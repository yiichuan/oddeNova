import { describe, expect, it } from 'vitest';
import {
  projectTrackClock,
  resolveTrackViewportFrame,
  sceneBandContainsViewport,
  sceneBandForViewport,
  sceneTransformFor,
} from '../track-timeline';

describe('track preview clock and scene projection', () => {
  it('keeps absolute pass identity while wrapping the displayed clock', () => {
    expect(projectTrackClock(35, 16)).toEqual({ displayNow: 3, loopOffset: 32 });
    expect(projectTrackClock(16, 16)).toEqual({ displayNow: 16, loopOffset: 0 });
  });

  it('resolves follow and fixed viewports into one finite frame', () => {
    expect(resolveTrackViewportFrame(35, {
      loopCycles: 16,
      viewport: { mode: 'follow', span: 4 },
    })).toEqual({ displayNow: 3, loopOffset: 32, begin: 1, end: 5, span: 4 });
    expect(resolveTrackViewportFrame(12, {
      loopCycles: 16,
      viewport: { begin: 14, end: 20 },
    })).toEqual({ displayNow: 12, loopOffset: 0, begin: 14, end: 16, span: 2 });
  });

  it('prefetches no more than three visible widths and never crosses the piece', () => {
    const band = sceneBandForViewport({ begin: 6, end: 10 }, 16);
    expect(band).toEqual({ begin: 2, end: 14 });
    expect(sceneBandContainsViewport(band, { begin: 6, end: 10 })).toBe(true);
    expect(sceneBandContainsViewport({ begin: 5.5, end: 12 }, { begin: 6, end: 10 })).toBe(false);
    expect(sceneBandForViewport({ begin: 0, end: 16 }, 16)).toEqual({ begin: 0, end: 16 });
    expect(sceneBandForViewport({ begin: 0, end: 2 }, 1)).toEqual({ begin: 0, end: 1 });
  });

  it('keeps scene width and offset continuous for adjacent follow samples', () => {
    const band = { begin: 2, end: 14 };
    const first = sceneTransformFor(band, { begin: 6, end: 10 });
    const next = sceneTransformFor(band, { begin: 6.01, end: 10.01 });
    expect(first.widthPercent).toBe(300);
    expect(next.widthPercent).toBe(300);
    expect(next.offsetPercent - first.offsetPercent).toBeCloseTo(-0.0833333333333333, 10);
  });
});
