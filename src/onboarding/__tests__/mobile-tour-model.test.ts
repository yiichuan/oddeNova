import { describe, expect, it } from 'vitest';
import {
  MOBILE_STAGE_COUNT,
  advancesOnWindowClose,
  canFinishOnMobile,
  isWindowPhase,
  mobilePhaseOf,
  mobileStageOf,
  needsMobileRecovery,
} from '../mobile-tour-model';
import { initialProgress, reduceOnboarding, type OnboardingProgress } from '../onboarding-state';

const started = (): OnboardingProgress =>
  reduceOnboarding(initialProgress('intro-piano-v1', 'hash', 0), {
    type: 'start',
    sessionId: 'practice',
    caseId: 'intro-piano-v1',
    contentHash: 'hash',
  }, 0);

function walk(progress: OnboardingProgress, ...events: Parameters<typeof reduceOnboarding>[1][]): OnboardingProgress {
  return events.reduce((p, event) => reduceOnboarding(p, event, 0), progress);
}

describe('mobileStageOf', () => {
  it('counts every new guide card as a step, in the order they appear', () => {
    expect(mobileStageOf('open-window')).toBe(1);
    expect(mobileStageOf('play-in-window')).toBe(2);
    expect(mobileStageOf('close-window')).toBe(3);
    expect(mobileStageOf('original-heard')).toBe(3);
    expect(mobileStageOf('send')).toBe(4);
    expect(mobileStageOf('read-reply')).toBe(5);
    expect(mobileStageOf('listen-adapted')).toBe(6);
    expect(mobileStageOf('finish')).toBe(7);
    expect(MOBILE_STAGE_COUNT).toBe(7);
  });
});

describe('mobilePhaseOf', () => {
  it('walks the first stage through the code window', () => {
    const fresh = started();
    expect(mobilePhaseOf(fresh, { codeWindowOpen: false })).toBe('open-window');
    expect(mobilePhaseOf(fresh, { codeWindowOpen: true })).toBe('play-in-window');

    const heard = walk(fresh, { type: 'original-heard' });
    expect(mobilePhaseOf(heard, { codeWindowOpen: true })).toBe('close-window');
    // A resume after hearing it: no need to open the window only to shut it.
    expect(mobilePhaseOf(heard, { codeWindowOpen: false })).toBe('original-heard');
  });

  it('keeps reply and adapted listen on one stage, and both last steps on the closing panel', () => {
    const p = started();
    expect(mobilePhaseOf({ ...p, step: 'send-instruction' }, { codeWindowOpen: false })).toBe('send');
    expect(mobilePhaseOf({ ...p, step: 'read-reply' }, { codeWindowOpen: false })).toBe('read-reply');
    expect(mobilePhaseOf({ ...p, step: 'listen-adapted' }, { codeWindowOpen: false })).toBe('listen-adapted');
    expect(mobilePhaseOf({ ...p, step: 'view-change' }, { codeWindowOpen: false })).toBe('finish');
    expect(mobilePhaseOf({ ...p, step: 'done' }, { codeWindowOpen: false })).toBe('finish');
  });

  it('only the first stage lives in the window', () => {
    expect(isWindowPhase('play-in-window')).toBe(true);
    expect(isWindowPhase('close-window')).toBe(true);
    for (const phase of ['open-window', 'original-heard', 'send', 'read-reply', 'listen-adapted', 'finish'] as const) {
      expect(isWindowPhase(phase)).toBe(false);
    }
  });
});

describe('closing the code window in the first stage', () => {
  it('moves on only once the original was heard', () => {
    const fresh = started();
    expect(advancesOnWindowClose(fresh)).toBe(false);
    const heard = walk(fresh, { type: 'original-heard' });
    expect(advancesOnWindowClose(heard)).toBe(true);

    // The close is one "next", and a second close changes nothing.
    const once = walk(heard, { type: 'next' });
    expect(once.step).toBe('send-instruction');
    expect(advancesOnWindowClose(once)).toBe(false);
  });

  it('does nothing for a guide that is not under way', () => {
    const skipped = walk(started(), { type: 'original-heard' }, { type: 'skip' });
    expect(advancesOnWindowClose(skipped)).toBe(false);
  });
});

describe('the closing panel', () => {
  const atClose = () => walk(
    started(),
    { type: 'original-heard' },
    { type: 'next' },
    { type: 'delivered' },
    { type: 'next' },
    { type: 'adapted-heard' },
    { type: 'next' },
  );

  it('may finish once delivered and the new version heard', () => {
    const p = atClose();
    expect(p.step).toBe('view-change');
    expect(canFinishOnMobile(p)).toBe(true);
    // The shared finish takes it straight to done/completed from here.
    const finished = walk(p, { type: 'finish' });
    expect(finished).toMatchObject({ status: 'completed', step: 'done' });
    expect(canFinishOnMobile(finished)).toBe(false);
  });

  it('sends a record that skipped the new listen back for it', () => {
    const odd: OnboardingProgress = { ...atClose(), adaptedHeard: false };
    expect(canFinishOnMobile(odd)).toBe(false);
    expect(needsMobileRecovery(odd)).toBe(true);
    const back = walk(odd, { type: 'prev' });
    expect(back.step).toBe('listen-adapted');
    expect(needsMobileRecovery(back)).toBe(false);

    const fromDone: OnboardingProgress = { ...odd, step: 'done' };
    const twice = walk(fromDone, { type: 'prev' });
    expect(needsMobileRecovery(twice)).toBe(true);
    expect(walk(twice, { type: 'prev' }).step).toBe('listen-adapted');
  });

  it('leaves a sound record alone', () => {
    expect(needsMobileRecovery(atClose())).toBe(false);
  });
});
