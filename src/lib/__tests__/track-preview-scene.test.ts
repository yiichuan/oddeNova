import { describe, expect, it } from 'vitest';
import {
  assembleSceneBatch,
  assembleTrackLane,
  buildTrackSceneLods,
  binIndexAt,
  buildHighlightIndex,
  DENSITY_COLUMN_BYTES,
  estimateAssembledLaneBytes,
  estimateSceneBatchBytes,
  estimateTileLaneBytes,
  EXACT_COUNT_SCREEN_FACTOR,
  EXACT_PRIMITIVE_BYTES,
  MAX_DENSITY_BINS,
  MIN_EXACT_WIDTH_PX,
  planTileGrid,
  planPixelPrecision,
  resolutionTierFor,
  TrackHighlightCursor,
  TrackLaneTileAccumulator,
  pixelsPerCycleFor,
  pendingRangesFromTiles,
  sameTrackFullSceneIdentity,
  trackFullSceneIdentityKey,
  type TrackSceneTile,
  type AccumulatedEvent,
} from '../track-preview-scene';

describe('full-scene identity and pending geometry', () => {
  it('ignores viewport details while distinguishing pass, loop and tempo', () => {
    const identity = { previewGeneration: 2, loopOffset: 8, loopCycles: 16, cps: 0.5 } as const;
    expect(trackFullSceneIdentityKey(identity)).toBe('2|8.000000000|16.000000000|0.500000000');
    expect(sameTrackFullSceneIdentity(identity, { ...identity })).toBe(true);
    expect(sameTrackFullSceneIdentity(identity, { ...identity, loopOffset: 16 })).toBe(false);
    expect(sameTrackFullSceneIdentity(identity, { ...identity, cps: 0.25 })).toBe(false);
  });

  it('merges only adjacent pending tiles and leaves a completed middle tile visible', () => {
    const tiles: TrackSceneTile[] = [
      { index: 0, begin: 0, end: 1, binSpan: 0.25, binCount: 4, status: 'pending', lanes: [], rawEventCount: 0 },
      { index: 1, begin: 1, end: 2, binSpan: 0.25, binCount: 4, status: 'complete', lanes: [], rawEventCount: 1 },
      { index: 2, begin: 2, end: 3, binSpan: 0.25, binCount: 4, status: 'pending', lanes: [], rawEventCount: 0 },
      { index: 3, begin: 3, end: 4, binSpan: 0.25, binCount: 4, status: 'pending', lanes: [], rawEventCount: 0 },
    ];
    expect(pendingRangesFromTiles(tiles)).toEqual([[0, 1], [2, 4]]);
  });
});

describe('resolution tiers', () => {
  it('derives a monotone 2-power tier from pixels per cycle', () => {
    expect(resolutionTierFor(100)).toBe(6);
    expect(resolutionTierFor(128)).toBe(7);
    expect(resolutionTierFor(4000)).toBe(11);
    expect(resolutionTierFor(0.5)).toBe(-1);
    expect(resolutionTierFor(0)).toBe(-16);
  });

  it('holds the tier across small resizes and moves on real changes', () => {
    const tier = resolutionTierFor(100);
    // A 10% resize keeps the same tier.
    expect(resolutionTierFor(90, tier)).toBe(tier);
    expect(resolutionTierFor(110, tier)).toBe(tier);
    // Crossing well past the boundary moves to the neighbouring tier.
    expect(resolutionTierFor(200, tier)).toBe(7);
    expect(resolutionTierFor(40, tier)).toBe(5);
    // Hysteresis holds through repeated small nudges.
    let held = tier;
    for (let index = 0; index < 5; index++) held = resolutionTierFor(100 + index * 8, held);
    expect(held).toBe(tier);
  });

  it('computes pixels per cycle from the visible viewport', () => {
    expect(pixelsPerCycleFor({ cssWidth: 400, viewportBegin: 0, viewportEnd: 16 })).toBe(25);
    expect(pixelsPerCycleFor({ cssWidth: 400, viewportBegin: 0, viewportEnd: 0 })).toBe(0);
  });
});

describe('tile grid planning', () => {
  it('snaps tiles onto the bin grid at about one cycle', () => {
    const grid = planTileGrid(0, 16, 25);
    expect(grid.binSpan).toBeCloseTo(0.04, 9);
    expect(grid.binCount).toBe(400);
    expect(grid.binsPerTile).toBe(25);
    expect(grid.tileSpan).toBeCloseTo(1, 9);
    expect(grid.tileCount).toBe(16);
    expect(binIndexAt(grid, 0)).toBe(0);
    expect(binIndexAt(grid, 15.99)).toBe(399);
  });

  it('widens columns instead of exceeding the bin cap', () => {
    const grid = planTileGrid(0, 40000, 1);
    expect(grid.binCount).toBeLessThanOrEqual(MAX_DENSITY_BINS);
    expect(grid.binSpan).toBeCloseTo(40000 / MAX_DENSITY_BINS, 6);
  });

  it('degrades to one bin for an unusable band', () => {
    expect(planTileGrid(0, 0, 25).tileCount).toBe(0);
    expect(planTileGrid(0, 16, 0).tileCount).toBe(0);
  });

  it('accepts a tier-fixed base bin span, still guarded by the bin cap', () => {
    // Tier 5 → base binSpan 2^-5 = 1/32, so one tile spans one cycle.
    const grid = planTileGrid(0, 16, 25, { binSpan: Math.pow(2, -5) });
    expect(grid.binSpan).toBeCloseTo(1 / 32, 9);
    expect(grid.binCount).toBe(512);
    expect(grid.tileCount).toBe(16);
    // A tier-fixed span coarsened by the cap stays at the cap, not finer.
    const wide = planTileGrid(0, 40000, 1, { binSpan: 1 / 128 });
    expect(wide.binCount).toBeLessThanOrEqual(MAX_DENSITY_BINS);
    expect(wide.binSpan).toBeCloseTo(40000 / MAX_DENSITY_BINS, 6);
  });
});

describe('pixel precision planning', () => {
  const precision = (over: Partial<Parameters<typeof planPixelPrecision>[0]> = {}) => planPixelPrecision({
    cssWidth: 1800,
    viewportBegin: 4,
    viewportEnd: 8,
    bandBegin: 0,
    bandEnd: 12,
    ...over,
  });

  it('keeps one identity for tier, effective binSpan and tile plan', () => {
    const plan = precision({});
    // pxPerCycle = 1800/4 = 450 → raw tier floor(log2 450) = 8.
    expect(plan.resolutionTier).toBe(8);
    expect(plan.effectiveBinSpan).toBeCloseTo(Math.pow(2, -8), 12);
    expect(plan.tile.binSpan).toBe(plan.effectiveBinSpan);
    // 25 px/bin at 450 px/cycle: columns land 1–2 CSS px wide.
    expect(plan.effectiveBinSpan * 450).toBeGreaterThanOrEqual(1);
    expect(plan.effectiveBinSpan * 450).toBeLessThan(2);
    expect(plan.exactBudget).toBe(1800 * EXACT_COUNT_SCREEN_FACTOR);
  });

  it('honours a validated requested tier within one step of the pixels', () => {
    // Fast gesture: the recorded target tier may lead by one step.
    expect(precision({ requestedTier: 9 }).resolutionTier).toBe(9);
    expect(precision({ requestedTier: 7 }).resolutionTier).toBe(7);
    // A stale render's tier cannot jump far from what the pixels say.
    expect(precision({ requestedTier: 3 }).resolutionTier).toBe(8);
    expect(precision({ requestedTier: Number.NaN }).resolutionTier).toBe(8);
    expect(precision({ requestedTier: 99 }).resolutionTier).toBe(8);
  });

  it('keeps the 25% hysteresis and the previous tier when asked', () => {
    const plan = precision({ previousTier: 8 });
    expect(plan.resolutionTier).toBe(8);
    void plan;
  });

  it('coarsens the effective span for long bands and reports the real binCount', () => {
    // A 40-cycle band at tier 8 would need 10240 bins; the cap coarsens.
    const plan = precision({ bandBegin: 0, bandEnd: 40, requestedTier: 8 });
    expect(plan.binCount).toBeLessThanOrEqual(MAX_DENSITY_BINS);
    expect(plan.effectiveBinSpan).toBeCloseTo(40 / MAX_DENSITY_BINS, 9);
    expect(plan.resolutionTier).toBe(8);
  });
});

describe('density tile accumulators', () => {
  it('keeps every event counted across tiles', () => {
    const grid = planTileGrid(0, 16, 25);
    const tiles: TrackLaneTileAccumulator[] = [];
    for (let tile = 0; tile < grid.tileCount; tile++) {
      tiles.push(new TrackLaneTileAccumulator('x', grid, tile, { maxExactCount: 1600, pxPerCycle: 25 }));
    }
    const total = 10000;
    for (let index = 0; index < total; index++) {
      const onset = (index % 16) + (index % 25) / 100;
      const tileIndex = Math.min(grid.tileCount - 1, Math.floor(onset / grid.tileSpan));
      const event: AccumulatedEvent = { begin: onset, end: onset + 0.5, pitch: 48 + (index % 12), soundId: 0 };
      tiles[tileIndex].addEvent(event, { ownsOnset: true });
      // A neighbour tile's overlapping pass still contributes its columns.
      if (tileIndex + 1 < tiles.length) tiles[tileIndex + 1].addEvent(event, { ownsOnset: false });
    }
    const raw = tiles.reduce((sum, tile) => sum + tile.finalize().rawEventCount, 0);
    expect(raw).toBe(total);
  });

  it('keeps only wide-enough events exact and demotes the lane on a thin one', () => {
    const grid = planTileGrid(0, 1, 25);
    const accumulator = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 1600, pxPerCycle: 25 });
    accumulator.addEvent({ begin: 0.1, end: 1.9, pitch: null, soundId: 0 }, { ownsOnset: true });
    expect(accumulator.exactCandidateCount).toBe(1);
    // A 0.02-cycle note is 0.5 px at 25 px/cycle — below the floor, so it
    // never becomes an exact candidate (but it stays in the columns).
    accumulator.addEvent({ begin: 0.2, end: 0.22, pitch: null, soundId: 1 }, { ownsOnset: true });
    expect(accumulator.exactCandidateCount).toBe(1);
    accumulator.demote();
    expect(accumulator.exactCandidateCount).toBe(0);
    const state = accumulator.finalize();
    expect(state.representation).toBe('density');
    expect([...state.density.counts].reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    expect(MIN_EXACT_WIDTH_PX).toBe(0.75);
  });

  it('honours the screen complexity budget for exact candidates', () => {
    const grid = planTileGrid(0, 1, 25);
    const events: AccumulatedEvent[] = Array.from({ length: 5 }, (_, index) => ({
      begin: 0.1 + index * 0.2, end: 0.2 + index * 0.2, pitch: null, soundId: 0,
    }));
    for (const maxExactCount of [100, 3]) {
      const accumulator = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount, pxPerCycle: 25 });
      for (const event of events) accumulator.addEvent(event, { ownsOnset: true });
      expect(accumulator.exactCandidateCount).toBe(Math.min(5, maxExactCount));
    }
    expect(EXACT_COUNT_SCREEN_FACTOR).toBe(4);
  });

  it('counts concurrency only where an event sounds at a column start', () => {
    const grid = planTileGrid(0, 1, 25);
    const accumulator = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 1600, pxPerCycle: 25 });
    accumulator.addEvent({ begin: 0, end: 0.5, pitch: null, soundId: 0 }, { ownsOnset: true });
    accumulator.addEvent({ begin: 0.04, end: 0.08, pitch: null, soundId: 0 }, { ownsOnset: true });
    const state = accumulator.finalize();
    // Column 0 starts at 0: only the first event sounds there (the second
    // starts exactly at column 1's start).
    expect(state.density.peakConcurrency[0]).toBe(1);
    // Column 1 starts at 0.04: both events sound.
    expect(state.density.peakConcurrency[1]).toBe(2);
    // The first column starting at or after the short event's end counts one.
    const later = Math.ceil(0.08 / grid.binSpan - 1e-9);
    expect(state.density.peakConcurrency[later]).toBe(1);
  });

  it('tracks pitch ranges and pitched/unpitched counts per column', () => {
    const grid = planTileGrid(0, 1, 25);
    const accumulator = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 1600, pxPerCycle: 25 });
    accumulator.addEvent({ begin: 0, end: 0.5, pitch: 40, soundId: 0 }, { ownsOnset: true });
    accumulator.addEvent({ begin: 0.04, end: 0.5, pitch: 80, soundId: 0 }, { ownsOnset: true });
    accumulator.addEvent({ begin: 0.04, end: 0.5, pitch: null, soundId: 1 }, { ownsOnset: true });
    const state = accumulator.finalize();
    expect(state.density.pitchMin[0]).toBe(40);
    expect(state.density.pitchMax[0]).toBe(40);
    expect(state.density.pitchMin[1]).toBe(40);
    expect(state.density.pitchMax[1]).toBe(80);
    expect(state.density.pitchedCounts[1]).toBe(2);
    expect(state.density.unpitchedCounts[1]).toBe(1);
  });
});

describe('scene assembly', () => {
  it('builds coarser density summaries from the same full-scene data', () => {
    const lanes = [{
      trackId: 'x',
      representation: 'exact' as const,
      exact: [
        { id: 0, begin: 0.1, end: 0.2, pitch: 60, soundId: 0 },
        { id: 1, begin: 1.1, end: 1.8, pitch: 64, soundId: 0 },
      ],
      rawEventCount: 2,
    }];
    const lods = buildTrackSceneLods(lanes, 0, 4, 0.25);
    expect(lods.length).toBeGreaterThan(1);
    expect(lods[0].lanes[0].representation).toBe('exact');
    expect(lods[1].lanes[0].representation).toBe('density');
    expect([...lods[1].lanes[0].density!.counts].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  });

  it('concatenates tile columns and exact candidates with fresh ids', () => {
    const grid = planTileGrid(0, 2, 25);
    const first = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 100, pxPerCycle: 25 });
    const second = new TrackLaneTileAccumulator('x', grid, 1, { maxExactCount: 100, pxPerCycle: 25 });
    first.addEvent({ begin: 0, end: 0.5, pitch: 60, soundId: 0 }, { ownsOnset: true });
    second.addEvent({ begin: 1, end: 1.5, pitch: 70, soundId: 1 }, { ownsOnset: true });
    const lane = assembleTrackLane('x', [first.finalize(), second.finalize()]);
    expect(lane.representation).toBe('exact');
    expect(lane.exact).toHaveLength(2);
    expect(lane.exact![0]).toMatchObject({ id: 0, begin: 0, end: 0.5, pitch: 60 });
    expect(lane.exact![1]).toMatchObject({ id: 1, begin: 1, end: 1.5, pitch: 70 });
    expect(lane.peakColumnCount).toBeGreaterThan(0);
  });

  it('presents a lane demoted anywhere as density everywhere', () => {
    const grid = planTileGrid(0, 2, 25);
    const first = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 100, pxPerCycle: 25 });
    const second = new TrackLaneTileAccumulator('x', grid, 1, { maxExactCount: 100, pxPerCycle: 25 });
    first.addEvent({ begin: 0, end: 0.5, pitch: 60, soundId: 0 }, { ownsOnset: true });
    // The second tile only receives an ultra-thin event: the lane demotes.
    second.addEvent({ begin: 1, end: 1.0001, pitch: null, soundId: 0 }, { ownsOnset: true });
    const lane = assembleTrackLane('x', [first.finalize(), second.finalize()]);
    expect(lane.representation).toBe('density');
    expect(lane.exact).toBeUndefined();
    expect(lane.rawEventCount).toBe(2);
  });

  it('ignores empty and cover-only tiles when a sparse lane stays exact', () => {
    const grid = planTileGrid(0, 3, 25);
    const first = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 100, pxPerCycle: 25 });
    first.addEvent({ begin: 0, end: 1.5, pitch: 60, soundId: 0 }, { ownsOnset: true });
    // Tile 1 only receives the sustain's overlapping cover — no owned event.
    const second = new TrackLaneTileAccumulator('x', grid, 1, { maxExactCount: 100, pxPerCycle: 25 });
    second.addEvent({ begin: 0, end: 1.5, pitch: 60, soundId: 0 }, { ownsOnset: false });
    const third = new TrackLaneTileAccumulator('x', grid, 2, { maxExactCount: 100, pxPerCycle: 25 });
    const lane = assembleTrackLane('x', [first.finalize(), second.finalize(), third.finalize()]);
    expect(lane.representation).toBe('exact');
    expect(lane.exact).toHaveLength(1);
    // An exact lane carries no density arrays for drawing.
    expect(lane.density).toBeUndefined();
  });

  it('marks a batch mixed when lanes differ and keeps the coverage marker for progress', () => {
    const batch = assembleSceneBatch({
      generation: 1,
      loopOffset: 0,
      bandBegin: 0,
      bandEnd: 2,
      viewportBegin: 0,
      viewportEnd: 2,
      resolutionTier: 7,
      status: 'progress',
      trackIds: ['a', 'b'],
      tiles: [[], []],
      sounds: ['bd'],
      coverageEnd: 1,
    });
    // Empty lanes aggregate: an absence of data is not an exact picture.
    expect(batch.representation).toBe('density');
    expect(batch.status).toBe('progress');
    expect(batch.coverageEnd).toBe(1);
    expect(batch.rawEventCount).toBe(0);
    expect(batch.lanes).toHaveLength(2);
  });

  it('aggregates 50k and 100k synthetic events without losing any range', () => {
    for (const total of [50000, 100000]) {
      const grid = planTileGrid(0, 50, 8);
      const tiles: TrackLaneTileAccumulator[] = [];
      for (let tile = 0; tile < grid.tileCount; tile++) {
        tiles.push(new TrackLaneTileAccumulator('x', grid, tile, { maxExactCount: 0, pxPerCycle: 25 }));
      }
      for (let index = 0; index < total; index++) {
        const onset = (index % 50) + (index % 97) / 100;
        const tileIndex = Math.min(grid.tileCount - 1, Math.floor(onset / grid.tileSpan));
        tiles[tileIndex].addEvent({ begin: onset, end: onset + 0.01, pitch: null, soundId: 0 }, { ownsOnset: true });
      }
      const states = tiles.map(tile => tile.finalize());
      const raw = states.reduce((sum, tile) => sum + tile.rawEventCount, 0);
      expect(raw).toBe(total);
      const assembled = assembleTrackLane('x', states);
      expect(assembled.rawEventCount).toBe(total);
      // Head, middle and tail columns all carry data — no missing prefix.
      const counts = assembled.density!.counts;
      expect(counts[0]).toBeGreaterThan(0);
      expect(counts[Math.floor(counts.length / 2)]).toBeGreaterThan(0);
      expect(counts[counts.length - 1]).toBeGreaterThan(0);
    }
    expect(MAX_DENSITY_BINS).toBe(4096);
    expect(DENSITY_COLUMN_BYTES).toBe(14);
  });
});

// ── Byte estimation ──────────────────────────────────────────────────────────

describe('byte estimation', () => {
  it('estimates tile and assembled lanes from their own data', () => {
    const grid = planTileGrid(0, 1, 25);
    const accumulator = new TrackLaneTileAccumulator('x', grid, 0, { maxExactCount: 100, pxPerCycle: 25 });
    accumulator.addEvent({ begin: 0, end: 0.5, pitch: 60, soundId: 0 }, { ownsOnset: true });
    accumulator.addEvent({ begin: 0.5, end: 1, pitch: 62, soundId: 0 }, { ownsOnset: true });
    const state = accumulator.finalize();
    const expected = 2 * EXACT_PRIMITIVE_BYTES + state.density.counts.length * DENSITY_COLUMN_BYTES;
    expect(estimateTileLaneBytes(state)).toBe(expected);
    const batch = assembleSceneBatch({
      generation: 1, loopOffset: 0, bandBegin: 0, bandEnd: 1,
      viewportBegin: 0, viewportEnd: 1, resolutionTier: 8, status: 'complete',
      trackIds: ['x'], tiles: [[state]], sounds: ['bd'],
    });
    expect(estimateSceneBatchBytes(batch)).toBe(estimateAssembledLaneBytes(batch.lanes[0]));
    expect(estimateSceneBatchBytes(batch)).toBeGreaterThan(0);
  });
});

// ── Highlight indexes ────────────────────────────────────────────────────────

describe('highlight indexes', () => {
  const primitives = [
    { id: 7, begin: 2, end: 3, pitch: null, soundId: 0 },
    { id: 3, begin: 0.5, end: 1.5, pitch: null, soundId: 0 },
    { id: 9, begin: 2.5, end: 4, pitch: null, soundId: 0 },
  ];

  it('builds a begin-sorted numeric index', () => {
    const index = buildHighlightIndex(primitives)!;
    expect([...index.ids]).toEqual([3, 7, 9]);
    expect([...index.begins]).toEqual([0.5, 2, 2.5]);
    expect([...index.ends]).toEqual([1.5, 3, 4]);
    expect(buildHighlightIndex([])).toBeNull();
  });

  it('rebuilds the active set on reset and advances incrementally while playing forward', () => {
    const cursor = new TrackHighlightCursor(primitives);
    expect(cursor.reset(0.6)).toEqual([3]);
    expect(cursor.advance(1.4)).toEqual([3]);
    expect(cursor.advance(1.6)).toEqual([]);
    expect(cursor.advance(2.6)).toEqual([7, 9]);
    expect(cursor.advance(4.1)).toEqual([]);
    // A jump backwards rebuilds instead of leaking expired events.
    expect(cursor.reset(2.6)).toEqual([7, 9]);
    expect(cursor.advance(3.2)).toEqual([9]);
    expect(cursor.reset(1)).toEqual([3]);
  });
});
