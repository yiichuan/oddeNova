import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A stand-in for Strudel's Cyclist, down to the two fields that decide where
 * the next query starts. It deliberately has no `setCycle` — the real one has
 * none either, so this exercises the same fallback the seek slider uses.
 */
interface FakeScheduler {
  started: boolean;
  lastBegin: number;
  lastEnd: number;
  num_cycles_at_cps_change: number;
  num_ticks_since_cps_change: number;
  seconds_at_cps_change: number;
  now: () => number;
  getTime: () => number;
  pause: () => void;
  stop: () => void;
}

const harness = vi.hoisted(() => ({
  scheduler: null as FakeScheduler | null,
  /** Where the playhead stood at each `evaluate` — the piece starts from here. */
  cyclesAtEvaluate: [] as number[],
}));

vi.mock('../strudel', () => ({
  strudelService: {
    isReady: true,
    prepareAudioForPlayback: vi.fn(async () => {}),
  },
}));

vi.mock('@strudel/transpiler', () => ({ transpiler: (code: string) => code }));
vi.mock('@strudel/webaudio', () => ({ webaudioOutput: () => {} }));
vi.mock('superdough', () => ({ getAudioContext: () => ({ currentTime: 0 }) }));

vi.mock('@strudel/core', () => ({
  repl: () => {
    const scheduler: FakeScheduler = {
      started: false,
      lastBegin: 0,
      lastEnd: 0,
      num_cycles_at_cps_change: 0,
      num_ticks_since_cps_change: 0,
      seconds_at_cps_change: 0,
      now: () => scheduler.lastBegin,
      getTime: () => 0,
      // Pausing leaves the cycle where it is; stopping is what rewinds it.
      pause: () => { scheduler.started = false; },
      stop: () => { scheduler.started = false; scheduler.lastBegin = 0; scheduler.lastEnd = 0; },
    };
    harness.scheduler = scheduler;

    return {
      scheduler,
      evaluate: async () => {
        harness.cyclesAtEvaluate.push(scheduler.lastEnd);
        // Swapping a pattern into a running Cyclist does not touch its clock.
        scheduler.started = true;
      },
      stop: () => scheduler.stop(),
    };
  },
}));

const FIRST = 'setcps(0.5)\ns("bd*4")';
const SECOND = 'setcps(0.25)\ns("hh*8")';

async function loadPlayer() {
  const { featuredPlayer } = await import('../featured-player');
  return featuredPlayer;
}

/** Wind the fake clock on, as playing for a while would. */
function playedOnTo(cycle: number) {
  const scheduler = harness.scheduler!;
  scheduler.lastBegin = cycle;
  scheduler.lastEnd = cycle + 0.25;
}

describe('featured player', () => {
  beforeEach(() => {
    vi.resetModules();
    harness.scheduler = null;
    harness.cyclesAtEvaluate.length = 0;
  });

  it('starts another piece from the top', async () => {
    const player = await loadPlayer();

    await player.play(FIRST);
    playedOnTo(12);

    await player.play(SECOND);

    // Rewound before the swap, not after it: the clock queries the pattern the
    // moment it takes it, so a late seek would let the middle of the piece sound.
    expect(harness.cyclesAtEvaluate).toEqual([0, 0]);
    expect(harness.scheduler!.lastEnd).toBe(0);
  });

  it('starts another piece from the top even when the last one was paused', async () => {
    const player = await loadPlayer();

    await player.play(FIRST);
    playedOnTo(7);
    player.pause();

    await player.play(SECOND);

    expect(harness.cyclesAtEvaluate).toEqual([0, 0]);
    expect(harness.scheduler!.lastEnd).toBe(0);
  });

  it('picks the same piece up where a pause left it', async () => {
    const player = await loadPlayer();

    await player.play(FIRST);
    playedOnTo(6);
    player.pause();

    await player.play(FIRST);

    expect(harness.scheduler!.lastBegin).toBe(6);
    expect(harness.scheduler!.lastEnd).toBe(6);
  });

  it('starts from a seek made while nothing was sounding', async () => {
    const player = await loadPlayer();

    // Two cycles into a four-cycle loop.
    await player.play(FIRST);
    player.stop();
    player.seek(0.5, 4);

    await player.play(FIRST);

    expect(harness.scheduler!.lastEnd).toBe(2);
  });
});
