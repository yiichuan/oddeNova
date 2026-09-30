/**
 * A progress reading that moves smoothly, fed by one that does not.
 *
 * The scheduler's playhead is derived from the audio clock plus a timer-driven
 * tick. Some browsers advance the audio clock in coarse steps and the tick
 * timer jitters, so a raw per-frame read stalls and lurches even though the
 * music itself is perfectly steady. Music at a fixed tempo advances at a known
 * rate, so the display does too — frame by frame, by elapsed time — and the
 * raw reading only steers it: a small share of the error each frame, which
 * absorbs jitter without letting drift build up. It never runs backwards,
 * except to follow a real jump (a replay from the top).
 */

export interface SmoothPlayhead {
  /** Anchor of the estimate: a value and the frame time it was true at. */
  value: number;
  time: number;
}

/** Share of the gap to the raw reading closed per frame. */
const CORRECTION = 0.08;
/** A gap this large is a real jump — a replay, a seek — not jitter: follow it. */
const JUMP = 0.1;

/**
 * The value to draw this frame, and the state to carry to the next. `raw` is
 * the engine's reading (0..1) or null while nothing plays; `rate` is progress
 * per second at the music's tempo.
 */
export function stepSmoothPlayhead(
  previous: SmoothPlayhead | null,
  raw: number | null,
  now: number,
  rate: number,
): SmoothPlayhead | null {
  if (raw === null) return null;
  if (previous === null) return { value: raw, time: now };

  const predicted = previous.value + ((now - previous.time) / 1000) * rate;
  const gap = raw - predicted;
  if (Math.abs(gap) > JUMP) return { value: raw, time: now };

  const corrected = Math.max(previous.value, predicted + gap * CORRECTION);
  return { value: Math.min(1, corrected), time: now };
}
