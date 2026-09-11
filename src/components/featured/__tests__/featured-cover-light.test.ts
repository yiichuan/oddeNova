import { describe, expect, it } from 'vitest';
import { MAX_TURN_DEG } from '../featured-carousel-motion';
import {
  coverGlazeCss,
  coverLight,
  coverLightAt,
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
    // Leaning nowhere, and the lamp straight down the sleeve.
    expect(light).toEqual({
      shade: 0, sheen: 0, sheenGlaze: 0, lean: null, lamp: 180, room: 'space',
    });

    // Not flat, though: the lamp is overhead, so the head of the cover carries
    // more light than the foot. That one gradient runs down the sleeve, giving
    // out where the lamp stops reaching and darkening from twice that mark.
    const lamp = coverLightCss(light);
    expect(angles(lamp)).toEqual([180]);
    expect(lamp).toContain(`rgba(255, 255, 255, 0.02) ${LAMP_REACH_PCT}%`);
    expect(lamp).toContain(`${LAMP_REACH_PCT * 2}%`);
  });

  it('shades the edge that turned away and lights the one that came forward', () => {
    // A negative `rotateY` brings the sleeve's right edge towards the viewer,
    // which is how the sleeves to the right of centre are angled.
    const right = coverLight(-MAX_TURN_DEG, 'space');

    // Where the edge that came forward is, as an angle across the cover: 90° is
    // its right hand.
    expect(right.lean).toBe(90);
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

    expect(left.lean).toBe(270);
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

describe('a sleeve put down at an angle', () => {
  it('reads every turn it was given, not just the one across the shelf', () => {
    // Tipped so that its foot comes forward, and turned so that its left hand
    // does too: the light is owed to the corner between them.
    const corner = coverLightAt({ x: 20, y: 20 }, 'space');

    expect(corner.lean).toBeGreaterThan(180);
    expect(corner.lean).toBeLessThan(270);
    // And it is lit as deeply as a single turn of the same size would be —
    // more so, since the sleeve has been taken further off square by two.
    expect(corner.shade).toBeGreaterThan(coverLightAt({ y: 20 }, 'space').shade);
  });

  it('leaves the lamp hanging in the room when the paper turns under it', () => {
    // The sleeve is turned a tenth of a right angle in the plane of the page,
    // so the lamp is turned back by as much and goes on falling down the shelf.
    expect(coverLightAt({ z: 9 }, 'space').lamp).toBe(171);
    expect(coverLightAt({ z: -9 }, 'space').lamp).toBe(189);
    // Turning the paper alone is not a turn away from the reader, so there is
    // nothing to shade: what is left is the lamp, aimed to stay upright.
    expect(coverLightCss(coverLightAt({ z: -9 }, 'space'))).toContain('linear-gradient(189deg');
  });

  it('is the one-axis reading when only one axis is turned', () => {
    expect(coverLightAt({ y: -30 }, 'paper')).toEqual(coverLight(-30, 'paper'));
  });
});

describe('the lamp, in the two layers it is laid on in', () => {
  const head = (css: string) => stops(css)[0][3];
  const white = ([red, green, blue]: number[]) => red === 255 && green === 255 && blue === 255;

  it('lays a floor of white on the artwork and no more than a floor', () => {
    for (const room of ['space', 'paper'] as const) {
      const square = coverLight(0, room);
      const veil = head(coverLightCss(square));
      // Something, or a cover whose artwork is a dark field has no lamp on it:
      // the glaze is laid on in soft light, and soft light on black is black.
      expect(veil).toBeGreaterThan(0);
      // And little: what is added rather than answered is a floor under the
      // darks, not the light itself, which is the glaze's to give.
      expect(veil).toBeLessThan(head(coverGlazeCss(square)) / 3);
    }
  });

  it('splits the sheen the same way, so no turned sleeve carries a veil either', () => {
    for (const room of ['space', 'paper'] as const) {
      const turned = coverLight(-MAX_TURN_DEG, room);
      // The lit edge keeps a floor, for the same reason the lamp does.
      expect(turned.sheen).toBeGreaterThan(0);
      // And the rest of it is in the glaze, laid on in soft light beside the
      // lamp's own — the sheen is the first of the two, over the artwork.
      expect(turned.sheenGlaze).toBeGreaterThan(turned.sheen * 3);
      const poured = coverGlazeCss(turned);
      expect(angles(poured)).toHaveLength(2);
      expect(stops(poured)[0][3]).toBeCloseTo(turned.sheenGlaze, 10);
    }
  });

  it('puts the light itself in the glaze, brightest at the head', () => {
    for (const room of ['space', 'paper'] as const) {
      const glaze = coverGlazeCss(coverLight(0, room));
      const poured = stops(glaze);
      expect(poured.every(white)).toBe(true);
      // Brightest where the lamp is, and gone by the foot of the cover.
      expect(head(glaze)).toBeGreaterThan(0.2);
      expect(poured[poured.length - 1][3]).toBe(0);
    }
  });

  it('is the one place the bright room throws more light than the dark one', () => {
    expect(head(coverGlazeCss(coverLight(0, 'paper'))))
      .toBeGreaterThan(head(coverGlazeCss(coverLight(0, 'space'))));
    // The shade down a turned edge stays the other way about: a veil on a page
    // this bright reads as fog long before it reads as shadow.
    expect(coverLight(-MAX_TURN_DEG, 'paper').shade)
      .toBeLessThan(coverLight(-MAX_TURN_DEG, 'space').shade);
  });

  it('hangs the glaze in the room, as the lamp it belongs to is', () => {
    expect(coverGlazeCss(coverLightAt({ z: -9 }, 'paper'))).toContain('linear-gradient(189deg');
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
    // Shallower than the dark room's, and in the page's ink rather than black.
    expect(sleeveShadowColor('paper', 0)).toBe('rgba(44, 45, 61, 0.3)');

    // Leaning under the pointer deepens it in either room, and never past the
    // weight the other room starts at.
    expect(sleeveShadowColor('paper', 1)).toBe('rgba(44, 45, 61, 0.4)');
  });
});
