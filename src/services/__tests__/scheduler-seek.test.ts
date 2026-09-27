import { describe, expect, it, vi } from 'vitest';
import { applySeekCycle, type SeekableScheduler } from '../scheduler-seek';

type CyclistHarness = SeekableScheduler & {
  cps: number;
  lastTick: number;
  clock: { duration: number };
  started: boolean;
  start: () => void;
  setTime: (time: number) => void;
  queriedBegins: number[];
};

function makeCyclist(): CyclistHarness {
  let now = 10;
  let phase = 8.31;
  const scheduler = {
    cps: 0.5,
    started: true,
    lastBegin: 4,
    lastEnd: 4.25,
    lastTick: 8,
    num_cycles_at_cps_change: 4,
    num_ticks_since_cps_change: 5,
    seconds_at_cps_change: 8,
    clock: {
      duration: 0.05,
      stop: () => { phase = 0; },
    },
    queriedBegins: [] as number[],
    getTime: () => now,
    now: () => {
      if (!scheduler.started) return 0;
      return scheduler.lastBegin! + (scheduler.getTime!() - scheduler.lastTick - scheduler.clock.duration) * scheduler.cps;
    },
    stop: () => { phase = 0; scheduler.lastEnd = 0; scheduler.started = false; },
    setTime: (time: number) => { now = time; },
    start: () => {
      scheduler.started = true;
      if (phase === 0) phase = now + 0.01;
      const lookahead = now + 0.2;
      while (phase < lookahead) {
        if (scheduler.num_ticks_since_cps_change === 0) {
          scheduler.num_cycles_at_cps_change = scheduler.lastEnd;
          scheduler.seconds_at_cps_change = phase;
        }
        scheduler.num_ticks_since_cps_change! += 1;
        scheduler.lastBegin = scheduler.lastEnd;
        scheduler.lastEnd = scheduler.num_cycles_at_cps_change! + scheduler.num_ticks_since_cps_change! * scheduler.clock.duration * scheduler.cps;
        scheduler.lastTick = phase;
        scheduler.queriedBegins.push(scheduler.lastBegin!);
        phase += scheduler.clock.duration;
      }
    },
  } as CyclistHarness;
  return scheduler;
}

describe('scheduler seek compatibility', () => {
  it('makes a fallback seek immediately readable at the requested cycle', () => {
    const scheduler = makeCyclist();

    expect(applySeekCycle(scheduler, 5.25)).toBe(true);
    expect(scheduler.now?.()).toBeCloseTo(5.25);
  });

  it('resets a paused clock before restart so the first tick stays at the target', () => {
    const scheduler = makeCyclist();

    expect(applySeekCycle(scheduler, 5.25, { resetClock: true })).toBe(true);
    scheduler.start();

    expect(scheduler.queriedBegins[0]).toBe(5.25);
    expect(scheduler.queriedBegins[1]).toBeCloseTo(5.275);
    expect(scheduler.queriedBegins[2]).toBeCloseTo(5.3);
    expect(scheduler.now?.()).toBeCloseTo(5.22);
    expect(scheduler.now?.()).toBeLessThan(5.25);
    expect(scheduler.now?.()).toBeGreaterThan(5);
  });

  it('prefers a scheduler-provided setCycle without touching fallback bookkeeping', () => {
    let cycle = 1;
    const setCycle = vi.fn((nextCycle: number) => { cycle = nextCycle; });
    const scheduler = {
      setCycle,
      lastBegin: 1,
      lastEnd: 2,
      lastTick: 3,
      getTime: () => 10,
      now: () => cycle,
    };

    expect(applySeekCycle(scheduler, 7.5)).toBe(true);
    expect(setCycle).toHaveBeenCalledWith(7.5);
    expect(scheduler.now()).toBe(7.5);
    expect(scheduler.lastBegin).toBe(1);
    expect(scheduler.lastEnd).toBe(2);
    expect(scheduler.lastTick).toBe(3);
  });

  it('rejects invalid scheduler and seek inputs without a refresh side effect', () => {
    expect(applySeekCycle(undefined, 1)).toBe(false);
    expect(applySeekCycle(makeCyclist(), Number.NaN)).toBe(false);
    expect(applySeekCycle(makeCyclist(), Number.POSITIVE_INFINITY)).toBe(false);
  });
});
