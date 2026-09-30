import type { ChatMessage } from '../hooks/useChat';
import type { CodeRevision, Session, SessionImportPayload } from '../hooks/useSessions';
import { t } from '../lib/i18n';
import {
  adaptedScript,
  originalScript,
  presetInstruction,
  presetReply,
} from './intro-piano-case';
import type { OnboardingProgress } from './onboarding-state';

/**
 * The practice as a session: made from the archived theme song, written once
 * with the preset turn, and checked before a practice is picked up again.
 *
 * It is an ordinary session the whole way through. The preset instruction and
 * reply are real messages and the adapted script a real revision, so when the
 * reader carries on, the model sees exactly what they saw: their instruction,
 * the result, and the code now in the editor. The guide's own words — cards,
 * step labels, "loading the example" — never become messages, so none of it
 * reaches the model's context. The opening line is a greeting, which the
 * history builder already leaves out.
 */

type Lang = 'zh' | 'en';
const LANGS: readonly Lang[] = ['zh', 'en'];

let idCounter = 0;
function localId(prefix: string, now: number): string {
  return `${prefix}-${now}-${++idCounter}`;
}

export function makePracticeSessionPayload(input: { id: string; lang: Lang; now?: number }): SessionImportPayload {
  const now = input.now ?? Date.now();
  const greeting: ChatMessage = {
    id: localId('msg', now),
    role: 'assistant',
    content: t('onboardingPracticeIntro'),
    timestamp: now,
    isGreeting: true,
  };
  return {
    id: input.id,
    title: t('onboardingPracticeTitle'),
    messages: [greeting],
    code: originalScript(input.lang),
    inputMode: 'normal',
    createdAt: now,
    updatedAt: now,
  };
}

/** The reply that carries the adapted script — what the tour's third step points at. */
export function presetReplyId(session: Pick<Session, 'messages'> | undefined): string | null {
  const reply = session?.messages.find((message) =>
    message.role === 'assistant'
    && message.code !== undefined
    && LANGS.some((lang) => adaptedScript(lang) === message.code));
  return reply?.id ?? null;
}

/** Which language's case this session was made from, or null if neither. */
function caseLangOf(code: string): Lang | null {
  return LANGS.find((lang) => originalScript(lang) === code || adaptedScript(lang) === code) ?? null;
}

export function hasPresetDelivered(session: Pick<Session, 'messages'>): boolean {
  return presetReplyId(session) !== null;
}

/**
 * The session with the preset turn written into it: the instruction, the
 * reply carrying the adapted script, and the revision between the two
 * versions. Returns null when that is already there, so a second send — a
 * double click, a refresh mid-load — can never write it twice.
 */
export function withPresetDelivered(session: Session, now = Date.now()): SessionImportPayload | null {
  if (hasPresetDelivered(session)) return null;
  const lang = caseLangOf(session.code) ?? 'en';
  const revision: CodeRevision = {
    id: localId('rev', now),
    beforeCode: originalScript(lang),
    afterCode: adaptedScript(lang),
    playbackStatus: 'not_attempted',
    createdAt: now,
  };
  const user: ChatMessage = {
    id: localId('msg', now),
    role: 'user',
    content: presetInstruction(lang),
    timestamp: now,
  };
  const reply: ChatMessage = {
    id: localId('msg', now),
    role: 'assistant',
    content: presetReply(lang),
    code: revision.afterCode,
    revisionId: revision.id,
    inputMode: 'normal',
    timestamp: now + 1,
  };
  return {
    id: session.id,
    title: session.title,
    messages: [...session.messages, user, reply],
    code: revision.afterCode,
    inputMode: 'normal',
    revisions: [...(session.revisions ?? []), revision],
    favoritedAt: session.favoritedAt,
    createdAt: session.createdAt,
    updatedAt: now + 1,
  };
}

export type PracticeResume =
  | { kind: 'ok'; delivered: boolean; lang: Lang }
  | { kind: 'missing' }
  /** The reader changed the piece since, or it is not the case's piece. */
  | { kind: 'changed' };

/**
 * Whether a practice can be picked up where `progress` left it. A session that
 * is gone, or whose code is no longer the version the step expects, is not
 * continued: the guide would be pointing at music that is not there, and
 * writing the preset into someone's edited piece would overwrite their work.
 */
export function checkPracticeResume(session: Session | undefined, progress: OnboardingProgress): PracticeResume {
  if (!session) return { kind: 'missing' };
  const lang = caseLangOf(session.code);
  if (!lang) return { kind: 'changed' };
  const delivered = hasPresetDelivered(session);
  const onAdapted = session.code === adaptedScript(lang);

  if (progress.delivered) {
    return delivered && onAdapted ? { kind: 'ok', delivered, lang } : { kind: 'changed' };
  }
  // Before delivery the piece must still be the original, unless the page
  // went away after the write but before the progress recorded it — then it
  // is simply delivered, and the caller moves the step forward.
  if (delivered) return onAdapted ? { kind: 'ok', delivered, lang } : { kind: 'changed' };
  return session.code === originalScript(lang) ? { kind: 'ok', delivered, lang } : { kind: 'changed' };
}
