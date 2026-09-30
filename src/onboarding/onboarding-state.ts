/**
 * Where a visitor is in the first-run guide, as data.
 *
 * The guide is one practice walked as a six-step tour — listen, send a preset
 * instruction, read the reply, listen again, see the change, carry on for
 * real — and this module is the whole of its memory: a reducer over the moves
 * the reader can make, and how that is kept per account. Nothing here touches audio, sessions or React, so every branch
 * (skip, later, resume, restart) can be checked without any of them.
 *
 * Its own flag, deliberately separate from `oddenova_welcome_seen` and the
 * theme song's seed mark: having seen the welcome says nothing about having
 * done the practice, and having the theme song in the history says nothing
 * about having ever asked for a change.
 */

/** 2: the guide became a six-step tour over the studio's own controls. */
export const ONBOARDING_GUIDE_VERSION = 2;

/**
 * The six steps, in order. Each points at the real control it teaches:
 * the play key, the composer, the reply, the play key again, the code.
 */
export const TOUR_STEPS = [
  'listen-original',
  'send-instruction',
  'read-reply',
  'listen-adapted',
  'view-change',
  'done',
] as const;

export type OnboardingStep = (typeof TOUR_STEPS)[number];

/**
 * - `new`: never offered, or offered and not answered.
 * - `active`: a practice is under way (or waiting to be resumed).
 * - `postponed`: "later" — not offered again automatically until `postponedUntil`.
 * - `skipped` / `completed`: settled; never offered automatically again.
 */
export type OnboardingStatus = 'new' | 'active' | 'postponed' | 'skipped' | 'completed';

export interface OnboardingProgress {
  guideVersion: number;
  caseId: string;
  /** Hash of the case's scripts and copy — a mismatch on resume means restart. */
  contentHash: string;
  status: OnboardingStatus;
  step: OnboardingStep;
  /** The practice session, once one has been made. */
  sessionId: string | null;
  originalHeard: boolean;
  /** The preset turn is written into the practice session. Irreversible. */
  delivered: boolean;
  adaptedHeard: boolean;
  postponedUntil?: number;
  /** The first genuine instruction after finishing has been counted. */
  realInstructionCounted?: boolean;
  updatedAt: number;
}

export type OnboardingEvent =
  | { type: 'start'; sessionId: string; caseId: string; contentHash: string }
  | { type: 'original-heard' }
  | { type: 'delivered' }
  | { type: 'adapted-heard' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'finish' }
  | { type: 'skip' }
  | { type: 'postpone'; until: number }
  | { type: 'real-instruction' }
  | { type: 'reset' };

export function initialProgress(caseId: string, contentHash: string, now = Date.now()): OnboardingProgress {
  return {
    guideVersion: ONBOARDING_GUIDE_VERSION,
    caseId,
    contentHash,
    status: 'new',
    step: TOUR_STEPS[0],
    sessionId: null,
    originalHeard: false,
    delivered: false,
    adaptedHeard: false,
    updatedAt: now,
  };
}

/** 1-based, for the "n/6" counter. */
export function stepNumber(step: OnboardingStep): number {
  return TOUR_STEPS.indexOf(step) + 1;
}

/**
 * Whether "next" is open. A step that asks the reader to do something opens
 * only once they have: heard the window through, or sent the instruction —
 * and sending moves on by itself, so its "next" never opens.
 */
export function canAdvance(progress: OnboardingProgress): boolean {
  if (progress.status !== 'active') return false;
  switch (progress.step) {
    case 'listen-original':
      return progress.originalHeard;
    case 'send-instruction':
      return false;
    case 'listen-adapted':
      return progress.adaptedHeard;
    case 'done':
      return false;
    default:
      return true;
  }
}

/**
 * Whether "previous" is open. Not from the first step, and not back across the
 * send: the instruction is in the conversation and the piece has changed, so
 * the steps before it would be pointing at music that is no longer there.
 */
export function canGoBack(progress: OnboardingProgress): boolean {
  if (progress.status !== 'active') return false;
  const index = TOUR_STEPS.indexOf(progress.step);
  if (index <= 0) return false;
  return !(progress.delivered && TOUR_STEPS[index - 1] === 'send-instruction');
}

/**
 * The guide's transitions. A move that does not apply where the reader is —
 * a double-clicked send, a late "heard" after they already moved on — returns
 * the progress unchanged rather than jumping anywhere.
 */
export function reduceOnboarding(
  progress: OnboardingProgress,
  event: OnboardingEvent,
  now = Date.now(),
): OnboardingProgress {
  const next = (patch: Partial<OnboardingProgress>): OnboardingProgress => ({ ...progress, ...patch, updatedAt: now });
  const active = progress.status === 'active';
  const index = TOUR_STEPS.indexOf(progress.step);

  switch (event.type) {
    case 'start':
      return {
        ...initialProgress(event.caseId, event.contentHash, now),
        status: 'active',
        sessionId: event.sessionId,
      };
    case 'original-heard':
      if (!active || progress.step !== 'listen-original' || progress.originalHeard) return progress;
      return next({ originalHeard: true });
    case 'delivered':
      if (!active || progress.delivered) return progress;
      if (progress.step !== 'send-instruction' && progress.step !== 'listen-original') return progress;
      return next({ delivered: true, step: 'read-reply' });
    case 'adapted-heard':
      if (!active || progress.step !== 'listen-adapted' || progress.adaptedHeard) return progress;
      return next({ adaptedHeard: true });
    case 'next':
      if (!canAdvance(progress)) return progress;
      return next({ step: TOUR_STEPS[index + 1] });
    case 'prev':
      if (!canGoBack(progress)) return progress;
      return next({ step: TOUR_STEPS[index - 1] });
    case 'finish':
      if (!active || !progress.delivered) return progress;
      return next({ step: 'done', status: 'completed' });
    case 'skip':
      if (progress.status === 'completed' || progress.status === 'skipped') return progress;
      return next({ status: 'skipped' });
    case 'postpone':
      if (progress.status !== 'new' && progress.status !== 'postponed') return progress;
      return next({ status: 'postponed', postponedUntil: event.until });
    case 'real-instruction':
      if (progress.status !== 'completed' || progress.realInstructionCounted) return progress;
      return next({ realInstructionCounted: true });
    case 'reset':
      return initialProgress(progress.caseId, progress.contentHash, now);
  }
}

/**
 * Whether the invitation may open by itself.
 *
 * Only for someone this browser met for the first time after the guide shipped
 * (`eligible`), and never for a settled guide. The caller decides whether the
 * studio is free (nothing else on screen) before asking.
 */
export function shouldAutoInvite(
  progress: OnboardingProgress,
  input: { eligible: boolean; now: number },
): boolean {
  if (!input.eligible) return false;
  if (progress.status === 'new') return true;
  if (progress.status === 'postponed') return (progress.postponedUntil ?? 0) <= input.now;
  return false;
}

// ── Storage ────────────────────────────────────────────────────────────────

const PROGRESS_KEY_PREFIX = 'oddenova_onboarding_v1:';
/**
 * Set on the very first visit a browser makes after the guide shipped — the
 * same first paint that opens the welcome window. Browsers that were already
 * using the app before that never get it, so existing accounts are not
 * interrupted by a practice they do not need; they reach it from the menu.
 */
export const ONBOARDING_ELIGIBLE_KEY = 'oddenova_onboarding_eligible';

export function progressKey(ownerKey: string): string {
  return `${PROGRESS_KEY_PREFIX}${ownerKey}`;
}

function isProgress(value: unknown): value is OnboardingProgress {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.guideVersion === ONBOARDING_GUIDE_VERSION
    && typeof v.caseId === 'string'
    && typeof v.contentHash === 'string'
    && typeof v.status === 'string'
    && (TOUR_STEPS as readonly unknown[]).includes(v.step)
    && typeof v.delivered === 'boolean';
}

/**
 * The progress stored for `ownerKey`, or a fresh one.
 *
 * An account seen for the first time inherits a settled guest answer: someone
 * who did (or declined) the practice as a guest and then signed up has already
 * answered, and asking again the moment their account opens would be asking
 * the same person twice. An unfinished guest practice is not carried over —
 * its session moves with the guest-history import, and the account can resume
 * or restart it from the menu.
 */
export function readProgress(
  ownerKey: string,
  fallback: OnboardingProgress,
  storage: Storage = localStorage,
): OnboardingProgress {
  const read = (key: string): OnboardingProgress | null => {
    try {
      const raw = storage.getItem(progressKey(key));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isProgress(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  // Progress from an older guide is not read: its steps are not these steps.
  // A settled answer is still an answer, though — see the guest case below.
  const own = read(ownerKey);
  if (own) return own;
  if (ownerKey !== 'guest') {
    const guest = read('guest');
    if (guest && (guest.status === 'completed' || guest.status === 'skipped')) {
      return { ...guest, sessionId: null };
    }
  }
  return fallback;
}

export function writeProgress(ownerKey: string, progress: OnboardingProgress, storage: Storage = localStorage): void {
  try {
    storage.setItem(progressKey(ownerKey), JSON.stringify(progress));
  } catch {
    // Private mode or a full quota: the guide still works for this page load.
  }
}

export function isOnboardingEligible(storage: Storage = localStorage): boolean {
  try { return storage.getItem(ONBOARDING_ELIGIBLE_KEY) === '1'; } catch { return false; }
}

export function markOnboardingEligible(storage: Storage = localStorage): void {
  try { storage.setItem(ONBOARDING_ELIGIBLE_KEY, '1'); } catch { /* this page load only */ }
}
