import type { OnboardingProgress } from './onboarding-state';

/**
 * The phone's reading of the six-step guide.
 *
 * The steps stay what they are — one reducer, one stored record, shared with
 * the desktop — and this is only how a phone presents them: one screen at a
 * time, each asking for one thing, and each new guide card counted as a step
 * of its own (the invitation is 0). The first desktop step teaches where the
 * phone's play key lives, so it splits on whether the code window is open (a
 * fact of this page load, never stored): open it, play inside it, shut it.
 * The last two desktop steps collapse into one closing panel. Nothing here
 * writes progress: a phone that turns wide again finds the desktop step it
 * left.
 */

/** Steps after the invitation, which counts as 0. */
export const MOBILE_STAGE_COUNT = 7;

export type MobileStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type MobilePhase =
  /** The code window is shut and the original not heard: point at its key. */
  | 'open-window'
  /** The window is open: point at its play key. */
  | 'play-in-window'
  /** Heard, window still open: point at its close key. */
  | 'close-window'
  /** Heard and the window already shut — a resume. One press moves on. */
  | 'original-heard'
  | 'send'
  | 'read-reply'
  | 'listen-adapted'
  | 'finish';

export function mobilePhaseOf(
  progress: Pick<OnboardingProgress, 'step' | 'originalHeard'>,
  input: { codeWindowOpen: boolean },
): MobilePhase {
  switch (progress.step) {
    case 'listen-original':
      if (input.codeWindowOpen) return progress.originalHeard ? 'close-window' : 'play-in-window';
      return progress.originalHeard ? 'original-heard' : 'open-window';
    case 'send-instruction':
      return 'send';
    case 'read-reply':
      return 'read-reply';
    case 'listen-adapted':
      return 'listen-adapted';
    case 'view-change':
    case 'done':
      return 'finish';
  }
}

/** The number the phone's guide shows: every new guide card is a step. */
const STAGE_OF_PHASE: Record<MobilePhase, MobileStage> = {
  'open-window': 1,
  'play-in-window': 2,
  'close-window': 3,
  // A resume after the listen with the window already shut stands in for
  // the card that asks to shut it.
  'original-heard': 3,
  send: 4,
  'read-reply': 5,
  'listen-adapted': 6,
  finish: 7,
};

export function mobileStageOf(phase: MobilePhase): MobileStage {
  return STAGE_OF_PHASE[phase];
}

/** Whether the phase is walked inside the code window rather than on the conversation. */
export function isWindowPhase(phase: MobilePhase): boolean {
  return phase === 'play-in-window' || phase === 'close-window';
}

/**
 * Whether the closing panel may hand the reader on. The shared `finish` only
 * asks that the preset was delivered; a phone asks too that the new version
 * was heard, which is the point of the practice. The original is not asked
 * for here: once the preset is in, the original is no longer in the editor to
 * be heard, and a record that got past it anyway cannot be sent back to it.
 */
export function canFinishOnMobile(progress: OnboardingProgress): boolean {
  return progress.status === 'active' && progress.delivered && progress.adaptedHeard;
}

/**
 * A stored record that reached the closing panel without the listen it needs
 * — never by the reducer's own moves, but a record is data — goes back a
 * step at a time until it reaches `listen-adapted`.
 */
export function needsMobileRecovery(progress: OnboardingProgress): boolean {
  return progress.status === 'active'
    && (progress.step === 'view-change' || progress.step === 'done')
    && progress.delivered
    && !progress.adaptedHeard;
}

/**
 * Closing the code window during the first stage: moves on exactly when the
 * original has been heard. Shutting it early leaves the step where it is, so
 * the reader is pointed back at the window's key.
 */
export function advancesOnWindowClose(progress: Pick<OnboardingProgress, 'status' | 'step' | 'originalHeard'>): boolean {
  return progress.status === 'active' && progress.step === 'listen-original' && progress.originalHeard;
}
