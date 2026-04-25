/**
 * 批量运行 test-user-prompt.md 中的 18 个测试用例，
 * 调用系统内置的 Anthropic Agent 生成 Strudel 乐谱，
 * 将结果保存到 docs/20260422-v1/scores.md
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// 直接内联使用与 src/services/llm.ts 相同的 API 配置
// ============================================================================

const ANTHROPIC_API_KEY = process.env['VITE_API_KEY'] || process.env['ANTHROPIC_API_KEY'] || '';
const ANTHROPIC_BASE_URL = process.env['VITE_BASE_URL'] || 'https://timesniper.club';
const ANTHROPIC_MODEL = process.env['VITE_LLM_MODEL'] || 'claude-sonnet-4-6';

const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  baseURL: ANTHROPIC_BASE_URL,
  dangerouslyAllowBrowser: true,
  defaultHeaders: { Authorization: `Bearer ${ANTHROPIC_API_KEY}` },
});

// ============================================================================
// 内联 parser.ts 的核心逻辑（避免引入浏览器依赖）
// ============================================================================

interface ScanState { inString: string | null; inLineComment: boolean; inBlockComment: boolean }
function newScanState(): ScanState { return { inString: null, inLineComment: false, inBlockComment: false }; }
function step(code: string, i: number, st: ScanState): number {
  const ch = code[i]; const prev = i > 0 ? code[i - 1] : '';
  if (st.inLineComment) { if (ch === '\n') st.inLineComment = false; return 0; }
  if (st.inBlockComment) { if (ch === '/' && prev === '*') st.inBlockComment = false; return 0; }
  if (st.inString) { if (ch === st.inString && prev !== '\\') st.inString = null; return 0; }
  if (ch === '"' || ch === "'" || ch === '`') { st.inString = ch; return 0; }
  if (ch === '/' && code[i + 1] === '/') { st.inLineComment = true; return 1; }
  if (ch === '/' && code[i + 1] === '*') { st.inBlockComment = true; return 1; }
  return -1;
}
function findMatchingClose(code: string, openIdx: number): number {
  let depth = 0; const st = newScanState();
  for (let i = openIdx; i < code.length; i++) {
    const skip = step(code, i, st);
    if (skip > 0) { i += skip; continue; }
    if (skip === 0) continue;
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function findTopLevelKeyword(code: string, keyword: string): number {
  let depth = 0; const st = newScanState();
  for (let i = 0; i < code.length; i++) {
    const skip = step(code, i, st);
    if (skip > 0) { i += skip; continue; }
    if (skip === 0) continue;
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
    if (depth === 0 && code.slice(i, i + keyword.length) === keyword) {
      const before = i > 0 ? code[i - 1] : '';
      const after = code[i + keyword.length];
      if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after || '')) return i;
    }
  }
  return -1;
}
function splitTopLevelCommas(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []; let depth = 0; const st = newScanState(); let segStart = 0;
  for (let i = 0; i < text.length; i++) {
    const skip = step(text, i, st);
    if (skip > 0) { i += skip; continue; }
    if (skip === 0) continue;
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { spans.push({ start: segStart, end: i }); segStart = i + 1; }
  }
  if (segStart < text.length) spans.push({ start: segStart, end: text.length });
  return spans;
}
function findSetcps(code: string): { cps: number; start: number; end: number } | null {
  const st = newScanState();
  for (let i = 0; i < code.length; i++) {
    const skip = step(code, i, st);
    if (skip > 0) { i += skip; continue; }
    if (skip === 0) continue;
    if (code.slice(i, i + 6) === 'setcps') {
      const before = i > 0 ? code[i - 1] : '';
      const after = code[i + 6];
      if (/[A-Za-z0-9_$]/.test(before)) continue;
      if (after !== '(' && !/\s/.test(after || '')) continue;
      const open = code.indexOf('(', i + 6);
      if (open < 0) continue;
      const close = findMatchingClose(code, open);
      if (close < 0) continue;
      const inner = code.slice(open + 1, close).trim();
      const num = parseFloat(inner);
      if (isNaN(num)) continue;
      return { cps: num, start: i, end: close + 1 };
    }
  }
  return null;
}

const LAYER_MARKER_RE = /^\s*\/\*\s*@layer\s+([A-Za-z0-9_]+)\s*\*\//;
interface ParsedLayer { name: string; source: string; rawStart: number; rawEnd: number; }
interface ParsedScore {
  raw: string; cps: number | null; bpm: number | null;
  setcpsMatch: { start: number; end: number } | null;
  hasStack: boolean; stackStart: number; stackArgsStart: number; stackArgsEnd: number;
  layers: ParsedLayer[];
}
function parseScore(code: string): ParsedScore {
  const result: ParsedScore = { raw: code, cps: null, bpm: null, setcpsMatch: null, hasStack: false, stackStart: -1, stackArgsStart: -1, stackArgsEnd: -1, layers: [] };
  if (!code || !code.trim()) return result;
  const setcps = findSetcps(code);
  if (setcps) { result.cps = setcps.cps; result.bpm = Math.round(setcps.cps * 240); result.setcpsMatch = { start: setcps.start, end: setcps.end }; }
  const stackIdx = findTopLevelKeyword(code, 'stack');
  if (stackIdx >= 0) {
    const openParen = code.indexOf('(', stackIdx + 'stack'.length);
    if (openParen > 0) {
      const closeIdx = findMatchingClose(code, openParen);
      if (closeIdx > 0) {
        result.hasStack = true; result.stackStart = stackIdx; result.stackArgsStart = openParen + 1; result.stackArgsEnd = closeIdx;
        const argsText = code.slice(result.stackArgsStart, result.stackArgsEnd);
        const spans = splitTopLevelCommas(argsText);
        let autoIdx = 0;
        for (const span of spans) {
          const argText = argsText.slice(span.start, span.end);
          if (!argText.trim()) continue;
          const marker = argText.match(LAYER_MARKER_RE);
          let name: string; let sourceText: string;
          if (marker) { name = marker[1]; sourceText = argText.slice(marker[0].length); }
          else { name = `layer_${autoIdx++}`; sourceText = argText; }
          if (!sourceText.trim()) continue;
          result.layers.push({ name, source: sourceText.trim(), rawStart: result.stackArgsStart + span.start, rawEnd: result.stackArgsStart + span.end });
        }
      }
    }
  }
  return result;
}
function bpmToCps(bpm: number): number { return Math.max(0.05, Math.min(8, bpm / 240)); }
function summariseScore(score: ParsedScore) {
  return { bpm: score.bpm, layers: score.layers.map((l) => ({ name: l.name, preview: l.source.length > 80 ? l.source.slice(0, 77) + '...' : l.source })) };
}

// ============================================================================
// 内联 tools.ts 的核心逻辑
// ============================================================================

interface AgentState { code: string; finalCode: string | null; }
interface ToolContext { state: AgentState; improviseLLM: (role: string, style: string, complementTask: string, hints: string, currentCode: string) => Promise<string>; }
interface ToolResult { ok: boolean; data?: unknown; error?: string; }
class CommitSignal extends Error {
  code: string;
  constructor(code: string) { super('commit'); this.name = 'CommitSignal'; this.code = code; }
}

interface LayerLite { name: string; source: string; }
function isSilencePlaceholder(src: string): boolean { const s = src.trim(); return s === 'silence' || s === 'silence()'; }
function rebuildStack(layers: LayerLite[]): string {
  if (layers.length === 0) return 'silence';
  return `stack(\n${layers.map((l) => `  /* @layer ${l.name} */ ${l.source}`).join(',\n')}\n)`;
}
function rebuildCode(score: ParsedScore, layers: LayerLite[], newCps?: number | null): string {
  const cps = newCps !== undefined ? newCps : score.cps;
  const setcpsLine = cps !== null ? `setcps(${cps})\n` : '';
  return setcpsLine + rebuildStack(layers);
}
function layersOf(score: ParsedScore): LayerLite[] { return score.layers.map((l) => ({ name: l.name, source: l.source })); }
function ensureStack(code: string): { score: ParsedScore; layers: LayerLite[] } {
  const score = parseScore(code);
  if (score.hasStack) return { score, layers: layersOf(score).filter((l) => !isSilencePlaceholder(l.source)) };
  const body = score.setcpsMatch ? (code.slice(0, score.setcpsMatch.start) + code.slice(score.setcpsMatch.end)) : code;
  const trimmed = body.trim().replace(/;$/, '').trim();
  if (!trimmed || isSilencePlaceholder(trimmed)) return { score, layers: [] };
  return { score, layers: [{ name: 'main', source: trimmed }] };
}
function validateCode(code: string): { ok: boolean; error?: string } {
  if (!code || !code.trim()) return { ok: false, error: '代码为空' };
  try { new Function(code.replace(/\._scope\(\)/g, '')); return { ok: true }; }
  catch (e: unknown) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

const TOOLS = [
  {
    name: 'getScore', description: '读取当前正在编辑的 strudel 代码及其结构化信息（bpm、所有层名称与片段预览）。在做任何修改前应先调用一次了解现状。',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: (_args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const score = parseScore(ctx.state.code);
      return { ok: true, data: { ...summariseScore(score), code: ctx.state.code } };
    },
  },
  {
    name: 'addLayer', description: '向 stack 中添加一个新层。layer name 必须唯一；若当前还没有 stack 会自动创建。code 字段填该层的 strudel 表达式（如 s("bd sd bd sd").gain(0.8)）。',
    parameters: { type: 'object', properties: { name: { type: 'string', description: '层名称，建议用语义化短词：drums / hh / bass / pad / lead / fx' }, code: { type: 'string', description: '该层的完整 strudel 表达式，不要包含外层 stack/setcps' } }, required: ['name', 'code'] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      if (typeof args.name !== 'string' || !args.name.trim()) return { ok: false, error: 'name 不能为空' };
      if (typeof args.code !== 'string' || !args.code.trim()) return { ok: false, error: 'code 不能为空' };
      const { score, layers } = ensureStack(ctx.state.code);
      if (layers.some((l) => l.name === args.name)) return { ok: false, error: `layer "${args.name}" 已存在，如需修改请用 replaceLayer 或 applyEffect` };
      const newLayers = [...layers, { name: args.name as string, source: (args.code as string).trim() }];
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code, layerCount: newLayers.length } };
    },
  },
  {
    name: 'removeLayer', description: '从 stack 中移除指定名称的层。',
    parameters: { type: 'object', properties: { name: { type: 'string', description: '要移除的层名称' } }, required: ['name'] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const name = String(args.name || '');
      if (!name) return { ok: false, error: 'name 不能为空' };
      const { score, layers } = ensureStack(ctx.state.code);
      const idx = layers.findIndex((l) => l.name === name);
      if (idx < 0) return { ok: false, error: `未找到 layer "${name}"` };
      const newLayers = layers.filter((_, i) => i !== idx);
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code, layerCount: newLayers.length } };
    },
  },
  {
    name: 'replaceLayer', description: '把指定层的整段表达式替换为新代码。',
    parameters: { type: 'object', properties: { name: { type: 'string', description: '要替换的层名称' }, code: { type: 'string', description: '新的 strudel 表达式' } }, required: ['name', 'code'] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const name = String(args.name || '');
      if (!name) return { ok: false, error: 'name 不能为空' };
      if (typeof args.code !== 'string' || !(args.code as string).trim()) return { ok: false, error: 'code 不能为空' };
      const { score, layers } = ensureStack(ctx.state.code);
      const idx = layers.findIndex((l) => l.name === name);
      if (idx < 0) return { ok: false, error: `未找到 layer "${name}"` };
      const newLayers = layers.slice(); newLayers[idx] = { name, source: (args.code as string).trim() };
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code } };
    },
  },
  {
    name: 'applyEffect', description: '在指定层尾部追加效果链，例如 ".lpf(800).gain(0.7)"。chain 必须以点号开头。',
    parameters: { type: 'object', properties: { layer: { type: 'string', description: '目标层名称' }, chain: { type: 'string', description: '效果链字符串，必须以点号开头' } }, required: ['layer', 'chain'] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const layerName = String(args.layer || '');
      const chain = String(args.chain || '').trim();
      if (!chain.startsWith('.')) return { ok: false, error: 'chain 必须以 "." 开头' };
      const { score, layers } = ensureStack(ctx.state.code);
      const idx = layers.findIndex((l) => l.name === layerName);
      if (idx < 0) return { ok: false, error: `未找到 layer "${layerName}"` };
      const newLayers = layers.slice(); newLayers[idx] = { name: layerName, source: layers[idx].source + chain };
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code } };
    },
  },
  {
    name: 'setTempo', description: '修改速度。bpm 范围约 30 ~ 240。内部会换算为 cps（cps = bpm / 240）。',
    parameters: { type: 'object', properties: { bpm: { type: 'number', description: '每分钟节拍数，常见值 90/120/140/170' } }, required: ['bpm'] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const bpm = Number(args.bpm);
      if (!isFinite(bpm) || bpm <= 0) return { ok: false, error: 'bpm 必须是正数' };
      const cps = bpmToCps(bpm);
      const { score, layers } = ensureStack(ctx.state.code);
      ctx.state.code = rebuildCode(score, layers, cps);
      return { ok: true, data: { code: ctx.state.code, bpm: Math.round(cps * 240), cps } };
    },
  },
  {
    name: 'validate', description: '对一段 strudel 代码做校验（不会播放）：做 JS 语法检查。在 commit 前应该至少 validate 一次最终代码；若失败请按错误信息修代码后再 validate 一次。',
    parameters: { type: 'object', properties: { code: { type: 'string', description: '要校验的 strudel 代码；不传则校验当前编辑中的代码' } }, required: [] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const code = typeof args.code === 'string' && (args.code as string).trim() ? args.code as string : ctx.state.code;
      const result = validateCode(code);
      return result.ok ? { ok: true, data: { valid: true } } : { ok: false, error: `语法错误: ${result.error}` };
    },
  },
  {
    name: 'improvise', description: '起草一个指定角色的单层 strudel 表达式。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。',
    parameters: { type: 'object', properties: { role: { type: 'string', enum: ['drums', 'hh', 'bass', 'pad', 'lead', 'fx'], description: '要生成的乐器角色' }, style: { type: 'string', enum: ['lofi', 'house', 'dnb', 'ambient', 'techno', 'synthwave'], description: '音乐风格（可选），与 AGENT_SYSTEM_PROMPT 中的 6 种内置风格对应' }, complement_task: { type: 'string', description: '该层要填补的音乐空缺（如 "off-beat hi-hat avoiding kick positions"、"warm pad in C minor at 200-2000Hz"）' }, hints: { type: 'string', description: '额外的风格、调性、密度等提示（中英文皆可）' } }, required: ['role'] },
    handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const role = String(args.role || '').trim();
      const style = String(args.style || '').trim();
      const complementTask = String(args.complement_task || '').trim();
      const hints = String(args.hints || '').trim();
      if (!role) return { ok: false, error: 'role 不能为空' };
      try {
        const snippet = await ctx.improviseLLM(role, style, complementTask, hints, ctx.state.code);
        return { ok: true, data: { role, code: snippet.trim() } };
      } catch (e: unknown) {
        return { ok: false, error: `improvise 失败: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  },
  {
    name: 'commit', description: '终止本次 agent 循环，把最终代码交给播放器。必须在所有编辑完成且 validate 通过后调用。',
    parameters: { type: 'object', properties: { code: { type: 'string', description: '最终要播放的完整代码；不传则使用当前编辑中的代码' }, explanation: { type: 'string', description: '一句话向用户解释这次改动（中文）' } }, required: [] },
    handler: (args: Record<string, unknown>, ctx: ToolContext): ToolResult => {
      const code = typeof args.code === 'string' && (args.code as string).trim() ? args.code as string : ctx.state.code;
      throw new CommitSignal(code);
    },
  },
];

function getToolSchemas() {
  return TOOLS.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
}
function findTool(name: string) { return TOOLS.find((t) => t.name === name); }

// ============================================================================
// 内联 IMPROVISE_SYSTEM_PROMPT 和 AGENT_SYSTEM_PROMPT
// ============================================================================

const STRUDEL_CHEATSHEET = [
  '## Strudel cheatsheet (concise)',
  '- Mini notation: `*N` repeat, `/N` slow, `[]` group, `<>` alternate cycles, `,` parallel, `~` rest, `(k,n)` euclidean, `!N` replicate, `@N` elongate.',
  '- Core: `note("c3 e3 g3")`, `s("bd sd hh")`, `stack(...)`, `cat(...)`. Tempo is owned by the `setTempo` tool — never write `setcps` in layer code.',
  '- Drums: `bd sd hh rs cp cb lt mt ht 808bd 808sd 808oh 808hc`. Banks: `.bank("RolandTR808")`.',
  '- Synths: `.s("sawtooth"|"sine"|"square"|"triangle")`. Melodic samples: `piano arpy bass moog juno sax gtr pluck sitar stab`.',
  '- Effects: `.gain(0..1)`, `.lpf(Hz)`, `.hpf(Hz)`, `.delay(0..1)`, `.room(N)`, `.pan(0..1)`, `.attack/.decay/.sustain/.release`, `.speed(N)`, `.vowel("a e i o")`.',
  '- Pattern mods: `.fast(N)`, `.slow(N)`, `.rev()`, `.jux(rev)`, `.ply(N)`, `.struct("x ~ x x")`, `.mask("<0 1 1 0>/16")`, `.every(N, fast(2))`, `.sometimes(fast(2))`, `.rarely(fn)`, `.often(fn)`, `.chunk(N, fast(2))`, `.off(0.125, x => x.add(note("7")))`.',
  '- Signals: `sine`, `cosine`, `saw`, `tri`, `rand`, `perlin` — combine with `.range(a,b).slow(N)` / `.segment(N)`. Example: `.lpf(sine.range(500,1000).slow(8))`, `.gain(perlin.range(.6,.9))`.',
  '- Harmony: `chord("<Cm9 Fm9>/4").dict("ireal").voicing()`, `.mode("root:g2")`, `.anchor("D5")`. Use `n("0 1").set(chords)` to map scale degrees onto chord tones.',
  '- For `every`/`sometimes`/`off`/`chunk`, the callback must be a real Strudel function (`fast(N)`, `rev`, `ply(N)`, or `x => x.something(...)`). TidalCycles-only APIs (`by`, `sometimesBy`, `someCyclesBy`, `within`) are NOT available in Strudel — `validate` will catch them.',
  '- Scales: `n("0 1 2 3").scale("C4:minor")`. Common: major / minor / dorian / mixolydian / phrygian / lydian / minor pentatonic.',
].join('\n');

const AGENT_SYSTEM_PROMPT = [
  'You are a Strudel live-coding agent. The user describes music in natural language; you assemble Strudel JavaScript code by calling tools, then commit the final code for playback.',
  '',
  '## Working style',
  '1. If `currentCode` is non-empty, ALWAYS call `getScore` first to inspect existing layers and bpm.',
  '2. For modifications, prefer the smallest editing tool: `applyEffect` < `replaceLayer` < `addLayer`/`removeLayer` < `setTempo`. Preserve layers the user did NOT mention.',
  '3. To create a new instrumental layer, you may either (a) write the strudel snippet yourself in `addLayer({ code })`, or (b) ask the small expert with `improvise({ role, style, complement_task, hints })` and then plug its returned code into `addLayer` / `replaceLayer`. When calling `improvise`, ALWAYS pass `complement_task` describing what the layer should fill in (e.g. "off-beat hi-hat avoiding kick positions", "warm pad in C minor at 200-2000Hz").',
  '4. After your last edit, run `validate` once on the final code. If it passes, `commit` directly.',
  '',
  '## Style matching',
  '- 8 built-in styles: `lofi` (70-90 BPM, chill/minor), `house` (118-128, four-on-the-floor/dorian), `dnb` (165-180, fast breaks/minor), `ambient` (60-90, sparse pads/lydian), `techno` (125-140, driving/phrygian), `synthwave` (90-110, retro 80s/minor), `trap` (130-160, 808 hi-hat rolls/minor), `jazz` (90-110, swing walking bass/dorian).',
  '- Match the user description to ONE of these by keyword (e.g. "学习/lo-fi/夜晚" → `lofi`, "快节奏/drum and bass" → `dnb`, "808/切分/drill" → `trap`, "爸士/swing/walking bass" → `jazz`). Use the matched style\'s BPM range as starting tempo and pass `style` to every `improvise` call so the sub-model picks coherent timbres.',
  '- If no style matches, fall back to your own judgment — `style` is optional.',
  '',
  '## Musicality principles (read every time you decide what layer to add next)',
  '1. **Layer order**: drums → bass → pad/lead → fx. Do NOT start with all-harmonic layers (3 pads + no rhythm = no song). Drums + bass form the skeleton; everything else is colour.',
  '2. **Frequency lanes**: kick <100Hz, bass c2-g2 (≈65-200Hz), pad/lead c4+ (≈260Hz+), hh + fx >2kHz. Two sustained layers in the same octave = mud. Use `.lpf` / `.hpf` to enforce lanes when in doubt.',
  '3. **Density contrast**: with ≥4 layers, AT LEAST one layer must use `.mask("<1 0 1 1>/4")`, `.struct("x ~ x x")`, or `.sometimes(...)` to leave space. Everything-on-every-beat is a wall of noise, not music.',
  '4. **Key consistency**: the FIRST melodic layer (bass/pad/lead) sets the key. Every subsequent melodic layer MUST use the same `.scale(...)` (e.g. all `C4:minor`). Do not mix `C:minor` and `D:major` in one stack.',
  '5. **Gain balance**: drums 0.7-0.9, bass 0.6-0.8, pad 0.3-0.5, lead 0.4-0.6, fx 0.3-0.5. Keep the loudest element rhythmic, not harmonic.',
  '',
  '## Iteration budget',
  '- You have AT MOST ~14 LLM turns per session, and each `tool_calls` round-trip burns one turn.',
  '- Plan accordingly: reserve the LAST 2 turns for `validate` + `commit`. Do NOT keep adding layers until the budget is exhausted.',
  '- For a typical 3–4 layer composition: 1 turn `getScore` (if needed) + 1 `setTempo` + 4×(`improvise`+`addLayer`) + 1 `validate` + 1 `commit` ≈ 11-12 turns.',
  '- BATCH whenever possible: a single assistant turn may emit multiple `tool_calls` in parallel (e.g. one `addLayer drums` + one `addLayer hh` together). Use this to stay under budget.',
  '',
  '## Layer naming',
  '- Use semantic names: `drums`, `hh`, `bass`, `pad`, `lead`, `fx`. The codebase preserves these via `/* @layer NAME */` comments — never hand-write that comment yourself, the tools do it.',
  '',
  STRUDEL_CHEATSHEET,
  '',
  '## Communication style',
  '- 每一轮调用工具之前，先用 1-2 句中文简述你的意图和思考（例如：你为何选择这个工具、这一步在整体构思中处于什么位置）。',
  '- 语气自然，像一位音乐人在构思，不要使用"步骤 N："这类模板语言。',
  '- 示例："先铺一层温暖的 pad 做底色，用慢速弦乐感觉，再往上叠旋律。" / "低音层用 sine 合成，律动缓一点，不要抢主角。"',
  '',
  '## Before you commit (quality gate)',
  'Silently run this checklist before calling `commit`. Fix any violation inline without mentioning it to the user:',
  '- **bass layer**: must have `.lpf(≤500)`. Missing lpf = bass bleeds into kick frequency range.',
  '- **pad / atmosphere layer**: must have `.room(≥1)` or `.delay(≥0.2)`. A dry pad has no spatial depth.',
  '- **hh / fx layer**: `.gain` must be ≤ 0.5. Hi-hats and effects should never compete with the kick.',
  '- **4+ layers total**: at least ONE layer must use `.mask(...)`, `.struct(...)`, or `.sometimes(...)` to leave rhythmic breathing room.',
  '- **lead / melody layer**: must use the same `.scale("X:mode")` string as the first harmonic layer already in the stack.',
  '',
  '## Rules',
  '- Every session MUST end with exactly ONE `commit` call. Stopping after editing without committing is a BUG — the user will see no result. If you are running out of turns, SKIP further refinements and `commit` the current state immediately.',
  '- `commit({ explanation })` — the `explanation` field is REQUIRED: 1 short Chinese sentence describing what changed (e.g. "加了一层 lo-fi 鼓点和 808 贝斯"). It is shown to the user as the chat reply.',
  '- Do not call any tool after `commit`.',
  '- NEVER write `setcps(...)` anywhere — tempo is owned by the `setTempo` tool.',
  '- NEVER include outer `stack(...)` inside a layer\'s `code` argument — the tool already wraps it.',
  '- Default to ~120 BPM (`setTempo({ bpm: 120 })`) when starting from scratch with no matching style.',
  '- Keep each layer\'s expression a single chained call, no semicolons, no `var/let/const`.',
].join('\n');

const IMPROVISE_SYSTEM_PROMPT = [
  'You are a Strudel snippet generator producing ONE complementary layer for a live-coding stack.',
  '',
  'You will be given:',
  '- `role`: drums / hh / bass / pad / lead / fx',
  '- `style` (optional): one of lofi / house / dnb / ambient / techno / synthwave',
  '- `complement_task` (optional): a free-text instruction about what gap this layer should fill (e.g. "off-beat hi-hat avoiding kick positions", "warm pad in C minor")',
  '- `hint` (optional): extra style/density words',
  '- `current code` (optional): the full Strudel code already on stage',
  '',
  'CRITICAL: when `current code` is provided, you MUST first read it to detect (a) the BPM (look for setcps; bpm = cps*240), (b) the key/scale already used by any melodic layer, (c) the existing rhythm density. Your output MUST be MUSICALLY COMPLEMENTARY: same key/scale, complementary frequency band (kick<100Hz, bass c2-g2, pad/lead c4+, hh+fx >2kHz), and complementary density (if existing layers are dense, leave space; if sparse, you can be active).',
  '',
  'Output STRICT JSON only: {"code": "..."}',
  '',
  'Examples (illustrative — adapt to actual context):',
  `- input: \`role: drums\\nstyle: lofi\\nhint: 低密度\` → ${JSON.stringify({ code: 's("bd ~ sd ~").bank("RolandTR808").gain(0.8)' })}`,
  `- input: \`role: bass\\ncomplement_task: walking bass in C minor, sparse\` → ${JSON.stringify({ code: 'note("c2 c2 eb2 g2").s("sawtooth").lpf(500).gain(0.7)' })}`,
  `- input: \`role: pad\\nstyle: ambient\` → ${JSON.stringify({ code: 'n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).gain(0.4)' })}`,
  '',
  'Rules:',
  '- code must be ONE chained expression, no var declarations, no $: prefix, no setcps, no stack wrapping, no semicolons.',
  '- Pick a `.gain(...)` consistent with the role: drums 0.7-0.9, bass 0.6-0.8, pad 0.3-0.5, lead 0.4-0.6, fx 0.3-0.5.',
  '- For `every`/`sometimes`/`off`/`jux`/`chunk`, the callback MUST be a real Strudel function reference: `fast(N)`, `slow(N)`, `rev`, `ply(N)`, or an inline arrow `x => x.add(note("12"))`. TidalCycles-only APIs (`by`, `sometimesBy`, `someCyclesBy`, `within`) are NOT in Strudel and will crash at play time.',
].join('\n');

// ============================================================================
// Anthropic 消息格式转换 + improviseLLM
// ============================================================================

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function convertChatHistory(msgs: ChatMsg[]): { system: string; messages: Anthropic.MessageParam[] } {
  let system = '';
  const out: Anthropic.MessageParam[] = [];
  for (const msg of msgs) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (msg.role === 'system') { system = system ? `${system}\n\n${content}` : content; continue; }
    if (msg.role === 'user') { out.push({ role: 'user', content }); continue; }
    if (msg.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (content.trim()) blocks.push({ type: 'text', text: content });
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try { const p = JSON.parse(tc.function.arguments || '{}'); if (p && typeof p === 'object' && !Array.isArray(p)) input = p as Record<string, unknown>; } catch { /* ok */ }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
      }
      if (blocks.length === 0) continue;
      out.push({ role: 'assistant', content: blocks }); continue;
    }
    if (msg.role === 'tool') {
      const block: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: msg.tool_call_id || '', content };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
        (prev.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return { system, messages: out };
}

function convertTools(oaiTools: ReturnType<typeof getToolSchemas>): Anthropic.Tool[] {
  return oaiTools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters as Anthropic.Tool.InputSchema }));
}

function extractStrudelSnippet(text: string): string | null {
  if (!text) return null;
  try { const p = JSON.parse(text) as { code?: unknown }; if (typeof p?.code === 'string' && p.code.trim()) return p.code.trim(); } catch { /* fallthrough */ }
  const jsonBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonBlock) { try { const p = JSON.parse(jsonBlock[1]) as { code?: unknown }; if (typeof p?.code === 'string' && p.code.trim()) return p.code.trim(); } catch { /* fallthrough */ } }
  const field = text.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (field) { try { return JSON.parse(`"${field[1]}"`); } catch { return field[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'); } }
  const codeBlock = text.match(/```(?:js|javascript|strudel)?\s*([\s\S]*?)```/);
  if (codeBlock && codeBlock[1].trim()) return codeBlock[1].trim();
  const trimmed = text.trim();
  if (trimmed && /(^|[^a-zA-Z_])(s|n|note|stack|chord)\s*\(/.test(trimmed)) return trimmed.split(/\n\s*\n/)[0].trim() || trimmed;
  return null;
}

const IMPROVISE_FALLBACKS: Record<string, string> = {
  drums: 's("bd ~ sd ~").bank("RolandTR808").gain(0.8)',
  hh: 's("hh*8").gain(0.5)',
  bass: 'note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)',
  pad: 'n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).gain(0.4)',
  lead: 'n("<0 2 4 7 5 4>").scale("C4:minor").s("triangle").gain(0.5)',
  fx: 's("~ ~ ~ cp").room(0.5).gain(0.5)',
};

async function improviseLLM(role: string, style: string, complementTask: string, hints: string, currentCode: string): Promise<string> {
  const userPrompt = [`role: ${role}`, style ? `style: ${style}` : '', complementTask ? `complement_task: ${complementTask}` : '', hints ? `hint: ${hints}` : '', currentCode ? `current code:\n${currentCode}` : ''].filter(Boolean).join('\n');
  try {
    const resp = await client.messages.create({
      model: ANTHROPIC_MODEL, system: IMPROVISE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.9, max_tokens: 512,
    });
    const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    const snippet = extractStrudelSnippet(text);
    if (snippet) return snippet;
  } catch (e) { console.warn('[improvise] errored:', e); }
  return IMPROVISE_FALLBACKS[role] ?? IMPROVISE_FALLBACKS.drums;
}

// ============================================================================
// Agent loop
// ============================================================================

async function runAgentLoop(instruction: string): Promise<{ code: string; explanation: string }> {
  const state: AgentState = { code: '', finalCode: null };
  const ctx: ToolContext = { state, improviseLLM };
  const tools = getToolSchemas();
  const messages: ChatMsg[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: `用户指令: ${instruction}` },
  ];

  const MAX_ITER = 30;
  let explanation = '';

  for (let i = 0; i < MAX_ITER; i++) {
    const { system, messages: amsgs } = convertChatHistory(messages);
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL, system, messages: amsgs,
      tools: convertTools(tools), temperature: 0.7, max_tokens: 1024,
    });

    let text = '';
    const toolCalls: { id: string; name: string; arguments: string }[] = [];
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
    }
    if (text.trim()) { explanation = text.trim(); process.stdout.write(`  💬 ${text.trim().slice(0, 80)}\n`); }

    const assistantMsg: ChatMsg = {
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.length > 0 ? toolCalls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.arguments } })) : undefined,
    };
    messages.push(assistantMsg);

    if (toolCalls.length === 0) {
      // No tool calls — model gave up without commit, use current state
      break;
    }

    for (const tc of toolCalls) {
      process.stdout.write(`  🔧 ${tc.name}(${tc.arguments.slice(0, 60)})\n`);
      const tool = findTool(tc.name);
      if (!tool) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: false, error: `未知 tool: ${tc.name}` }) });
        continue;
      }
      let parsedArgs: Record<string, unknown> = {};
      try { const p = JSON.parse(tc.arguments); if (p && typeof p === 'object' && !Array.isArray(p)) parsedArgs = p as Record<string, unknown>; } catch { /* ok */ }
      try {
        const result = await (tool.handler as (a: Record<string, unknown>, c: ToolContext) => Promise<ToolResult> | ToolResult)(parsedArgs, ctx);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      } catch (e) {
        if (e instanceof CommitSignal) {
          state.finalCode = e.code;
          return { code: e.code, explanation };
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }) });
      }
    }
  }

  return { code: state.code || 'silence', explanation };
}

// ============================================================================
// 测试用例
// ============================================================================

const TEST_CASES = [
  { id: 'TC-001', name: '自然表达-Lofi House', prompt: '来一段 90 BPM 的 lofi house 完整作品。和弦循环用 Bbm9 → Fm9，共享给电钢琴、原声贝斯和一条飘的旋律层。鼓走 909，加一点 swing（late 0.01）。旋律层要用 chunk 切段、perlin 调音量、sine 扫 lpf、偶尔 ply，带 reverb/delay/fm/distortion。' },
  { id: 'TC-002', name: '极简触发-Coastline', prompt: '按 coastline 风格做一段：Bbm9/Fm9、共享和弦进行、鼓+电钢+贝斯+旋律四层，旋律层要丰富点。' },
  { id: 'TC-003', name: '定制变体-Downtempo', prompt: '参考 coastline 的结构做一段 downtempo：和弦改成 <Am11 Dm9 Fmaj7 G7>，BPM 85，电钢琴换成 gm_electric_piano_1，贝斯保持 gm_acoustic_bass，旋律层保留 chunk(4, fast(2)) 和 perlin/sine 的调制，但把 mask 改成 <1 0 1 1>/16' },
  { id: 'TC-004', name: '风格-深夜开车 Ambient Techno', prompt: '来一段深夜开车的 ambient techno，节奏稀疏但 bassline 厚重' },
  { id: 'TC-005', name: '风格-日式咖啡厅 Jazz', prompt: '做一段日式咖啡厅的背景音乐，jazz 风格，带钢琴和贝斯' },
  { id: 'TC-006', name: '风格-赛博朋克 Dark Synth', prompt: '来一段赛博朋克城市感的 dark synth，节奏感强，带失真' },
  { id: 'TC-007', name: '风格-森林冥想 Ambient', prompt: '做一段像在森林里冥想的 ambient 音乐，不需要鼓' },
  { id: 'TC-008', name: '风格-80s 迪斯科 Disco', prompt: '来一段 80s 复古迪斯科风格的舞曲' },
  { id: 'TC-009', name: '场景-千与千寻开场', prompt: '帮我做一段像《千与千寻》开场那种略带忧伤的轻音乐' },
  { id: 'TC-010', name: '场景-游戏 Boss 配乐', prompt: '做一段适合打 boss 的游戏配乐，紧张、层次丰富' },
  { id: 'TC-011', name: '场景-早晨咖啡时刻', prompt: '来一段早晨醒来窗边喝咖啡的感觉，轻盈、温暖' },
  { id: 'TC-012', name: '场景-Burial 风格 UK Garage', prompt: '做一段像 Burial 风格的 UK garage，有颗粒感的人声采样，沉重的鼓' },
  { id: 'TC-013', name: '技术-Minimal Techno', prompt: '来一段 120 BPM 的 minimal techno，只用 kick、hihat、一条 acid bassline，bassline 用 sawtooth + lpf 调制' },
  { id: 'TC-014', name: '技术-Trip-hop', prompt: '做一段 70 BPM 的 trip-hop，鼓要带 swing，钢琴用 gm_acoustic_grand_piano，加 reverb 和 delay' },
  { id: 'TC-015', name: '技术-Nu-jazz 四拍循环', prompt: '来一段 110 BPM 的 nu-jazz，和弦用 Cm9 → Abmaj7 → Ebmaj7 → Bb7，走四拍循环' },
  { id: 'TC-016', name: '极简-开放式请求 v1', prompt: '来一段好听的' },
  { id: 'TC-017', name: '极简-开放式请求 v2', prompt: '做点什么让我放松' },
  { id: 'TC-018', name: '极简-风格标签', prompt: 'lo-fi 一段' },
];

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  const results: Array<{ id: string; name: string; prompt: string; code: string; explanation: string }> = [];

  for (const tc of TEST_CASES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`▶ ${tc.id} — ${tc.name}`);
    console.log(`  Prompt: ${tc.prompt.slice(0, 80)}...`);
    try {
      const { code, explanation } = await runAgentLoop(tc.prompt);
      results.push({ ...tc, code, explanation });
      console.log(`  ✅ 完成，代码长度 ${code.length} chars`);
    } catch (e) {
      console.error(`  ❌ 失败:`, e);
      results.push({ ...tc, code: '// 生成失败', explanation: '生成过程中发生错误' });
    }
  }

  // 生成 Markdown
  const date = '2026-04-23';
  const lines: string[] = [
    `# Vibe 测试用例乐谱 — ${date}`,
    '',
    `> 由 Vibe 系统内置 Agent（claude-sonnet-4-6 + Strudel 工具链）自动生成`,
    `> 生成时间: ${date} | 模型: ${ANTHROPIC_MODEL} | 代理: ${ANTHROPIC_BASE_URL}`,
    '',
    '## 目录',
    '',
  ];
  for (const r of results) {
    lines.push(`- [${r.id} — ${r.name}](#${r.id.toLowerCase()})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const r of results) {
    lines.push(`## ${r.id} — ${r.name}`);
    lines.push('');
    lines.push(`**提示词**: ${r.prompt}`);
    lines.push('');
    if (r.explanation) {
      lines.push(`**Agent 说明**: ${r.explanation}`);
      lines.push('');
    }
    lines.push('```strudel');
    lines.push(r.code);
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const outDir = path.join(ROOT, 'docs', 'test-case', '20260423-v3');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'scores.md');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
  console.log(`\n✅ 所有乐谱已保存到: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
