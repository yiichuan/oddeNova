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
 * of the rest, not as a row that recedes — and the further the two sizes are
 * apart, the more plainly it is the one record rather than the row that is
 * being offered. A little over half is where the sides are still records rather
 * than thumbnails of them.
 */
export const SIDE_SCALE = 0.54;

/**
 * The air between one sleeve and the next, edge to edge and the same all the
 * way along. Measured off the stage rather than off the sleeve, so a wide
 * window opens the collection out instead of only drawing it larger.
 */
export const slotGap = (stageWidth: number) => Math.min(76, Math.max(40, stageWidth * 0.048));

/**
 * How far either side of centre the turn is spent: the sleeve at that distance
 * is the one standing edge-on to the reader.
 */
export const VISIBLE_RADIUS = 3;

/** How deep the room behind the shelf is — the stage's own `perspective`. */
export const STAGE_PERSPECTIVE_PX = 800;

/**
 * The angle each sleeve's paper has come to rest at, dealt out around the
 * collection. Read against the record rather than against the slot it happens
 * to be standing in: the slot numbering runs on for as long as the wheel is
 * turned, so an angle pinned to it would deal the same record a different angle
 * on every lap.
 */
export const PAPER_X_ROTATIONS = [10, -12.5, 7.5, -9.5, 12, -9, 14] as const;

/** Half the widest of those, which is what the wheel's spacing allows for. */
const PAPER_TILT_ALLOWANCE_DEG = 7;

const RADIANS = Math.PI / 180;

/** How far a sleeve has turned at a given distance from the centre. */
export const turnAt = (distance: number) => MAX_TURN_DEG
  * (1 - (1 - Math.min(Math.abs(distance) / VISIBLE_RADIUS, 1)) ** 1.5);

/**
 * Where each slot out from the centre stands, so that the air between one
 * sleeve and the next is `gap` — the same all the way along the wheel.
 *
 * It has to be laid out slot by slot because the stage has a perspective, and a
 * perspective does not move a sleeve, it moves each of its edges by a different
 * amount. The edge that has turned towards the reader is nearer, so it is drawn
 * larger and further out; the edge that has turned away is drawn smaller and
 * further in. Two sleeves side by side therefore lean into each other's air:
 * the outer one's near edge is thrown out while the next one's far edge is
 * pulled back, and by the time the wheel is fully turned the two have converged
 * by more than a hundred pixels.
 *
 * Spaced by a flat step — one sleeve's width and a gap, which is what this was
 * — the wheel looks evenly spread at the centre and closes up towards the
 * edges, the last pair of sleeves overlapping while the first pair stand a
 * finger's width apart. So each slot is placed against where the one before it
 * actually landed: project the previous sleeve's near edge, add the air, and
 * solve for where this one's far edge has to start.
 */
export const slotOffsets = (cardSize: number, gap: number, slots: number) => {
  const half = (cardSize * SIDE_SCALE) / 2;
  const offsets = [0];
  // The centred sleeve is square to the reader and full size, so its own edge
  // is where it is drawn.
  let reach = cardSize / 2;
  for (let slot = 1; slot <= slots; slot += 1) {
    const turn = turnAt(slot) * RADIANS;
    /* Half the sleeve as it is seen, and how far its edges stand out of the
       screen — the near one towards the reader, the far one away. The paper
       each sleeve is dealt is tilted too, which lifts its corners out of the
       line its edges run along and a little further forward again; half the
       widest angle dealt is the allowance that keeps the air even measured
       corner to corner rather than edge to edge. */
    const seen = Math.cos(turn) * half;
    const depth = (Math.sin(turn) + Math.sin(PAPER_TILT_ALLOWANCE_DEG * RADIANS)) * half;
    const near = STAGE_PERSPECTIVE_PX / (STAGE_PERSPECTIVE_PX - depth);
    const far = STAGE_PERSPECTIVE_PX / (STAGE_PERSPECTIVE_PX + depth);
    const offset = (reach + gap) / far + seen;
    offsets.push(offset);
    reach = (offset + seen) * near;
  }
  return offsets;
};

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
  /*
   * Build the answer from the target slot and a whole number of laps. Besides
   * expressing the ring more directly, this keeps an integer target exact.
   * Computing it as `from + delta` can leave a floating-point remainder after
   * a drag (for example `-2.9999999999999996`), which is not a valid array
   * index even though it is visually the `-3` slot.
   *
   * `Math.round(-0.5)` preserves the existing tie-break: a target exactly half
   * a lap ahead is reached forwards.
   */
  const laps = Math.round((from - target) / ring);
  return target + laps * ring;
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
