/**
 * The lap, on its way between the two shapes it is drawn in.
 *
 * On the shelf the lap *is* the transport pill's outline — a racetrack run from
 * the top centre clockwise, the whole of it the band and as much of it as has
 * sounded the accent, with no other edge drawn on the pill at all. Inside a
 * record it is a band above the transport, run from the left. The two are the
 * same lap, so opening a record does not swap one for the other: the racetrack
 * is unwrapped into the line, and the line then goes to where the band stands.
 *
 * It comes apart the way a loop of string laid on a table would if you pulled
 * the two ends of its top run apart: both ends travel anticlockwise — the far
 * end all the way back round the bottom, the near end only as far as the top
 * left corner — until what is left of the loop is its top edge, which is already
 * straight. Nothing is bent to make that happen. The whole move is a window on
 * to a path that never changes, which is why the played part can shrink with it
 * and stay the same share of it throughout.
 *
 * Then the line, and not before: it lifts to the band's own height, widens past
 * the caps it used to run between, and thickens from a hairline to the band. The
 * two moves are in that order and not at once — a shape that unwrapped while it
 * travelled would read as neither.
 */

/** How much of the trip is spent coming unwrapped, the rest being the travel. */
export const UNWRAP_SHARE = 0.6;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, at: number) => from + (to - from) * at;

/**
 * The one curve the whole move is made of, in the closed form a frame loop can
 * read: `MORPH_EASING` is the same curve for anything doing its share of it in
 * CSS.
 *
 * Eased at both ends, and both ends of each half. The move is two beats — the
 * loop comes unwrapped, then the line goes to the band — and a beat that begins
 * at full speed is a jolt where the one before it has just come to rest. Started
 * and stopped, twice, the two read as one gesture with a breath in the middle
 * rather than as a slide interrupted.
 */
export const easeInOutCubic = (progress: number) => (progress < 0.5
  ? 4 * progress ** 3
  : 1 - (-2 * progress + 2) ** 3 / 2);

/** The same curve, for the parts of the move CSS is carrying. */
export const MORPH_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';

export interface LapCapsule {
  /** The box the lap is drawn in — the pill's own, to the fraction of a pixel. */
  width: number;
  height: number;
  /**
   * Half the straight top edge as a share of the whole perimeter, which is the
   * distance from where the path opens to the top's middle — the point the lap
   * starts and finishes at.
   */
  topCentre: number;
  /** The top edge's two ends and its height, in the box's own units. */
  left: number;
  right: number;
  top: number;
  /** The capsule, drawn on the glass ring's centre line. */
  d: string;
}

/**
 * The pill as a path: a rounded rect whose corners are half its height, laid on
 * the glass ring's own centre line — that ring is the pill's 1px transparent
 * border, so the middle of it is the measured box taken in half a pixel all
 * round. Half a pixel of drift and the accent runs alongside the glass instead
 * of over it.
 *
 * Null for a box that is not a capsule: nothing has been measured yet, or the
 * pill is momentarily taller than it is wide.
 */
export function lapCapsule(width: number, height: number, border: number): LapCapsule | null {
  const inset = border / 2;
  const innerWidth = width - border;
  const innerHeight = height - border;
  if (innerWidth <= innerHeight || innerHeight <= 0) return null;

  const radius = innerHeight / 2;
  const straight = innerWidth - innerHeight;
  const perimeter = straight * 2 + Math.PI * innerHeight;

  return {
    width,
    height,
    topCentre: straight / 2 / perimeter,
    left: inset + radius,
    right: inset + innerWidth - radius,
    top: inset,
    d: `M ${inset + radius} ${inset}`
      + ` H ${inset + innerWidth - radius}`
      + ` A ${radius} ${radius} 0 0 1 ${inset + innerWidth - radius} ${inset + innerHeight}`
      + ` H ${inset + radius}`
      + ` A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset} Z`,
  };
}

/** Where the band the lap is on its way to stands, relative to the pill's box. */
export interface LapBand {
  /** The air between the band and the top of the pill, in px. */
  gap: number;
  /** How thick the band is, and how thick the outline it comes from is. */
  thickness: number;
  ring: number;
}

export interface LapShape {
  /** The path the lap is drawn on, whatever shape it is currently in. */
  d: string;
  /**
   * The window of that path the lap covers, in path-length units — where it
   * begins, and how much of the path it runs for. The played part is the same
   * beginning and `progress` of the same length, so what has been heard stays
   * the same share of the lap however much of the lap is left.
   *
   * The beginning runs negative and the end past 1 while the loop is still
   * wrapped: a dash pattern repeats, so a window that runs off one end of a
   * closed path comes back on at the other.
   */
  start: number;
  length: number;
  /** How thick to draw it, in px. */
  thickness: number;
  /**
   * How far along the second beat the lap is: 0 anywhere in the unwrap, 1 once
   * the line is standing where the band stands, eased the same way the geometry
   * above is.
   *
   * Handed out rather than recomputed by the caller, because what reads it is
   * the lap's colour — on paper the outline and the band are not the same grey,
   * and the one number that moves the line into place is the one that has to
   * carry the colour there too, or a bar arrives at the band still wearing the
   * shelf's white.
   */
  travel: number;
  /**
   * Whether the path it is drawn on closes on itself.
   *
   * It decides how the window is written as a dash pattern, and that is not a
   * detail: a pattern whose period is the whole path length has its next dash
   * begin exactly where an open path ends, and a dash of no length under a round
   * cap is drawn as a dot. On the capsule there is no end for that dot to land
   * on — the next dash is the same dash — so the two cases are written
   * differently. See `lapDash`.
   */
  closed: boolean;
}

/**
 * The lap at one point of the trip: `morph` is 0 on the shelf and 1 at the band.
 *
 * The first stretch keeps the capsule's own path and moves only the window on to
 * it, which is what unwraps it; the rest leaves the capsule behind for the
 * straight run its top edge has become, and takes that to the band.
 */
export function lapShape(capsule: LapCapsule, morph: number, band: LapBand): LapShape {
  const unwrap = easeInOutCubic(clamp01(morph / UNWRAP_SHARE));
  const travel = easeInOutCubic(clamp01((morph - UNWRAP_SHARE) / (1 - UNWRAP_SHARE)));

  if (travel <= 0) {
    // Both ends anticlockwise: the start from the top's middle to the top left
    // corner, the end from a whole lap ahead of it to the top right one.
    const start = lerp(capsule.topCentre, 0, unwrap);
    const end = lerp(capsule.topCentre + 1, capsule.topCentre * 2, unwrap);
    return {
      d: capsule.d,
      start,
      length: end - start,
      thickness: band.ring,
      travel: 0,
      closed: true,
    };
  }

  /* The run stops half its own thickness inside the band's ends, because a round
     cap is what fills the rest: a line from edge to edge would be the band plus a
     half-circle hanging off each end of it, and the band it hands over to is a box
     with rounded ends. */
  const cap = band.thickness / 2;
  return {
    d: `M ${lerp(capsule.left, cap, travel)} ${lerp(capsule.top, -(band.gap + cap), travel)}`
      + ` H ${lerp(capsule.right, capsule.width - cap, travel)}`,
    start: 0,
    length: 1,
    thickness: lerp(band.ring, band.thickness, travel),
    travel,
    closed: false,
  };
}

/**
 * A stretch of the lap, written as a dash pattern.
 *
 * Round the capsule the pattern repeats every whole path length, which on a path
 * that closes on itself means the one dash drawn twice in the same place. On the
 * straight run it would mean a second dash beginning exactly at the far end —
 * nothing of it on the path, but a round cap draws a dot for a dash of no length
 * all the same, which is a bead of the accent sitting off the right-hand end. So
 * an open path is given a gap it cannot come back from.
 */
export function lapDash(length: number, closed: boolean): string {
  return `${length} ${closed ? 1 - length : 1}`;
}
