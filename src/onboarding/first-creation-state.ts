/**
 * Where a visitor is in the first-run guide, as data.
 *
 * The guide is four sent instructions. Each turn is composed: the preset sits
 * in the real message box and the reader presses send. Then the two layouts
 * part ways:
 * - desktop: the first three turns are each explained by a card over the code
 *   panel, and the fourth closes on "you've made your first piece";
 * - phone: each turn plays from its reply's widget and the next one follows at
 *   once; after the fourth, the reader opens the code window (`open-code`),
 *   reads what the code is (`read-code`), and the guide closes.
 *
 * Its own flag, separate from `oddenova_welcome_seen` and the theme song's
 * seed mark: having seen the welcome says nothing about having made a piece.
 */

import { FIRST_CREATION_TURN_COUNT } from './first-creation-case';

/** 3: the guide became four turns of a first creation. */
export const FIRST_CREATION_GUIDE_VERSION = 3;

/**
 * - `new`: never offered, or offered and not answered.
 * - `active`: a practice is under way (or waiting to be resumed).
 * - `postponed`: not offered again automatically until `postponedUntil`.
 * - `skipped` / `completed`: settled; never offered automatically again.
 */
export type OnboardingStatus = 'new' | 'active' | 'postponed' | 'skipped' | 'completed';

export type CreationLayout = 'desktop' | 'mobile';

export const CREATION_STEPS = [
  'compose-1',
  'explain-1',
  'compose-2',
  'explain-2',
  'compose-3',
  'explain-3',
  'compose-4',
  // The phone only, after the fourth turn: open the code window, then read it.
  'open-code',
  'read-code',
  'done',
] as const;

export type CreationStep = (typeof CREATION_STEPS)[number];

export interface CreationProgress {
  guideVersion: number;
  caseId: string;
  /** Hash of the case in the language it was started in. */
  contentHash: string;
  status: OnboardingStatus;
  step: CreationStep;
  sessionId: string | null;
  /** How many turns are written into the practice session, 0..4. */
  delivered: number;
  postponedUntil?: number;
  realInstructionCounted?: boolean;
  updatedAt: number;
}

export type CreationEvent =
  | { type: 'start'; sessionId: string; caseId: string; contentHash: string }
  | { type: 'delivered'; turn: number; layout: CreationLayout }
  | { type: 'next' }
  /** The phone's code window was opened on `open-code`. */
  | { type: 'code-opened' }
  /** The reader is now on this layout: a step the other layout owns is moved onto this one's path. */
  | { type: 'layout'; layout: CreationLayout }
  | { type: 'finish' }
  | { type: 'skip' }
  | { type: 'postpone'; until: number }
  | { type: 'real-instruction' }
  | { type: 'reset' };

export function initialCreationProgress(caseId: string, contentHash: string, now = Date.now()): CreationProgress {
  return {
    guideVersion: FIRST_CREATION_GUIDE_VERSION,
    caseId,
    contentHash,
    status: 'new',
    step: CREATION_STEPS[0],
    sessionId: null,
    delivered: 0,
    updatedAt: now,
  };
}

/** The turn a compose step sends, or null on any other step. */
export function composeTurnOf(step: CreationStep): number | null {
  const match = /^compose-(\d)$/.exec(step);
  return match ? Number(match[1]) : null;
}

/** The turn an explain step describes, or null on any other step. */
export function explainTurnOf(step: CreationStep): number | null {
  const match = /^explain-(\d)$/.exec(step);
  return match ? Number(match[1]) : null;
}

/** How many steps the counter counts: the four turns, and on a phone the code window. */
export function creationStepCount(layout: CreationLayout): number {
  return layout === 'mobile' ? FIRST_CREATION_TURN_COUNT + 1 : FIRST_CREATION_TURN_COUNT;
}

/** 1-based, for the "n/4" (phone: "n/5") counter. */
export function creationStepNumber(step: CreationStep): number {
  if (step === 'open-code' || step === 'read-code') return FIRST_CREATION_TURN_COUNT + 1;
  return composeTurnOf(step) ?? explainTurnOf(step) ?? FIRST_CREATION_TURN_COUNT;
}

export function isCreationSettled(progress: CreationProgress): boolean {
  return progress.status === 'completed' || progress.status === 'skipped';
}

/**
 * Where a turn's delivery leaves the reader. Desktop: its explanation, or the
 * close after the last. Phone: the next turn, or the code window after the last.
 */
function stepAfterDelivery(turn: number, layout: CreationLayout): CreationStep {
  const last = turn >= FIRST_CREATION_TURN_COUNT;
  if (layout === 'mobile') return last ? 'open-code' : `compose-${turn + 1}` as CreationStep;
  return last ? 'done' : `explain-${turn}` as CreationStep;
}

/** The step on `layout`'s path that stands for `step` on the other's. */
function stepOnLayout(step: CreationStep, layout: CreationLayout): CreationStep {
  if (layout === 'mobile') {
    const turn = explainTurnOf(step);
    return turn === null ? step : `compose-${turn + 1}` as CreationStep;
  }
  return step === 'open-code' || step === 'read-code' ? 'done' : step;
}

/**
 * The guide's transitions. A move that does not apply where the reader is — a
 * double-clicked send, a late delivery after a restart — returns the progress
 * unchanged rather than jumping anywhere.
 */
export function reduceCreation(
  progress: CreationProgress,
  event: CreationEvent,
  now = Date.now(),
): CreationProgress {
  const next = (patch: Partial<CreationProgress>): CreationProgress => ({ ...progress, ...patch, updatedAt: now });
  const active = progress.status === 'active';

  switch (event.type) {
    case 'start':
      return {
        ...initialCreationProgress(event.caseId, event.contentHash, now),
        status: 'active',
        sessionId: event.sessionId,
      };
    case 'delivered':
      if (!active || event.turn !== progress.delivered + 1) return progress;
      if (composeTurnOf(progress.step) !== event.turn) return progress;
      return next({ delivered: event.turn, step: stepAfterDelivery(event.turn, event.layout) });
    case 'next': {
      if (!active) return progress;
      if (progress.step === 'read-code') return next({ step: 'done' });
      const turn = explainTurnOf(progress.step);
      if (turn === null || progress.delivered < turn) return progress;
      return next({ step: `compose-${turn + 1}` as CreationStep });
    }
    case 'code-opened':
      if (!active || progress.step !== 'open-code') return progress;
      return next({ step: 'read-code' });
    case 'layout': {
      if (!active) return progress;
      const step = stepOnLayout(progress.step, event.layout);
      return step === progress.step ? progress : next({ step });
    }
    case 'finish':
      if (!active || progress.delivered < FIRST_CREATION_TURN_COUNT) return progress;
      return next({ step: 'done', status: 'completed' });
    case 'skip':
      if (isCreationSettled(progress)) return progress;
      return next({ status: 'skipped' });
    case 'postpone':
      if (progress.status !== 'new' && progress.status !== 'postponed') return progress;
      return next({ status: 'postponed', postponedUntil: event.until });
    case 'real-instruction':
      if (progress.status !== 'completed' || progress.realInstructionCounted) return progress;
      return next({ realInstructionCounted: true });
    case 'reset':
      return initialCreationProgress(progress.caseId, progress.contentHash, now);
  }
}

/**
 * Bring a stored step in line with what the practice session actually holds:
 * a page that went away after a turn was written but before that was
 * recorded resumes past it rather than sending it again.
 */
export function reconcileDelivered(
  progress: CreationProgress,
  deliveredInSession: number,
  layout: CreationLayout,
  now = Date.now(),
): CreationProgress {
  let current = progress;
  while (current.delivered < deliveredInSession) {
    const turn = current.delivered + 1;
    const moved = reduceCreation({ ...current, step: `compose-${turn}` as CreationStep }, { type: 'delivered', turn, layout }, now);
    if (moved === current) break;
    current = moved;
  }
  return current;
}

/** Whether the invitation may open by itself. */
export function shouldAutoInviteCreation(
  progress: CreationProgress,
  input: { eligible: boolean; now: number },
): boolean {
  if (!input.eligible) return false;
  if (progress.status === 'new') return true;
  if (progress.status === 'postponed') return (progress.postponedUntil ?? 0) <= input.now;
  return false;
}

// ── Storage ────────────────────────────────────────────────────────────────

const PROGRESS_KEY_PREFIX = 'oddenova_first_creation_v1:';

export function creationProgressKey(ownerKey: string): string {
  return `${PROGRESS_KEY_PREFIX}${ownerKey}`;
}

function isCreationProgress(value: unknown): value is CreationProgress {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.guideVersion === FIRST_CREATION_GUIDE_VERSION
    && typeof v.caseId === 'string'
    && typeof v.contentHash === 'string'
    && typeof v.status === 'string'
    && (CREATION_STEPS as readonly unknown[]).includes(v.step)
    && typeof v.delivered === 'number';
}

/** Read only the progress for this account or guest. */
export function readCreationProgress(
  ownerKey: string,
  fallback: CreationProgress,
  storage: Storage = localStorage,
): CreationProgress {
  try {
    const raw = storage.getItem(creationProgressKey(ownerKey));
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isCreationProgress(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeCreationProgress(ownerKey: string, progress: CreationProgress, storage: Storage = localStorage): void {
  try {
    storage.setItem(creationProgressKey(ownerKey), JSON.stringify(progress));
  } catch {
    // Private mode or a full quota: the guide still works for this page load.
  }
}

/**
 * Set on the very first visit a browser makes after the guide shipped — the
 * same first paint that opens the welcome window. Browsers that were already
 * using the app before that never get it, so returning guests reach the guide
 * from the menu. Signed-in users use account progress instead.
 */
export const ONBOARDING_ELIGIBLE_KEY = 'oddenova_onboarding_eligible';

export function isOnboardingEligible(storage: Storage = localStorage): boolean {
  try { return storage.getItem(ONBOARDING_ELIGIBLE_KEY) === '1'; } catch { return false; }
}

export function markOnboardingEligible(storage: Storage = localStorage): void {
  try { storage.setItem(ONBOARDING_ELIGIBLE_KEY, '1'); } catch { /* this page load only */ }
}
