import { chatOnce } from './llm';
import type { ChatMessage } from '../hooks/useChat';

export interface GenerateSongTitleParams {
  code: string;
  sessionTitle?: string;
  messages?: Pick<ChatMessage, 'role' | 'content' | 'timestamp'>[];
  locale: 'zh-CN' | 'en';
}

const MAX_TITLE_CHARS = 60;
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CODE_CHARS = 4000;
const MAX_MESSAGE_CHARS = 500;

function stripWrappingQuotes(value: string): string {
  return value
    .replace(/^["'`“”‘’「『《]+/, '')
    .replace(/["'`“”‘’」』》]+$/, '');
}

export function sanitizeSongTitle(raw: string): string {
  const withoutExtension = stripWrappingQuotes(raw.trim()).replace(/\.(wav|wave|mp3|flac|aiff?|ogg)$/i, '');
  const cleaned = withoutExtension
    .replace(/[\r\n]+/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_CHARS)
    .trim();

  if (!cleaned) {
    throw new Error('No usable song title');
  }

  return cleaned;
}

function summarizeMessages(messages: GenerateSongTitleParams['messages']): string {
  if (!messages || messages.length === 0) return 'No chat context.';

  return messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => {
      const content = message.content.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS);
      return `${message.role}: ${content}`;
    })
    .join('\n');
}

function buildSystemPrompt(locale: GenerateSongTitleParams['locale']): string {
  const language = locale === 'zh-CN' ? 'Chinese' : 'English';
  return [
    'You generate concise song titles for exported music files.',
    `Return exactly one ${language} song title.`,
    'Do not include explanations, quotes, numbering, punctuation-only decoration, or a file extension.',
    'Keep it short, evocative, and suitable as a filename.',
  ].join(' ');
}

function buildUserPrompt(params: GenerateSongTitleParams): string {
  const sessionTitle = params.sessionTitle?.trim() || 'Untitled session';
  const code = params.code.trim().slice(0, MAX_CODE_CHARS) || 'No code available.';

  return [
    `Session title: ${sessionTitle}`,
    '',
    'Recent chat:',
    summarizeMessages(params.messages),
    '',
    'Current Strudel code:',
    code,
  ].join('\n');
}

export async function generateSongTitle(params: GenerateSongTitleParams): Promise<string> {
  const raw = await chatOnce(buildSystemPrompt(params.locale), buildUserPrompt(params), {
    temperature: 0.8,
    maxTokens: 40,
  });

  return sanitizeSongTitle(raw);
}
