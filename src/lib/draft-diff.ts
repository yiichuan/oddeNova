import type { ChatMessage } from '../hooks/useChat';
import type { CodeRevision } from '../hooks/useSessions';

/**
 * The synthetic id of the manual-edit segment at the tail of the reading. It
 * belongs to no message: the segment is derived from the working draft every
 * render rather than stored, so nothing about it can drift out of step with the
 * code the editor is actually holding.
 */
export const DRAFT_SEGMENT_ID = '__draft__';

/**
 * What the working draft is measured against: the last take the conversation
 * committed, or null where the reading has committed none.
 *
 * Derived rather than stored, and that holds because rolling back truncates the
 * stream (`App.tsx` handleRollback) — so the last committed take in the reading
 * is always the one the draft actually grew out of, whether it arrived from a
 * turn or from a rollback.
 *
 * Null is not the same as an empty baseline, and the difference matters — it is
 * what says a reading with nothing in it has nothing to report.
 *
 * Writing a script by hand into a session that has held no conversation is the
 * plain case: there is no earlier version for it to be a change *from*, so the
 * reading stays empty until a turn gives it something to say. Nothing is lost
 * by the silence — the first turn takes that hand-written script as its own
 * baseline (`useAgentRunner` reads the live code), so it appears in the reading
 * as the thing that turn changed.
 *
 * A session can also open already holding a script nobody in the reading wrote:
 * the theme song seeds `code` under a greeting that carries none, and an import
 * can do the same. Measured against an empty string, that whole script would be
 * reported as the typist's own edit the moment the session opened.
 */
export function draftBaseCode(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'assistant' && message.code != null) return message.code;
  }
  return null;
}

/**
 * The code a rollback to `messageId` puts back: what the editor held when that
 * message was sent, or null where the message is not in the reading.
 *
 * The turn itself recorded that when it committed — its revision's
 * `beforeCode` is the live editor at turn start (`useAgentRunner`), so it
 * carries a script pasted into an empty session, the theme song, or a hand
 * edit made on top of the last take. None of those sit in any message, which
 * is why the last take before the message is only the fallback, for a turn
 * that committed nothing.
 *
 * With neither — no take before the message and none recorded for it — nothing
 * in the reading wrote the code; if nothing after it did either, the editor
 * still holds the user's own script and the rollback leaves it there.
 */
export function codeBeforeMessage(
  messages: ChatMessage[],
  revisions: readonly CodeRevision[] | undefined,
  messageId: string,
  currentCode: string,
): string | null {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return null;

  const later = messages.slice(index + 1);
  const nextUser = later.findIndex((message) => message.role === 'user');
  const turn = nextUser < 0 ? later : later.slice(0, nextUser);
  for (const message of turn) {
    if (message.role !== 'assistant' || message.code == null || !message.revisionId) continue;
    const revision = revisions?.find((candidate) => candidate.id === message.revisionId);
    if (revision) return revision.beforeCode;
  }

  const base = draftBaseCode(messages.slice(0, index));
  if (base !== null) return base;
  return later.some((message) => message.role === 'assistant' && message.code != null) ? '' : currentCode;
}
