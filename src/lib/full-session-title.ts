import type { ChatMessage } from '../hooks/useChat';

/** Recover only the exact legacy auto-title; preserve user-chosen names. */
export function fullSessionTitle(title: string, messages: readonly ChatMessage[]): string {
  const first = messages.find((message) => message.role === 'user')?.content.trim();
  return first && first.length > 20 && title === `${first.slice(0, 20)}…`
    ? first
    : title;
}
