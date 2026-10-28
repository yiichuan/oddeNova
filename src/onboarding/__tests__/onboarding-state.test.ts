import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ELIGIBLE_KEY,
  ONBOARDING_GUIDE_VERSION,
  TOUR_STEPS,
  canAdvance,
  canGoBack,
  initialProgress,
  isOnboardingEligible,
  markOnboardingEligible,
  progressKey,
  readProgress,
  reduceOnboarding,
  shouldAutoInvite,
  stepNumber,
  writeProgress,
  type OnboardingEvent,
  type OnboardingProgress,
} from '../onboarding-state';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

const fresh = () => initialProgress('intro-piano-v1', 'hash', 0);

function run(...events: OnboardingEvent[]): OnboardingProgress {
  return events.reduce((progress, event) => reduceOnboarding(progress, event, 1), fresh());
}

const start: OnboardingEvent = { type: 'start', sessionId: 'session-1', caseId: 'intro-piano-v1', contentHash: 'hash' };

const heardOriginal: OnboardingEvent = { type: 'original-heard' };
const delivered: OnboardingEvent = { type: 'delivered' };
const heardAdapted: OnboardingEvent = { type: 'adapted-heard' };
const next: OnboardingEvent = { type: 'next' };
const prev: OnboardingEvent = { type: 'prev' };

/** Straight through to the last step. */
const walkedToDone = () => run(start, heardOriginal, next, delivered, next, heardAdapted, next, next);

describe('reduceOnboarding', () => {
  it('walks the six steps in order and completes', () => {
    expect(TOUR_STEPS).toHaveLength(6);
    const done = walkedToDone();
    expect(done).toMatchObject({ status: 'active', step: 'done', originalHeard: true, delivered: true, adaptedHeard: true });
    expect(stepNumber(done.step)).toBe(6);
    expect(reduceOnboarding(done, { type: 'finish' })).toMatchObject({ status: 'completed', step: 'done' });
  });

  it('opens "next" on a listening step only once the window was heard', () => {
    const listening = run(start);
    expect(canAdvance(listening)).toBe(false);
    expect(reduceOnboarding(listening, next)).toBe(listening);
    const heard = reduceOnboarding(listening, heardOriginal);
    expect(canAdvance(heard)).toBe(true);
    expect(reduceOnboarding(heard, next).step).toBe('send-instruction');

    const adapted = run(start, heardOriginal, next, delivered, next);
    expect(adapted.step).toBe('listen-adapted');
    expect(canAdvance(adapted)).toBe(false);
    expect(canAdvance(reduceOnboarding(adapted, heardAdapted))).toBe(true);
  });

  it('moves on from sending only by sending', () => {
    const sending = run(start, heardOriginal, next);
    expect(canAdvance(sending)).toBe(false);
    expect(reduceOnboarding(sending, next)).toBe(sending);
    expect(reduceOnboarding(sending, delivered)).toMatchObject({ step: 'read-reply', delivered: true });
  });

  it('goes back freely, but never back across the send', () => {
    const sending = run(start, heardOriginal, next);
    expect(canGoBack(run(start))).toBe(false);
    expect(reduceOnboarding(sending, prev).step).toBe('listen-original');

    const reading = reduceOnboarding(sending, delivered);
    expect(canGoBack(reading)).toBe(false);
    expect(reduceOnboarding(reading, prev)).toBe(reading);

    const done = walkedToDone();
    expect(reduceOnboarding(done, prev).step).toBe('view-change');
    // Heard stays heard: coming back to a listening step does not close "next" again.
    const backToListen = run(start, heardOriginal, next, delivered, next, heardAdapted, next, prev);
    expect(backToListen.step).toBe('listen-adapted');
    expect(canAdvance(backToListen)).toBe(true);
  });

  it('ignores moves that do not apply where the reader is', () => {
    const sending = run(start, heardOriginal, next);
    expect(reduceOnboarding(sending, heardAdapted)).toBe(sending);
    const reading = reduceOnboarding(sending, delivered);
    // A second delivery (a double click, a refresh) changes nothing.
    expect(reduceOnboarding(reading, delivered)).toBe(reading);
    expect(reduceOnboarding(run(start), { type: 'finish' })).toEqual(run(start));
  });

  it('skips from any step and keeps the practice session', () => {
    const skipped = run(start, heardOriginal, next, { type: 'skip' });
    expect(skipped).toMatchObject({ status: 'skipped', sessionId: 'session-1' });
    expect(reduceOnboarding(skipped, { type: 'skip' })).toBe(skipped);
    expect(reduceOnboarding(reduceOnboarding(walkedToDone(), { type: 'finish' }), { type: 'skip' }).status).toBe('completed');
  });

  it('postpones only an unanswered invitation', () => {
    const later = reduceOnboarding(fresh(), { type: 'postpone', until: 99 });
    expect(later).toMatchObject({ status: 'postponed', postponedUntil: 99 });
    const active = run(start);
    expect(reduceOnboarding(active, { type: 'postpone', until: 99 })).toBe(active);
  });

  it('counts the first real instruction once, and only after completing', () => {
    const active = run(start);
    expect(reduceOnboarding(active, { type: 'real-instruction' })).toBe(active);
    const completed = reduceOnboarding(walkedToDone(), { type: 'finish' });
    const counted = reduceOnboarding(completed, { type: 'real-instruction' });
    expect(counted.realInstructionCounted).toBe(true);
    expect(reduceOnboarding(counted, { type: 'real-instruction' })).toBe(counted);
  });

  it('starting again gives a fresh practice on the new session', () => {
    const skipped = run(start, heardOriginal, { type: 'skip' });
    const again = reduceOnboarding(skipped, { ...start, sessionId: 'session-2' });
    expect(again).toMatchObject({
      status: 'active', step: 'listen-original', sessionId: 'session-2', originalHeard: false, delivered: false,
    });
  });
});

describe('shouldAutoInvite', () => {
  it('invites an eligible newcomer, and nobody else', () => {
    expect(shouldAutoInvite(fresh(), { eligible: true, now: 0 })).toBe(true);
    expect(shouldAutoInvite(fresh(), { eligible: false, now: 0 })).toBe(false);
  });

  it('waits out "later"', () => {
    const later = reduceOnboarding(fresh(), { type: 'postpone', until: 100 });
    expect(shouldAutoInvite(later, { eligible: true, now: 50 })).toBe(false);
    expect(shouldAutoInvite(later, { eligible: true, now: 100 })).toBe(true);
  });

  it('never re-invites a settled or running guide', () => {
    expect(shouldAutoInvite(run(start), { eligible: true, now: 0 })).toBe(false);
    expect(shouldAutoInvite(run(start, { type: 'skip' }), { eligible: true, now: 0 })).toBe(false);
  });
});

describe('progress storage', () => {
  it('keeps each account to itself', () => {
    const storage = memoryStorage();
    writeProgress('user:a', run(start), storage);
    expect(readProgress('user:a', fresh(), storage).status).toBe('active');
    expect(readProgress('user:b', fresh(), storage).status).toBe('new');
  });

  it('lets an account inherit a settled guest answer, but not an unfinished practice', () => {
    const storage = memoryStorage();
    writeProgress('guest', run(start, { type: 'skip' }), storage);
    const inherited = readProgress('user:a', fresh(), storage);
    expect(inherited.status).toBe('skipped');
    expect(inherited.sessionId).toBeNull();

    writeProgress('guest', run(start), storage);
    expect(readProgress('user:b', fresh(), storage).status).toBe('new');
  });

  it('falls back on anything unreadable', () => {
    const storage = memoryStorage();
    storage.setItem(progressKey('guest'), '{not json');
    expect(readProgress('guest', fresh(), storage)).toEqual(fresh());
    storage.setItem(progressKey('guest'), JSON.stringify({ status: 'completed' }));
    expect(readProgress('guest', fresh(), storage)).toEqual(fresh());
  });

  it('does not read progress written by an older guide, whose steps are not these', () => {
    const storage = memoryStorage();
    storage.setItem(progressKey('guest'), JSON.stringify({
      ...run(start), guideVersion: ONBOARDING_GUIDE_VERSION - 1, step: 'compare',
    }));
    expect(readProgress('guest', fresh(), storage)).toEqual(fresh());
  });

  it('marks eligibility in its own key, apart from the welcome flag', () => {
    const storage = memoryStorage();
    expect(isOnboardingEligible(storage)).toBe(false);
    markOnboardingEligible(storage);
    expect(storage.getItem(ONBOARDING_ELIGIBLE_KEY)).toBe('1');
    expect(storage.getItem('oddenova_welcome_seen')).toBeNull();
    expect(isOnboardingEligible(storage)).toBe(true);
  });
});
