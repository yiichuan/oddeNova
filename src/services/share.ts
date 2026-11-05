import { ownImage } from '../lib/image-attachments';
import { authHeaders } from './cloud-session-repository';
import type { ChatMessage } from '../hooks/useChat';
import type { CodeRevision } from '../hooks/useSessions';

export type ShareLocale = 'zh-CN' | 'en';

export interface SharePayload {
  version: 1;
  title: string;
  code: string;
  messages: ChatMessage[];
  revisions?: CodeRevision[];
  sharedAt: number;
  locale?: ShareLocale;
}

export interface UploadShareInput {
  title: string;
  code: string;
  messages: ChatMessage[];
  revisions?: CodeRevision[];
  locale: ShareLocale;
}

export async function uploadShare(input: UploadShareInput): Promise<string> {
  const hasImages = input.messages.some(message => message.images?.length);
  if (hasImages && !window.confirm('分享后，输入图片将随对话公开。是否继续？')) throw new Error('已取消分享');
  const payload: SharePayload = {
    version: 1,
    title: input.title,
    code: input.code,
    messages: await Promise.all(input.messages.map(async message => ({ ...message, ...(message.images?.length ? { images: await Promise.all(message.images.map(ownImage)) } : {}) }))),
    revisions: input.revisions,
    sharedAt: Date.now(),
    locale: input.locale,
  };

  const res = await fetch('/api/share', {
    method: 'POST',
    headers: hasImages ? await authHeaders(true) : { 'Content-Type': 'application/json' },
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
