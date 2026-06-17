import { chatOnce } from './llm';
import type { ChatMessage } from '../hooks/useChat';

export interface GenerateSongTitleParams {
  code: string;
  sessionTitle?: string;
  messages?: Pick<ChatMessage, 'role' | 'content' | 'timestamp'>[];
  locale: 'zh-CN' | 'en';
}

const MAX_TITLE_CHARS = 60;
const MAX_SESSION_TITLE_CHARS = 120;
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CODE_CHARS = 4000;
const MAX_MESSAGE_CHARS = 500;
const TITLE_COMPLETION_MAX_TOKENS = 2000;

function stripWrappingQuotes(value: string): string {
  return value
    .replace(/^["'`“”‘’「『《]+/, '')
    .replace(/["'`“”‘’」』》]+$/, '');
}

function truncateVisible(value: string, maxChars: number): string {
  return Array.from(value).slice(0, maxChars).join('');
}

export function sanitizeSongTitle(raw: string): string {
  const withoutExtension = stripWrappingQuotes(raw.trim()).replace(/\.(wav|wave|mp3|flac|aiff?|ogg)$/i, '');
  const cleaned = withoutExtension
    .replace(/[\r\n]+/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const truncated = truncateVisible(cleaned, MAX_TITLE_CHARS).trim();

  if (!truncated) {
    throw new Error('No usable song title');
  }

  return truncated;
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
    'You are a celebrated album-naming poet, hired to give exported tracks titles that feel like they belong on a real record sleeve.',
    `Read the session context and code below, then return exactly one ${language} song name that captures a specific mood, image, or moment from it.`,
    'Favor concrete imagery, unexpected word pairings, or a vivid fragment over generic mood words such as "Midnight", "Dream", "Journey", "Echo", "Drift", or "Neon".',
    'Avoid naming the genre, BPM, or instruments literally; suggest them instead.',
    'Do not include explanations, quotes, numbering, punctuation-only decoration, or a file extension.',
    'Keep it evocative, surprising, and suitable as a filename.'
  ].join(' ');
}

function buildUserPrompt(params: GenerateSongTitleParams): string {
  const sessionTitle = truncateVisible(params.sessionTitle?.trim() || 'Untitled session', MAX_SESSION_TITLE_CHARS);
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
    maxTokens: TITLE_COMPLETION_MAX_TOKENS,
  });

  return sanitizeSongTitle(raw);
}
