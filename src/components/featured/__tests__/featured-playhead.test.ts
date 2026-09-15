import { beforeEach, describe, expect, it } from 'vitest';

import { readPlayheadProgress, resetPlayhead, syncPlayhead } from '../featured-playhead';

/** Ten seconds of loop, so a second of wall time is a tenth of a lap. */
const LOOP = 10;

beforeEach(() => resetPlayhead());

describe('featured playhead', () => {
  it('runs on wall time from the moment the record was started', () => {
    syncPlayhead('a', true, false, LOOP, 1_000);
    expect(readPlayheadProgress('a', LOOP, 1_000)).toBe(0);
    expect(readPlayheadProgress('a', LOOP, 3_500)).toBeCloseTo(0.25);
  });

  it('keeps the lap across a transport that is unmounted and drawn again', () => {
    syncPlayhead('a', true, false, LOOP, 1_000);
    // The window crosses the breakpoint: one transport goes, another arrives
    // and syncs on the same record, still playing. The origin is not reset.
    syncPlayhead('a', true, false, LOOP, 4_000);
    expect(readPlayheadProgress('a', LOOP, 6_000)).toBeCloseTo(0.5);
  });

  it('holds where the ear left it on a pause, and carries on from there', () => {
    syncPlayhead('a', true, false, LOOP, 1_000);
    syncPlayhead('a', false, true, LOOP, 6_000);
    expect(readPlayheadProgress('a', LOOP, 9_000)).toBeCloseTo(0.5);

    syncPlayhead('a', true, false, LOOP, 9_000);
    expect(readPlayheadProgress('a', LOOP, 10_000)).toBeCloseTo(0.6);
  });

  it('rewinds on a stop, and on reaching for another record', () => {
    syncPlayhead('a', true, false, LOOP, 1_000);
    syncPlayhead('a', false, false, LOOP, 6_000);
    expect(readPlayheadProgress('a', LOOP, 9_000)).toBe(0);

    syncPlayhead('a', true, false, LOOP, 9_000);
    syncPlayhead('b', true, false, LOOP, 11_000);
    expect(readPlayheadProgress('b', LOOP, 11_000)).toBe(0);
    expect(readPlayheadProgress('b', LOOP, 13_000)).toBeCloseTo(0.2);
  });

  it('wraps round rather than running off the end, and answers only for the record it is on', () => {
    syncPlayhead('a', true, false, LOOP, 1_000);
    expect(readPlayheadProgress('a', LOOP, 26_000)).toBeCloseTo(0.5);
    expect(readPlayheadProgress('b', LOOP, 26_000)).toBe(0);
    expect(readPlayheadProgress(null, LOOP, 26_000)).toBe(0);
    expect(readPlayheadProgress('a', 0, 26_000)).toBe(0);
  });
});
