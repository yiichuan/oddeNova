/**
 * Moving a Strudel scheduler's playhead.
 *
 * Both transports need this and neither should own it: the fallback below
 * reaches into the Cyclist's tick bookkeeping, which is the one piece of this
 * app that a Strudel upgrade could quietly break. One copy, one place to fix.
 */

/** The slice of a Cyclist this touches. */
export interface SeekableScheduler {
  now?: () => number;
  getTime?: () => number;
  setCycle?: (cycle: number) => void;
  lastBegin?: number;
  lastEnd?: number;
  num_cycles_at_cps_change?: number;
  num_ticks_since_cps_change?: number;
  seconds_at_cps_change?: number;
}

/**
 * Put the playhead on `cycle`. Returns false when there is no scheduler to move
 * or the cycle is not a number, so a caller can hold the seek until there is.
 */
export function applySeekCycle(
  scheduler: SeekableScheduler | undefined,
  cycle: number,
): boolean {
  if (!scheduler || !Number.isFinite(cycle)) return false;

  if (typeof scheduler.setCycle === 'function') {
    scheduler.setCycle(cycle);
    return true;
  }

  // Cyclist does not expose setCycle(), but its next tick takes its cycle
  // origin from lastEnd when the tick counter is reset.
  scheduler.lastBegin = cycle;
  scheduler.lastEnd = cycle;
  scheduler.num_cycles_at_cps_change = cycle;
  scheduler.num_ticks_since_cps_change = 0;
  scheduler.seconds_at_cps_change = scheduler.getTime?.() ?? 0;
  return true;
}

/** The cycle `progress` (0..1) lands on in a loop `loopCycles` long, or null. */
export function seekTargetCycle(progress: number, loopCycles: number): number | null {
  if (!Number.isFinite(progress) || !Number.isFinite(loopCycles) || loopCycles <= 0) return null;
  return Math.min(1, Math.max(0, progress)) * loopCycles;
}
