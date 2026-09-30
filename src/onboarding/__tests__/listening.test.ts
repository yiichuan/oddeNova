import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPARE_WINDOW, INTRO_PIANO_CPS } from '../intro-piano-case';
import { PAUSE_LEAD_CYCLES, watchListening } from '../listening';

/**
 * A studio transport whose playhead the test moves by hand — the cycle is
 * whatever `cycle` says, and pausing it is a recorded call, not a timer.
 */
function fakeTransport() {
  const state = { cycle: 0 as number | null, paused: 0 };
  return {
    state,
    transport: {
      currentCycle: () => state.cycle,
      stop: () => { state.paused += 1; },
    },
  };
}

function watch(transport: ReturnType<typeof fakeTransport>['transport']) {
  const onProgress = vi.fn();
  const onHeard = vi.fn();
  const handle = watchListening(transport, COMPARE_WINDOW, { cps: INTRO_PIANO_CPS, onProgress, onHeard });
  return { handle, onProgress, onHeard };
}

describe('watchListening', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports progress off the playhead and stops at the end of the window', () => {
    const { state, transport } = fakeTransport();
    const { onProgress, onHeard } = watch(transport);

    state.cycle = 1;
    vi.advanceTimersByTime(50);
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    expect(state.paused).toBe(0);

    state.cycle = COMPARE_WINDOW.endCycle - PAUSE_LEAD_CYCLES;
    vi.advanceTimersByTime(50);
    expect(state.paused).toBe(1);
    // Paused a little early so the next chord is never queued; the notes
    // already sounding play out to 5 s before it counts.
    expect(onHeard).not.toHaveBeenCalled();
    vi.advanceTimersByTime((PAUSE_LEAD_CYCLES / INTRO_PIANO_CPS) * 1000);
    expect(onHeard).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('does not count time: a playhead that never gets there is never heard', () => {
    const { state, transport } = fakeTransport();
    const { onHeard } = watch(transport);
    state.cycle = 1.2;
    vi.advanceTimersByTime(60_000);
    expect(onHeard).not.toHaveBeenCalled();
    expect(state.paused).toBe(0);
  });

  it('stops watching when cancelled — a pause by the reader keeps what was heard for the next play', () => {
    const { state, transport } = fakeTransport();
    const { handle, onProgress, onHeard } = watch(transport);
    state.cycle = 0.8;
    vi.advanceTimersByTime(50);
    handle.cancel();
    state.cycle = 2;
    vi.advanceTimersByTime(5_000);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onHeard).not.toHaveBeenCalled();
    expect(state.paused).toBe(0);
  });

  it('still reports after its own stop, which is what silences the transport and cancels it', () => {
    const { state, transport } = fakeTransport();
    const { handle, onHeard } = watch(transport);
    state.cycle = 1.95;
    vi.advanceTimersByTime(50);
    expect(state.paused).toBe(1);
    handle.cancel();
    vi.advanceTimersByTime(1_000);
    expect(onHeard).toHaveBeenCalledTimes(1);
  });

  it('waits while nothing is sounding', () => {
    const { state, transport } = fakeTransport();
    const { onProgress } = watch(transport);
    state.cycle = null;
    vi.advanceTimersByTime(500);
    expect(onProgress).not.toHaveBeenCalled();
  });
});
