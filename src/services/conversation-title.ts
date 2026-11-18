import { normalizeSessionTitle } from '../../shared/session-title';
import { chatOnce } from './llm-loader';

type TitleLocale = 'zh-CN' | 'en';

function stripTitleWrapping(value: string): string {
  const pairs = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
    ['《', '》'],
  ] as const;

  for (const [opening, closing] of pairs) {
    if (value.startsWith(opening) && value.endsWith(closing)) {
      return value.slice(opening.length, -closing.length).trim();
    }
  }

  return value;
}

export function sanitizeConversationTitle(raw: string): string {
  const firstLine = raw
    .trim()
    .replace(/^```(?:\w+)?\s*/u, '')
    .replace(/\s*```$/u, '')
    .split(/\r?\n/u, 1)[0]
    .trim()
    .replace(/^(?:title|标题)\s*[:：]\s*/iu, '')
    .replace(/^(?:[-*•]|\d+[.)、])\s*/u, '');
  const cleaned = normalizeSessionTitle(stripTitleWrapping(firstLine), '');

  if (!cleaned) {
    throw new Error('No usable conversation title');
  }

  return cleaned;
}

export async function generateConversationTitle(
  firstMessage: string,
  fallbackLocale: TitleLocale,
): Promise<string> {
  const language = fallbackLocale === 'zh-CN' ? 'Chinese' : 'English';
  const system = [
    'You create concise titles for saved conversations in a browser music creation app.',
    'Read the user’s first message and name the conversation after the creative direction or task it expresses.',
    `Use the same language as the first message. If its language is unclear, use ${language}.`,
    'Make the title specific and easy to recognize later. Keep it short and natural.',
    'Return only one title on one line, without a label, explanation, quotes, numbering, or decorative punctuation.',
  ].join(' ');
  const raw = await chatOnce(system, firstMessage.trim(), {
    temperature: 0.4,
    maxTokens: 2000,
  });

  return sanitizeConversationTitle(raw);
}
