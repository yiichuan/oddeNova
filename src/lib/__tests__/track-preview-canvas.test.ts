import { describe, expect, it } from 'vitest';
import {
  cycleToX,
  densityColumnWidth,
  exactNoteGeometry,
  executeLaneDrawCommands,
  laneProjection,
  NOTE_DIMMED_OPACITY,
  NOTE_HEIGHT_PX,
  NOTE_MIN_WIDTH_PX,
  NOTE_RADIUS_PX,
  NOTE_SEP_WIDTH_PX,
  normalizeDevicePixelRatio,
  pitchCentreY,
  planLaneBase,
  planLaneOverlay,
  planRasterBlocks,
  RASTER_BLEED_PHYSICAL_PX,
  RASTER_MAX_BACKING_AXIS,
  RASTER_MAX_BLOCK_CSS_PX,
  rasterBlockAxisPhysical,
  unpitchedCentreY,
  type LaneColors,
  type LaneDrawCommand,
  type RasterPlanInput,
} from '../track-preview-canvas';
import type { TrackLaneSceneData } from '../track-preview-scene';

const COLORS: LaneColors = {
  color: '#66B2C0',
  colorStrong: '#86CBD8',
  grid: '#232329',
  gridMinor: '#191921',
  pending: '#191921',
  sep: '#0A0A0C',
};

const densityLane = (counts: number[], options: { pitchMin?: number; pitchMax?: number; unpitched?: number } = {}): TrackLaneSceneData => {
  const size = counts.length;
  const pitched = options.pitchMin !== undefined || options.pitchMax !== undefined;
  return {
    trackId: 'x',
    representation: 'density',
    density: {
      binBegin: 0, binSpan: 0.04,
      counts: Uint32Array.from(counts),
      peakConcurrency: new Uint16Array(size),
      pitchMin: new Int16Array(size).fill(options.pitchMin ?? (pitched ? 60 : 0x7fff)),
      pitchMax: new Int16Array(size).fill(options.pitchMax ?? (pitched ? 60 : -0x8000)),
      pitchedCounts: new Uint16Array(size).fill(pitched ? 1 : 0),
      unpitchedCounts: new Uint16Array(size).fill(options.unpitched ?? (pitched ? 0 : 1)),
    },
    rawEventCount: counts.reduce((sum, value) => sum + value, 0),
  };
};

const projection = laneProjection(0, 4, 400);

describe('projection geometry', () => {
  it('maps cycles to pixels and pitches to the middle half of the row', () => {
    expect(cycleToX(projection, 0)).toBe(0);
    expect(cycleToX(projection, 2)).toBe(200);
    expect(cycleToX(projection, 4)).toBe(400);
    expect(pitchCentreY(60, 40)).toBeCloseTo(20, 6);
    expect(pitchCentreY(24, 40)).toBeCloseTo(30, 6);
    expect(pitchCentreY(96, 40)).toBeCloseTo(10, 6);
    expect(pitchCentreY(12, 40)).toBeCloseTo(30, 6);
    expect(pitchCentreY(108, 40)).toBeCloseTo(10, 6);
    // Percussion lanes stay around the centreline.
    for (const sound of ['bd', 'hh', 'cp', 'rim', 'x']) {
      const y = unpitchedCentreY(sound, 40);
      expect(y).toBeGreaterThanOrEqual(40 / 2 - 8);
      expect(y).toBeLessThanOrEqual(40 / 2 + 8);
    }
  });

  it('degrades to an unusable projection for empty geometry', () => {
    const broken = laneProjection(0, 0, 400);
    expect(broken.pxPerCycle).toBe(0);
    expect(cycleToX(broken, 2)).toBe(0);
  });
});

describe('exact note geometry', () => {
  const at = (begin: number, end: number, pitch: number | null = null) => ({ id: 0, begin, end, pitch, soundId: 0 });

  it('clips long events to the band without fake starts, ends or separations', () => {
    const geometry = exactNoteGeometry(at(-5, 10), 'pad', projection, 40)!;
    expect(geometry.x).toBe(0);
    expect(geometry.width).toBe(400);
    expect(geometry.radius).toEqual([0, 0, 0, 0]);
    expect(geometry.startsInside).toBe(false);
    expect(geometry.endsInside).toBe(false);

    const exiting = exactNoteGeometry(at(3.5, 10), 'pad', projection, 40)!;
    expect(exiting.radius).toEqual([NOTE_RADIUS_PX, 0, 0, NOTE_RADIUS_PX]);
    expect(exiting.startsInside).toBe(true);

    const entering = exactNoteGeometry(at(-1, 1), 'pad', projection, 40)!;
    expect(entering.radius).toEqual([0, NOTE_RADIUS_PX, NOTE_RADIUS_PX, 0]);
  });

  it('keeps ultra-short notes visible with the width floor and hides non-overlapping ones', () => {
    const tiny = exactNoteGeometry(at(2, 2.00001), 'bd', projection, 40)!;
    expect(tiny.width).toBe(NOTE_MIN_WIDTH_PX);
    const gone = exactNoteGeometry(at(4.5, 5), 'bd', projection, 40);
    expect(gone).toBeNull();
  });

  it('positions pitched and unpitched notes on their row centres', () => {
    const pitched = exactNoteGeometry(at(0, 1, 96), 'bd', projection, 40)!;
    expect(pitched.y).toBeCloseTo(pitchCentreY(96, 40) - NOTE_HEIGHT_PX / 2, 6);
    const unpitched = exactNoteGeometry(at(0, 1, null), 'cp', projection, 40)!;
    expect(unpitched.y).toBeCloseTo(unpitchedCentreY('cp', 40) - NOTE_HEIGHT_PX / 2, 6);
  });
});

describe('base planning', () => {
  it('clears, draws the grid, then the notes or columns and a pending region', () => {
    const lane: TrackLaneSceneData = {
      trackId: 'x',
      representation: 'exact',
      exact: [
        { id: 0, begin: 0.5, end: 1.5, pitch: 60, soundId: 0 },
        { id: 1, begin: 2, end: 6, pitch: null, soundId: 0 },
      ],
      rawEventCount: 2,
    };
    const commands = planLaneBase({
      lane,
      sounds: ['bd'],
      projection,
      cssHeight: 40,
      colors: COLORS,
      quiet: false,
      minorTicks: [0.5, 1, 2],
      majorTicks: [1, 2, 3],
      coverageEnd: 3,
    });
    expect(commands[0]).toMatchObject({ kind: 'clear', width: 400, height: 40 });
    // Grid lines land on their cycle positions.
    const rects = commands.filter(command => command.kind === 'rect') as Extract<LaneDrawCommand, { kind: 'rect' }>[];
    expect(rects.some(rect => rect.kind === 'rect' && Math.abs(rect.x - cycleToX(projection, 1)) < 0.5)).toBe(true);
    // Notes draw at their projected geometry with the base opacity.
    const note = rects.find(rect => rect.width > 90 && rect.height === NOTE_HEIGHT_PX)!;
    expect(note.alpha).toBeCloseTo(0.72, 6);
    expect(rects.some(rect => rect.kind === 'rect' && rect.fill === COLORS.pending && rect.x > 290)).toBe(true);
    // Separation rides on real starts only: both notes start inside the band.
    const seps = commands.filter(command => command.kind === 'sep');
    expect(seps).toHaveLength(2);
    expect(Math.abs(seps[0].x - cycleToX(projection, 0.5))).toBeLessThan(0.5);
  });

  it('dims quiet lanes and keeps pending out when the band is complete', () => {
    const lane: TrackLaneSceneData = {
      trackId: 'x',
      representation: 'exact',
      exact: [{ id: 0, begin: 0.5, end: 1, pitch: null, soundId: 0 }],
      rawEventCount: 1,
    };
    const quiet = planLaneBase({
      lane, sounds: ['bd'], projection, cssHeight: 40, colors: COLORS, quiet: true,
      minorTicks: [], majorTicks: [],
    });
    const note = quiet.find(command => command.kind === 'rect' && command.height === NOTE_HEIGHT_PX) as Extract<LaneDrawCommand, { kind: 'rect' }>;
    expect(note.alpha).toBe(NOTE_DIMMED_OPACITY);
    // No pending region beyond the band.
    expect(quiet.some(command => command.kind === 'rect' && command.fill === COLORS.pending && command.x > 0)).toBe(false);
  });

  it('draws non-contiguous pending ranges without hiding completed middle tiles', () => {
    const lane: TrackLaneSceneData = {
      trackId: 'x',
      representation: 'exact',
      exact: [{ id: 0, begin: 1.1, end: 1.4, pitch: 60, soundId: 0 }],
      rawEventCount: 1,
    };
    const commands = planLaneBase({
      lane,
      sounds: ['bd'],
      projection,
      cssHeight: 40,
      colors: COLORS,
      quiet: false,
      minorTicks: [],
      majorTicks: [],
      pendingRanges: [[0, 1], [2, 4]],
    });
    const pending = commands.filter(command => command.kind === 'rect' && command.fill === COLORS.pending) as Extract<LaneDrawCommand, { kind: 'rect' }>[];
    expect(pending).toHaveLength(2);
    expect(pending[0].x).toBeCloseTo(0, 6);
    expect(pending[1].x).toBeCloseTo(200, 6);
    expect(pending[1].width).toBeCloseTo(200, 6);
  });

  it('draws density columns with log-normalised alpha and pitch ranges', () => {
    const counts = [1, 10, 100, 0];
    const lane = densityLane(counts, { pitchMin: 40, pitchMax: 80, unpitched: 0 });
    // Mark one column unpitched so its span reaches the centreline band.
    lane.density!.unpitchedCounts[2] = 1;
    const commands = planLaneBase({
      lane, sounds: ['bd'], projection, cssHeight: 40, colors: COLORS, quiet: false,
      minorTicks: [], majorTicks: [],
    });
    const columns = commands.filter(command => command.kind === 'rect' && command.fill === COLORS.color) as Extract<LaneDrawCommand, { kind: 'rect' }>[];
    expect(columns).toHaveLength(3);
    // Log normalisation: the busiest column is the most opaque but not by 100×.
    const [sparse, mid, dense] = columns;
    expect(dense.alpha).toBeGreaterThan(mid.alpha);
    expect(mid.alpha).toBeGreaterThan(sparse.alpha);
    expect(dense.alpha - sparse.alpha).toBeLessThan(0.7);
    // The pitched span maps its pitch range; the unpitched mix reaches wider.
    expect(dense.height).toBeGreaterThanOrEqual(NOTE_HEIGHT_PX);
    expect(columns.every(column => Number.isFinite(column.x) && Number.isFinite(column.y) && column.width > 0)).toBe(true);
    expect(densityColumnWidth(lane.density!, projection, 0)).toBeCloseTo(0.04 * projection.pxPerCycle, 6);
  });

  it('produces finite commands for degenerate scenes', () => {
    const empty: TrackLaneSceneData = { trackId: 'x', representation: 'density', rawEventCount: 0 };
    const commands = planLaneBase({
      lane: empty, sounds: [], projection: laneProjection(0, 4, 400), cssHeight: 40,
      colors: COLORS, quiet: false, minorTicks: [], majorTicks: [],
    });
    expect(commands[0]).toMatchObject({ kind: 'clear' });
    expect(commands.every(command => command.kind !== 'rect' || Number.isFinite(command.x))).toBe(true);
    expect(NOTE_SEP_WIDTH_PX).toBe(1);
    expect(executeLaneDrawCommands).toBeTypeOf('function');
  });
});

describe('overlay planning', () => {
  it('clears when stopped and highlights only the sounding primitives', () => {
    const lane: TrackLaneSceneData = {
      trackId: 'x',
      representation: 'exact',
      exact: [
        { id: 0, begin: 0.5, end: 1.5, pitch: null, soundId: 0 },
        { id: 1, begin: 2, end: 3, pitch: null, soundId: 0 },
      ],
      rawEventCount: 2,
    };
    const stopped = planLaneOverlay({
      lane, sounds: ['bd'], projection, cssHeight: 40, colors: COLORS, quiet: false,
    });
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({ kind: 'clear' });

    const active = planLaneOverlay({
      lane, sounds: ['bd'], projection, cssHeight: 40, colors: COLORS, quiet: false,
      activeIds: [1],
    });
    const rects = active.filter(command => command.kind === 'rect') as Extract<LaneDrawCommand, { kind: 'rect' }>[];
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ alpha: 1, fill: COLORS.colorStrong, x: cycleToX(projection, 2) });
  });

  it('highlights the density column under the playhead and nothing when quiet', () => {
    const lane = densityLane([1, 5, 0]);
    const active = planLaneOverlay({
      lane, sounds: ['bd'], projection, cssHeight: 40, colors: COLORS, quiet: false,
      activeBins: [1],
    });
    const rects = active.filter(command => command.kind === 'rect') as Extract<LaneDrawCommand, { kind: 'rect' }>[];
    expect(rects).toHaveLength(1);
    expect(rects[0].alpha).toBe(1);
    const quiet = planLaneOverlay({
      lane, sounds: ['bd'], projection, cssHeight: 40, colors: COLORS, quiet: true,
      activeBins: [1],
    });
    expect(quiet).toHaveLength(1);
  });
});

describe('raster block planning', () => {
  const input = (over: Partial<RasterPlanInput> = {}): RasterPlanInput => ({
    bandBegin: 0,
    dataBegin: 0,
    dataEnd: 12,
    viewportBegin: 4,
    viewportEnd: 8,
    drawBegin: 0,
    drawEnd: 16,
    pxPerCycle: 100,
    cssHeight: 40,
    devicePixelRatio: 2,
    ...over,
  });

  it('keeps 5 CSS px notes at full DPR sampling however wide the prefetch is', () => {
    // A three-screen scene at 600 CSS px/viewport: the old shared-cap path
    // downsampled the whole band to 4096; blocks never do.
    const plan = planRasterBlocks(input({
      dataBegin: 0, dataEnd: 600, viewportBegin: 200, viewportEnd: 400, drawBegin: 0, drawEnd: 600,
      pxPerCycle: 30, devicePixelRatio: 2,
    }));
    expect(plan.blocks.length).toBeGreaterThan(4);
    for (const block of plan.blocks) {
      expect(block.backingWidth).toBeLessThanOrEqual(RASTER_MAX_BACKING_AXIS);
      expect(block.backingHeight).toBeLessThanOrEqual(RASTER_MAX_BACKING_AXIS);
      expect(block.scaleY).toBeCloseTo(2, 6);
      expect(block.scaleX).toBeCloseTo(2, 6);
    }
  });

  it('caps block backing axes including bleed at every DPR', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      const plan = planRasterBlocks(input({ devicePixelRatio: dpr }));
      expect(plan.blocks.length).toBeGreaterThan(0);
      expect(plan.devicePixelRatio).toBe(dpr);
      for (const block of plan.blocks) {
        expect(block.backingWidth).toBeLessThanOrEqual(RASTER_MAX_BACKING_AXIS);
        expect(block.backingWidth).toBeGreaterThan(2 * RASTER_BLEED_PHYSICAL_PX);
      }
      // Interior blocks span the full grid cell; edges clip to the window.
      const interior = plan.blocks.filter(block =>
        block.cssWidth * dpr >= rasterBlockAxisPhysical(dpr) - 1e-9);
      expect(interior.length).toBeGreaterThan(0);
      for (const block of interior) {
        expect(block.backingWidth).toBe(rasterBlockAxisPhysical(dpr) + 2 * RASTER_BLEED_PHYSICAL_PX);
      }
    }
  });

  it('never lowers the vertical scale for an unusually tall lane', () => {
    const plan = planRasterBlocks(input({ cssHeight: 3000, devicePixelRatio: 2 }));
    const rows = new Set(plan.blocks.map(block => block.row));
    expect(rows.size).toBeGreaterThan(1);
    for (const block of plan.blocks) {
      expect(block.backingHeight).toBeLessThanOrEqual(RASTER_MAX_BACKING_AXIS);
      expect(block.scaleY).toBeCloseTo(2, 6);
    }
  });

  it('falls back to DPR 1 for unusable ratios', () => {
    expect(normalizeDevicePixelRatio(Number.NaN)).toBe(1);
    expect(normalizeDevicePixelRatio(0)).toBe(1);
    expect(normalizeDevicePixelRatio(-2)).toBe(1);
    expect(normalizeDevicePixelRatio(3.5)).toBe(3.5);
  });

  it('keeps ownership regions tiled and bleeding into neighbours exactly once', () => {
    const plan = planRasterBlocks(input({ pxPerCycle: 300, devicePixelRatio: 2 }));
    const sorted = [...plan.blocks].sort((a, b) => a.beginCycle - b.beginCycle);
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      // Ownership regions tile: no gap, no overlap.
      expect(current.beginCycle).toBeCloseTo(previous.endCycle, 9);
      expect(current.cssOwnLeft).toBeCloseTo(previous.cssOwnLeft + previous.cssOwnWidth, 6);
      expect(current.cssOwnTop).toBeCloseTo(previous.cssOwnTop, 6);
      // Canvases overlap by exactly one bleed pixel on each side.
      expect(current.cssLeft).toBeCloseTo(previous.cssLeft + previous.cssWidth - 2 * RASTER_BLEED_PHYSICAL_PX / plan.devicePixelRatio, 6);
    }
    // Backing geometry derives from the physical boundary difference, so
    // scales never assume an integer DPR.
    for (const block of plan.blocks) {
      expect(block.cssWidth * plan.devicePixelRatio).toBeCloseTo(block.backingWidth, 6);
      expect(block.cssOwnWidth * plan.devicePixelRatio).toBeCloseTo(block.backingWidth - 2 * RASTER_BLEED_PHYSICAL_PX, 6);
    }
  });

  it('clips block ownership to the draw range and reports honest bytes', () => {
    const plan = planRasterBlocks(input({ drawBegin: 1, drawEnd: 9 }));
    expect(plan.blocks[0].beginCycle).toBeGreaterThanOrEqual(1);
    expect(plan.blocks.at(-1)!.endCycle).toBeLessThanOrEqual(16 - 1);
    const bytes = plan.blocks.reduce(
      (sum, block) => sum + block.backingWidth * block.backingHeight * 4 * 2, 0,
    );
    expect(plan.estimatedBytes).toBe(bytes);
  });

  it('shrinks off-screen prefetch before ever dropping the viewport', () => {
    // A lane tall enough that the full three-screen plan is huge.
    const over = input({ cssHeight: 2000, pxPerCycle: 200 });
    const budgeted = planRasterBlocks({ ...over, maxBytes: 4 * 1024 * 1024 });
    const full = planRasterBlocks(over);
    expect(full.estimatedBytes).toBeGreaterThan(budgeted.estimatedBytes);
    // The visible range survives every shrink.
    const viewStart = over.viewportBegin * over.pxPerCycle * 2;
    const viewEnd = over.viewportEnd * over.pxPerCycle * 2;
    const own = budgeted.blocks;
    expect(Math.min(...own.map(b => b.beginCycle)) * over.pxPerCycle * 2).toBeLessThanOrEqual(viewStart + 1);
    expect(Math.max(...own.map(b => b.endCycle)) * over.pxPerCycle * 2).toBeGreaterThanOrEqual(viewEnd - 1);
  });

  it('is stable across pans on the same raster version and changes on geometry', () => {
    const first = planRasterBlocks(input());
    const panned = planRasterBlocks(input({ drawBegin: 0.5, drawEnd: 12.5, viewportBegin: 5, viewportEnd: 9 }));
    expect(panned.rasterVersion).toBe(first.rasterVersion);
    // Interior grid cells match exactly across pans.
    const stableA = first.blocks.find(block => block.column > 0)!;
    const stableB = panned.blocks.find(block => block.column === stableA.column)!;
    expect(stableB.beginCycle).toBeCloseTo(stableA.beginCycle, 9);
    expect(stableB.backingWidth).toBe(stableA.backingWidth);
    const zoomed = planRasterBlocks(input({ pxPerCycle: 120 }));
    expect(zoomed.rasterVersion).not.toBe(first.rasterVersion);
    const resized = planRasterBlocks(input({ cssHeight: 44 }));
    expect(resized.rasterVersion).not.toBe(first.rasterVersion);
  });

  it('degrades to no blocks for degenerate geometry', () => {
    expect(planRasterBlocks(input({ pxPerCycle: 0 })).blocks).toHaveLength(0);
    expect(planRasterBlocks(input({ dataEnd: 4 })).blocks).toHaveLength(0);
    expect(planRasterBlocks(input({ cssHeight: 0 })).blocks).toHaveLength(0);
    // A viewport outside the data has nothing visible to draw.
    expect(planRasterBlocks(input({ viewportBegin: 20, viewportEnd: 24 })).blocks).toHaveLength(0);
    expect(planRasterBlocks(input({ viewportBegin: 6, viewportEnd: 6, dataBegin: 6, dataEnd: 6 })).blocks).toHaveLength(0);
  });

  it('draws at least the viewport even when the requested draw range is smaller', () => {
    const plan = planRasterBlocks(input({ drawBegin: 5, drawEnd: 6 }));
    const begin = Math.min(...plan.blocks.map(block => block.beginCycle));
    const end = Math.max(...plan.blocks.map(block => block.endCycle));
    expect(begin).toBeLessThanOrEqual(4 + 1e-9);
    expect(end).toBeGreaterThanOrEqual(8 - 1e-9);
  });

  it('keeps every block within the 1024 CSS px budget at full DPR backing', () => {
    // 1800 CSS px viewport × 3 screens = 5400 CSS px of scene, but blocks
    // stay ≤ 1024 CSS px each with full DPR backing.
    const plan = planRasterBlocks(input({
      dataBegin: 0, dataEnd: 40.5, drawBegin: 0, drawEnd: 40.5,
      viewportBegin: 13.5, viewportEnd: 17.5, pxPerCycle: 1800 / 4, devicePixelRatio: 1,
    }));
    expect(plan.blocks.length).toBeGreaterThan(3);
    for (const block of plan.blocks) {
      expect(block.cssWidth).toBeLessThanOrEqual(RASTER_MAX_BLOCK_CSS_PX + 2 / plan.devicePixelRatio);
      expect(block.backingWidth).toBeLessThanOrEqual(RASTER_MAX_BACKING_AXIS);
      expect(block.scaleX).toBeCloseTo(1, 6);
    }
    expect(plan.blocks.some(block => block.backingWidth >= rasterBlockAxisPhysical(1))).toBe(true);
  });
});

describe('command execution', () => {
  it('executes rect and separation commands through fillRect with recorded geometry', () => {
    const calls: Array<{ method: string; args: number[] }> = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      clearRect: (x: number, y: number, w: number, h: number) => calls.push({ method: 'clearRect', args: [x, y, w, h] }),
      fillRect: (x: number, y: number, w: number, h: number) => calls.push({ method: 'fillRect', args: [x, y, w, h] }),
      beginPath: () => calls.push({ method: 'beginPath', args: [] }),
      fill: () => calls.push({ method: 'fill', args: [] }),
    } as unknown as CanvasRenderingContext2D;
    executeLaneDrawCommands(ctx, [
      { kind: 'clear', width: 400, height: 40 },
      { kind: 'rect', x: 10, y: 5, width: 30, height: NOTE_HEIGHT_PX, radius: [0, 0, 0, 0], alpha: 0.5, fill: '#fff' },
      { kind: 'sep', x: 10, y: 5, height: NOTE_HEIGHT_PX, fill: '#000' },
    ]);
    expect(calls.map(call => call.method)).toEqual(['clearRect', 'fillRect', 'fillRect']);
    expect(calls[1].args).toEqual([10, 5, 30, NOTE_HEIGHT_PX]);
    expect(calls[2].args).toEqual([10, 5, NOTE_SEP_WIDTH_PX, NOTE_HEIGHT_PX]);
  });
});
