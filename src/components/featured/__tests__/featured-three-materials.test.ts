import { describe, expect, it } from 'vitest';
import {
  BULGE_HEIGHT,
  createWearMarks,
  RECORD_RADIUS,
  vinylBulgeHeight,
} from '../featured-three-materials';

describe('vinyl package geometry', () => {
  it('creates a flat-centred, shallow disc with a broad smooth falloff', () => {
    expect(vinylBulgeHeight(0, 0)).toBeCloseTo(BULGE_HEIGHT);
    expect(vinylBulgeHeight(RECORD_RADIUS * 0.25, 0)).toBeCloseTo(BULGE_HEIGHT);
    expect(vinylBulgeHeight(RECORD_RADIUS, 0)).toBeGreaterThan(0);
    expect(vinylBulgeHeight(0.5, 0.5)).toBeCloseTo(0);
    expect(BULGE_HEIGHT).toBeLessThan(0.004);
  });

  it('generates stable, bounded edge wear that varies by package id', () => {
    const first = createWearMarks('first');
    expect(first).toEqual(createWearMarks('first'));
    expect(first).not.toEqual(createWearMarks('second'));
    expect(first).toHaveLength(72);
    expect(first.every((mark) => mark.edge >= 0 && mark.edge <= 3)).toBe(true);
    expect(first.every((mark) => mark.along >= 0 && mark.along <= 1)).toBe(true);
    expect(first.every((mark) => mark.depth > 0 && mark.depth < 0.01)).toBe(true);
  });
});
