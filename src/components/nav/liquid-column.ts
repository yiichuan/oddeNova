/**
 * The primary nav column as one body of liquid.
 *
 * The bar and the two pods are not different elements — they are one silhouette
 * that pulls apart and flows back together. This module owns that silhouette:
 * a path built from the column's box plus a strand between the two lobes, and
 * the timing curves that make the strand hold on before it lets go.
 *
 * Everything here is pure, so the shape can be unit-tested without a layout.
 */

/** Matches `--radius-region`; the lobes settle at the same corner as every other region. */
export const NAV_RADIUS = 6;

/** How far the lobes travel before the strand between them lets go. */
export const NECK_SNAP = 64;
/** How far the meniscus reaches back along a lobe's edge where the strand meets it. */
const NECK_FILLET = 12;
/** Below this the strand is thinner than its own outline, so it has already broken. */
const NECK_MIN_WAIST = 2.5;

/* Keep the liquid character, but let the silhouette answer immediately. The
   strand gets only a brief tension beat before the lobes visibly travel. */
export const STICKY_MS = 180;
export const RELEASE_MS = 280;
export const APPROACH_MS = 180;
export const MERGE_MS = 220;
export const SPLIT_MS = STICKY_MS + RELEASE_MS;
export const REJOIN_MS = APPROACH_MS + MERGE_MS;
/** A lobe folding open sloshes rather than slides. */
export const UNFOLD_MS = 340;

export interface ColumnShape {
  width: number;
  height: number;
  /** Where the top lobe ends. */
  gapTop: number;
  /** Where the bottom lobe starts. */
  gapBottom: number;
  radius: number;
}

export interface Neck {
  /** Half-width of the strand at its narrowest. */
  waist: number;
  /** Half-width where the strand meets a lobe's edge. */
  attach: number;
}

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/* A whisker of overshoot: the lobes recoil past their resting size when the
   strand snaps, then relax back into it. */
const easeOutBack = (t: number, overshoot: number) =>
  1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;

/**
 * The strand at a given gap, or null once it has broken. Thins slowly at first
 * and then pinches — the profile that reads as surface tension giving way.
 */
export function neckFor(gap: number, halfWidth: number): Neck | null {
  if (gap <= 0) return { waist: halfWidth, attach: halfWidth };
  if (gap >= NECK_SNAP) return null;

  const waist = halfWidth * (1 - (gap / NECK_SNAP) ** 1.5);
  if (waist < NECK_MIN_WAIST) return null;

  return { waist, attach: Math.min(halfWidth, waist + NECK_FILLET) };
}

/**
 * The corner where a lobe meets the strand. Square while the strand still
 * spans the full width, rounding up to the region radius as it necks in.
 */
export function lobeRadius(gap: number, halfWidth: number, radius: number): number {
  const neck = neckFor(gap, halfWidth);
  if (!neck) return radius;
  return radius * clamp((halfWidth - neck.attach) / NECK_FILLET, 0, 1);
}

const round = (value: number) => Math.round(value * 100) / 100;

/** One closed rounded rect, clockwise, with independent top and bottom radii. */
function lobePath(x0: number, y0: number, x1: number, y1: number, rTop: number, rBottom: number): string {
  const limit = Math.min((x1 - x0) / 2, (y1 - y0) / 2);
  const rt = round(clamp(rTop, 0, limit));
  const rb = round(clamp(rBottom, 0, limit));
  const [a, b, c, d] = [round(x0), round(y0), round(x1), round(y1)];

  return `M${a + rt},${b}H${c - rt}A${rt},${rt} 0 0 1 ${c},${b + rt}`
    + `V${d - rb}A${rb},${rb} 0 0 1 ${c - rb},${d}`
    + `H${a + rb}A${rb},${rb} 0 0 1 ${a},${d - rb}`
    + `V${b + rt}A${rt},${rt} 0 0 1 ${a + rt},${b}Z`;
}

/**
 * The column's silhouette as SVG path data, in the element's own pixels.
 *
 * `inset` offsets the outline along its inward normal, which is what lets the
 * same builder produce the 1px ring that stands in for the bar's border: outer
 * outline plus inset outline, filled even-odd.
 */
export function liquidOutline(shape: ColumnShape, inset = 0): string {
  const { width, height, radius } = shape;
  const half = width / 2;
  const gap = shape.gapBottom - shape.gapTop;
  const neck = neckFor(gap, half);

  const x0 = inset;
  const x1 = width - inset;
  const y0 = inset;
  const y1 = height - inset;
  const cx = half;
  const r = Math.max(radius - inset, 0);
  const ri = Math.max(lobeRadius(gap, half, radius) - inset, 0);
  /* The lobe edges face outwards from the gap, so insetting pulls them apart. */
  const top = shape.gapTop - inset;
  const bottom = shape.gapBottom + inset;

  if (!neck) {
    return `${lobePath(x0, y0, x1, top, r, ri)} ${lobePath(x0, bottom, x1, y1, ri, r)}`;
  }

  const waist = Math.max(neck.waist - inset, 0.4);
  const attach = clamp(neck.attach - inset, waist, cx - inset);
  const ym = (top + bottom) / 2;
  /* Leave the lobe edge horizontally and arrive at the waist vertically: the
     two tangents are what make the join a meniscus instead of a chamfer. */
  const k = (attach - waist) * 0.55;
  const j = (ym - top) * 0.55;

  const n = round;
  const corner = (rr: number, x: number, y: number) =>
    (rr > 0 ? `A${n(rr)},${n(rr)} 0 0 1 ${n(x)},${n(y)}` : `L${n(x)},${n(y)}`);

  return `M${n(x0 + r)},${n(y0)}`
    + `H${n(x1 - r)}${corner(r, x1, y0 + r)}`
    + `V${n(top - ri)}${corner(ri, x1 - ri, top)}`
    + `H${n(cx + attach)}`
    + `C${n(cx + attach - k)},${n(top)} ${n(cx + waist)},${n(ym - j)} ${n(cx + waist)},${n(ym)}`
    + `C${n(cx + waist)},${n(ym + j)} ${n(cx + attach - k)},${n(bottom)} ${n(cx + attach)},${n(bottom)}`
    + `H${n(x1 - ri)}${corner(ri, x1, bottom + ri)}`
    + `V${n(y1 - r)}${corner(r, x1 - r, y1)}`
    + `H${n(x0 + r)}${corner(r, x0, y1 - r)}`
    + `V${n(bottom + ri)}${corner(ri, x0 + ri, bottom)}`
    + `H${n(cx - attach)}`
    + `C${n(cx - attach + k)},${n(bottom)} ${n(cx - waist)},${n(ym + j)} ${n(cx - waist)},${n(ym)}`
    + `C${n(cx - waist)},${n(ym - j)} ${n(cx - attach + k)},${n(top)} ${n(cx - attach)},${n(top)}`
    + `H${n(x0 + ri)}${corner(ri, x0, top - ri)}`
    + `V${n(y0 + r)}${corner(r, x0 + r, y0)}`
    + 'Z';
}

/**
 * How far apart the lobes are, as a fraction of their fully-parted gap, `t`
 * through the split. `snap` is where in that range the strand breaks, so the
 * first beat is spent stretching it and the second getting home.
 */
export function splitSpread(t: number, snap: number): number {
  const hold = STICKY_MS / SPLIT_MS;
  if (t <= hold) {
    const u = t / hold;
    return snap * (0.12 * u + 0.88 * u ** 2.2);
  }
  const u = (t - hold) / (1 - hold);
  return snap + (1 - snap) * easeOutBack(u, 0.7);
}

/** The same journey back: drift into range, then get taken the last stretch. */
export function rejoinSpread(t: number, snap: number): number {
  const drift = APPROACH_MS / REJOIN_MS;
  if (t <= drift) {
    const u = t / drift;
    return 1 - (1 - snap) * (0.25 * u + 0.75 * u * u);
  }
  const u = (t - drift) / (1 - drift);
  return snap * (1 - easeOutCubic(u));
}

/**
 * Where on a curve a given spread already sits, so an interrupted transition
 * can pick the journey up from where the last one got to rather than jumping.
 */
export function solveSpreadTime(curve: (t: number) => number, value: number, descending: boolean): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    const behind = descending ? curve(mid) > value : curve(mid) < value;
    if (behind) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A lobe folding open or shut, with a touch of slosh at the end. */
export function unfoldCurve(from: number, to: number): (t: number) => number {
  return (t: number) => from + (to - from) * easeOutBack(t, 0.9);
}
