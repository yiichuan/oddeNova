/**
 * The carousel's arithmetic: how a ring of slots is counted, and how far a trip
 * across it has got at any moment.
 *
 * Kept beside the component rather than inside it because none of it needs a
 * render to be true — and because a component file that also exports functions
 * loses fast refresh.
 */

/** Wheel travel that advances one sleeve — lower is a lighter touch. */
export const WHEEL_PIXELS_PER_SLOT = 40;

/**
 * How far the sleeve at the edge of the visible run has turned, in degrees.
 * Everything between the centre and that edge is turned in proportion, so this
 * is also what "fully turned" means to the light falling on them.
 */
export const MAX_TURN_DEG = 76;

/**
 * How small a sleeve stands once it is off the centre. Every slot either side
 * gives up the same amount: the wheel is read as one record held out in front
 * of the rest, not as a row that recedes.
 */
export const SIDE_SCALE = 0.66;

/**
 * The air between one sleeve and the next, edge to edge and the same all the
 * way along. Measured off the stage rather than off the sleeve, so a wide
 * window opens the collection out instead of only drawing it larger.
 */
export const slotGap = (stageWidth: number) => Math.min(76, Math.max(40, stageWidth * 0.048));

/** One sleeve's worth of settling. */
export const SNAP_DURATION_MS = 360;
/** What each sleeve past the first adds to a trip, and the most one can take. */
const SNAP_STEP_MS = 90;
export const SNAP_MAX_MS = 760;

export const positiveModulo = (value: number, divisor: number) => (
  ((value % divisor) + divisor) % divisor
);

/**
 * The collection is a ring, so every slot can be reached either way round. This
 * is whichever of a slot's equivalents lies nearer to where the carousel is
 * already heading — the short way about, whichever way that turns out to be.
 *
 * `from` may sit part-way between slots, which is what a trip interrupted
 * mid-flight looks like; the answer stays an exact equivalent of `target`.
 */
export const nearestEquivalent = (target: number, from: number, ring: number) => {
  if (ring <= 0) return target;
  const delta = positiveModulo(target - from, ring);
  return from + (delta > ring / 2 ? delta - ring : delta);
};

/** cubic-bezier(0.22, 1, 0.36, 1), in the closed form a frame loop can read. */
export const easeOutQuint = (progress: number) => 1 - (1 - progress) ** 5;

/**
 * One sleeve settles in the base time. A longer trip is stretched, but nowhere
 * near as far again for each extra sleeve — crossing a whole collection should
 * still feel like one move, not like waiting for a carousel to come round.
 */
export const snapDuration = (distance: number) => Math.min(
  SNAP_MAX_MS,
  SNAP_DURATION_MS + Math.max(Math.abs(distance) - 1, 0) * SNAP_STEP_MS,
);
