import { describe, expect, it } from 'vitest';
import {
  CREATION_STEPS,
  creationProgressKey,
  creationStepCount,
  creationStepNumber,
  initialCreationProgress,
  readCreationProgress,
  reconcileDelivered,
  reduceCreation,
  shouldAutoInviteCreation,
  writeCreationProgress,
  type CreationEvent,
  type CreationProgress,
} from '../first-creation-state';

const started = (): CreationProgress =>
  reduceCreation(initialCreationProgress('case', 'hash', 0), { type: 'start', sessionId: 's1', caseId: 'case', contentHash: 'hash' }, 1);

function run(progress: CreationProgress, events: CreationEvent[]): CreationProgress {
  return events.reduce((p, event) => reduceCreation(p, event, 2), progress);
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('first-creation state', () => {
  it('walks four turns: compose and explain for three, then the close', () => {
    const seen: string[] = [];
    let p = started();
    seen.push(p.step);
    for (let turn = 1; turn <= 4; turn++) {
      p = reduceCreation(p, { type: 'delivered', turn, layout: 'desktop' });
      seen.push(p.step);
      if (turn < 4) {
        p = reduceCreation(p, { type: 'next' });
        seen.push(p.step);
      }
    }
    expect(seen).toEqual(CREATION_STEPS.filter((step) => step !== 'open-code' && step !== 'read-code'));
    expect(p.delivered).toBe(4);
    expect(p.status).toBe('active');
    expect(reduceCreation(p, { type: 'finish' }).status).toBe('completed');
  });

  it('ignores a delivery that is not the next turn, or arrives off its compose step', () => {
    const p = started();
    expect(reduceCreation(p, { type: 'delivered', turn: 2, layout: 'desktop' })).toBe(p);
    const delivered = reduceCreation(p, { type: 'delivered', turn: 1, layout: 'desktop' });
    // A double-clicked send.
    expect(reduceCreation(delivered, { type: 'delivered', turn: 1, layout: 'desktop' })).toBe(delivered);
    // Turn 2 before moving on from the explanation of turn 1.
    expect(reduceCreation(delivered, { type: 'delivered', turn: 2, layout: 'desktop' })).toBe(delivered);
  });

  it('moves on from an explanation only, and finishes only after the fourth turn', () => {
    const p = started();
    expect(reduceCreation(p, { type: 'next' })).toBe(p);
    expect(reduceCreation(p, { type: 'finish' })).toBe(p);
    const third = run(p, [
      { type: 'delivered', turn: 1, layout: 'desktop' }, { type: 'next' },
      { type: 'delivered', turn: 2, layout: 'desktop' }, { type: 'next' },
      { type: 'delivered', turn: 3, layout: 'desktop' },
    ]);
    expect(third.step).toBe('explain-3');
    expect(reduceCreation(third, { type: 'finish' })).toBe(third);
  });

  it('on a phone, goes from turn to turn, then through the code window to the close', () => {
    const seen: string[] = [];
    let p = started();
    seen.push(p.step);
    for (let turn = 1; turn <= 4; turn++) {
      p = reduceCreation(p, { type: 'delivered', turn, layout: 'mobile' });
      seen.push(p.step);
    }
    // "Got it" before the window was opened does nothing.
    expect(reduceCreation(p, { type: 'next' })).toBe(p);
    p = reduceCreation(p, { type: 'code-opened' });
    seen.push(p.step);
    expect(reduceCreation(p, { type: 'code-opened' })).toBe(p);
    p = reduceCreation(p, { type: 'next' });
    seen.push(p.step);
    expect(seen).toEqual(['compose-1', 'compose-2', 'compose-3', 'compose-4', 'open-code', 'read-code', 'done']);
    expect(reduceCreation(p, { type: 'finish' }).status).toBe('completed');
    expect(reconcileDelivered(started(), 4, 'mobile').step).toBe('open-code');
  });

  it('moves a practice carried across the breakpoint onto the layout now showing', () => {
    const explaining = reduceCreation(started(), { type: 'delivered', turn: 1, layout: 'desktop' });
    expect(reduceCreation(explaining, { type: 'layout', layout: 'mobile' }).step).toBe('compose-2');
    expect(reduceCreation(explaining, { type: 'layout', layout: 'desktop' })).toBe(explaining);
    let phone = started();
    for (let turn = 1; turn <= 4; turn++) phone = reduceCreation(phone, { type: 'delivered', turn, layout: 'mobile' });
    expect(reduceCreation(phone, { type: 'layout', layout: 'desktop' }).step).toBe('done');
  });

  it('counts the code window as a fifth step on a phone', () => {
    expect(creationStepCount('desktop')).toBe(4);
    expect(creationStepCount('mobile')).toBe(5);
    expect(creationStepNumber('open-code')).toBe(5);
    expect(creationStepNumber('read-code')).toBe(5);
  });

  it('numbers both halves of a turn with the turn, and the close as the last', () => {
    expect(creationStepNumber('compose-2')).toBe(2);
    expect(creationStepNumber('explain-2')).toBe(2);
    expect(creationStepNumber('done')).toBe(4);
  });

  it('catches up with turns written before the page went away', () => {
    const p = started();
    const caught = reconcileDelivered(p, 2, 'desktop');
    expect(caught.delivered).toBe(2);
    expect(caught.step).toBe('explain-2');
    expect(reconcileDelivered(caught, 2, 'desktop')).toBe(caught);
    expect(reconcileDelivered(p, 4, 'desktop').step).toBe('done');
  });

  it('settles on skip and counts the first real instruction once, after finishing', () => {
    const skipped = reduceCreation(started(), { type: 'skip' });
    expect(skipped.status).toBe('skipped');
    expect(reduceCreation(skipped, { type: 'skip' })).toBe(skipped);
    expect(reduceCreation(skipped, { type: 'real-instruction' })).toBe(skipped);
  });

  it('invites only an eligible newcomer, or one whose "later" has run out', () => {
    const fresh = initialCreationProgress('case', 'hash', 0);
    expect(shouldAutoInviteCreation(fresh, { eligible: true, now: 10 })).toBe(true);
    expect(shouldAutoInviteCreation(fresh, { eligible: false, now: 10 })).toBe(false);
    const later = reduceCreation(fresh, { type: 'postpone', until: 100 });
    expect(shouldAutoInviteCreation(later, { eligible: true, now: 50 })).toBe(false);
    expect(shouldAutoInviteCreation(later, { eligible: true, now: 100 })).toBe(true);
    expect(shouldAutoInviteCreation(started(), { eligible: true, now: 10 })).toBe(false);
  });

  it('keeps guest progress separate from each account', () => {
    const storage = memoryStorage();
    const fallback = initialCreationProgress('case', 'hash', 0);
    writeCreationProgress('guest', started(), storage);
    expect(readCreationProgress('user:a', fallback, storage)).toBe(fallback);

    writeCreationProgress('guest', reduceCreation(started(), { type: 'skip' }), storage);
    expect(readCreationProgress('guest', fallback, storage).status).toBe('skipped');
    expect(readCreationProgress('user:a', fallback, storage)).toBe(fallback);

    const accountProgress = reduceCreation(started(), { type: 'skip' });
    writeCreationProgress('user:a', accountProgress, storage);
    expect(readCreationProgress('user:a', fallback, storage)).toEqual(accountProgress);
    expect(readCreationProgress('user:b', fallback, storage)).toBe(fallback);

    storage.setItem(creationProgressKey('user:b'), JSON.stringify({ ...started(), guideVersion: 2 }));
    expect(readCreationProgress('user:b', fallback, storage)).toBe(fallback);
  });
});
