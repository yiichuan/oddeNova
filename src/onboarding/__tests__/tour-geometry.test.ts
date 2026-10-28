import { describe, expect, it } from 'vitest';
import { expandRect, placeCard, scrimPath, type Rect } from '../tour-geometry';

const viewport = { width: 1200, height: 800 };
const card = { width: 340, height: 200 };

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

describe('placeCard', () => {
  it('centres itself when there is nothing to point at', () => {
    expect(placeCard(null, card, viewport)).toEqual({ left: 430, top: 300 });
  });

  it('never covers its target when a side has room', () => {
    const targets: Rect[] = [
      { left: 900, top: 740, width: 32, height: 32 }, // the play key, low on the right
      { left: 60, top: 640, width: 360, height: 130 }, // the composer, bottom left
      { left: 60, top: 80, width: 360, height: 560 }, // a tall reply
      { left: 500, top: 100, width: 680, height: 120 }, // a layer in the code panel
    ];
    for (const target of targets) {
      const at = placeCard(target, card, viewport);
      expect(overlaps({ ...at, ...card }, target)).toBe(false);
      expect(at.left).toBeGreaterThanOrEqual(12);
      expect(at.top).toBeGreaterThanOrEqual(12);
      expect(at.left + card.width).toBeLessThanOrEqual(viewport.width - 12);
      expect(at.top + card.height).toBeLessThanOrEqual(viewport.height - 12);
    }
  });

  it('prefers below, then above', () => {
    expect(placeCard({ left: 500, top: 100, width: 40, height: 40 }, card, viewport).top).toBe(152);
    expect(placeCard({ left: 500, top: 700, width: 40, height: 40 }, card, viewport).top).toBe(488);
  });

  it('sits directly above a small control, left edges aligned, when asked to', () => {
    const playKey = { left: 700, top: 700, width: 44, height: 44 };
    expect(placeCard(playKey, card, viewport, { placement: 'above-start' })).toEqual({ left: 700, top: 488 });
    // No room above: falls back to whichever side fits.
    const high = { left: 700, top: 40, width: 44, height: 44 };
    expect(placeCard(high, card, viewport, { placement: 'above-start' }).top).toBe(96);
    // Too close to the right edge: stays on screen.
    const edge = { left: 1100, top: 700, width: 44, height: 44 };
    expect(placeCard(edge, card, viewport, { placement: 'above-start' }).left).toBe(1200 - 12 - 340);
  });

  it('sits directly below a small control, left edges aligned, when asked to', () => {
    const playKey = { left: 700, top: 100, width: 44, height: 44 };
    expect(placeCard(playKey, card, viewport, { placement: 'below-start' })).toEqual({ left: 700, top: 156 });
    // No room below: falls back to whichever side fits.
    const low = { left: 700, top: 700, width: 44, height: 44 };
    expect(placeCard(low, card, viewport, { placement: 'below-start' }).top).toBe(488);
  });

  it('stays on screen when nothing fits whole', () => {
    const phone = { width: 390, height: 700 };
    const at = placeCard({ left: 0, top: 120, width: 390, height: 460 }, { width: 366, height: 220 }, phone);
    expect(at.left).toBeGreaterThanOrEqual(12);
    expect(at.top + 220).toBeLessThanOrEqual(phone.height - 12);
  });
});

describe('scrimPath', () => {
  it('is the whole screen without a hole, and cuts one when given', () => {
    expect(scrimPath(viewport, null)).toBe('M0 0H1200V800H0Z');
    const withHole = scrimPath(viewport, { left: 10, top: 20, width: 100, height: 50 });
    expect(withHole.startsWith('M0 0H1200V800H0Z')).toBe(true);
    expect(withHole.match(/Z/g)).toHaveLength(2);
  });
});

describe('expandRect', () => {
  it('pads the target and keeps it on screen', () => {
    expect(expandRect({ left: 2, top: 10, width: 20, height: 20 }, 6, viewport))
      .toEqual({ left: 0, top: 4, width: 28, height: 32 });
  });
});
