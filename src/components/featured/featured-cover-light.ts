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
  /**
   * What the near edge of that same sleeve catches back, in the two layers a
   * light on this shelf is laid on in: a thin floor of plain white, so that the
   * lit edge of a black cover is lit at all, and the body of it in soft light,
   * which brightens the artwork instead of standing in front of it. The lamp is
   * split the same way and for the same reason — see lampStops and lampGlaze.
   */
  sheen: { floor: number; glaze: number };
  /** The colour every shadow in this room is cast in. */
  dark: string;
  /**
   * The lamp itself: the only light on a sleeve facing straight out. Its
   * colour stops only — which way it falls is the sleeve's business, not the
   * room's, because a sleeve turned in the plane of the page has to keep the
   * lamp where the room left it.
   */
  lampStops: string;
  /**
   * The lit half of the same lamp, for surfaces that lay it on in soft light
   * rather than over the artwork. White only, and it fades out where the fall
   * above takes over. See coverGlazeCss.
   */
  lampGlaze: string;
  /**
   * The shadow the sleeve drops on the shelf — how deep it is at rest, and how
   * much more it gains as the sleeve leans under the pointer.
   *
   */
  cast: { rest: number; lean: number };
}

const ROOM: Record<CoverRoom, RoomLight> = {
  space: {
    shade: 0.55,
    sheen: { floor: 0.05, glaze: 0.42 },
    dark: SPACE_DARK,
    /* A floor of white at the head, and then the fall. Most of what a cover
       catches is the glaze below, which is laid on in soft light and so answers
       to the artwork — but soft light on black is black: it has nothing to
       lift, and a sleeve whose artwork is a dark field comes back as one flat
       dark field with no lamp on it at all. This is the little that is added
       rather than answered, and it is what puts a head and a foot on those
       covers. Kept to a tenth: it is a floor, not the light. */
    lampStops: `rgba(255, 255, 255, 0.11) 0%, rgba(255, 255, 255, 0.02) ${LAMP_REACH_PCT}%, rgba(${SPACE_DARK}, 0.1) ${LAMP_REACH_PCT * 2}%, rgba(${SPACE_DARK}, 0.34) 100%`,
    /* A dark room's own glaze is the gentler of the two: the fall below carries
       most of the reading here, and a cover in the dark is already separated
       from what is behind it. */
    lampGlaze: `rgba(255, 255, 255, 0.36) 0%, rgba(255, 255, 255, 0.12) ${LAMP_REACH_PCT}%, rgba(255, 255, 255, 0) ${LAMP_REACH_PCT * 2}%`,
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
    sheen: { floor: 0.03, glaze: 0.24 },
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
    /* The same floor and the same fall as the dark room's, a shade more of the
       first: a black cover has further to go before it separates from a bright
       page than it does from a dark room. */
    lampStops: `rgba(255, 255, 255, 0.13) 0%, rgba(255, 255, 255, 0.03) ${PAPER_LAMP_REACH_PCT}%, rgba(${PAPER_DARK}, 0.09) 100%`,
    /* And the brightest glaze of the two, which is the one place the rooms swap
       over: the instinct is to hold light back on a bright page, and that is
       right for the shade down a turned edge — which is why `shade` above is
       half what the dark room spends — but the lamp is not a veil, it is what
       the room is lit by, and the bright room is the one throwing the most of
       it. */
    lampGlaze: `rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.24) ${PAPER_LAMP_REACH_PCT}%, rgba(255, 255, 255, 0) 72%`,
    /* Half the depth, in the page's own ink rather than in black — a shadow on
       paper is the paper with the light taken out of it. Same geometry: what
       was wrong on this page was how dark the sleeve's shadow was and what
       colour, not where it fell. */
    /* Deeper than half the dark room's, which is where this started. On paper
       the shadow is the only thing under a sleeve that says it is standing off
       the page at all — there is no dark room behind it for its edges to
       separate against, and the veils on the cover itself are held shallow so
       as not to fog the artwork. Shallower than that and a cover reads as
       printed on the page beside its neighbours rather than laid over them. */
    cast: { rest: 0.3, lean: 0.1 },
  },
};

export interface CoverLight {
  /** The veil on the edge that has turned away, 0 when the sleeve faces out. */
  shade: number;
  /**
   * Where the edge that came forward is, as a CSS gradient angle across the
   * cover: 0° at its head, 90° at its right hand. Null when the sleeve faces
   * straight out and no edge is nearer the reader than any other.
   */
  lean: number | null;
  /** The floor of plain white on the edge that has come forward. */
  sheen: number;
  /** And the body of that same sheen, for the layer laid on in soft light. */
  sheenGlaze: number;
  /**
   * Which way the lamp falls, as a CSS gradient angle across the cover. 180°
   * — straight down the sleeve — unless the sleeve itself has been turned in
   * the plane of the page, in which case it is turned back by as much: the
   * lamp hangs in the room, and a record laid at an angle under it is lit from
   * above like everything else on the shelf.
   */
  lamp: number;
  /** The room it was measured in, which is also the room it is drawn in. */
  room: CoverRoom;
}

/**
 * How a sleeve is standing, in the three CSS rotations it is drawn with.
 *
 * `x` and `y` turn it out of the page about its own two midlines; `z` turns it
 * in the page, about the pin through the middle of it. Whatever is left out is
 * a sleeve that has not been turned that way.
 */
export interface CoverStance {
  x?: number;
  y?: number;
  z?: number;
}

const RADIANS = Math.PI / 180;

/** A CSS angle, brought back into 0°–360° and rounded to the nearest degree. */
const cssAngle = (degrees: number) => Math.round(((degrees % 360) + 360) % 360);

/**
 * How one sleeve stands in that light, from the angles it is drawn at.
 *
 * All of them, not just the one across the window. A record on a shelf is
 * turned about whichever of its axes it happened to be put down at, and the
 * light does not care which: what it answers is where the sleeve's face is
 * pointing, and that is one direction however many rotations it took to get
 * there.
 *
 * That direction is read off the depth the sleeve gains across its own face —
 * the third row of the composed rotation, which says how far out of the screen
 * a point on the cover stands per step across it and per step down it. The
 * length of that pair is the sine of how far the sleeve is turned away from the
 * reader; where it points is the edge that came forward. The lamp is handed the
 * `z` back so that it stays hanging in the room while the paper turns under it.
 */
export function coverLightAt({ x = 0, y = 0, z = 0 }: CoverStance, room: CoverRoom): CoverLight {
  const sinX = Math.sin(x * RADIANS);
  const cosX = Math.cos(x * RADIANS);
  const sinY = Math.sin(y * RADIANS);
  const sinZ = Math.sin(z * RADIANS);
  const cosZ = Math.cos(z * RADIANS);
  const acrossDepth = sinX * sinZ - cosX * sinY * cosZ;
  const downDepth = sinX * cosZ + cosX * sinY * sinZ;

  const away = Math.min(Math.hypot(acrossDepth, downDepth), 1);
  const strength = Math.min(Math.asin(away) / RADIANS / MAX_TURN_DEG, 1);
  const lamp = cssAngle(180 - z);
  if (strength === 0) return { shade: 0, sheen: 0, sheenGlaze: 0, lean: null, lamp, room };
  return {
    shade: ROOM[room].shade * strength,
    sheen: ROOM[room].sheen.floor * strength,
    sheenGlaze: ROOM[room].sheen.glaze * strength,
    // 0° points up the cover and 90° across it to the right.
    lean: cssAngle(Math.atan2(acrossDepth, -downDepth) / RADIANS),
    lamp,
    room,
  };
}

/**
 * The same, for a sleeve turned about one axis only — the shelf laid across a
 * window, where `turn` is the sleeve's CSS `rotateY` in degrees, so a negative
 * turn brings its right edge forward.
 *
 * Held to the wheel's own widest turn first: nothing past the edge of the
 * visible run is lit any more deeply than that edge is, and without the hold a
 * sleeve turned far enough would come back round to facing the reader.
 */
export function coverLight(turn: number, room: CoverRoom): CoverLight {
  return coverLightAt({ y: Math.max(-MAX_TURN_DEG, Math.min(MAX_TURN_DEG, turn)) }, room);
}

/**
 * That light as a stack of gradients to lay over the artwork, for
 * `background-image`.
 *
 * A layer rather than a `filter`, because a shadow falls across a sleeve
 * without touching the colours it was printed in. The near edge's sheen sits
 * over the far edge's shade, and the lamp under both — the first layer in the
 * list is the one nearest the eye. Of the sheen and the lamp only their floors
 * are here; the rest of both is the glaze.
 *
 * Half of the light only: what the sleeve loses. What it catches is the glaze,
 * which is composited differently — see coverGlazeCss, which every surface that
 * draws this should draw with it.
 */
export function coverLightCss({ shade, sheen, lean, lamp, room }: CoverLight): string {
  const { dark, lampStops } = ROOM[room];
  const lampLayer = `linear-gradient(${lamp}deg, ${lampStops})`;
  if (lean === null) return lampLayer;

  // A gradient's first stop sits at the end it is pointing away from — so the
  // shade is aimed at the edge that came forward in order to start on the edge
  // that went back, and the sheen the other way about.
  const sheenAngle = cssAngle(lean + 180);

  return [
    `linear-gradient(${sheenAngle}deg, rgba(255, 255, 255, ${sheen}) 0%, rgba(255, 255, 255, ${sheen * 0.22}) 18%, rgba(255, 255, 255, 0) 46%)`,
    `linear-gradient(${lean}deg, rgba(${dark}, ${shade}) 0%, rgba(${dark}, ${shade * 0.34}) 30%, rgba(${dark}, 0) 66%)`,
    lampLayer,
  ].join(', ');
}

/**
 * Everything the sleeve catches, to be laid on the artwork in soft light: the
 * lit half of the lamp, and the body of the sheen down the edge that came
 * forward.
 *
 * The other half of what `coverLightCss` draws, and a layer of its own because
 * it is composited differently.
 *
 * White over artwork is the whole difficulty. Laid on plainly, as every other
 * layer here is, it does not light the cover: it stands in front of it. The
 * black in the picture stops being black — a veil at a quarter opacity puts a
 * floor of a quarter under every tone on the sleeve — and a picture whose darks
 * have all come up together is exactly what the eye reads as fog. It is worst
 * in the bright room, where the lamp is turned up highest and the artwork it is
 * turned up over is often pale to begin with.
 *
 * In soft light the same gradient answers to what is already there: it lifts
 * the middle of the range, where a lamp does most of its work, and leaves the
 * darks nearly where they were. So the head of the cover brightens, the picture
 * keeps its floor, and nothing is standing in front of the artwork.
 *
 * Which is why the numbers here are so much higher than a veil's, and are not
 * to be read against one. Soft light is gentle by construction: it takes some
 * seven tenths of white to lift a mid grey as far as a quarter of a white veil
 * would, and where the veil would have carried the darks up with it — and, at
 * the top of the range, flattened what was nearly white into white — this
 * lifts the one and cannot reach the other. Bright, in other words, is what
 * these are for; the veil's restraint was a tax on the wrong thing.
 *
 * What soft light cannot do is put light where there is none. Its answer to
 * black is black — nothing to lift, and a cover whose artwork is a dark field
 * would come back as one flat field with no lamp on it. So both lights keep a
 * thin floor of plain white — the lamp at its head, the sheen down its lit edge
 * — and this is laid over those: the floor gives the dark covers their head and
 * foot and their lit corner, and the glaze gives every cover its light.
 *
 * `mix-blend-mode: soft-light`, in a container that isolates — the sleeve is
 * meant to be lit, not the shelf behind it.
 */
export function coverGlazeCss({ sheenGlaze, lean, lamp, room }: CoverLight): string {
  const glaze = `linear-gradient(${lamp}deg, ${ROOM[room].lampGlaze})`;
  if (lean === null) return glaze;
  // Aimed away from the edge that came forward, so that it starts on it — the
  // same reading `coverLightCss` gives the sheen's own floor.
  return [
    `linear-gradient(${cssAngle(lean + 180)}deg, rgba(255, 255, 255, ${sheenGlaze}) 0%, rgba(255, 255, 255, ${sheenGlaze * 0.22}) 18%, rgba(255, 255, 255, 0) 46%)`,
    glaze,
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
