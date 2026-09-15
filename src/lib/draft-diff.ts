import type { ChatMessage } from '../hooks/useChat';

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
