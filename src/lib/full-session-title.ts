import type { ChatMessage } from '../hooks/useChat';
import { normalizeSessionTitle } from './session-title';

/**
 * The name to draw for a conversation, with one old truncation undone.
 *
 * Titles derived before the shared limit existed were the first twenty UTF-16
 * units of the opening message and an ellipsis — short enough that the phone's
 * running caption had nothing to run. Where a stored title is *exactly* that
 * string, the opening message is what it was cut from, so it is put back.
 *
 * Only an exact match, and never a guess: an ellipsis is also something a user
 * types. A name they chose that happens to trail off is theirs, and expanding it
 * into the body of a message would replace a title with a paragraph.
 *
 * What comes back is held to the current limit either way — the recovered text
 * is a whole message, and the point of recovering it is to see more of the name,
 * not all of the message. The message itself keeps every word.
 */
export function fullSessionTitle(title: string, messages: readonly ChatMessage[]): string {
  const first = messages.find((message) => message.role === 'user')?.content.trim();
  const restored = first && title === `${first.slice(0, 20)}…` ? first : title;
  return normalizeSessionTitle(restored, title);
}
