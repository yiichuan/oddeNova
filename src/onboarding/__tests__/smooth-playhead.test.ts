import { describe, expect, it } from 'vitest';
import { stepSmoothPlayhead, type SmoothPlayhead } from '../smooth-playhead';

const RATE = 0.2; // 0.4 cycles/s over a 2-cycle window
const FRAME = 1000 / 60;

/** Feed `frames` frames of a reading that only updates every `every` ms. */
function run(frames: number, every: number, start: SmoothPlayhead | null = null) {
  let state = start;
  const drawn: number[] = [];
  for (let i = 0; i < frames; i++) {
    const now = i * FRAME;
    const raw = Math.floor(now / every) * every / 1000 * RATE; // steppy, like a coarse audio clock
    state = stepSmoothPlayhead(state, raw, now, RATE);
    drawn.push(state!.value);
  }
  return drawn;
}

describe('stepSmoothPlayhead', () => {
  it('moves every frame even when the reading only updates in steps', () => {
    const drawn = run(120, 50);
    const steps = drawn.slice(1).map((value, i) => value - drawn[i]);
    expect(steps.every((step) => step > 0)).toBe(true);
    // Evenly: no frame moves more than twice the ideal per-frame distance.
    const ideal = (FRAME / 1000) * RATE;
    expect(Math.max(...steps)).toBeLessThan(ideal * 2);
  });

  it('stays close to the real playhead', () => {
    const drawn = run(240, 50);
    const truth = (239 * FRAME / 1000) * RATE;
    expect(Math.abs(drawn.at(-1)! - truth)).toBeLessThan(0.02);
  });

  it('follows a real jump back to the top, and clears when nothing plays', () => {
    const late = { value: 0.9, time: 0 };
    expect(stepSmoothPlayhead(late, 0.01, FRAME, RATE)).toEqual({ value: 0.01, time: FRAME });
    expect(stepSmoothPlayhead(late, null, FRAME, RATE)).toBeNull();
  });

  it('never runs past the end of the window', () => {
    expect(stepSmoothPlayhead({ value: 0.999, time: 0 }, 1, 1000, RATE)!.value).toBe(1);
  });
});
