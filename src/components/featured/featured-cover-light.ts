/**
 * The light the collection stands in.
 *
 * One lamp, hung above the shelf and a little in front of it, and nothing else
 * in the room. A sleeve turned out of the centre catches that light along the
 * edge that came forward and loses it along the edge that went back; the sleeve
 * facing straight out catches it evenly across, and is still brighter at the
 * head than at the foot. Lighting every cover the same is what makes a rack of
 * records read as a row of pictures rather than as objects standing at angles.
 *
 * Kept out of the components because none of it needs a render to be true, and
 * because the numbers below are the whole look: they are meant to be turned up
 * and down by eye, in one place, rather than hunted for in a class list.
 */

import { MAX_TURN_DEG } from './featured-carousel-motion';

/** How dark the far edge of a fully turned sleeve goes. */
const SHADE = 0.55;
/** What the near edge of that same sleeve catches back. */
const SHEEN = 0.18;

/** The shadow's colour: the page's own black, so a veil never reads as grey. */
const DARK = '2, 4, 8';

/**
 * How far down a cover the lamp still reaches, as a percentage of its height —
 * the one number that says how much of the sleeve is lit. Turn it up to hang
 * the lamp further out over the shelf, down to pull it back overhead.
 *
 * The shadow gathers from twice that mark, so the two move together and the
 * band between them stays a fall rather than a line.
 */
export const LAMP_REACH_PCT = 43;

/**
 * The lamp itself — above and slightly in front, so every sleeve carries a
 * little more light at the head than at the foot however it is turned. This is
 * the only light on the sleeve that is facing straight out at you.
 */
const LAMP = `linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.015) ${LAMP_REACH_PCT}%, rgba(${DARK}, 0.05) ${LAMP_REACH_PCT * 2}%, rgba(${DARK}, 0.24) 100%)`;

export interface CoverLight {
  /** The veil on the edge that has turned away, 0 when the sleeve faces out. */
  shade: number;
  /** The sheen on the edge that has come forward. */
  sheen: number;
  /** Which edge that is. A sleeve facing straight out leans neither way. */
  lean: 'left' | 'right' | null;
}

/**
 * How one sleeve stands in that light, from the turn it is drawn at.
 *
 * `turn` is the sleeve's CSS `rotateY` in degrees, so a negative turn brings
 * its right edge forward — which is the way the sleeves to the right of centre
 * are angled, each one facing back towards the middle of the stage.
 */
export function coverLight(turn: number): CoverLight {
  const lean = Math.max(-1, Math.min(1, -turn / MAX_TURN_DEG));
  const strength = Math.abs(lean);
  return {
    shade: SHADE * strength,
    sheen: SHEEN * strength,
    lean: strength === 0 ? null : lean > 0 ? 'right' : 'left',
  };
}

/**
 * That light as a stack of gradients to lay over the artwork, for
 * `background-image`.
 *
 * A layer rather than a `filter`, because a shadow falls across a sleeve
 * without touching the colours it was printed in. The near edge's sheen sits
 * over the far edge's shade, and the lamp under both — the first layer in the
 * list is the one nearest the eye.
 */
export function coverLightCss({ shade, sheen, lean }: CoverLight): string {
  if (lean === null) return LAMP;

  // 0deg points up and 90deg to the right, and a gradient's first stop sits at
  // the end it is pointing away from — so the shade is aimed at the edge that
  // came forward in order to start on the edge that went back, and the sheen
  // the other way about.
  const shadeAngle = lean === 'right' ? 90 : 270;
  const sheenAngle = lean === 'right' ? 270 : 90;

  return [
    `linear-gradient(${sheenAngle}deg, rgba(255, 255, 255, ${sheen}) 0%, rgba(255, 255, 255, ${sheen * 0.22}) 18%, rgba(255, 255, 255, 0) 46%)`,
    `linear-gradient(${shadeAngle}deg, rgba(${DARK}, ${shade}) 0%, rgba(${DARK}, ${shade * 0.34}) 30%, rgba(${DARK}, 0) 66%)`,
    LAMP,
  ].join(', ');
}
