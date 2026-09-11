import { describe, expect, it } from 'vitest';
import { lapCapsule, lapDash, lapShape, UNWRAP_SHARE } from '../featured-lap-morph';

/** The pill at about the size a phone gives it, and the band above it. */
const BOX = { width: 260, height: 48, border: 1 };
const BAND = { gap: 12, thickness: 3, ring: 1.5 };

const capsule = () => lapCapsule(BOX.width, BOX.height, BOX.border)!;

/** The three numbers a straight run is written as: its two ends and its height. */
const line = (d: string) => {
  const [x0, y, x1] = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g)!.map(Number);
  return { x0, y, x1 };
};

/** Where the drawn window ends, which is the end that travels the whole way. */
const windowEnd = (morph: number) => {
  const lap = lapShape(capsule(), morph, BAND);
  return lap.start + lap.length;
};

describe('lapCapsule', () => {
  it('measures the capsule on the ring\'s own centre line', () => {
    const shape = capsule();
    const inset = BOX.border / 2;
    const radius = (BOX.height - BOX.border) / 2;

    // The top edge runs between the two caps, half a pixel inside the measured
    // box — the middle of the 1px band the glass ring is drawn in.
    expect(shape.top).toBe(inset);
    expect(shape.left).toBe(inset + radius);
    expect(shape.right).toBe(inset + BOX.width - BOX.border - radius);
    expect(shape.d.startsWith(`M ${shape.left} ${shape.top}`)).toBe(true);

    // The lap starts and finishes at the top's middle, which is half the top
    // edge along a perimeter of two edges and two half-circles.
    const straight = shape.right - shape.left;
    const perimeter = straight * 2 + Math.PI * (BOX.height - BOX.border);
    expect(shape.topCentre).toBeCloseTo(straight / 2 / perimeter, 10);
  });

  it('has nothing to draw on a box that is not a capsule', () => {
    expect(lapCapsule(0, 0, 1)).toBeNull();
    // Taller than it is wide: no straight run to unwrap into.
    expect(lapCapsule(40, 48, 1)).toBeNull();
  });
});

describe('lapShape', () => {
  it('is the whole outline, run from the top centre, on the shelf', () => {
    const shape = capsule();
    const lap = lapShape(shape, 0, BAND);

    expect(lap.d).toBe(shape.d);
    expect(lap.start).toBeCloseTo(shape.topCentre, 10);
    expect(lap.length).toBeCloseTo(1, 10);
    expect(lap.thickness).toBe(BAND.ring);
    expect(lap.closed).toBe(true);
  });

  it('unwraps the outline into its top edge, both ends anticlockwise', () => {
    const shape = capsule();
    const halfTop = shape.topCentre;

    // Halfway through the unwrap the window is shorter than the whole lap and
    // longer than the top edge, and both of its ends have moved backwards.
    const middle = lapShape(shape, UNWRAP_SHARE / 2, BAND);
    expect(middle.d).toBe(shape.d);
    expect(middle.start).toBeLessThan(halfTop);
    expect(middle.start).toBeGreaterThan(0);
    expect(middle.length).toBeLessThan(1);
    expect(middle.length).toBeGreaterThan(halfTop * 2);

    // At the end of it the window is exactly the top edge: from the top left
    // corner to the top right one, drawn on the capsule's own path.
    const flat = lapShape(shape, UNWRAP_SHARE, BAND);
    expect(flat.d).toBe(shape.d);
    expect(flat.start).toBeCloseTo(0, 10);
    expect(flat.length).toBeCloseTo(halfTop * 2, 10);
    expect(flat.thickness).toBe(BAND.ring);
  });

  it('never lets either end of the window run forwards', () => {
    let previousEnd = windowEnd(0);
    let previousStart = lapShape(capsule(), 0, BAND).start;

    for (let step = 1; step <= 30; step += 1) {
      const morph = (UNWRAP_SHARE * step) / 30;
      const lap = lapShape(capsule(), morph, BAND);
      expect(lap.start).toBeLessThanOrEqual(previousStart + 1e-9);
      expect(windowEnd(morph)).toBeLessThanOrEqual(previousEnd + 1e-9);
      previousStart = lap.start;
      previousEnd = windowEnd(morph);
    }
  });

  it('takes the straight run up to the band and widens it past the caps', () => {
    const shape = capsule();

    // The moment it leaves the capsule it is the same line the unwrap left: the
    // two halves of the trip meet rather than cut.
    const left = lapShape(shape, UNWRAP_SHARE + 1e-9, BAND);
    expect(line(left.d).x0).toBeCloseTo(shape.left, 4);
    expect(line(left.d).y).toBeCloseTo(shape.top, 4);
    expect(line(left.d).x1).toBeCloseTo(shape.right, 4);
    expect(left.start).toBe(0);
    expect(left.length).toBe(1);
    expect(left.thickness).toBeCloseTo(BAND.ring, 6);

    // And it lands as the band: the width of the pill's box less the round cap
    // at either end, which is what fills it back out to the box's own two ends.
    const cap = BAND.thickness / 2;
    const landed = lapShape(shape, 1, BAND);
    expect(line(landed.d)).toEqual({ x0: cap, y: -(BAND.gap + cap), x1: BOX.width - cap });
    expect(landed.thickness).toBe(BAND.thickness);
    expect(landed.closed).toBe(false);
  });

  it('hands the colour the same number it hands the geometry', () => {
    const shape = capsule();

    // Nothing of the second beat anywhere in the first: the loop comes apart in
    // the colour it was wearing on the shelf.
    expect(lapShape(shape, 0, BAND).travel).toBe(0);
    expect(lapShape(shape, UNWRAP_SHARE / 2, BAND).travel).toBe(0);
    expect(lapShape(shape, UNWRAP_SHARE, BAND).travel).toBe(0);

    // And through the second it goes the whole way, arriving exactly where the
    // line does — the colour and the place are one event, not two.
    const middle = lapShape(shape, UNWRAP_SHARE + (1 - UNWRAP_SHARE) / 2, BAND);
    expect(middle.travel).toBeGreaterThan(0);
    expect(middle.travel).toBeLessThan(1);
    expect(lapShape(shape, 1, BAND).travel).toBeCloseTo(1, 10);
  });
});

describe('lapDash', () => {
  it('closes the pattern round the capsule and opens it on the straight run', () => {
    // Round a closed path the period is the path: the one dash, drawn once.
    expect(lapDash(0.25, true)).toBe('0.25 0.75');

    // On an open one the gap has to outrun the path, or the next dash begins
    // exactly at the far end — where a round cap turns a dash of no length into
    // a bead of colour sitting off the end of the band.
    const [dash, gap] = lapDash(0.25, false).split(' ').map(Number);
    expect(dash).toBe(0.25);
    expect(dash + gap).toBeGreaterThan(1);
  });
});
