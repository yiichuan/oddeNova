import type { ExactTrackPrimitive, TrackDensityScene, TrackLaneSceneData } from './track-preview-scene';
import { MIN_NOTE_DRAW_WIDTH_PX } from './track-preview-scene';

/**
 * Pure geometry and draw-command planning for the track lane canvases. The
 * component measures, sizes the backing store and executes the commands;
 * everything visual — projection, clipping, LOD columns, highlight regions —
 * is decided here so tests can assert finite geometry without a browser.
 */

export const NOTE_HEIGHT_PX = 5;
export const NOTE_RADIUS_PX = 2;
export const NOTE_MIN_WIDTH_PX = MIN_NOTE_DRAW_WIDTH_PX;
export const NOTE_SEP_WIDTH_PX = 1;
export const NOTE_OPACITY = 0.72;
export const NOTE_DIMMED_OPACITY = 0.35;
/** Density columns never fade out entirely; sparse music stays readable. */
export const DENSITY_MIN_ALPHA = 0.28;
export const DENSITY_MAX_ALPHA = 0.9;
/** Unpitched columns reach this far around the row centreline. */
export const UNPITCHED_SPAN_PX = 10;

/** Concrete colours resolved once by the component (no CSS vars here). */
export interface LaneColors {
  color: string;
  colorStrong: string;
  grid: string;
  gridMinor: string;
  pending: string;
  sep: string;
}

export type LaneDrawCommand =
  | { kind: 'clear'; width: number; height: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius: [number, number, number, number]; alpha: number; fill: string }
  | { kind: 'sep'; x: number; y: number; height: number; fill: string };

/** CSS-pixel projection of cycles onto the scene band. */
export interface LaneProjection {
  bandBegin: number;
  bandSpan: number;
  cssWidth: number;
  pxPerCycle: number;
}

export function laneProjection(bandBegin: number, bandEnd: number, cssWidth: number): LaneProjection {
  const bandSpan = bandEnd - bandBegin;
  const usable = Number.isFinite(bandSpan) && bandSpan > 0 && Number.isFinite(cssWidth) && cssWidth > 0;
  return {
    bandBegin,
    bandSpan: usable ? bandSpan : 1,
    cssWidth: usable ? cssWidth : 0,
    pxPerCycle: usable ? cssWidth / bandSpan : 0,
  };
}

/** The x position (CSS px) of a cycle inside the scene band. */
export function cycleToX(projection: LaneProjection, cycle: number): number {
  return (cycle - projection.bandBegin) / projection.bandSpan * projection.cssWidth;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** The pitch row centre in CSS px, mirroring the retired DOM mapping. */
export function pitchCentreY(pitch: number, cssHeight: number): number {
  const ratio = 25 + (1 - clampUnit((pitch - 24) / 72)) * 50;
  return ratio / 100 * cssHeight;
}

/** The unpitched row centre in CSS px, hashed from the sound's own name. */
export function unpitchedCentreY(sound: string, cssHeight: number): number {
  let hash = 0;
  for (const char of sound) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const offset = (hash % 5 - 2) * 4;
  return (50 + offset) / 100 * cssHeight;
}

export interface NoteGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: [number, number, number, number];
  startsInside: boolean;
  endsInside: boolean;
}

/**
 * Geometry for one exact primitive, clipped to the scene band. Events without
 * any visible span produce null — never an edge dot from the width floor.
 */
export function exactNoteGeometry(
  primitive: ExactTrackPrimitive,
  soundName: string,
  projection: LaneProjection,
  cssHeight: number,
): NoteGeometry | null {
  const clippedBegin = Math.max(primitive.begin, projection.bandBegin);
  const clippedEnd = Math.min(primitive.end, projection.bandBegin + projection.bandSpan);
  if (!(clippedEnd > clippedBegin)) return null;
  const x = cycleToX(projection, clippedBegin);
  const width = Math.max(NOTE_MIN_WIDTH_PX, cycleToX(projection, clippedEnd) - x);
  const y = (primitive.pitch !== null
    ? pitchCentreY(primitive.pitch, cssHeight)
    : unpitchedCentreY(soundName, cssHeight)) - NOTE_HEIGHT_PX / 2;
  const startsInside = primitive.begin >= projection.bandBegin;
  const endsInside = primitive.end <= projection.bandBegin + projection.bandSpan;
  return {
    x,
    y,
    width,
    height: NOTE_HEIGHT_PX,
    radius: [
      startsInside ? NOTE_RADIUS_PX : 0,
      endsInside ? NOTE_RADIUS_PX : 0,
      endsInside ? NOTE_RADIUS_PX : 0,
      startsInside ? NOTE_RADIUS_PX : 0,
    ],
    startsInside,
    endsInside,
  };
}

function maxOf(values: ArrayLike<number>): number {
  let max = 0;
  for (let index = 0; index < values.length; index++) if (values[index] > max) max = values[index];
  return max;
}

/** The pixel width of one density column, clipped to the canvas. */
export function densityColumnWidth(
  density: TrackDensityScene,
  projection: LaneProjection,
  bin: number,
): number {
  const x = cycleToX(projection, density.binBegin + bin * density.binSpan);
  const next = cycleToX(projection, density.binBegin + (bin + 1) * density.binSpan);
  return Math.max(NOTE_MIN_WIDTH_PX, Math.min(projection.cssWidth - x, next - x));
}

/** The vertical span a column covers, from its pitch range and centreline. */
export function densityColumnSpan(
  density: TrackDensityScene,
  bin: number,
  cssHeight: number,
): { top: number; height: number } {
  const pitched = density.pitchedCounts[bin] > 0;
  const unpitched = density.unpitchedCounts[bin] > 0;
  let top = cssHeight / 2 - UNPITCHED_SPAN_PX;
  let bottom = cssHeight / 2 + UNPITCHED_SPAN_PX;
  if (pitched) {
    top = pitchCentreY(density.pitchMax[bin], cssHeight) - NOTE_HEIGHT_PX / 2;
    bottom = pitchCentreY(density.pitchMin[bin], cssHeight) + NOTE_HEIGHT_PX / 2;
    if (unpitched) {
      top = Math.min(top, cssHeight / 2 - UNPITCHED_SPAN_PX);
      bottom = Math.max(bottom, cssHeight / 2 + UNPITCHED_SPAN_PX);
    }
  }
  return { top, height: Math.max(NOTE_HEIGHT_PX, bottom - top) };
}

function pushColumn(
  commands: LaneDrawCommand[],
  density: TrackDensityScene,
  projection: LaneProjection,
  cssHeight: number,
  bin: number,
  fill: string,
  alpha: number,
): void {
  const x = cycleToX(projection, density.binBegin + bin * density.binSpan);
  const width = densityColumnWidth(density, projection, bin);
  if (x >= projection.cssWidth || x + width <= 0) return;
  const { top, height } = densityColumnSpan(density, bin, cssHeight);
  commands.push({ kind: 'rect', x, y: top, width, height, radius: [0, 0, 0, 0], alpha, fill });
}

function appendDensityColumns(
  commands: LaneDrawCommand[],
  density: TrackDensityScene,
  projection: LaneProjection,
  cssHeight: number,
  fill: string,
  alphaBase: number,
): void {
  const maxCount = maxOf(density.counts);
  const maxPeak = maxOf(density.peakConcurrency);
  if (maxCount <= 0) return;
  for (let bin = 0; bin < density.counts.length; bin++) {
    const count = density.counts[bin];
    if (count <= 0) continue;
    // Logarithmic normalisation keeps a few ultra-dense moments from
    // flattening the rest of the piece; peak concurrency shares the weight.
    const t = Math.log1p(count) / Math.log1p(maxCount);
    const peakT = maxPeak > 0 ? Math.log1p(density.peakConcurrency[bin]) / Math.log1p(maxPeak) : t;
    const alpha = alphaBase * (DENSITY_MIN_ALPHA + (DENSITY_MAX_ALPHA - DENSITY_MIN_ALPHA) * (t * 0.7 + peakT * 0.3));
    pushColumn(commands, density, projection, cssHeight, bin, fill, Math.min(1, Math.max(0.05, alpha)));
  }
}

export interface LaneBasePlan {
  lane: TrackLaneSceneData;
  sounds: readonly string[];
  projection: LaneProjection;
  cssHeight: number;
  colors: LaneColors;
  quiet: boolean;
  /** Absolute cycle positions of the lane's grid lines. */
  minorTicks: readonly number[];
  majorTicks: readonly number[];
  /** Tiles before this cycle are complete; beyond it the lane is pending. */
  coverageEnd?: number;
  /** Non-contiguous pending/guarded ranges. */
  pendingRanges?: readonly (readonly [number, number])[];
  /**
   * Physical pixels per CSS pixel at draw time. When given, grid lines and
   * note separations snap to the physical pixel grid at draw stage; note
   * bodies and playback positions keep their continuous coordinates.
   */
  pixelSnap?: number;
}

/** Snap a CSS x to the physical pixel grid when a DPR is given. */
function snapX(x: number, pixelSnap: number | undefined): number {
  if (!pixelSnap || pixelSnap <= 0 || !Number.isFinite(x)) return x;
  return Math.round(x * pixelSnap) / pixelSnap;
}

/**
 * Plan the static base layer: grid, exact notes or density columns, and the
 * pending background of tiles still being queried. Sounding highlights never
 * appear here — they live on the overlay.
 */
export function planLaneBase(plan: LaneBasePlan): LaneDrawCommand[] {
  const { lane, projection, cssHeight } = plan;
  const commands: LaneDrawCommand[] = [{ kind: 'clear', width: projection.cssWidth, height: cssHeight }];
  for (const cycle of plan.minorTicks) {
    const x = snapX(cycleToX(projection, cycle), plan.pixelSnap);
    if (x < -0.5 || x > projection.cssWidth) continue;
    commands.push({ kind: 'rect', x, y: 0, width: 1, height: cssHeight, radius: [0, 0, 0, 0], alpha: 1, fill: plan.colors.gridMinor });
  }
  for (const cycle of plan.majorTicks) {
    const x = snapX(cycleToX(projection, cycle), plan.pixelSnap);
    if (x < -0.5 || x > projection.cssWidth) continue;
    commands.push({ kind: 'rect', x, y: 0, width: 1, height: cssHeight, radius: [0, 0, 0, 0], alpha: 1, fill: plan.colors.grid });
  }
  if (lane.representation === 'exact' && lane.exact) {
    const alpha = plan.quiet ? NOTE_DIMMED_OPACITY : NOTE_OPACITY;
    for (const primitive of lane.exact) {
      const geometry = exactNoteGeometry(primitive, plan.sounds[primitive.soundId] ?? '', projection, cssHeight);
      if (!geometry) continue;
      commands.push({
        kind: 'rect',
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        radius: geometry.radius,
        alpha,
        fill: plan.colors.color,
      });
      // A real start keeps its attack separation; a band-edge cut is flat.
      if (geometry.startsInside) {
        commands.push({ kind: 'sep', x: snapX(geometry.x, plan.pixelSnap), y: geometry.y, height: geometry.height, fill: plan.colors.sep });
      }
    }
  }
  if (lane.representation === 'density' && lane.density) {
    appendDensityColumns(commands, lane.density, projection, cssHeight, plan.colors.color, plan.quiet ? NOTE_DIMMED_OPACITY : NOTE_OPACITY);
  }
  const bandEnd = projection.bandBegin + projection.bandSpan;
  const pendingRanges = plan.pendingRanges?.length
    ? plan.pendingRanges
    : plan.coverageEnd !== undefined && plan.coverageEnd < bandEnd - 1e-9
      ? [[plan.coverageEnd, bandEnd] as const]
      : [];
  for (const [pendingBegin, pendingEnd] of pendingRanges) {
    const begin = Math.max(projection.bandBegin, pendingBegin);
    const end = Math.min(bandEnd, pendingEnd);
    if (end <= begin) continue;
    const x = cycleToX(projection, begin);
    commands.push({
      kind: 'rect',
      x,
      y: 0,
      width: Math.max(0, cycleToX(projection, end) - x),
      height: cssHeight,
      radius: [0, 0, 0, 0],
      alpha: 1,
      fill: plan.colors.pending,
    });
  }
  return commands;
}

export interface LaneOverlayPlan {
  lane: TrackLaneSceneData;
  sounds: readonly string[];
  projection: LaneProjection;
  cssHeight: number;
  colors: LaneColors;
  quiet: boolean;
  /** Sounding exact primitive ids; empty or missing clears the overlay. */
  activeIds?: readonly number[];
  /** Sounding density columns. */
  activeBins?: readonly number[];
  /** Physical pixels per CSS pixel at draw time (separation snapping). */
  pixelSnap?: number;
}

/**
 * Plan the overlay: only the currently sounding highlights, drawn over the
 * untouched base. Stopped playback clears it; a pause keeps whatever the last
 * sample drew.
 */
export function planLaneOverlay(plan: LaneOverlayPlan): LaneDrawCommand[] {
  const { lane, projection, cssHeight } = plan;
  const commands: LaneDrawCommand[] = [{ kind: 'clear', width: projection.cssWidth, height: cssHeight }];
  if (plan.quiet) return commands;
  if (lane.representation === 'exact' && lane.exact && plan.activeIds?.length) {
    const byId = new Map(lane.exact.map(primitive => [primitive.id, primitive]));
    for (const id of plan.activeIds) {
      const primitive = byId.get(id);
      if (!primitive) continue;
      const geometry = exactNoteGeometry(primitive, plan.sounds[primitive.soundId] ?? '', projection, cssHeight);
      if (!geometry) continue;
      commands.push({
        kind: 'rect',
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        radius: geometry.radius,
        alpha: 1,
        fill: plan.colors.colorStrong,
      });
      if (geometry.startsInside) {
        commands.push({ kind: 'sep', x: snapX(geometry.x, plan.pixelSnap), y: geometry.y, height: geometry.height, fill: plan.colors.sep });
      }
    }
  }
  if (lane.representation === 'density' && lane.density && plan.activeBins?.length) {
    for (const bin of plan.activeBins) {
      if (bin < 0 || bin >= lane.density.counts.length || lane.density.counts[bin] <= 0) continue;
      pushColumn(commands, lane.density, projection, cssHeight, bin, plan.colors.colorStrong, 1);
    }
  }
  return commands;
}

// ── Raster block planning ────────────────────────────────────────────────────

/**
 * The lane scene is no longer one downscaled bitmap: it is a row of finite
 * drawing blocks, each a device-pixel-accurate bitmap of its own cycle range.
 * Planning stays pure so tests can assert exact geometry without a canvas.
 */

/** The browser's real DPR; invalid values fall back to 1 instead of a cap. */
export function normalizeDevicePixelRatio(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return dpr;
}

/** A block draws at most this many CSS px per axis. */
export const RASTER_MAX_BLOCK_CSS_PX = 1024;
/** A block's backing store never exceeds this on either physical axis,
 *  *including* its bleed pixels. */
export const RASTER_MAX_BACKING_AXIS = 4096;
/** Every block bleeds one physical pixel into its neighbours' area so the
 *  compositor samples real content at seams; ownership clips it away. */
export const RASTER_BLEED_PHYSICAL_PX = 1;
/** Soft budget for one lane's base+overlay bitmaps; the visible area may
 *  exceed it rather than go blurry. */
export const RASTER_DEFAULT_BUDGET_BYTES = 64 * 1024 * 1024;

/** One physical-pixel grid cell of the current raster version. */
export interface RasterBlock {
  /** Stable grid cell index (column × row) within the version. */
  column: number;
  row: number;
  /** Ownership cycle range — where this block's pixels are authoritative. */
  beginCycle: number;
  endCycle: number;
  /** Canvas geometry relative to the scene band's left/top edge, in CSS px,
   *  *including* the bleed pixels. */
  cssLeft: number;
  cssTop: number;
  cssWidth: number;
  cssHeight: number;
  /** The ownership clip region (the wrapper's geometry), bleed excluded. */
  cssOwnLeft: number;
  cssOwnTop: number;
  cssOwnWidth: number;
  cssOwnHeight: number;
  /** Backing size including the bleed pixels. */
  backingWidth: number;
  backingHeight: number;
  /** Real backing-to-CSS ratios; never assumed to be integers. */
  scaleX: number;
  scaleY: number;
}

export interface RasterPlan {
  /** Changes when px/cycle, lane height or DPR change; stable while panning. */
  rasterVersion: number;
  devicePixelRatio: number;
  pxPerCycle: number;
  cssHeight: number;
  blocks: RasterBlock[];
  /** All mounted blocks × (base + overlay) × 4 bytes per pixel. */
  estimatedBytes: number;
}

export interface RasterPlanInput {
  /** The data scene band's begin; CSS offsets are relative to it. */
  bandBegin: number;
  /** Cycles the data scene actually covers. */
  dataBegin: number;
  dataEnd: number;
  /** The visible viewport, in cycles. Never shaved by the budget. */
  viewportBegin: number;
  viewportEnd: number;
  /** Cycles we would like to raster (viewport ± one screen, clipped to data). */
  drawBegin: number;
  drawEnd: number;
  /** CSS px per cycle of the shared scene band. */
  pxPerCycle: number;
  /** The lane's measured CSS height. */
  cssHeight: number;
  devicePixelRatio: number;
  /** Soft per-lane budget in bytes; over-budget plans shrink the off-screen
   *  prefetch before ever dropping the visible area's resolution. */
  maxBytes?: number;
}

function hashRasterVersion(pxPerCycle: number, cssHeight: number, dpr: number): number {
  // 1e-6 quantisation: sub-nanopixel drift does not deserve a re-raster.
  const quantize = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 1e6) >>> 0;
  };
  let hash = 2166136261;
  for (const value of [quantize(pxPerCycle), quantize(cssHeight), quantize(dpr)]) {
    hash ^= value;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/** The physical pixels one grid cell spans on an axis, bleed included. */
export function rasterBlockAxisPhysical(dpr: number): number {
  const css = Math.min(RASTER_MAX_BLOCK_CSS_PX, (RASTER_MAX_BACKING_AXIS - 2 * RASTER_BLEED_PHYSICAL_PX) / dpr);
  return Math.max(1, Math.floor(css * dpr));
}

/**
 * Cut the draw range into blocks on one global physical-pixel grid. Block
 * edges are grid multiples first and CSS positions second, so neighbouring
 * blocks tile exactly — no per-block rounding gaps, no shared downscale.
 * Backing widths come from physical boundary differences; the scales come
 * from the real backing-to-CSS ratios and never assume an integer DPR.
 */
export function planRasterBlocks(input: RasterPlanInput): RasterPlan {
  const dpr = normalizeDevicePixelRatio(input.devicePixelRatio);
  const pxPerCycle = Number.isFinite(input.pxPerCycle) && input.pxPerCycle > 0 ? input.pxPerCycle : 0;
  const cssHeight = Number.isFinite(input.cssHeight) && input.cssHeight > 0 ? input.cssHeight : 0;
  const dataBegin = Number.isFinite(input.dataBegin) ? input.dataBegin : 0;
  const dataEnd = Number.isFinite(input.dataEnd) ? Math.max(dataBegin, input.dataEnd) : dataBegin;
  const bandBegin = Number.isFinite(input.bandBegin) ? input.bandBegin : dataBegin;
  const drawBegin = Math.min(Math.max(Number.isFinite(input.drawBegin) ? input.drawBegin : dataBegin, dataBegin), dataEnd);
  const drawEnd = Math.min(Math.max(Number.isFinite(input.drawEnd) ? input.drawEnd : drawBegin, drawBegin), dataEnd);
  const rasterVersion = hashRasterVersion(pxPerCycle, cssHeight, dpr);
  const plan: RasterPlan = { rasterVersion, devicePixelRatio: dpr, pxPerCycle, cssHeight, blocks: [], estimatedBytes: 0 };
  if (!(pxPerCycle > 0) || !(cssHeight > 0) || !(dataEnd > dataBegin) || !(drawEnd > drawBegin)) return plan;

  const cycleToPhysical = (cycle: number): number => cycle * pxPerCycle * dpr;
  const bleed = RASTER_BLEED_PHYSICAL_PX;
  const columnPhys = rasterBlockAxisPhysical(dpr);
  const rowPhys = columnPhys;
  const vStart = Math.round(cycleToPhysical(Math.min(Math.max(
    Number.isFinite(input.viewportBegin) ? input.viewportBegin : drawBegin, dataBegin,
  ), dataEnd)));
  const vEndRaw = Math.round(cycleToPhysical(Math.min(Math.max(
    Number.isFinite(input.viewportEnd) ? input.viewportEnd : drawBegin,
    vStart / (pxPerCycle * dpr),
  ), dataEnd)));
  // A degenerate viewport still owns one physical px of visible content,
  // never beyond the data itself.
  const vEnd = Math.max(vEndRaw === vStart ? Math.min(vStart + 1, Math.round(cycleToPhysical(dataEnd))) : vEndRaw, vStart);
  // Nothing visible inside the data: no blocks at all.
  if (!(vEnd > vStart)) return plan;
  const pStart = Math.min(Math.round(cycleToPhysical(drawBegin)), vStart);
  const pEnd = Math.max(Math.round(cycleToPhysical(drawEnd)), vEnd);
  // Vertical rows: same principle as columns — full CSS resolution, split
  // when the lane is unusually tall, never a lowered vertical scale.
  const cssPhysHeight = Math.round(cssHeight * dpr);
  const rowCount = Math.max(1, Math.ceil(cssPhysHeight / rowPhys - 1e-9));
  const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

  /** Ownership columns of one candidate draw range, on the shared grid. */
  const columnsFor = (left: number, right: number): Array<{ ownStart: number; ownEnd: number; column: number }> => {
    const columns: Array<{ ownStart: number; ownEnd: number; column: number }> = [];
    for (let column = Math.floor(left / columnPhys); ; column++) {
      const ownStart = Math.max(column * columnPhys, left);
      const ownEnd = Math.min((column + 1) * columnPhys, right);
      if (ownEnd <= ownStart) break;
      columns.push({ ownStart, ownEnd, column });
      if (ownEnd >= right) break;
    }
    return columns;
  };

  const blocksFor = (columns: Array<{ ownStart: number; ownEnd: number; column: number }>): { blocks: RasterBlock[]; bytes: number } => {
    const blocks: RasterBlock[] = [];
    let bytes = 0;
    for (let row = 0; row < rowCount; row++) {
      // Row boundaries sit on the shared vertical physical grid too.
      const ownPhysTop = row * rowPhys;
      const ownPhysBottom = Math.min(cssPhysHeight, (row + 1) * rowPhys);
      if (ownPhysBottom <= ownPhysTop) break;
      const backingPhysTop = Math.max(0, ownPhysTop - bleed);
      const backingPhysBottom = Math.min(cssPhysHeight, ownPhysBottom + bleed);
      const backingHeight = Math.max(1, backingPhysBottom - backingPhysTop);
      const backingCssTop = backingPhysTop / dpr;
      const backingCssHeight = backingHeight / dpr;
      const ownCssTop = ownPhysTop / dpr;
      const ownCssHeight = (ownPhysBottom - ownPhysTop) / dpr;
      for (const columnEntry of columns) {
        const backingWidth = columnEntry.ownEnd - columnEntry.ownStart + 2 * bleed;
        const backingCssWidth = backingWidth / dpr;
        const ownCssWidth = (columnEntry.ownEnd - columnEntry.ownStart) / dpr;
        bytes += backingWidth * backingHeight * 4 * 2;
        blocks.push({
          column: columnEntry.column,
          row,
          beginCycle: columnEntry.ownStart / (pxPerCycle * dpr),
          endCycle: columnEntry.ownEnd / (pxPerCycle * dpr),
          cssLeft: round6(columnEntry.ownStart / dpr - bleed / dpr - bandBegin * pxPerCycle),
          cssTop: round6(backingCssTop),
          cssWidth: round6(backingCssWidth),
          cssHeight: round6(backingCssHeight),
          cssOwnLeft: round6(columnEntry.ownStart / dpr - bandBegin * pxPerCycle),
          cssOwnTop: round6(ownCssTop),
          cssOwnWidth: round6(ownCssWidth),
          cssOwnHeight: round6(ownCssHeight),
          backingWidth,
          backingHeight,
          scaleX: round6(backingWidth / backingCssWidth),
          scaleY: round6(backingHeight / backingCssHeight),
        });
      }
    }
    return { blocks, bytes };
  };

  // Off-screen prefetch shrinks before clarity does: full margins first,
  // then half of each side's margin, a quarter, and finally none — the
  // viewport itself is never shaved.
  const shrink = (fraction: number): [number, number] => [
    Math.max(pStart, vStart - Math.round((vStart - pStart) * fraction)),
    Math.min(pEnd, vEnd + Math.round((pEnd - vEnd) * fraction)),
  ];
  const candidates: Array<[number, number]> = [shrink(1), shrink(0.5), shrink(0.25), shrink(0)];
  let chosenBlocks: RasterBlock[] = [];
  let chosenBytes = 0;
  for (const [left, right] of candidates) {
    const { blocks, bytes } = blocksFor(columnsFor(left, right));
    chosenBlocks = blocks;
    chosenBytes = bytes;
    if (bytes <= (Number.isFinite(input.maxBytes) && input.maxBytes! > 0 ? input.maxBytes! : Infinity)) break;
  }
  plan.blocks = chosenBlocks;
  plan.estimatedBytes = chosenBytes;
  return plan;
}

// ── Execution ────────────────────────────────────────────────────────────────

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: readonly [number, number, number, number],
): void {
  const [tl, tr, br, bl] = radius.map(value => Math.max(0, Math.min(value, width / 2, height / 2)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + width - tr, y);
  if (tr > 0) ctx.arcTo(x + width, y, x + width, y + tr, tr);
  ctx.lineTo(x + width, y + height - br);
  if (br > 0) ctx.arcTo(x + width, y + height, x + width - br, y + height, br);
  ctx.lineTo(x + bl, y + height);
  if (bl > 0) ctx.arcTo(x, y + height, x, y + height - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * Execute planned commands on a 2D context. The caller has already applied
 * the DPR transform (`setTransform(scale, 0, 0, scale, 0, 0)`), so commands
 * stay in CSS pixels.
 */
export function executeLaneDrawCommands(ctx: CanvasRenderingContext2D, commands: readonly LaneDrawCommand[]): void {
  for (const command of commands) {
    if (command.kind === 'clear') {
      ctx.clearRect(0, 0, command.width, command.height);
      continue;
    }
    if (command.kind === 'sep') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = command.fill;
      ctx.fillRect(command.x, command.y, NOTE_SEP_WIDTH_PX, command.height);
      continue;
    }
    ctx.globalAlpha = command.alpha;
    ctx.fillStyle = command.fill;
    if (command.radius.every(value => value <= 0)) {
      ctx.fillRect(command.x, command.y, command.width, command.height);
    } else {
      roundRectPath(ctx, command.x, command.y, command.width, command.height, command.radius);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
