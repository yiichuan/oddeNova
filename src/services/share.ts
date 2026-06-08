import type { ChatMessage } from '../hooks/useChat';

export interface ShareCard {
  title: string;
  description: string;
}

export interface SharePayload {
  version: 1;
  title: string;
  code: string;
  messages: ChatMessage[];
  sharedAt: number;
  card?: ShareCard;
}

interface UploadShareInput {
  title: string;
  code: string;
  messages: ChatMessage[];
}

const DEFAULT_CARD_TITLE = 'oddeNova 即兴音乐创作';
const DEFAULT_CARD_DESCRIPTION =
  'oddeNova是一款即兴音乐制作agent。你如何vibe coding，就如何vibe一支属于你自己的单曲。让灵感，自由发声。';

function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function createShareCard(input: UploadShareInput): ShareCard {
  const firstUser = input.messages.find((m) => m.role === 'user')?.content ?? '';
  const firstAssistant = input.messages.find((m) => m.role === 'assistant')?.content ?? '';
  const cleanedTitle = cleanText(input.title);
  const titleSource =
    cleanedTitle && cleanedTitle !== '新会话'
      ? cleanedTitle
      : cleanText(firstUser || firstAssistant);
  const title = titleSource
    ? `${truncate(titleSource, 42)} | oddeNova`
    : DEFAULT_CARD_TITLE;

  const descriptionSource =
    cleanText(firstUser) ||
    cleanText(firstAssistant) ||
    cleanText(input.code);
  const description = descriptionSource
    ? truncate(`听听这段用 oddeNova 生成的即兴音乐：${descriptionSource}`, 110)
    : DEFAULT_CARD_DESCRIPTION;

  return { title, description };
}

export async function uploadShare(input: UploadShareInput): Promise<string> {
  const payload: SharePayload = {
    version: 1,
    title: input.title,
    code: input.code,
    messages: input.messages,
    sharedAt: Date.now(),
    card: createShareCard(input),
  };

  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Share failed: ${res.status}`);

  const data = (await res.json()) as { shareId: string };
  return data.shareId;
}

export async function fetchShare(shareId: string): Promise<SharePayload> {
  const res = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`);
  if (!res.ok) throw new Error(`Fetch share failed: ${res.status}`);
  return res.json() as Promise<SharePayload>;
}
