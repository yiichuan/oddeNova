/**
 * Converts a Session into the read model consumed by the Favorites page.
 * Favorites remain session rows; this object is rebuilt from the current row
 * instead of being persisted separately.
 */

import type { ChatMessage } from '../hooks/useChat';
import type { Session } from '../hooks/useSessions';
import { t } from './i18n';
import type { FavoriteConversation, FavoriteTurn } from './favorite-conversations';

/**
 * What the conversation actually said: the greeting is the app talking to
 * itself before anything was asked, and the studio keeps it out of its own
 * scrollback for the same reason. A session that never got past it has no
 * conversation to show, which is a thing the Favorites page has to be able to
 * tell.
 */
function isExchange(message: ChatMessage): message is ChatMessage & { role: 'user' | 'assistant' } {
  return (message.role === 'user' || message.role === 'assistant') && message.isGreeting !== true;
}

/**
 * The turns the Favorites page indexes the conversation by: what was said, in
 * order, and the script each reply committed.
 *
 * Agent process messages are left out — the archive filters them out of the
 * reading too, and a rail tick or a code column standing for a tool call would
 * point at something the page never shows. Ids are the messages' own, so a
 * script column, a rail tick and the message in the reading all name the same
 * thing.
 */
function sessionTurns(session: Session): FavoriteTurn[] {
  const turns: FavoriteTurn[] = [];
  for (const message of session.messages) {
    if (!isExchange(message)) continue;
    turns.push({
      id: message.id,
      role: message.role,
      text: message.content,
      ...(message.code === undefined ? {} : { code: message.code }),
    });
  }
  return turns;
}

/** Create the Favorites read model for a session. */
export function sessionAsFavorite(
  session: Session,
  options: { favoritedAt?: number; finalCode?: string } = {},
): FavoriteConversation {
  const messages = session.messages
    .filter((message) => message.role === 'progress' || isExchange(message))
    .map((message) => ({ ...message }));
  return {
    id: session.id,
    sessionId: session.id,
    sourceSessionId: session.id,
    title: session.title || t('newSessionTitle'),
    // A session with no `favoritedAt` is not one this is called for, but a
    // favorite without a date would sort to the bottom of time rather than
    // fail loudly, so it falls back to when the session was last touched.
    favoritedAt: options.favoritedAt ?? session.favoritedAt ?? session.updatedAt,
    turns: sessionTurns(session),
    // The greeting goes here too: it is not part of the exchange, and an
    // archive that opened on it would be showing a conversation that never
    // happened.
    messages,
    // Where the session came to rest. It is only read when no turn carries a
    // script of its own — see `favoriteScripts`.
    code: options.finalCode ?? session.code,
  };
}

/**
 * Every kept conversation, newest first — the order the Favorites list draws
 * and the page opens on.
 */
export function favoritedConversations(sessions: readonly Session[]): FavoriteConversation[] {
  return sessions
    .filter((session) => session.favoritedAt !== undefined)
    .sort((left, right) => (right.favoritedAt ?? 0) - (left.favoritedAt ?? 0))
    .map((session) => sessionAsFavorite(session));
}
