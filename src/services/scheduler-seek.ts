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
  stop?: () => void;
  lastTick?: number;
  lastBegin?: number;
  lastEnd?: number;
  num_cycles_at_cps_change?: number;
  num_ticks_since_cps_change?: number;
  seconds_at_cps_change?: number;
  clock?: { duration?: number; stop?: () => void };
}

// Cyclist's `now()` subtracts the duration of its lookahead callback from the
// current time. Keep the fallback aligned with that formula when an older
// scheduler has no public seek method.
const CYCLIST_TICK_DURATION = 0.05;

/**
 * Put the playhead on `cycle`. Returns false when there is no scheduler to move
 * or the cycle is not a number, so a caller can hold the seek until there is.
 */
export function applySeekCycle(
  scheduler: SeekableScheduler | undefined,
  cycle: number,
  options: { resetClock?: boolean } = {},
): boolean {
  if (!scheduler || !Number.isFinite(cycle)) return false;

  if (options.resetClock) {
    // A paused Zyklus keeps its phase. Reset that phase before the next start so
    // a long pause is not replayed as a burst of overdue scheduler ticks. The
    // public scheduler stop is the fallback for implementations that do not
    // expose their clock object.
    if (typeof scheduler.clock?.stop === 'function') scheduler.clock.stop();
    else scheduler.stop?.();
  }

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
  const currentTime = scheduler.getTime?.();
  const duration = scheduler.clock?.duration ?? CYCLIST_TICK_DURATION;
  scheduler.seconds_at_cps_change = currentTime ?? 0;
  if (Number.isFinite(currentTime) && Number.isFinite(duration)) {
    // `now()` = lastBegin + (getTime() - lastTick - clock.duration) * cps.
    // Setting lastTick to currentTime alone would leave a one-lookahead jump.
    scheduler.lastTick = (currentTime as number) - duration;
  }
  return true;
}

/** The cycle `progress` (0..1) lands on in a loop `loopCycles` long, or null. */
export function seekTargetCycle(progress: number, loopCycles: number): number | null {
  if (!Number.isFinite(progress) || !Number.isFinite(loopCycles) || loopCycles <= 0) return null;
  return Math.min(1, Math.max(0, progress)) * loopCycles;
}
