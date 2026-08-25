import { describe, expect, it } from 'vitest';
import { MAX_TURN_DEG } from '../featured-carousel-motion';
import { coverLight, coverLightCss, LAMP_REACH_PCT } from '../featured-cover-light';

/** The angle each gradient in the stack is aimed at, in the order given. */
const angles = (css: string) => Array.from(css.matchAll(/linear-gradient\((\d+)deg/g))
  .map((match) => Number(match[1]));

describe('the light over the collection', () => {
  it('leaves the sleeve facing straight out lit only from above', () => {
    const light = coverLight(0);
    expect(light).toEqual({ shade: 0, sheen: 0, lean: null });

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
    const right = coverLight(-MAX_TURN_DEG);

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
    const left = coverLight(MAX_TURN_DEG);
    const right = coverLight(-MAX_TURN_DEG);

    expect(left.lean).toBe('left');
    expect(left.shade).toBe(right.shade);
    expect(left.sheen).toBe(right.sheen);
    expect(angles(coverLightCss(left))).toEqual([90, 270, 180]);
  });

  it('deepens with the turn, and holds at a full one', () => {
    const half = coverLight(-MAX_TURN_DEG / 2);
    const full = coverLight(-MAX_TURN_DEG);

    expect(half.shade).toBeCloseTo(full.shade / 2, 10);
    expect(half.sheen).toBeCloseTo(full.sheen / 2, 10);
    // Nothing past the edge of the visible run goes darker than that edge does.
    expect(coverLight(-MAX_TURN_DEG * 3)).toEqual(full);
  });
});
