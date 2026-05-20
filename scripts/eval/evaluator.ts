// scripts/eval/evaluator.ts
// 混合评估器：规则层 + LLM Judge 层

import Anthropic from '@anthropic-ai/sdk';
import { parseScore } from '../../src/agent/parser.js';
import type { RuleScore, JudgeScore, SingleTurnCase, MultiTurnCase, TurnResult } from './types.js';

// ── Anthropic 客户端 ──────────────────────────────────────
const ANTHROPIC_API_KEY = process.env['VITE_API_KEY'] || process.env['ANTHROPIC_API_KEY'] || '';
const ANTHROPIC_BASE_URL = process.env['VITE_BASE_URL'] || 'https://timesniper.club';
const ANTHROPIC_MODEL = process.env['VITE_LLM_MODEL'] || 'claude-sonnet-4-6';

const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  baseURL: ANTHROPIC_BASE_URL,
  dangerouslyAllowBrowser: true,
  defaultHeaders: { Authorization: `Bearer ${ANTHROPIC_API_KEY}` },
});

// ── 规则打分 ──────────────────────────────────────────────

export function scoreRules(code: string): RuleScore {
  const breakdown: RuleScore['breakdown'] = {};
  let total = 0;

  // 1. syntax (20pt)
  let syntaxPass = false;
  try {
    new Function(code.replace(/\._scope\(\)/g, ''));
    syntaxPass = true;
  } catch {
    syntaxPass = false;
  }
  breakdown['syntax'] = { pass: syntaxPass, score: syntaxPass ? 20 : 0 };
  total += breakdown['syntax'].score;

  // 语法错误时，级联失败所有后续检查
  if (!syntaxPass) {
    for (const key of ['hasMusic', 'hasBpm', 'layerCount', 'bassLpf', 'padRoom', 'hhGain', 'breathingSpace', 'noTidalOnly', 'noSetcpsInLayers']) {
      breakdown[key] = { pass: false, score: 0, detail: '语法错误，跳过' };
    }
    return { total: 0, breakdown };
  }

  const parsed = parseScore(code);
  const layers = parsed.layers;

  // 1.5 hasMusic gate（0pt，级联门）
  const hasMusicPass = layers.length > 0;
  breakdown['hasMusic'] = {
    pass: hasMusicPass,
    score: 0,
    detail: hasMusicPass ? undefined : '无实际音乐层（silence），后续规则全部跳过',
  };
  if (!hasMusicPass) {
    for (const key of ['hasBpm', 'layerCount', 'bassLpf', 'padRoom', 'hhGain', 'breathingSpace', 'noTidalOnly', 'noSetcpsInLayers']) {
      breakdown[key] = { pass: false, score: 0, detail: '无音乐层，跳过' };
    }
    return { total, breakdown };
  }

  // 2. hasBpm (10pt)
  const hasBpmPass = /setcps\s*\(/.test(code);
  breakdown['hasBpm'] = { pass: hasBpmPass, score: hasBpmPass ? 10 : 0 };
  total += breakdown['hasBpm'].score;

  // 3. layerCount (10pt)
  const layerCountPass = layers.length >= 2;
  breakdown['layerCount'] = { pass: layerCountPass, score: layerCountPass ? 10 : 0 };
  total += breakdown['layerCount'].score;

  // 4. bassLpf (10pt)
  const bassLayer = layers.find((l) => /bass/i.test(l.name));
  if (!bassLayer) {
    breakdown['bassLpf'] = { pass: false, score: 0, detail: '无 bass 层，跳过' };
  } else {
    const lpfMatch = bassLayer.source.match(/\.lpf\s*\(\s*(\d+(\.\d+)?)\s*\)/);
    const bassLpfPass = lpfMatch != null && parseFloat(lpfMatch[1]) <= 500;
    breakdown['bassLpf'] = { pass: bassLpfPass, score: bassLpfPass ? 10 : 0 };
  }
  total += breakdown['bassLpf'].score;

  // 5. padRoom (10pt)
  const padLayer = layers.find((l) => /pad|atmo|atmosphere|chord/i.test(l.name));
  if (!padLayer) {
    breakdown['padRoom'] = { pass: false, score: 0, detail: '无 pad 层，跳过' };
  } else {
    const padRoomPass = /\.room\s*\(/.test(padLayer.source) || /\.delay\s*\(/.test(padLayer.source);
    breakdown['padRoom'] = { pass: padRoomPass, score: padRoomPass ? 10 : 0 };
  }
  total += breakdown['padRoom'].score;

  // 6. hhGain (10pt)
  const hhLayer = layers.find((l) => /^(hh|fx|hihat)/i.test(l.name));
  if (!hhLayer) {
    // 无 hh 层默认通过
    breakdown['hhGain'] = { pass: true, score: 10, detail: '无 hh 层，默认通过' };
  } else {
    const gainMatch = hhLayer.source.match(/\.gain\s*\(\s*(\d+(\.\d+)?)\s*\)/);
    const hhGainPass = gainMatch != null && parseFloat(gainMatch[1]) <= 0.5;
    breakdown['hhGain'] = { pass: hhGainPass, score: hhGainPass ? 10 : 0 };
  }
  total += breakdown['hhGain'].score;

  // 7. breathingSpace (10pt)
  let breathingPass: boolean;
  if (layers.length >= 4) {
    breathingPass = layers.some((l) =>
      /\.mask\s*\(|\.struct\s*\(|\.sometimes\s*\(|\.rarely\s*\(|\.often\s*\(/.test(l.source)
    );
  } else {
    breathingPass = true;
  }
  breakdown['breathingSpace'] = { pass: breathingPass, score: breathingPass ? 10 : 0 };
  total += breakdown['breathingSpace'].score;

  // 8. noTidalOnly (10pt)
  const tidalOnlyRe = /\.(sometimesBy|someCyclesBy|within|byDefault|whenmod)\s*\(/;
  const noTidalOnlyPass = !tidalOnlyRe.test(code);
  breakdown['noTidalOnly'] = { pass: noTidalOnlyPass, score: noTidalOnlyPass ? 10 : 0 };
  total += breakdown['noTidalOnly'].score;

  // 9. noSetcpsInLayers (10pt)
  const noSetcpsInLayersPass = !layers.some((l) => l.source.includes('setcps('));
  breakdown['noSetcpsInLayers'] = { pass: noSetcpsInLayersPass, score: noSetcpsInLayersPass ? 10 : 0 };
  total += breakdown['noSetcpsInLayers'].score;

  return { total, breakdown };
}

// ── 多轮层保留评分 ────────────────────────────────────────

export function scoreLayerPreservation(turns: TurnResult[]): number {
  if (turns.length <= 1) return 10;
  let totalScore = 0;
  const maxPerTurn = 10 / (turns.length - 1);
  for (let i = 1; i < turns.length; i++) {
    const prevLayers = parseScore(turns[i - 1].generatedCode).layers.map((l) => l.name);
    const currLayers = parseScore(turns[i].generatedCode).layers.map((l) => l.name);
    const preserved = prevLayers.filter((n) => currLayers.includes(n)).length;
    const rate = prevLayers.length > 0 ? preserved / prevLayers.length : 1;
    totalScore += rate * maxPerTurn;
  }
  return Math.round(totalScore * 10) / 10;
}

// ── LLM Judge 提示词 ──────────────────────────────────────

const SINGLE_JUDGE_PROMPT = `你是一名 Strudel 代码评审员。你将收到用户的音乐创作提示词和生成的 Strudel 代码。

请从以下 5 个维度各给 0-2 分（0=差/未体现，1=基本达到，2=优秀）：
1. style_match: 生成结果是否贴合 prompt 描述的音乐风格/情绪
2. layer_completeness: 是否有合理的鼓/律动骨架，而非全由 pad 堆砌
3. musical_diversity: 各层在密度、节奏、频率区间上是否有对比和差异
4. parameter_accuracy: 用户明确指定的参数（BPM、和弦、乐器）是否准确落地
5. creative_expression: 是否有让音乐"活"起来的调制（perlin/sine/mask/off 等）

严格输出 JSON，不加任何解释文字：
{
  "style_match": { "score": 0-2, "reason": "一句话" },
  "layer_completeness": { "score": 0-2, "reason": "一句话" },
  "musical_diversity": { "score": 0-2, "reason": "一句话" },
  "parameter_accuracy": { "score": 0-2, "reason": "一句话" },
  "creative_expression": { "score": 0-2, "reason": "一句话" },
  "total": 0-10
}`;

const MULTI_JUDGE_PROMPT = `你是一名 Strudel 代码评审员。你将收到一段多轮对话历史（用户指令 + 每轮生成代码），以及期望行为说明。

请从以下 7 个维度各给 0-2 分（0=差/未体现，1=基本达到，2=优秀）：
1. style_match: 最终代码是否贴合原始 prompt 的风格/情绪
2. layer_completeness: 是否有合理的鼓/律动骨架
3. musical_diversity: 各层在密度、频率区间上是否有对比
4. parameter_accuracy: 明确指定的参数是否准确落地
5. creative_expression: 是否有让音乐"活"起来的调制
6. edit_precision: 每轮修改是否只改了用户要求的地方，未提及的层保持不变
7. intent_understanding: 对模糊反馈（"太吵了"/"旋律太平"等）的理解是否合理

严格输出 JSON，total 为 7 项之和（0-14），归一化由调用方处理：
{
  "style_match": { "score": 0-2, "reason": "一句话" },
  "layer_completeness": { "score": 0-2, "reason": "一句话" },
  "musical_diversity": { "score": 0-2, "reason": "一句话" },
  "parameter_accuracy": { "score": 0-2, "reason": "一句话" },
  "creative_expression": { "score": 0-2, "reason": "一句话" },
  "edit_precision": { "score": 0-2, "reason": "一句话" },
  "intent_understanding": { "score": 0-2, "reason": "一句话" },
  "total": 0-14
}`;

// ── 重试辅助 ────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.warn(`    [judge] 第 ${attempt} 次尝试失败: ${e instanceof Error ? e.message : String(e)}`);
      if (attempt < maxAttempts) {
        console.warn(`    [judge] ${delayMs * attempt}ms 后重试...`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ── LLM Judge 解析辅助 ────────────────────────────────────

function parseJudgeResponse(raw: string): Record<string, { score: number; reason: string }> & { total?: number } {
  type JudgeResult = Record<string, { score: number; reason: string }> & { total?: number };

  // 1. 整体直接解析
  try {
    return JSON.parse(raw.trim()) as JudgeResult;
  } catch { /* continue */ }

  // 2. markdown 代码块（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]) as JudgeResult;
    } catch { /* continue */ }
  }

  // 3. 贪婪正则：从最后一个顶层 JSON 对象向前尝试
  //    先收集所有 { ... }（最多两层嵌套），倒序尝试解析
  const candidates = [...raw.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)].reverse();
  for (const m of candidates) {
    try {
      return JSON.parse(m[0]) as JudgeResult;
    } catch { /* continue */ }
  }

  console.error(`    [judge] 无法解析 JSON，完整原始响应 (${raw.length} 字符):\n${raw}`);
  throw new Error(`No JSON found in judge response. Raw (first 500 chars): ${raw.substring(0, 500)}`);
}

// ── 单轮 Judge ────────────────────────────────────────────

export async function judgeSingleTurn(tc: SingleTurnCase, code: string): Promise<JudgeScore> {
  const userContent = `用户 prompt：${tc.prompt}\n\n期望维度：${tc.expectedDimensions.join('、')}\n\n生成代码：\n\`\`\`\n${code}\n\`\`\``;

  const parsed = await withRetry(async () => {
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: SINGLE_JUDGE_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const result = parseJudgeResponse(raw);
    const hasDimensions = Object.entries(result).some(
      ([k, v]) => k !== 'total' && typeof v === 'object' && v !== null && 'score' in v
    );
    if (!hasDimensions) {
      console.warn(`    [judge] 解析到 JSON 但无维度数据，完整响应 (${raw.length} 字符):\n${raw}`);
      throw new Error(`Judge 返回了无维度数据的响应: ${raw.substring(0, 200)}`);
    }
    return { result, raw };
  });

  const { result: parsedSingle, raw: rawSingle } = parsed;
  const { total: _total, ...dims } = parsedSingle;

  const breakdown: JudgeScore['breakdown'] = {};
  for (const [key, val] of Object.entries(dims)) {
    if (typeof val === 'object' && val !== null && 'score' in val) {
      breakdown[key] = val as { score: number; reason: string };
    }
  }

  const total = typeof _total === 'number' ? _total : Object.values(breakdown).reduce((s, v) => s + v.score, 0);

  return { total, breakdown, rawResponse: rawSingle };
}

// ── 多轮 Judge ────────────────────────────────────────────

export async function judgeMultiTurn(tc: MultiTurnCase, turns: TurnResult[]): Promise<JudgeScore> {
  const historyLines: string[] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = tc.turns[i];
    const result = turns[i];
    historyLines.push(`【第 ${i + 1} 轮】用户：${turn.userMessage}`);
    if (turn.checkpoints && turn.checkpoints.length > 0) {
      historyLines.push(`期望行为：${turn.checkpoints.join('；')}`);
    }
    historyLines.push(`生成代码：\n\`\`\`\n${result.generatedCode}\n\`\`\``);
  }

  const userContent = historyLines.join('\n\n');

  const parsedMulti = await withRetry(async () => {
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system: MULTI_JUDGE_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const result = parseJudgeResponse(raw);
    const hasDimensions = Object.entries(result).some(
      ([k, v]) => k !== 'total' && typeof v === 'object' && v !== null && 'score' in v
    );
    if (!hasDimensions) {
      console.warn(`    [judge] 解析到 JSON 但无维度数据，完整响应 (${raw.length} 字符):\n${raw}`);
      throw new Error(`Judge 返回了无维度数据的响应: ${raw.substring(0, 200)}`);
    }
    return { result, raw };
  });

  const { result: parsed2, raw: raw2 } = parsedMulti;
  const { total: rawTotal, ...dims } = parsed2;

  const breakdown: JudgeScore['breakdown'] = {};
  for (const [key, val] of Object.entries(dims)) {
    if (typeof val === 'object' && val !== null && 'score' in val) {
      breakdown[key] = val as { score: number; reason: string };
    }
  }

  const sumRaw = typeof rawTotal === 'number' ? rawTotal : Object.values(breakdown).reduce((s, v) => s + v.score, 0);
  const total = Math.round((sumRaw / 14) * 100) / 10;

  return { total, breakdown, rawResponse: raw2 };
}
