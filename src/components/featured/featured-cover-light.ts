/**
 * The light the collection stands in.
 *
 * One lamp, hung above the shelf and a little in front of it. A sleeve turned
 * out of the centre catches that light along the edge that came forward and
 * loses it along the edge that went back; the sleeve facing straight out
 * catches it evenly across, and is still brighter at the head than at the foot.
 * Lighting every cover the same is what makes a rack of records read as a row
 * of pictures rather than as objects standing at angles.
 *
 * Two rooms, because the page now has two. `space` is the collection room with
 * that lamp and nothing else in it: what a sleeve loses falls all the way to
 * near-black, and it can afford to fall a long way. `paper` is the same shelf
 * in a lit room, where the page itself is a bright ground bouncing light back
 * into every sleeve — so the fill is high, every shadow is shallow, and the
 * ink they are cast in is the page's own rather than black.
 *
 * A sleeve lit for the dark room and then stood on paper is what goes wrong
 * without that second set: its veils stop reading as shade and start reading as
 * grime over the artwork, its cast shadow reads as a hole rather than as a
 * sleeve standing off the page, and the lamp's own fall arrives as a band
 * across the foot of a bright cover.
 *
 * Kept out of the components because none of it needs a render to be true, and
 * because the numbers below are the whole look: they are meant to be turned up
 * and down by eye, in one place, rather than hunted for in a class list.
 */

import { MAX_TURN_DEG } from './featured-carousel-motion';

/** Which of the two the shelf is standing in. */
export type CoverRoom = 'space' | 'paper';

/**
 * How far down a cover the dark room's lamp still reaches, as a percentage of
 * its height — the one number that says how much of the sleeve is lit there.
 * Turn it up to hang the lamp further out over the shelf, down to pull it back
 * overhead.
 *
 * The shadow gathers from twice that mark, so the two move together and the
 * band between them stays a fall rather than a line.
 */
export const LAMP_REACH_PCT = 43;

/** Where the same lamp gives out on paper, and the foot's fall begins. */
export const PAPER_LAMP_REACH_PCT = 40;

/** Each room's own black. A veil in the page's ink never reads as grey. */
const SPACE_DARK = '2, 4, 8';
const PAPER_DARK = '44, 45, 61';

interface RoomLight {
  /** How dark the far edge of a fully turned sleeve goes. */
  shade: number;
  /** What the near edge of that same sleeve catches back. */
  sheen: number;
  /** The colour every shadow in this room is cast in. */
  dark: string;
  /** The lamp itself: the only light on a sleeve facing straight out. */
  lamp: string;
  /**
   * The shadow the sleeve drops on the shelf — how deep it is at rest, and how
   * much more it gains as the sleeve leans under the pointer.
   */
  cast: { rest: number; lean: number };
}

const ROOM: Record<CoverRoom, RoomLight> = {
  space: {
    shade: 0.55,
    sheen: 0.18,
    dark: SPACE_DARK,
    lamp: `linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.015) ${LAMP_REACH_PCT}%, rgba(${SPACE_DARK}, 0.05) ${LAMP_REACH_PCT * 2}%, rgba(${SPACE_DARK}, 0.24) 100%)`,
    cast: { rest: 0.34, lean: 0.12 },
  },
  paper: {
    /* Half the dark room's veil, and rather less sheen than it. Both are laid
       over the artwork, and on a page this bright a veil stops reading as shade
       long before it gets deep — past about a quarter it reads as a sleeve seen
       through something, which is what makes a rack of them look foggy. The
       turn is carried by the perspective, the scale and the cast shadow as much
       as by these two, so they can afford to come down this far. */
    shade: 0.26,
    sheen: 0.1,
    dark: PAPER_DARK,
    /* One long fall rather than a reach and a gather.

       The dark room can hide the corner where its two halves meet, because by
       the time the fall gets there the sleeve is nearly as dark as the room
       behind it. A bright cover on a bright page hides nothing: what the eye
       picks out is not the shadow but the change of slope in it, and the dark
       room's foot — a fifth of the way down in the last seventh of the height —
       lands as a drawn edge across the bottom of the artwork.

       So the lamp gives out at the waist and the foot arrives from there in a
       single slope, a twelfth deep where it is deepest. There is no second stop
       to put a corner in, and nothing steep enough to leave one. */
    lamp: `linear-gradient(180deg, rgba(255, 255, 255, 0.0) 0%, rgba(255, 255, 255, 0.05) ${PAPER_LAMP_REACH_PCT}%, rgba(${PAPER_DARK}, 0.01) 100%)`,
    /* Half the depth, in the page's own ink rather than in black — a shadow on
       paper is the paper with the light taken out of it. Same geometry: what
       was wrong on this page was how dark the sleeve's shadow was and what
       colour, not where it fell. */
    cast: { rest: 0.18, lean: 0.07 },
  },
};

export interface CoverLight {
  /** The veil on the edge that has turned away, 0 when the sleeve faces out. */
  shade: number;
  /** The sheen on the edge that has come forward. */
  sheen: number;
  /** Which edge that is. A sleeve facing straight out leans neither way. */
  lean: 'left' | 'right' | null;
  /** The room it was measured in, which is also the room it is drawn in. */
  room: CoverRoom;
}

/**
 * How one sleeve stands in that light, from the turn it is drawn at.
 *
 * `turn` is the sleeve's CSS `rotateY` in degrees, so a negative turn brings
 * its right edge forward — which is the way the sleeves to the right of centre
 * are angled, each one facing back towards the middle of the stage.
 */
export function coverLight(turn: number, room: CoverRoom): CoverLight {
  const lean = Math.max(-1, Math.min(1, -turn / MAX_TURN_DEG));
  const strength = Math.abs(lean);
  return {
    shade: ROOM[room].shade * strength,
    sheen: ROOM[room].sheen * strength,
    lean: strength === 0 ? null : lean > 0 ? 'right' : 'left',
    room,
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
export function coverLightCss({ shade, sheen, lean, room }: CoverLight): string {
  const { dark, lamp } = ROOM[room];
  if (lean === null) return lamp;

  // 0deg points up and 90deg to the right, and a gradient's first stop sits at
  // the end it is pointing away from — so the shade is aimed at the edge that
  // came forward in order to start on the edge that went back, and the sheen
  // the other way about.
  const shadeAngle = lean === 'right' ? 90 : 270;
  const sheenAngle = lean === 'right' ? 270 : 90;

  return [
    `linear-gradient(${sheenAngle}deg, rgba(255, 255, 255, ${sheen}) 0%, rgba(255, 255, 255, ${sheen * 0.22}) 18%, rgba(255, 255, 255, 0) 46%)`,
    `linear-gradient(${shadeAngle}deg, rgba(${dark}, ${shade}) 0%, rgba(${dark}, ${shade * 0.34}) 30%, rgba(${dark}, 0) 66%)`,
    lamp,
  ].join(', ');
}

/**
 * The colour of the shadow the sleeve itself drops on the shelf, at whatever
 * strength it is leaning under the pointer — 0 when it is standing square.
 *
 * Only the colour: where the shadow falls is the lean's own business, and it is
 * the same throw in either room. Here so that a sleeve's shadow is lit by the
 * same room the sleeve is.
 */
export function sleeveShadowColor(room: CoverRoom, strength: number): string {
  const { dark, cast } = ROOM[room];
  return `rgba(${dark}, ${cast.rest + strength * cast.lean})`;
}
