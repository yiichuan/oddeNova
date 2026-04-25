import Anthropic from '@anthropic-ai/sdk';
import { getActiveModelConfig } from './llm-config';

// 模型/凭据复用 services/llm-config.ts 中的统一配置，方便切换 sonnet / opus。

export const STATIC_SUGGESTIONS = [
  '来段复古游戏机通关音乐',
  '来段Jazz Funk',
  '来首小提琴和钢琴',
  '来点动感音乐',
  '来首古典优雅钢琴曲',
];

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const cfg = getActiveModelConfig();
    client = new Anthropic({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        Authorization: `Bearer ${cfg.apiKey}`,
      },
    });
  }
  return client;
}

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

function buildSuggestSystem(state: MusicState, styleIntent: string | null): string {
  const layersStr = state.layers.length > 0 ? state.layers.join(', ') : '无';
  const missingStr = state.missing.length > 0 ? state.missing.join(', ') : '无';
  const styleStr = styleIntent ?? '未知';

  return `你是 Strudel 实时电子乐协作伙伴。

当前曲子状态：
- 已有声部：${layersStr}
- 缺少声部：${missingStr}
- 制作阶段：${state.stage}
- 风格方向：${styleStr}

基于以上状态，建议 2 个用户可以发出的"下一步"中文短指令。
规则：
- stage=early → 优先建议补 missing 里的声部（如"加入鼓点"、"铺一层低音"）
- stage=developing → 可以加层，也可以调质感/节奏/速度
- stage=full → 专注变奏、情绪变化，不要再建议加层
- 风格方向不为"未知"时，建议内容要符合该风格特征
- 每条 6-12 个字，自然口语，不要英文术语堆砌
- 输出 JSON：{"suggestions":["...","..."]}，不要任何额外文字`;
}

interface SuggestResult {
  suggestions: string[];
}

function pickStatic(n = 2): string[] {
  const shuffled = [...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function parseSuggestions(text: string): string[] | null {
  if (!text) return null;
  // Try direct JSON first.
  try {
    const p = JSON.parse(text) as SuggestResult;
    if (Array.isArray(p?.suggestions)) {
      return p.suggestions.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3);
    }
  } catch {
    // fall through
  }
  // Try to find a JSON object inside fences.
  const m = text.match(/\{[\s\S]*?"suggestions"[\s\S]*?\}/);
  if (m) {
    try {
      const p = JSON.parse(m[0]) as SuggestResult;
      if (Array.isArray(p?.suggestions)) {
        return p.suggestions.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3);
      }
    } catch {
      // fall through
    }
  }
  return null;
}

/**
 * Build 2 short next-step suggestions based on the current code and conversation.
 * - Empty code → static defaults.
 * - Otherwise → LLM call with music state context; failure falls back to static.
 */
export async function buildSuggestions(
  currentCode: string,
  messages: { role: string; content: string }[],
): Promise<string[]> {
  if (!currentCode.trim()) {
    return pickStatic(2);
  }
  try {
    const state = analyzeMusicState(currentCode);
    const styleIntent = extractStyleIntent(messages);
    const system = buildSuggestSystem(state, styleIntent);

    const anthropic = getClient();
    const resp = await anthropic.messages.create({
      model: getActiveModelConfig().model,
      system,
      messages: [
        {
          role: 'user',
          content: `当前曲谱：\n${currentCode}\n\n请输出 2 条建议。`,
        },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = parseSuggestions(text);
    if (parsed && parsed.length > 0) return parsed.slice(0, 2);
  } catch (e) {
    console.warn('[suggestions] upstream call failed, falling back to static', e);
  }
  return pickStatic(2);
}
