import { chatOnce } from './llm';
import { zh } from '../lib/i18n';

// Model/credentials reuse the unified configuration in services/llm-config.ts;
// single-turn requests are automatically routed to the current provider via chatOnce().

const STATIC_SUGGESTIONS_ZH = [
  '来段复古游戏机通关音乐',
  '来段Jazz Funk',
  '来首小提琴和钢琴',
  '来点动感音乐',
  '来首古典优雅钢琴曲',
];

const STATIC_SUGGESTIONS_EN = [
  'Play some retro game music',
  'Play some Jazz Funk',
  'Play violin and piano',
  'Play some energetic music',
  'Play a classical piano piece',
];

export const STATIC_SUGGESTIONS = zh ? STATIC_SUGGESTIONS_ZH : STATIC_SUGGESTIONS_EN;

export type MusicStage = 'early' | 'developing' | 'full';
export type MusicLayer = typeof ALL_LAYERS[number];

const ALL_LAYERS = ['drum', 'bass', 'melody', 'fx'] as const;

export interface MusicState {
  layers: MusicLayer[];
  missing: MusicLayer[];
  stage: MusicStage;
}

/**
 * Lightweight heuristic analysis of a Strudel code snippet.
 * Returns which layers are present, which are missing, and the overall stage.
 * Does NOT call LLM — pure string analysis.
 */
export function analyzeMusicState(code: string): MusicState {
  if (!code) return { layers: [], missing: [...ALL_LAYERS], stage: 'early' };
  const c = code.toLowerCase();
  const layers: MusicLayer[] = [];

  // Drum detection: common Strudel drum sample names
  if (/\b(bd|sd|hh|oh|cp|mt|lt|ht|rim|kick|snare|hat|clap)\b/.test(c)) {
    layers.push('drum');
  }
  // Bass detection
  if (/\b(bass|sub|sawtooth|saw|square)\b/.test(c)) {
    layers.push('bass');
  }
  // Melody detection: pitched synths
  if (/\b(note|sine|piano|pluck|chord|melody|lead|pad|string)\b/.test(c)) {
    layers.push('melody');
  }
  // FX detection
  if (/\b(room|reverb|delay|echo|crush|distort|filter|lpf|hpf|pan)\b/.test(c)) {
    layers.push('fx');
  }

  const missing = ALL_LAYERS.filter((l) => !layers.includes(l));
  let stage: MusicStage;
  if (layers.length <= 1) stage = 'early';
  else if (layers.length <= 3) stage = 'developing';
  else stage = 'full';

  return { layers, missing, stage };
}

const STYLE_ALIASES: Record<string, string> = {
  lofi: 'lo-fi',
  'lo fi': 'lo-fi',
  hiphop: 'hip-hop',
  'hip hop': 'hip-hop',
  dnb: 'drum and bass',
  'drum and bass': 'drum and bass',
};

const STYLE_KEYWORDS = [
  'lo-fi', 'lofi', 'house', 'techno', 'ambient', 'jazz', 'funk',
  'drum and bass', 'dnb', 'trance', 'minimal', 'classical',
  'hip hop', 'hiphop', 'trap', 'indie', 'folk', 'lo fi',
];

/**
 * Extract a style intent string from the first user message in the conversation.
 * Returns null if no known style keyword is found.
 */
export function extractStyleIntent(messages: { role: string; content: string }[]): string | null {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return null;
  const text = firstUser.content.toLowerCase();
  for (const kw of STYLE_KEYWORDS) {
    if (text.includes(kw)) {
      return STYLE_ALIASES[kw] ?? kw;
    }
  }
  return null;
}

function buildSuggestSystem(state: MusicState, styleIntent: string | null, isZh: boolean): string {
  if (isZh) {
    const layersStr = state.layers.length > 0 ? state.layers.join(', ') : '无';
    const missingStr = state.missing.length > 0 ? state.missing.join(', ') : '无';
    const styleStr = styleIntent ?? '未知';
    return `你是 Strudel 实时电子乐协作伙伴。

目标：
为用户生成 2 个最值得点击的下一步创作指令，帮助当前曲子自然推进，而不是泛泛提问或解释。

原则：
- 优先降低用户决策成本，让每条建议都能直接驱动一次清晰的音乐改动。
- 根据曲子的丰满程度判断下一步价值：稀疏时建立基础，中期发展层次、律动或质感，丰满时推动变奏、对比和情绪变化。
- 风格方向明确时，让建议体现该风格的典型节奏、音色、密度或情绪。
- 避免把所有曲子推向同一种编曲模板；根据当前材料选择最有音乐性的方向。

状态知识：
- 已有声部：${layersStr}
- 缺少声部：${missingStr}
- 制作阶段：${state.stage}
- 风格方向：${styleStr}

声部角色：
- drum 提供律动和能量轮廓。
- bass 提供低频支撑和和声根基。
- melody 提供可记忆的主题、和声或氛围。
- fx 提供空间、转场、质感和动态变化。

创作引导：
- 如果曲子仍偏稀疏，优先建议补上最能支撑当前风格的缺失声部。
- 如果曲子已有基础，建议可以围绕层次、律动、速度、空间、音色或段落变化展开。
- 如果曲子已经丰满，建议应更关注变奏、对比、留白、情绪推进或风格化处理，而不是继续堆层。

硬约束：
- 每条必须是点击后可直接执行的祈使句选项，如"加入鼓点"、"让副歌更开阔"。
- 不要写问题、条件句、说明句、二选一长句或"如果你想...可以告诉我"这类咨询文本。
- 每条只能包含一个明确动作，不要用"或"、"或者"把两个选项混在同一条里。
- 每条 6-12 个字，自然口语，不要英文术语堆砌

输出前自检：
- 是否贴合当前状态和风格方向？
- 是否都是可直接执行的短指令？
- 是否每条只表达一个选项？
- 是否避免了咨询式、解释式或泛泛而谈的文本？

输出格式：
只输出 JSON：{"suggestions":["...","..."]}，不要任何额外文字`;
  }

  const layersStr = state.layers.length > 0 ? state.layers.join(', ') : 'none';
  const missingStr = state.missing.length > 0 ? state.missing.join(', ') : 'none';
  const styleStr = styleIntent ?? 'unknown';
  return `You are a Strudel live-coding music collaborator.

Goal:
Generate 2 next-step creative instructions that are worth clicking and help the current track move forward naturally, without generic questions or explanations.

Principles:
- Reduce the user's decision effort: each suggestion should drive one clear musical change.
- Judge the next best move from the track's fullness: sparse tracks need foundation, developing tracks need depth, groove, or texture, and full tracks need variation, contrast, or mood movement.
- When the style direction is known, reflect that style through rhythm, tone, density, or mood.
- Avoid forcing every track into the same arrangement template; choose what best serves the current material.

State Knowledge:
- Present layers: ${layersStr}
- Missing layers: ${missingStr}
- Production stage: ${state.stage}
- Style direction: ${styleStr}

Layer Roles:
- drum provides groove and energy contour.
- bass provides low-frequency support and harmonic foundation.
- melody provides memorable themes, harmony, or atmosphere.
- fx provides space, transitions, texture, and dynamic movement.

Creative Guidance:
- If the track is still sparse, prefer the missing layer that best supports the current style.
- If the track has a foundation, suggestions may develop layers, groove, tempo, space, tone, or section shape.
- If the track is already full, focus on variation, contrast, restraint, mood movement, or style-specific polish instead of adding more layers.

Hard Constraints:
- Each item must be a directly executable imperative option, e.g. "Add a drum beat" or "Make the bridge wider".
- Do not write questions, conditional phrasing, explanations, either/or long sentences, or "tell me if..." helper text.
- Each item must contain one clear action; do not join alternatives with "or" or "either".
- 5–10 words each, natural phrasing, avoid jargon

Self-Review:
- Does each suggestion fit the current state and style direction?
- Is each suggestion a directly executable short instruction?
- Does each item express only one option?
- Did you avoid consultative, explanatory, or generic text?

Output Format:
Only output JSON: {"suggestions":["...","..."]}, nothing else`;
}

interface SuggestResult {
  suggestions: string[];
}

function pickStatic(n = 2): string[] {
  const shuffled = [...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// Parse `jsonText` and return up to 3 non-empty string suggestions, or null if
// it isn't valid JSON with a `suggestions` array.
function extractSuggestionsFromJSON(jsonText: string): string[] | null {
  try {
    const p = JSON.parse(jsonText) as SuggestResult;
    if (Array.isArray(p?.suggestions)) {
      return p.suggestions
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim())
        .filter(isExecutableSuggestion)
        .slice(0, 3);
    }
  } catch {
    // fall through
  }
  return null;
}

function isExecutableSuggestion(s: string): boolean {
  if (!s || /[?？]/.test(s)) return false;
  const isZhSuggestion = /[一-龥]/.test(s);
  if (isZhSuggestion) {
    if (Array.from(s).length > 28) return false;
    return !/(如果|或者|或|可以告诉我|告诉我|我可以|你想|你可以|请告诉|描述你|我会|我能|是否|要不要|想不想)/.test(s);
  }
  if (s.split(/\s+/).filter(Boolean).length > 12) return false;
  return !/\b(if|when|or|either|tell me|let me know|you can|could you|would you|do you want|describe|ask me)\b/i.test(s);
}

function parseSuggestions(text: string): string[] | null {
  if (!text) return null;
  // Try direct JSON first.
  const direct = extractSuggestionsFromJSON(text);
  if (direct) return direct;
  // Try to find a JSON object inside fences.
  const m = text.match(/\{[\s\S]*?"suggestions"[\s\S]*?\}/);
  if (m) {
    const fenced = extractSuggestionsFromJSON(m[0]);
    if (fenced) return fenced;
  }
  console.warn('[suggestions] parseSuggestions: could not find valid JSON in LLM response:', text.slice(0, 200));
  return null;
}

/**
 * Extract next-step suggestion lines from a commit explanation.
 * Supports both Chinese ("接下来可以：") and English ("Next steps:") formats.
 * Returns an empty array if neither section is found.
 */
export function parseNextSteps(explanation: string): string[] {
  const match =
    explanation.match(/接下来可以[：:][\s\S]*$/) ??
    explanation.match(/Next steps[：:]\s*[\s\S]*$/i);
  if (!match) return [];
  return match[0]
    .split('\n')
    .filter((l) => /^\s*-\s/.test(l))
    .map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter(isExecutableSuggestion)
    .filter(Boolean);
}

export function stripNextSteps(explanation: string): string {
  return explanation
    .replace(/\n\n(?:接下来可以|Next steps)[：:][\s\S]*$/i, '')
    .trim();
}

/**
 * Build 2 short next-step suggestions based on the current code and conversation.
 * - Empty code → static defaults.
 * - Otherwise → LLM call with music state context; failure falls back to static.
 */
function detectIsZh(messages: { role: string; content: string }[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser ? /[一-龥]/.test(lastUser.content) : zh;
}

export async function buildSuggestions(
  currentCode: string,
  messages: { role: string; content: string }[],
): Promise<string[]> {
  if (!currentCode.trim()) {
    return pickStatic(2);
  }
  try {
    const isZh = detectIsZh(messages);
    const state = analyzeMusicState(currentCode);
    const styleIntent = extractStyleIntent(messages);
    const system = buildSuggestSystem(state, styleIntent, isZh);
    console.debug('[suggestions] calling LLM for suggestions, stage=%s style=%s isZh=%s', state.stage, styleIntent, isZh);

    const userMsg = isZh
      ? `当前曲谱：\n${currentCode}\n\n请输出 2 条建议。`
      : `Current score:\n${currentCode}\n\nOutput 2 suggestions.`;
    const text = await chatOnce(system, userMsg, {
      temperature: 0.8,
      maxTokens: 2048,
    });
    console.debug('[suggestions] LLM responded:', text.slice(0, 300));
    const parsed = parseSuggestions(text);
    if (parsed && parsed.length >= 2) {
      console.debug('[suggestions] parsed suggestions:', parsed);
      return parsed.slice(0, 2);
    }
    console.warn('[suggestions] parseSuggestions returned empty, falling back to static');
  } catch (e) {
    console.warn('[suggestions] upstream call failed, falling back to static', e);
  }
  return pickStatic(2);
}
