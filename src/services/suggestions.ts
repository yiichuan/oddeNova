import Anthropic from '@anthropic-ai/sdk';

// Reuse the same upstream proxy + key as services/llm.ts.
const ANTHROPIC_API_KEY = 'sk-bQJ3QzB4h6b3u5aRGuvd8XTXG0jD1KDsWMtJgtLGcQjGArvR';
const ANTHROPIC_BASE_URL = 'https://timesniper.club';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export const STATIC_SUGGESTIONS = [
  '来一段 lo-fi 鼓点',
  '加一个 808 贝斯',
  '来点空灵的 pad',
  '节奏加快一点',
  '加些混响效果',
  '换成 house 风格',
];

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
      baseURL: ANTHROPIC_BASE_URL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        Authorization: `Bearer ${ANTHROPIC_API_KEY}`,
      },
    });
  }
  return client;
}

const SUGGEST_SYSTEM = `你是 Strudel 实时电子乐协作伙伴。基于当前曲谱，建议 2 个用户可以发出的"下一步"中文短指令。
要求：
- 每条 6-12 个字，自然口语，不要带编号、不要英文术语堆砌
- 多样化：可以是加层、调速度、换风格、加效果、移除某层
- 直接输出 JSON：{"suggestions":["...","..."]}，不要任何额外文字`;

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
 * Build 2 short next-step suggestions based on the current code.
 * - Empty code → static defaults.
 * - Otherwise → light LLM call; failure silently falls back to static.
 */
export async function buildSuggestions(currentCode: string): Promise<string[]> {
  if (!currentCode.trim()) {
    return pickStatic(2);
  }
  try {
    const anthropic = getClient();
    const resp = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      system: SUGGEST_SYSTEM,
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
