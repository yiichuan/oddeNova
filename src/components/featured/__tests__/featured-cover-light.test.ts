import { describe, expect, it } from 'vitest';
import { MAX_TURN_DEG } from '../featured-carousel-motion';
import {
  coverLight,
  coverLightCss,
  LAMP_REACH_PCT,
  PAPER_LAMP_REACH_PCT,
  sleeveShadowColor,
} from '../featured-cover-light';

/** The angle each gradient in the stack is aimed at, in the order given. */
const angles = (css: string) => Array.from(css.matchAll(/linear-gradient\((\d+)deg/g))
  .map((match) => Number(match[1]));

/** Every colour stop in a gradient stack, as `[r, g, b, a]`. */
const stops = (css: string) => Array.from(css.matchAll(/rgba\(([^)]+)\)/g))
  .map((match) => match[1].split(',').map((part) => Number(part.trim())));

describe('the light over the collection', () => {
  it('leaves the sleeve facing straight out lit only from above', () => {
    const light = coverLight(0, 'space');
    expect(light).toEqual({ shade: 0, sheen: 0, lean: null, room: 'space' });

    // Not flat, though: the lamp is overhead, so the head of the cover carries
    // more light than the foot. That one gradient runs down the sleeve, giving
    // out where the lamp stops reaching and darkening from twice that mark.
    const lamp = coverLightCss(light);
    expect(angles(lamp)).toEqual([180]);
    expect(lamp).toContain(`rgba(255, 255, 255, 0.015) ${LAMP_REACH_PCT}%`);
    expect(lamp).toContain(`${LAMP_REACH_PCT * 2}%`);
  });

  it('shades the edge that turned away and lights the one that came forward', () => {
    // A negative `rotateY` brings the sleeve's right edge towards the viewer,
    // which is how the sleeves to the right of centre are angled.
    const right = coverLight(-MAX_TURN_DEG, 'space');

    expect(right.lean).toBe('right');
    expect(right.sheen).toBeGreaterThan(0);
    // The deeper of the two: a cover loses more to a shadow than a sheen gives
    // back, which is what keeps a turned sleeve reading as turned away.
    expect(right.shade).toBeGreaterThan(right.sheen);

    // Sheen aimed left so that it starts on the right edge, shade aimed right
    // so that it starts on the left, and the lamp still overhead under both.
    expect(angles(coverLightCss(right))).toEqual([270, 90, 180]);
  });

  it('mirrors the whole thing when the sleeve is turned the other way', () => {
    const left = coverLight(MAX_TURN_DEG, 'space');
    const right = coverLight(-MAX_TURN_DEG, 'space');

    expect(left.lean).toBe('left');
    expect(left.shade).toBe(right.shade);
    expect(left.sheen).toBe(right.sheen);
    expect(angles(coverLightCss(left))).toEqual([90, 270, 180]);
  });

  it('deepens with the turn, and holds at a full one', () => {
    const half = coverLight(-MAX_TURN_DEG / 2, 'space');
    const full = coverLight(-MAX_TURN_DEG, 'space');

    expect(half.shade).toBeCloseTo(full.shade / 2, 10);
    expect(half.sheen).toBeCloseTo(full.sheen / 2, 10);
    // Nothing past the edge of the visible run goes darker than that edge does.
    expect(coverLight(-MAX_TURN_DEG * 3, 'space')).toEqual(full);
  });
});

describe('the same shelf in a lit room', () => {
  it('turns every veil down, and keeps the turn readable all the same', () => {
    const space = coverLight(-MAX_TURN_DEG, 'space');
    const paper = coverLight(-MAX_TURN_DEG, 'paper');

    expect(paper.lean).toBe(space.lean);
    // Both come down — a page this bright fills its own shadows — and the shade
    // stays the deeper of the two, or the sleeve stops reading as turned away.
    expect(paper.shade).toBeLessThan(space.shade);
    expect(paper.sheen).toBeLessThan(space.sheen);
    expect(paper.shade).toBeGreaterThan(paper.sheen);
  });

  it('casts its shadows in the page\'s ink rather than in black', () => {
    const veils = stops(coverLightCss(coverLight(-MAX_TURN_DEG, 'paper')))
      // The sheen is white in either room; it is the dark half that changes.
      .filter(([red, green, blue]) => !(red === 255 && green === 255 && blue === 255));

    expect(veils.length).toBeGreaterThan(0);
    for (const [red, green, blue] of veils) {
      expect([red, green, blue]).toEqual([44, 45, 61]);
    }
  });

  it('runs the lamp down the sleeve in one fall, with no corner in it', () => {
    const lamp = coverLightCss(coverLight(0, 'paper'));

    expect(angles(lamp)).toEqual([180]);
    // Three stops, not four: the dark room's second dark stop is the corner
    // that shows as a band across the foot of a bright cover.
    expect(stops(lamp)).toHaveLength(3);
    expect(lamp).toContain(`${PAPER_LAMP_REACH_PCT}%`);

    // And what it falls to is a fraction of what the dark room falls to.
    const [, , foot] = stops(lamp);
    const [, , , spaceFoot] = stops(coverLightCss(coverLight(0, 'space')));
    expect(foot[3]).toBeLessThan(spaceFoot[3] / 2);
  });

  it('drops a shallower shadow on the shelf, in that same ink', () => {
    expect(sleeveShadowColor('space', 0)).toBe('rgba(2, 4, 8, 0.34)');
    expect(sleeveShadowColor('paper', 0)).toBe('rgba(44, 45, 61, 0.18)');

    // Leaning under the pointer deepens it in either room, and never past the
    // weight the other room starts at.
    expect(sleeveShadowColor('paper', 1)).toBe('rgba(44, 45, 61, 0.25)');
  });
});
