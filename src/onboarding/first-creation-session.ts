import { makeGreetingMessage, type Session, type SessionImportPayload } from '../hooks/useSessions';
import { t } from '../lib/i18n';
import {
  CREATION_LANGS,
  FIRST_CREATION_TURN_COUNT,
  creationScript,
  type CreationLang,
} from './first-creation-case';
import type { CreationProgress } from './first-creation-state';

/**
 * The practice as a session. It is an ordinary conversation the whole way
 * through: each turn's instruction, thinking and reply are real messages and
 * its script a real revision, so when the reader carries on, the model sees
 * exactly what they saw. The guide's own cards never become messages.
 */

export function makeCreationSessionPayload(input: { id: string; now?: number }): SessionImportPayload {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    title: t('onboardingPracticeTitle'),
    messages: [makeGreetingMessage()],
    code: '',
    inputMode: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}

/** The reply carrying turn `turn`'s script, if the session has it. */
function replyIndexOf(session: Pick<Session, 'messages'>, turn: number, lang: CreationLang): number {
  const code = creationScript(turn, lang);
  return session.messages.findIndex((message) => message.role === 'assistant' && message.code === code);
}

/**
 * How many turns, in order, the session holds a reply for, and in which
 * language. Counting stops at the first missing turn.
 */
export function deliveredTurns(session: Pick<Session, 'messages'>): { count: number; lang: CreationLang | null } {
  for (const lang of CREATION_LANGS) {
    let count = 0;
    while (count < FIRST_CREATION_TURN_COUNT && replyIndexOf(session, count + 1, lang) !== -1) count++;
    if (count > 0) return { count, lang };
  }
  return { count: 0, lang: null };
}

/**
 * The session with whatever an unfinished turn left behind — the sent
 * instruction, half-streamed thinking — taken off the end, or null when there
 * is nothing to take. A turn cut short (stopped, the page closed, the reader
 * walking off the practice) is then sent again from clean.
 */
export function withoutUnfinishedTurn(session: Session): SessionImportPayload | null {
  const { count, lang } = deliveredTurns(session);
  const keep = count === 0 || !lang
    ? session.messages.findIndex((message) => message.role === 'user')
    : replyIndexOf(session, count, lang) + 1;
  if (keep === -1 || keep >= session.messages.length) return null;
  const messages = session.messages.slice(0, keep);
  const revisionIds = new Set(messages.map((message) => message.revisionId).filter(Boolean));
  return {
    id: session.id,
    title: session.title,
    messages,
    code: session.code,
    inputMode: 'normal',
    revisions: (session.revisions ?? []).filter((revision) => revisionIds.has(revision.id)),
    favoritedAt: session.favoritedAt,
    createdAt: session.createdAt,
    updatedAt: Date.now(),
  };
}

export type CreationResume =
  | { kind: 'ok'; delivered: number }
  | { kind: 'missing' }
  /** The reader changed the piece since, or the session is not this practice. */
  | { kind: 'changed' };

/**
 * Whether a practice can be picked up where `progress` left it. The session's
 * code must still be the last delivered turn's script: the guide would
 * otherwise point at music that is not there, and the next turn would write
 * over the reader's own edit.
 */
export function checkCreationResume(
  session: Session | undefined,
  progress: CreationProgress,
  lang: CreationLang,
): CreationResume {
  if (!session) return { kind: 'missing' };
  const found = deliveredTurns(session);
  const delivered = found.lang === null || found.lang === lang ? found.count : -1;
  if (delivered < progress.delivered) return { kind: 'changed' };
  if (session.code !== creationScript(delivered, lang)) return { kind: 'changed' };
  return { kind: 'ok', delivered };
}
