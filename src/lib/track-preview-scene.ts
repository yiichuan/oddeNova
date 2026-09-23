/**
 * Pure data model for the track preview scene: resolution tiers, the
 * render-scene types, the streaming density accumulators behind the LOD,
 * scene assembly, byte estimation and the sounding-highlight indexes. No
 * DOM, no React, no Pattern — everything here is deterministic and
 * unit-testable without a browser.
 */

export type TrackSceneRepresentation = 'exact' | 'density' | 'mixed';
export type TrackSceneStatus = 'progress' | 'complete' | 'resource-guarded' | 'failed';

/**
 * The immutable identity of one complete display-domain scene. Viewport and
 * raster details deliberately do not belong here: changing zoom must never
 * invalidate music data that was already queried.
 */
export interface TrackFullSceneIdentity {
  readonly previewGeneration: number;
  readonly loopOffset: number;
  readonly loopCycles: number;
  readonly cps: number;
}

export function trackFullSceneIdentityKey(identity: TrackFullSceneIdentity): string {
  const numberKey = (value: number): string => (Number.isFinite(value) ? value.toFixed(9) : 'NaN');
  return [
    identity.previewGeneration,
    numberKey(identity.loopOffset),
    numberKey(identity.loopCycles),
    numberKey(identity.cps),
  ].join('|');
}

export function sameTrackFullSceneIdentity(
  left: TrackFullSceneIdentity | null | undefined,
  right: TrackFullSceneIdentity | null | undefined,
): boolean {
  return left !== null && left !== undefined
    && right !== null && right !== undefined
    && left.previewGeneration === right.previewGeneration
    && Math.abs(left.loopOffset - right.loopOffset) < 1e-9
    && Math.abs(left.loopCycles - right.loopCycles) < 1e-9
    && Math.abs(left.cps - right.cps) < 1e-9;
}

export type TrackFullSceneStatus = 'idle' | 'preparing' | 'complete' | 'resource-guarded' | 'failed';
export type TrackFullSceneFailure = 'long-task' | 'allocation' | 'no-progress' | 'query-failed';

/** One fixed-range tile in a full-scene snapshot. */
export interface TrackSceneTile {
  readonly index: number;
  readonly begin: number;
  readonly end: number;
  readonly binSpan: number;
  readonly binCount: number;
  readonly status: 'pending' | 'complete' | 'guarded';
  readonly lanes: readonly (TileLaneState | null)[];
  readonly rawEventCount: number;
}

export interface TrackFullSceneSnapshot {
  readonly identity: TrackFullSceneIdentity;
  readonly status: TrackFullSceneStatus;
  readonly begin: 0;
  readonly end: number;
  readonly completedTiles: ReadonlySet<number>;
  readonly tiles: readonly TrackSceneTile[];
  readonly sounds: readonly string[];
  readonly resolutionTier: number;
  readonly effectiveBinSpan: number;
  readonly exactBudget: number;
  readonly lods: readonly TrackSceneLod[];
  readonly failure?: TrackFullSceneFailure;
}

/** One frozen scene request. No live scheduler state is read after start. */
export interface TrackSceneRequest {
  generation?: number;
  loopOffset: number;
  cps: number;
  /** Display-domain band, already clipped to the piece's [0, L]. */
  queryBegin: number;
  queryEnd: number;
  viewportBegin: number;
  viewportEnd: number;
  /** Visible CSS width the scene is drawn at (the shared lane content width). */
  cssWidth: number;
  devicePixelRatio: number;
  /**
   * The caller's last accepted target tier, recorded across renders. Optional:
   * callers that do not track precision keep the service's own computation.
   */
  resolutionTier?: number;
  /** Cooperative slice budget in ms; playing samples use ~4, paused ~6. */
  workSliceMs?: number;
  /** Internal full-scene scheduler order; viewport never changes this list. */
  tileOrder?: readonly number[];
}

export interface TrackSceneBatch {
  generation: number;
  loopOffset: number;
  begin: number;
  end: number;
  viewportBegin?: number;
  viewportEnd?: number;
  representation: TrackSceneRepresentation;
  status: TrackSceneStatus;
  lanes: readonly TrackLaneSceneData[];
  /** Every raw hap the query produced, valid or not. */
  rawEventCount: number;
  resolutionTier: number;
  /**
   * The effective base bin span the density columns actually use — the cache
   * identity's binning specification, not merely the tier. Present whenever
   * the batch holds density columns.
   */
  effectiveBinSpan?: number;
  /** The exact-candidate budget this batch was assembled under. */
  exactBudget?: number;
  /** Sound dictionary: ExactTrackPrimitive.soundId indexes into this. */
  sounds: readonly string[];
  /** Progressive delivery: data covers [begin, coverageEnd); absent = whole band. */
  coverageEnd?: number;
  /** Fixed full-scene tiles; present when the batch is backed by that model. */
  sceneTiles?: readonly TrackSceneTile[];
  /** Non-contiguous tile completion, used instead of a prefix coverage marker. */
  completedTiles?: ReadonlySet<number>;
  /** Pending/guarded ranges projected in the same coordinate domain as the lane. */
  pendingRanges?: readonly (readonly [number, number])[];
}

/** One per-lane segment of the assembled scene. */
export interface TrackLaneSceneData {
  trackId: string;
  representation: 'exact' | 'density';
  /** Whole (uncropped) note spans owned by this lane; sound via the dictionary. */
  exact?: readonly ExactTrackPrimitive[];
  density?: TrackDensityScene;
  /** Valid raw haps owned by this lane. */
  rawEventCount: number;
}

export interface TrackSceneLod {
  readonly level: number;
  readonly binSpan: number;
  readonly lanes: readonly TrackLaneSceneData[];
}

export interface ExactTrackPrimitive {
  /** Lane-scoped identity for highlight indexes. */
  id: number;
  begin: number;
  end: number;
  pitch: number | null;
  /** Index into the batch's sound dictionary. */
  soundId: number;
}

/** Density columns over one tile: bins cover [binBegin, binBegin + n × binSpan). */
export interface TrackDensityScene {
  binBegin: number;
  binSpan: number;
  /** Haps covering each column (cover semantics, clipped to the band). */
  counts: Uint32Array;
  /** Haps sounding at each column's start cycle. */
  peakConcurrency: Uint16Array;
  pitchMin: Int16Array;
  pitchMax: Int16Array;
  pitchedCounts: Uint16Array;
  unpitchedCounts: Uint16Array;
}

// ── Resolution tiers ─────────────────────────────────────────────────────────

export const MIN_RESOLUTION_TIER = -16;
export const MAX_RESOLUTION_TIER = 16;
/** A zoom change under 25% keeps the current tier: no re-query on small resizes. */
export const TIER_HYSTERESIS_RATIO = 0.25;
/** A note narrower than this is drawn at the renderer's minimum width. */
export const MIN_NOTE_DRAW_WIDTH_PX = 2;

function rawTierOf(pixelsPerCycle: number): number {
  if (!Number.isFinite(pixelsPerCycle) || pixelsPerCycle <= 0) return MIN_RESOLUTION_TIER;
  return Math.max(MIN_RESOLUTION_TIER, Math.min(MAX_RESOLUTION_TIER, Math.floor(Math.log2(pixelsPerCycle))));
}

function rawTier(pixelsPerCycle: number): number {
  return rawTierOf(pixelsPerCycle);
}

/**
 * The 2-power tier of `pixelsPerCycle`. With `previousTier` given, the tier
 * holds across a ±25% band around its boundary so small zooms and resizes
 * reuse the same scene instead of flapping between tiers.
 */
export function resolutionTierFor(pixelsPerCycle: number, previousTier?: number): number {
  const tier = rawTier(pixelsPerCycle);
  if (previousTier === undefined || previousTier === tier) return tier;
  if (tier === previousTier + 1 && pixelsPerCycle < Math.pow(2, tier) * (1 + TIER_HYSTERESIS_RATIO)) return previousTier;
  if (tier === previousTier - 1 && pixelsPerCycle > Math.pow(2, tier + 1) * (1 - TIER_HYSTERESIS_RATIO)) return previousTier;
  return tier;
}

/** CSS pixels per cycle the scene is drawn at, from the visible viewport. */
export function pixelsPerCycleFor(request: Pick<TrackSceneRequest, 'cssWidth' | 'viewportBegin' | 'viewportEnd'>): number {
  const span = request.viewportEnd - request.viewportBegin;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(request.cssWidth) || request.cssWidth <= 0) return 0;
  return request.cssWidth / span;
}

// ── Tile planning ────────────────────────────────────────────────────────────

/** Hard cap on density columns per lane per scene; more only widens columns. */
export const MAX_DENSITY_BINS = 4096;
/** A lane keeps exact form while its notes are at least this wide on screen. */
export const MIN_EXACT_WIDTH_PX = 0.75;
/** A lane keeps exact form while its primitives stay under screen × 4. */
export const EXACT_COUNT_SCREEN_FACTOR = 4;
/** A full tile spans about one cycle, snapped onto the bin grid. */
export const TILE_TARGET_CYCLES = 1;

/**
 * One request's precision in one place, shared by the panel and the service:
 * the hysteresis-resolved tier, the density binning the tier fixes, and the
 * exact-candidate budget. The tier comes from CSS px/cycle only — the
 * device pixel ratio is a raster concern, never a music-data one.
 */
export interface PixelPrecisionPlan {
  resolutionTier: number;
  /**
   * The base bin span the tier fixes (`2^-tier`), coarsened only by the
   * bin-count guard. This — not the raw px/cycle — is what the accumulators
   * bin at and what the cache identity must carry.
   */
  effectiveBinSpan: number;
  /** Density bins the band holds at the effective span. */
  binCount: number;
  /** Exact-candidate budget: screen width × EXACT_COUNT_SCREEN_FACTOR. */
  exactBudget: number;
  /** The tiles the band is cut into at this precision. */
  tile: TrackTilePlan;
}

export interface PixelPrecisionInput {
  cssWidth: number;
  viewportBegin: number;
  viewportEnd: number;
  bandBegin: number;
  bandEnd: number;
  /** The tier hysteresis holds across (the panel's last accepted tier). */
  previousTier?: number;
  /** The caller's requested tier; validated against the measured one. */
  requestedTier?: number;
}

/**
 * Validate a requested tier: any integer inside the tier range within one
 * step of the measured tier is honoured — fast gestures may advance, a value
 * from a stale render cannot jump far from what the pixels say.
 */
export function validateRequestedTier(requestedTier: number | undefined, rawTier: number): number | undefined {
  if (requestedTier === undefined || !Number.isFinite(requestedTier)) return undefined;
  const tier = Math.round(requestedTier);
  if (tier < MIN_RESOLUTION_TIER || tier > MAX_RESOLUTION_TIER) return undefined;
  if (Math.abs(tier - rawTier) > 1) return undefined;
  return tier;
}

/**
 * One precision decision for a whole request: tier (with hysteresis and the
 * caller's requested tier), the fixed base binning it implies, and the
 * exact-candidate budget. Both the UI and the service call this so a cache
 * hit means "same tier, same effective binSpan, same exact budget" — one
 * truth, not a UI-side re-check.
 */
export function planPixelPrecision(input: PixelPrecisionInput): PixelPrecisionPlan {
  const pxPerCycle = pixelsPerCycleFor(input);
  const rawTier = rawTierOf(pxPerCycle);
  const hysteresisTier = resolutionTierFor(pxPerCycle, input.previousTier);
  // A requested tier wins only when it stays within one step of the pixels
  // actually shown; the panel's recorded tier may lead during a gesture.
  const tier = validateRequestedTier(input.requestedTier, rawTier) ?? hysteresisTier;
  // The tier fixes the base resolution: 2^-tier cycles per bin, so columns
  // land 1–2 CSS px wide at this tier. No continuous px/cycle binning.
  const baseBinSpan = Math.pow(2, -tier);
  const tile = planTileGrid(input.bandBegin, input.bandEnd, pxPerCycle, { binSpan: baseBinSpan });
  return {
    resolutionTier: tier,
    effectiveBinSpan: tile.binSpan,
    binCount: tile.binCount,
    exactBudget: Math.max(0, Math.floor(
      (Number.isFinite(input.cssWidth) && input.cssWidth > 0 ? input.cssWidth : 0) * EXACT_COUNT_SCREEN_FACTOR,
    )),
    tile,
  };
}

export interface TrackTilePlan {
  bandBegin: number;
  bandEnd: number;
  binSpan: number;
  binCount: number;
  binsPerTile: number;
  tileCount: number;
  /** Cycles spanned by a full tile (the last one clips at the band end). */
  tileSpan: number;
}

/**
 * Cut the scene band into reusable tiles aligned to the density bin grid, so
 * adjacent tiles concatenate into one lane scene without re-binning. The bin
 * span follows the screen (about one CSS pixel per column), never the event
 * count. When `options.binSpan` carries a tier-fixed base span it is used
 * directly (then only coarsened by the bin-count guard); the default keeps
 * the continuous px/cycle span for callers that do not plan precision.
 */
export function planTileGrid(
  bandBegin: number,
  bandEnd: number,
  pxPerCycle: number,
  options?: { binSpan?: number },
): TrackTilePlan {
  const bandSpan = bandEnd - bandBegin;
  if (!Number.isFinite(bandSpan) || bandSpan <= 0) {
    return { bandBegin, bandEnd: bandBegin, binSpan: 0, binCount: 0, binsPerTile: 1, tileCount: 0, tileSpan: 0 };
  }
  let binSpan = Number.isFinite(options?.binSpan) && options!.binSpan! > 0
    ? options!.binSpan!
    : Number.isFinite(pxPerCycle) && pxPerCycle > 0 ? 1 / pxPerCycle : 0;
  if (!(binSpan > 0)) {
    return { bandBegin, bandEnd: bandBegin, binSpan: 0, binCount: 0, binsPerTile: 1, tileCount: 0, tileSpan: 0 };
  }
  binSpan = Math.max(binSpan, bandSpan / MAX_DENSITY_BINS);
  binSpan = Math.min(binSpan, bandSpan);
  const binCount = Math.max(1, Math.ceil((bandSpan - 1e-9) / binSpan));
  const binsPerTile = Math.max(1, Math.round(TILE_TARGET_CYCLES / binSpan));
  const tileSpan = binsPerTile * binSpan;
  return { bandBegin, bandEnd, binSpan, binCount, binsPerTile, tileCount: Math.ceil(binCount / binsPerTile), tileSpan };
}

/** The bin index holding `cycle`, clamped into the plan's bins. */
export function binIndexAt(plan: Pick<TrackTilePlan, 'bandBegin' | 'binSpan' | 'binCount'>, cycle: number): number {
  const index = Math.floor((cycle - plan.bandBegin) / plan.binSpan);
  return Math.min(Math.max(0, index), plan.binCount - 1);
}

// ── Streaming tile accumulators ──────────────────────────────────────────────

/** One display-domain event handed to an accumulator. */
export interface AccumulatedEvent {
  begin: number;
  end: number;
  pitch: number | null;
  soundId: number;
}

/** Interior state of one lane inside one tile. */
export interface TileLaneState {
  representation: 'exact' | 'density';
  exact: ExactTrackPrimitive[];
  density: TrackDensityScene;
  /** Valid raw haps owned by this tile's lane. */
  rawEventCount: number;
}

/**
 * Accumulates one lane inside one tile. Every accepted event feeds the
 * density columns immediately, so a later demotion loses nothing; wide-enough
 * events are additionally kept as exact candidates until the lane's screen
 * complexity budget is exceeded. All coordinates are display-domain.
 */
export class TrackLaneTileAccumulator {
  readonly trackId: string;
  readonly tileBegin: number;
  readonly tileEnd: number;
  private readonly binSpan: number;
  private readonly binCount: number;
  private readonly maxExactCount: number;
  private readonly pxPerCycle: number;
  private readonly exact: ExactTrackPrimitive[] = [];
  private readonly counts: Uint32Array;
  private readonly pitchMin: Int16Array;
  private readonly pitchMax: Int16Array;
  private readonly pitchedCounts: Uint16Array;
  private readonly unpitchedCounts: Uint16Array;
  private readonly peak: Uint16Array;
  private rawEventCount = 0;

  constructor(trackId: string, plan: TrackTilePlan, tileIndex: number, options: { maxExactCount: number; pxPerCycle: number }) {
    this.trackId = trackId;
    const firstBin = tileIndex * plan.binsPerTile;
    const binCount = Math.min(plan.binCount, firstBin + plan.binsPerTile) - firstBin;
    this.tileBegin = plan.bandBegin + firstBin * plan.binSpan;
    this.tileEnd = plan.bandBegin + (firstBin + binCount) * plan.binSpan;
    this.binSpan = plan.binSpan;
    this.binCount = binCount;
    this.maxExactCount = Math.max(0, Math.floor(options.maxExactCount));
    this.pxPerCycle = options.pxPerCycle;
    this.counts = new Uint32Array(binCount);
    this.pitchMin = new Int16Array(binCount).fill(0x7fff);
    this.pitchMax = new Int16Array(binCount).fill(-0x8000);
    this.pitchedCounts = new Uint16Array(binCount);
    this.unpitchedCounts = new Uint16Array(binCount);
    this.peak = new Uint16Array(binCount);
  }

  get isEmpty(): boolean { return this.rawEventCount === 0; }

  /** How many whole events the lane has kept as exact candidates. */
  get exactCandidateCount(): number { return this.exact.length; }

  /**
   * Record one valid hap. `ownsOnset` marks the one pass responsible for the
   * event's in-band onset: only that pass writes the concurrency counts and
   * may keep an exact primitive; coverage columns are written wherever the
   * event overlaps, so cross-tile sustains stay complete.
   */
  addEvent(event: AccumulatedEvent, options: { ownsOnset: boolean }): void {
    // Only the onset-owning pass counts the event: ownership is unique per
    // raw hap, so the accumulated count is the band's honest distinct total.
    if (options.ownsOnset) this.rawEventCount++;
    const begin = Math.max(event.begin, this.tileBegin);
    const end = Math.min(event.end, this.tileEnd);
    if (end <= begin) return;
    // Cover columns: every bin intersecting the event inside this tile.
    const firstBin = Math.min(this.binCount - 1, Math.floor((begin - this.tileBegin) / this.binSpan));
    const lastBin = Math.max(0, Math.min(this.binCount - 1, Math.floor((end - this.tileBegin - 1e-9) / this.binSpan)));
    for (let bin = firstBin; bin <= lastBin; bin++) {
      this.counts[bin] += 1;
      if (event.pitch === null) this.unpitchedCounts[bin] += 1;
      else {
        this.pitchedCounts[bin] += 1;
        if (event.pitch < this.pitchMin[bin]) this.pitchMin[bin] = event.pitch;
        if (event.pitch > this.pitchMax[bin]) this.pitchMax[bin] = event.pitch;
      }
    }
    // Concurrency sampled at column start cycles: bins whose start falls in
    // [event.begin, event.end), clipped to the tile.
    const peakFirst = Math.max(0, Math.ceil((event.begin - this.tileBegin) / this.binSpan - 1e-9));
    const peakLast = Math.min(this.binCount, Math.ceil((end - this.tileBegin) / this.binSpan - 1e-9));
    for (let bin = peakFirst; bin < peakLast; bin++) {
      if (this.peak[bin] < 0xffff) this.peak[bin] += 1;
    }
    // Exact retention: whole events only (onsets owned by this tile), wide
    // enough to resolve on screen, within the screen-complexity budget.
    if (!options.ownsOnset) return;
    if (this.exact.length >= this.maxExactCount) return;
    if ((event.end - event.begin) * this.pxPerCycle < MIN_EXACT_WIDTH_PX) return;
    this.exact.push({
      id: this.exact.length,
      begin: event.begin,
      end: event.end,
      pitch: event.pitch,
      soundId: event.soundId,
    });
  }

  /** Freeze the tile's lane: the columns are final, exact kept as-is. */
  finalize(): TileLaneState {
    return {
      representation: this.exact.length > 0 ? 'exact' : 'density',
      exact: this.exact,
      density: {
        binBegin: this.tileBegin,
        binSpan: this.binSpan,
        counts: this.counts,
        peakConcurrency: this.peak,
        pitchMin: this.pitchMin,
        pitchMax: this.pitchMax,
        pitchedCounts: this.pitchedCounts,
        unpitchedCounts: this.unpitchedCounts,
      },
      rawEventCount: this.rawEventCount,
    };
  }

  /** Drop the exact candidates; the columns already hold every event. */
  demote(): void {
    this.exact.length = 0;
  }
}

// ── Scene assembly ───────────────────────────────────────────────────────────

/** Whole-band lane data assembled from a track's tiles. */
export interface AssembledLane extends TrackLaneSceneData {
  /** The busiest column's event count, for statistics. */
  peakColumnCount: number;
}

/**
 * Merge one track's finished tiles into a single whole-band lane. Exact
 * candidates concatenate (onset ownership keeps them disjoint); density
 * columns concatenate (tiles share one bin grid). A lane demoted anywhere is
 * presented as density everywhere.
 */
export function assembleTrackLane(
  trackId: string,
  tiles: readonly (TileLaneState | null)[],
  retainExactDensityForLods = false,
): AssembledLane {
  const present = tiles.filter(state => state !== null);
  // Only a tile that owns events may veto the lane's exact form: empty tiles
  // and cover-only tiles (a sustain overlapping from a neighbour) never
  // demote a sparse lane whose other tiles hold exact notes.
  const veto = present.some(state => state.rawEventCount > 0 && state.representation !== 'exact');
  const allExact = present.length > 0 && !veto;
  const representation: 'exact' | 'density' = allExact ? 'exact' : 'density';
  const rawEventCount = present.reduce((sum, state) => sum + state.rawEventCount, 0);
  const exact: ExactTrackPrimitive[] = [];
  if (allExact) {
    let nextId = 0;
    for (const state of tiles) {
      for (const primitive of state?.exact ?? []) exact.push({ ...primitive, id: nextId++ });
    }
  }
  const binCount = present.reduce((sum, state) => sum + (state.density?.counts.length ?? 0), 0);
  const density: TrackDensityScene = {
    binBegin: present[0]?.density?.binBegin ?? 0,
    binSpan: present[0]?.density?.binSpan ?? 1,
    counts: new Uint32Array(binCount),
    peakConcurrency: new Uint16Array(binCount),
    pitchMin: new Int16Array(binCount).fill(0x7fff),
    pitchMax: new Int16Array(binCount).fill(-0x8000),
    pitchedCounts: new Uint16Array(binCount),
    unpitchedCounts: new Uint16Array(binCount),
  };
  let offset = 0;
  let peakColumnCount = 0;
  for (const state of tiles) {
    const source = state?.density;
    if (!source) continue;
    const size = source.counts.length;
    density.counts.set(source.counts, offset);
    density.peakConcurrency.set(source.peakConcurrency, offset);
    density.pitchMin.set(source.pitchMin, offset);
    density.pitchMax.set(source.pitchMax, offset);
    density.pitchedCounts.set(source.pitchedCounts, offset);
    density.unpitchedCounts.set(source.unpitchedCounts, offset);
    offset += size;
    for (let bin = 0; bin < size; bin++) {
      if (source.counts[bin] > peakColumnCount) peakColumnCount = source.counts[bin];
    }
  }
  const lane: AssembledLane = { trackId, representation, rawEventCount, peakColumnCount };
  if (representation === 'exact') lane.exact = exact;
  // Full-scene LOD generation can keep the complete density accumulator beside
  // exact candidates, since exact retention may omit events too small to draw.
  if (representation === 'density' || retainExactDensityForLods) lane.density = density;
  return lane;
}

function rebinLaneDensity(
  lane: TrackLaneSceneData,
  bandBegin: number,
  bandEnd: number,
  binSpan: number,
): TrackLaneSceneData {
  const binCount = Math.max(1, Math.ceil((bandEnd - bandBegin - 1e-9) / binSpan));
  const density: TrackDensityScene = {
    binBegin: bandBegin,
    binSpan,
    counts: new Uint32Array(binCount),
    peakConcurrency: new Uint16Array(binCount),
    pitchMin: new Int16Array(binCount).fill(0x7fff),
    pitchMax: new Int16Array(binCount).fill(-0x8000),
    pitchedCounts: new Uint16Array(binCount),
    unpitchedCounts: new Uint16Array(binCount),
  };
  const addEvent = (event: ExactTrackPrimitive): void => {
    const begin = Math.max(bandBegin, event.begin);
    const end = Math.min(bandEnd, event.end);
    if (end <= begin) return;
    const first = Math.max(0, Math.floor((begin - bandBegin) / binSpan));
    const last = Math.min(binCount - 1, Math.floor((end - bandBegin - 1e-9) / binSpan));
    for (let bin = first; bin <= last; bin++) {
      density.counts[bin] += 1;
      if (event.pitch === null) density.unpitchedCounts[bin] += 1;
      else {
        density.pitchedCounts[bin] += 1;
        density.pitchMin[bin] = Math.min(density.pitchMin[bin], event.pitch);
        density.pitchMax[bin] = Math.max(density.pitchMax[bin], event.pitch);
      }
    }
    const peakFirst = Math.max(0, Math.ceil((event.begin - bandBegin) / binSpan - 1e-9));
    const peakLast = Math.min(binCount, Math.ceil((end - bandBegin) / binSpan - 1e-9));
    for (let bin = peakFirst; bin < peakLast; bin++) {
      if (density.peakConcurrency[bin] < 0xffff) density.peakConcurrency[bin] += 1;
    }
  };
  if (lane.density) {
    const source = lane.density;
    for (let sourceBin = 0; sourceBin < source.counts.length; sourceBin++) {
      const count = source.counts[sourceBin];
      if (count <= 0) continue;
      const begin = source.binBegin + sourceBin * source.binSpan;
      const end = begin + source.binSpan;
      const first = Math.max(0, Math.floor((begin - bandBegin) / binSpan));
      const last = Math.min(binCount - 1, Math.floor((end - bandBegin - 1e-9) / binSpan));
      for (let bin = first; bin <= last; bin++) {
        density.counts[bin] += count;
        density.peakConcurrency[bin] = Math.min(0xffff, Math.max(
          density.peakConcurrency[bin],
          source.peakConcurrency[sourceBin],
        ));
        density.pitchedCounts[bin] += source.pitchedCounts[sourceBin];
        density.unpitchedCounts[bin] += source.unpitchedCounts[sourceBin];
        density.pitchMin[bin] = Math.min(density.pitchMin[bin], source.pitchMin[sourceBin]);
        density.pitchMax[bin] = Math.max(density.pitchMax[bin], source.pitchMax[sourceBin]);
      }
    }
  } else if (lane.representation === 'exact') {
    for (const primitive of lane.exact ?? []) addEvent(primitive);
  }
  return { trackId: lane.trackId, representation: 'density', density, rawEventCount: lane.rawEventCount };
}

/** Build coarser display-only density summaries from an already queried scene. */
export function buildTrackSceneLods(
  lanes: readonly TrackLaneSceneData[],
  bandBegin: number,
  bandEnd: number,
  baseBinSpan: number,
  sourceTiles?: readonly TrackSceneTile[],
): readonly TrackSceneLod[] {
  if (!(bandEnd > bandBegin) || !(baseBinSpan > 0)) return Object.freeze([]);
  const baseLanes = lanes.map(lane => {
    if (lane.representation !== 'exact' || !lane.density) return lane;
    return {
      trackId: lane.trackId,
      representation: lane.representation,
      exact: lane.exact,
      rawEventCount: lane.rawEventCount,
    };
  });
  const lods: TrackSceneLod[] = [{ level: 0, binSpan: baseBinSpan, lanes: Object.freeze(baseLanes) }];
  const densitySources = sourceTiles?.length
    ? lanes.map((lane, trackIndex) => lane.representation === 'exact'
      ? assembleTrackLane(
        lane.trackId,
        sourceTiles.map(tile => tile.lanes[trackIndex] ?? null),
        true,
      )
      : lane)
    : lanes;
  let binSpan = baseBinSpan * 2;
  let level = 1;
  while (Math.ceil((bandEnd - bandBegin - 1e-9) / binSpan) > 1 && level <= 16) {
    lods.push({
      level,
      binSpan,
      lanes: Object.freeze(densitySources.map(lane => rebinLaneDensity(lane, bandBegin, bandEnd, binSpan))),
    });
    binSpan *= 2;
    level += 1;
  }
  return Object.freeze(lods);
}

/** Assemble an immutable batch from per-track tile rows. */
export function assembleSceneBatch(options: {
  generation: number;
  loopOffset: number;
  bandBegin: number;
  bandEnd: number;
  viewportBegin: number;
  viewportEnd: number;
  resolutionTier: number;
  status: TrackSceneStatus;
  trackIds: readonly string[];
  /** tiles[trackIndex][tileIndex]; null = tile not finished (pending). */
  tiles: readonly (readonly (TileLaneState | null)[])[];
  rawEventCount?: number;
  sounds: readonly string[];
  coverageEnd?: number;
  /** Metadata the cache identity rides on; progress and complete both carry it. */
  effectiveBinSpan?: number;
  exactBudget?: number;
  sceneTiles?: readonly TrackSceneTile[];
  completedTiles?: ReadonlySet<number>;
  pendingRanges?: readonly (readonly [number, number])[];
}): TrackSceneBatch {
  const lanes = options.trackIds.map((trackId, index) => assembleTrackLane(trackId, options.tiles[index] ?? []));
  const kinds = new Set(lanes.map(lane => lane.representation));
  const representation: TrackSceneRepresentation = kinds.size > 1 ? 'mixed' : kinds.values().next().value ?? 'exact';
  // The batch's raw total is the lanes' own sum: onset ownership counts each
  // distinct raw hap exactly once.
  const rawEventCount = options.rawEventCount ?? lanes.reduce((sum, lane) => sum + lane.rawEventCount, 0);
  return {
    generation: options.generation,
    loopOffset: options.loopOffset,
    begin: options.bandBegin,
    end: options.bandEnd,
    viewportBegin: options.viewportBegin,
    viewportEnd: options.viewportEnd,
    representation,
    status: options.status,
    lanes,
    rawEventCount,
    resolutionTier: options.resolutionTier,
    effectiveBinSpan: options.effectiveBinSpan,
    exactBudget: options.exactBudget,
    sounds: options.sounds,
    coverageEnd: options.coverageEnd,
    sceneTiles: options.sceneTiles,
    completedTiles: options.completedTiles,
    pendingRanges: options.pendingRanges,
  };
}

/**
 * Build immutable tile metadata from the mutable rows used by the cooperative
 * query. The row arrays are copied at the publication boundary so a later
 * chunk cannot mutate a React-visible progress snapshot.
 */
export function sceneTilesFromRows(options: {
  plan: TrackTilePlan;
  rows: readonly (readonly (TileLaneState | null)[])[];
  completedTiles: ReadonlySet<number>;
  rawCounts?: ReadonlyMap<number, number>;
  guardedTiles?: ReadonlySet<number>;
}): readonly TrackSceneTile[] {
  const tiles: TrackSceneTile[] = [];
  for (let index = 0; index < options.plan.tileCount; index++) {
    const lanes = options.rows.map(row => row[index] ?? null);
    const completed = options.completedTiles.has(index);
    const guarded = options.guardedTiles?.has(index) ?? false;
    const begin = options.plan.bandBegin + index * options.plan.tileSpan;
    const end = Math.min(options.plan.bandEnd, begin + options.plan.tileSpan);
    tiles.push({
      index,
      begin,
      end,
      binSpan: options.plan.binSpan,
      binCount: Math.max(
        0,
        Math.min(options.plan.binCount, (index + 1) * options.plan.binsPerTile)
          - index * options.plan.binsPerTile,
      ),
      status: completed ? 'complete' : guarded ? 'guarded' : 'pending',
      lanes: Object.freeze(lanes.slice()),
      rawEventCount: options.rawCounts?.get(index) ?? lanes.reduce((sum, lane) => sum + (lane?.rawEventCount ?? 0), 0),
    });
  }
  return Object.freeze(tiles);
}

export function pendingRangesFromTiles(tiles: readonly TrackSceneTile[]): readonly (readonly [number, number])[] {
  const ranges: Array<readonly [number, number]> = [];
  for (const tile of tiles) {
    if (tile.status === 'complete') continue;
    const previous = ranges.at(-1);
    if (previous && Math.abs(previous[1] - tile.begin) < 1e-9) {
      ranges[ranges.length - 1] = [previous[0], tile.end];
    } else {
      ranges.push([tile.begin, tile.end]);
    }
  }
  return Object.freeze(ranges);
}

function emptyTileLane(tile: TrackSceneTile): TileLaneState {
  const count = Math.max(0, tile.binCount);
  return {
    representation: 'density',
    exact: [],
    density: {
      binBegin: tile.begin,
      binSpan: tile.binSpan,
      counts: new Uint32Array(count),
      peakConcurrency: new Uint16Array(count),
      pitchMin: new Int16Array(count).fill(0x7fff),
      pitchMax: new Int16Array(count).fill(-0x8000),
      pitchedCounts: new Uint16Array(count),
      unpitchedCounts: new Uint16Array(count),
    },
    rawEventCount: 0,
  };
}

/**
 * Convert a full-scene snapshot to the existing canvas batch shape. Pending
 * tiles contribute zero-width data placeholders so completed density columns
 * retain their absolute offsets; the pending ranges are drawn separately.
 */
export function assembleFullSceneBatch(
  snapshot: TrackFullSceneSnapshot,
  trackIds: readonly string[],
  viewportBegin: number,
  viewportEnd: number,
  cssWidth = 400,
): TrackSceneBatch {
  const rows = trackIds.map((_, trackIndex) => snapshot.tiles.map(tile =>
    tile.lanes[trackIndex] ?? emptyTileLane(tile)));
  const status: TrackSceneStatus = snapshot.status === 'complete'
    ? 'complete'
    : snapshot.status === 'failed'
      ? 'failed'
      : snapshot.status === 'resource-guarded'
        ? 'resource-guarded'
        : 'progress';
  const base = assembleSceneBatch({
    generation: snapshot.identity.previewGeneration,
    loopOffset: snapshot.identity.loopOffset,
    bandBegin: snapshot.begin,
    bandEnd: snapshot.end,
    viewportBegin,
    viewportEnd,
    resolutionTier: snapshot.resolutionTier,
    status,
    trackIds,
    tiles: rows,
    sounds: snapshot.sounds,
    effectiveBinSpan: snapshot.effectiveBinSpan,
    exactBudget: snapshot.exactBudget,
    sceneTiles: snapshot.tiles,
    completedTiles: snapshot.completedTiles,
    pendingRanges: pendingRangesFromTiles(snapshot.tiles),
  });
  const viewportSpan = viewportEnd - viewportBegin;
  const targetBinSpan = viewportSpan > 0 && cssWidth > 0 ? viewportSpan / cssWidth : snapshot.effectiveBinSpan;
  const selectedLod = snapshot.lods.length > 0
    ? snapshot.lods.reduce((best, candidate) =>
      Math.abs(Math.log2(candidate.binSpan / targetBinSpan))
        < Math.abs(Math.log2(best.binSpan / targetBinSpan)) ? candidate : best)
    : null;
  if (!selectedLod) return base;

  // Coarser LODs summarize every lane as density. Preserve exact notes for a
  // sparse lane when its complete exact data remains readable at this zoom;
  // this lets the existing sounding overlay highlight the whole note. Dense,
  // incomplete, or sub-pixel lanes keep the selected density representation.
  const pxPerCycle = viewportSpan > 0 && cssWidth > 0 ? cssWidth / viewportSpan : 0;
  const exactScreenBudget = Math.min(snapshot.exactBudget, Math.floor(cssWidth * EXACT_COUNT_SCREEN_FACTOR));
  const baseLanes = new Map((snapshot.lods[0]?.lanes ?? []).map(lane => [lane.trackId, lane]));
  const lanes = selectedLod.level === 0 ? selectedLod.lanes : selectedLod.lanes.map(lane => {
    const exactLane = baseLanes.get(lane.trackId);
    const exact = exactLane?.exact;
    if (exactLane?.representation !== 'exact'
      || !exact
      || exact.length !== exactLane.rawEventCount
      || exact.length > exactScreenBudget
      || exact.some(note => (note.end - note.begin) * pxPerCycle < MIN_NOTE_DRAW_WIDTH_PX)) {
      return lane;
    }
    return exactLane;
  });
  const kinds = new Set(lanes.map(lane => lane.representation));
  const representation: TrackSceneRepresentation = kinds.size > 1 ? 'mixed' : kinds.values().next().value ?? 'exact';
  return { ...base, lanes, representation };
}

// ── Byte estimation ──────────────────────────────────────────────────────────

/** Conservative: exact primitives and density columns count in full. */
export const EXACT_PRIMITIVE_BYTES = 40;
export const DENSITY_COLUMN_BYTES = 14; // u32 + 5 × u16

export function estimateTileLaneBytes(state: TileLaneState): number {
  const bins = state.density?.counts.length ?? 0;
  return state.exact.length * EXACT_PRIMITIVE_BYTES + bins * DENSITY_COLUMN_BYTES;
}

export function estimateAssembledLaneBytes(lane: TrackLaneSceneData): number {
  const bins = lane.density?.counts.length ?? 0;
  return (lane.exact?.length ?? 0) * EXACT_PRIMITIVE_BYTES + bins * DENSITY_COLUMN_BYTES;
}

export function estimateSceneBatchBytes(batch: TrackSceneBatch): number {
  return batch.lanes.reduce((sum, lane) => sum + estimateAssembledLaneBytes(lane), 0);
}

// ── Sounding highlight indexes ───────────────────────────────────────────────

/** Numeric sounding index over one exact lane, sorted by begin. */
export interface TrackHighlightIndex {
  begins: Float64Array;
  ends: Float64Array;
  ids: Uint32Array;
}

export function buildHighlightIndex(primitives: readonly ExactTrackPrimitive[]): TrackHighlightIndex | null {
  if (primitives.length === 0) return null;
  const order = primitives.map((_, index) => index).sort((a, b) =>
    primitives[a].begin - primitives[b].begin || primitives[a].end - primitives[b].end);
  const count = order.length;
  const begins = new Float64Array(count);
  const ends = new Float64Array(count);
  const ids = new Uint32Array(count);
  for (let out = 0; out < count; out++) {
    const source = primitives[order[out]];
    begins[out] = source.begin;
    ends[out] = source.end;
    ids[out] = source.id;
  }
  return { begins, ends, ids };
}

/**
 * Incremental sounding tracker over one exact lane. Steady forward playback
 * only touches primitives that started or ended since the last sample; a
 * seek or a backward position rebuilds the active set by binary search.
 */
export class TrackHighlightCursor {
  private readonly index: TrackHighlightIndex;
  private readonly active = new Set<number>();
  private enterCursor = 0;

  constructor(primitives: readonly ExactTrackPrimitive[]) {
    const built = buildHighlightIndex(primitives);
    // An empty lane never reaches a tracker: the panel skips it first. The
    // guard keeps the type honest without a nullable index field.
    this.index = built ?? { begins: new Float64Array(0), ends: new Float64Array(0), ids: new Uint32Array(0) };
  }

  /** Rebuild the active set for an arbitrary (possibly jumped) position. */
  reset(now: number): number[] {
    const { begins, ends } = this.index;
    let low = 0;
    let high = begins.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (begins[middle] <= now) low = middle + 1;
      else high = middle;
    }
    this.enterCursor = low;
    this.active.clear();
    for (let position = 0; position < low; position++) {
      if (ends[position] > now) this.active.add(position);
    }
    return this.ids();
  }

  /** Slide the sample position forward and return the sounding ids. */
  advance(now: number): number[] {
    const { begins, ends } = this.index;
    for (const position of this.active) {
      if (ends[position] <= now) this.active.delete(position);
    }
    while (this.enterCursor < begins.length && begins[this.enterCursor] <= now) {
      if (ends[this.enterCursor] > now) this.active.add(this.enterCursor);
      this.enterCursor++;
    }
    return this.ids();
  }

  private ids(): number[] {
    const source = this.index.ids;
    return [...this.active].map(position => source[position]);
  }
}

/** The column a playhead position highlights in a density lane. */
export function densityColumnAt(density: TrackDensityScene, now: number): number {
  const index = Math.floor((now - density.binBegin) / density.binSpan);
  return Math.min(Math.max(0, index), density.counts.length - 1);
}
