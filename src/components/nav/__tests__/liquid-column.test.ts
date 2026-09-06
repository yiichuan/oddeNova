import { describe, expect, it } from 'vitest';
import {
  APPROACH_MS,
  liquidOutline,
  lobeRadius,
  NAV_RADIUS,
  NECK_SNAP,
  neckFor,
  rejoinSpread,
  REJOIN_MS,
  solveSpreadTime,
  splitSpread,
  SPLIT_MS,
  STICKY_MS,
  unfoldCurve,
} from '../liquid-column';

const HALF = 30;
const shape = (gapTop: number, gapBottom: number) => ({
  width: 60,
  height: 900,
  gapTop,
  gapBottom,
  radius: NAV_RADIUS,
});

const subpaths = (path: string) => path.split('M').length - 1;
/* Arc radii and flags are not coordinates — fold each arc down to its endpoint
   so a path can be read as the points it visits. */
const numbers = (path: string) => (
  path.replace(/A[\d.]+,[\d.]+ 0 0 1 /g, 'L').match(/-?\d+(\.\d+)?/g) ?? []
).map(Number);

describe('neckFor', () => {
  it('spans the full width while the lobes are still joined', () => {
    expect(neckFor(0, HALF)).toEqual({ waist: HALF, attach: HALF });
  });

  it('thins as the lobes part, and lets go before the waist is a hairline', () => {
    const waists = [4, 16, 32, 48, 60].map((gap) => neckFor(gap, HALF)?.waist ?? 0);
    expect(waists).toEqual([...waists].sort((a, b) => b - a));
    expect(waists[0]).toBeLessThan(HALF);
    expect(neckFor(NECK_SNAP, HALF)).toBeNull();
    expect(neckFor(NECK_SNAP + 200, HALF)).toBeNull();
  });

  it('reaches back along the lobe edge, never past its half width', () => {
    for (const gap of [1, 10, 25, 40, 55]) {
      const neck = neckFor(gap, HALF);
      expect(neck).not.toBeNull();
      expect(neck!.attach).toBeGreaterThanOrEqual(neck!.waist);
      expect(neck!.attach).toBeLessThanOrEqual(HALF);
    }
  });
});

describe('lobeRadius', () => {
  it('is square where the strand still spans the lobe, and settles at the region radius', () => {
    expect(lobeRadius(0, HALF, NAV_RADIUS)).toBe(0);
    expect(lobeRadius(NECK_SNAP, HALF, NAV_RADIUS)).toBe(NAV_RADIUS);
    const midway = lobeRadius(50, HALF, NAV_RADIUS);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThanOrEqual(NAV_RADIUS);
  });
});

describe('liquidOutline', () => {
  it('draws one body while a strand holds, and two once it snaps', () => {
    expect(subpaths(liquidOutline(shape(450, 450)))).toBe(1);
    expect(subpaths(liquidOutline(shape(430, 470)))).toBe(1);
    expect(subpaths(liquidOutline(shape(60, 840)))).toBe(2);
  });

  it('stays inside the column and finite at every stage', () => {
    for (const gap of [0, 8, 24, 48, 63, 64, 200, 780]) {
      const path = liquidOutline(shape((900 - gap) / 2, (900 + gap) / 2));
      expect(path).toMatch(/^M/);
      expect(path.endsWith('Z')).toBe(true);
      expect(numbers(path).every(Number.isFinite)).toBe(true);
      expect(Math.max(...numbers(path))).toBeLessThanOrEqual(900);
      expect(Math.min(...numbers(path))).toBeGreaterThanOrEqual(0);
    }
  });

  it('insets the ring inwards on every edge, including across the strand', () => {
    const joined = numbers(liquidOutline(shape(450, 450), 1));
    // One pixel in from the column on every side: 1..59 across, 1..899 down.
    expect(Math.min(...joined)).toBe(1);
    expect(Math.max(...joined)).toBe(899);

    const stretched = shape(440, 460);
    const outer = numbers(liquidOutline(stretched));
    const inner = numbers(liquidOutline(stretched, 1));
    // The ring never reaches the column's edges the outline does.
    expect(Math.max(...inner)).toBeLessThan(Math.max(...outer));
    expect(Math.min(...inner)).toBeGreaterThan(Math.min(...outer));
  });

  it('pads the same outline into a larger box without redrawing it', () => {
    // Every stage, so the padded strand is checked as well as the padded lobes.
    for (const gap of [0, 24, 63, 64, 200, 780]) {
      const column = shape((900 - gap) / 2, (900 + gap) / 2);
      const at = (pad: number) => numbers(liquidOutline(column, 0, pad));
      const moved = at(96).map((value) => Math.round((value - 96) * 100) / 100);
      expect(moved).toEqual(at(0));
    }
  });

  it('leaves the padded column room on every side of its box', () => {
    const padded = numbers(liquidOutline(shape(60, 840), 0, 96));
    expect(Math.min(...padded)).toBe(96);
    // 60 across and 900 down, each with 96px of box left past it.
    expect(Math.max(...padded)).toBe(996);
  });
});

describe('spread curves', () => {
  const snap = 64 / 780;

  it('spends the first beat on the strand and the rest getting home', () => {
    expect(splitSpread(0, snap)).toBeCloseTo(0);
    expect(splitSpread(STICKY_MS / SPLIT_MS, snap)).toBeCloseTo(snap);
    expect(splitSpread(1, snap)).toBeCloseTo(1);
    // Barely anything has moved a quarter of the way in: that is the stickiness.
    expect(splitSpread(0.25, snap)).toBeLessThan(snap / 2);
  });

  it('recoils past the resting gap before settling into it', () => {
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => splitSpread(0.6 + i / 100, snap)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.03);
  });

  it('runs the journey backwards, taking the last of the gap quickly', () => {
    expect(rejoinSpread(0, snap)).toBeCloseTo(1);
    expect(rejoinSpread(APPROACH_MS / REJOIN_MS, snap)).toBeCloseTo(snap);
    expect(rejoinSpread(1, snap)).toBeCloseTo(0);
  });

  it('picks an interrupted transition up where it stands', () => {
    const curve = (t: number) => splitSpread(t, snap);
    for (const value of [0.05, 0.3, 0.8]) {
      expect(curve(solveSpreadTime(curve, value, false))).toBeCloseTo(value, 2);
    }
    const back = (t: number) => rejoinSpread(t, snap);
    expect(back(solveSpreadTime(back, 0.4, true))).toBeCloseTo(0.4, 2);
  });
});

describe('unfoldCurve', () => {
  it('lands on its target after a slosh past it', () => {
    const curve = unfoldCurve(0, 96);
    expect(curve(0)).toBeCloseTo(0);
    expect(curve(1)).toBeCloseTo(96);
    expect(Math.max(...Array.from({ length: 20 }, (_, i) => curve(0.5 + i / 40)))).toBeGreaterThan(96);
  });
});
