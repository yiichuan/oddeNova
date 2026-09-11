import { describe, expect, it } from 'vitest';
import {
  MAX_TURN_DEG,
  PAPER_X_ROTATIONS,
  SIDE_SCALE,
  slotGap,
  slotOffsets,
  STAGE_PERSPECTIVE_PX,
  turnAt,
  VISIBLE_RADIUS,
} from '../featured-carousel-motion';

const RADIANS = Math.PI / 180;

/**
 * Where a sleeve's four corners actually land on the screen.
 *
 * Modelled from the other end than `slotOffsets` is: that one places each slot
 * by projecting the edges down the middle of a sleeve, this one takes the
 * transform the carousel writes — `translateX rotateX rotateY scale`, under the
 * stage's perspective — and puts all four corners of the cover through it. What
 * the two have to agree on is the only thing the wheel is spaced for: that no
 * sleeve reaches into the next one's air.
 */
function coverEdges(slot: number, cardSize: number, offset: number, paperTilt: number) {
  const scale = SIDE_SCALE + Math.max(0, 1 - slot) * (1 - SIDE_SCALE);
  const turn = -turnAt(slot) * RADIANS;
  const tilt = paperTilt * Math.min(slot, 1) * RADIANS;
  const half = cardSize / 2;
  const projected = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([acrossSign, downSign]) => {
    const across = acrossSign * half * scale;
    const down = downSign * half * scale;
    // rotateY, then rotateX, in the order the slot's transform lists them.
    const turnedX = across * Math.cos(turn);
    const turnedZ = -across * Math.sin(turn);
    const depth = down * -Math.sin(tilt) + turnedZ * Math.cos(tilt);
    return ((turnedX + offset) * STAGE_PERSPECTIVE_PX) / (STAGE_PERSPECTIVE_PX - depth);
  });
  return { left: Math.min(...projected), right: Math.max(...projected) };
}

describe('the wheel’s spacing', () => {
  it('turns each sleeve further than the last, and stands the outermost edge-on', () => {
    expect(turnAt(0)).toBe(0);
    expect(turnAt(1)).toBeLessThan(turnAt(2));
    expect(turnAt(VISIBLE_RADIUS)).toBeCloseTo(MAX_TURN_DEG, 10);
    // And no further, however far out the ring is mounted.
    expect(turnAt(VISIBLE_RADIUS + 2)).toBeCloseTo(MAX_TURN_DEG, 10);
  });

  it('leaves the same air between every pair of sleeves, once the room has had its say', () => {
    for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800]]) {
      const cardSize = Math.min(320, Math.max(160, Math.min(width * 0.26, height * 0.38)));
      const gap = slotGap(width);
      const offsets = slotOffsets(cardSize, gap, VISIBLE_RADIUS);

      const air = offsets.slice(1).map((offset, index) => {
        const inner = coverEdges(index, cardSize, offsets[index], PAPER_X_ROTATIONS[index]);
        const outer = coverEdges(index + 1, cardSize, offset, PAPER_X_ROTATIONS[index + 1]);
        return outer.left - inner.right;
      });

      // Nothing overlaps — the failure this replaced was the outermost pair
      // reaching into each other by some eight pixels — and every gap is near
      // enough the one asked for, given that the allowance for the dealt paper
      // is one angle standing in for seven.
      for (const between of air) {
        expect(between).toBeGreaterThan(gap * 0.85);
        expect(between).toBeLessThan(gap * 1.15);
      }
      // The point of all of it: even, rather than closing up towards the edge.
      // Flat spacing gave 65px between the first pair and none at all between
      // the last.
      expect(Math.max(...air) - Math.min(...air)).toBeLessThan(8);
    }
  });

  it('steps out further as the sleeves turn, rather than by a flat width', () => {
    const offsets = slotOffsets(320, 76, 4);
    const steps = offsets.slice(1).map((offset, index) => offset - offsets[index]);
    // Each step past the first is longer than the one before it: the further a
    // sleeve has turned, the further the perspective throws its near edge.
    for (let index = 2; index < steps.length; index += 1) {
      expect(steps[index]).toBeGreaterThan(steps[index - 1]);
    }
  });
});
