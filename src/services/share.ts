import type { AgentMode, ChatMessage } from '../hooks/useChat';

export interface SharePayload {
  version: 1;
  title: string;
  mode?: AgentMode;
  code: string;
  messages: ChatMessage[];
  sharedAt: number;
}

interface UploadShareInput {
  title: string;
  mode?: AgentMode;
  code: string;
  messages: ChatMessage[];
}

export async function uploadShare(input: UploadShareInput): Promise<string> {
  const payload: SharePayload = {
    version: 1,
    title: input.title,
    mode: input.mode,
    code: input.code,
    messages: input.messages,
    sharedAt: Date.now(),
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
