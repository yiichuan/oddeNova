import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { TrackLaneSceneData } from '../../lib/track-preview-scene';
import {
  executeLaneDrawCommands,
  laneProjection,
  planLaneBase,
  planLaneOverlay,
  planRasterBlocks,
  type LaneColors,
  type LaneDrawCommand,
  type RasterBlock,
  type RasterPlan,
} from '../../lib/track-preview-canvas';

export interface TrackLaneActive {
  /** Sounding exact primitive ids (exact lanes). */
  ids?: readonly number[];
  /** Sounding density columns (density lanes). */
  bins?: readonly number[];
}

export interface TrackLaneCanvasHandle {
  /** Low-frequency sounding highlight; draws only the overlay canvases. */
  setActive(active: TrackLaneActive | null): void;
}

interface TrackLaneCanvasProps {
  trackName: string;
  lane: TrackLaneSceneData | null;
  sounds: readonly string[];
  slot: number;
  quiet: boolean;
  bandBegin: number;
  bandEnd: number;
  /** The visible viewport, in cycles — never shaved by the raster budget. */
  viewportBegin: number;
  viewportEnd: number;
  /** The range the lane would like to raster (viewport ± one screen). */
  drawBegin: number;
  drawEnd: number;
  minorTicks?: readonly number[];
  majorTicks?: readonly number[];
  /** Tiles before this cycle are complete; beyond it the lane shows pending. */
  coverageEnd?: number;
  /** Non-contiguous pending/guarded ranges in the full-scene coordinate domain. */
  pendingRanges?: readonly (readonly [number, number])[];
  /** The display's real DPR as subscribed by the panel. */
  devicePixelRatio: number;
  /** Panel-allocated soft budget for this lane's base+overlay bitmaps. */
  rasterBudgetBytes?: number;
  /** Reports bitmap allocation/context failures; the caller keeps its own
   *  failure state instead of pretending the raster succeeded. */
  onRasterFailure?: () => void;
  /** "Exact note preview" / "Full density preview" description for ARIA. */
  representationLabel: string;
  notesLabel: string;
  rawEventCount: number;
  /** Bumped when theme variables change so the base repaints. */
  colorEpoch?: number;
}

function resolvedColors(element: HTMLElement, slot: number): LaneColors {
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
  const read = (name: string): string => (style ? style.getPropertyValue(name).trim() : '');
  return {
    color: read(`--track-hue-${slot}`),
    colorStrong: read(`--track-hue-${slot}-strong`),
    grid: read('--track-grid'),
    gridMinor: read('--track-grid-minor'),
    pending: read('--track-grid-minor'),
    sep: read('--track-note-sep'),
  };
}

function contextOf(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  return canvas.getContext('2d');
}

function blockKey(block: RasterBlock): string { return `${block.column}:${block.row}`; }

/**
 * One lane's scene as a row of finite raster blocks. Each block holds a
 * device-pixel-accurate base (grid, exact notes or density columns) and an
 * overlay for the low-frequency sounding highlight. The element keeps the
 * shared scene transform from CSS; React redraws on scene, mix, label, size
 * or raster-version changes — never per animation frame. Blocks the budget
 * released stay released; a pan only draws the blocks that newly entered.
 */

const EMPTY_TICKS: readonly number[] = [];

const TrackLaneCanvas = memo(forwardRef<TrackLaneCanvasHandle, TrackLaneCanvasProps>(function TrackLaneCanvas({
  trackName, lane, sounds, slot, quiet, bandBegin, bandEnd, viewportBegin, viewportEnd,
  drawBegin, drawEnd, minorTicks = EMPTY_TICKS, majorTicks = EMPTY_TICKS, coverageEnd, pendingRanges,
  devicePixelRatio, rasterBudgetBytes,
  onRasterFailure, representationLabel, notesLabel, rawEventCount, colorEpoch = 0,
}, forwardedRef) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<TrackLaneActive | null>(null);
  const baseCanvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const overlayCanvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const backingSizesRef = useRef(new WeakMap<HTMLCanvasElement, string>());
  const baseDrawnRef = useRef<{ epoch: string; keys: Set<string> }>({ epoch: '', keys: new Set() });
  const failureReportedRef = useRef(false);
  // Fractional CSS sizes: rounding happens only when physical bounds are cut.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [visible, setVisible] = useState(true);

  const measure = useCallback((entry: { width: number; height: number } | null) => {
    const width = Math.max(0, entry?.width ?? 0);
    const height = Math.max(0, entry?.height ?? 0);
    setSize(previous => (
      Math.abs(previous.width - width) < 1e-9 && Math.abs(previous.height - height) < 1e-9
        ? previous
        : { width, height }
    ));
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) measure({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  // Vertical invisibility releases the lane's bitmaps; layout and the ARIA
  // description stay, and scrolling back rebuilds them.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) setVisible(entry.isIntersecting);
    }, { rootMargin: '120px 0px 120px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pxPerCycle = size.width > 0 && bandEnd > bandBegin ? size.width / (bandEnd - bandBegin) : 0;

  const plan: RasterPlan | null = useMemo(() => {
    if (!(size.width > 0) || !(size.height > 0) || !(bandEnd > bandBegin) || !visible) return null;
    return planRasterBlocks({
      bandBegin,
      dataBegin: bandBegin,
      dataEnd: bandEnd,
      viewportBegin,
      viewportEnd,
      drawBegin,
      drawEnd,
      pxPerCycle,
      cssHeight: size.height,
      devicePixelRatio,
      maxBytes: rasterBudgetBytes,
    });
  }, [
    bandBegin, bandEnd, devicePixelRatio, drawBegin, drawEnd,
    pxPerCycle, rasterBudgetBytes, size.height, size.width, viewportBegin, viewportEnd, visible,
  ]);

  /** The stable identity of what the blocks draw (everything but geometry). */
  const contentEpoch = useMemo(
    () => `${trackName}|${slot}|${quiet ? 1 : 0}|${colorEpoch}|${coverageEnd ?? -1}`
      + `|${pendingRanges?.map(range => range.join(':')).join(',') ?? ''}`
      + `|${minorTicks.join(',')}|${majorTicks.join(',')}|${visible ? 1 : 0}`,
    [colorEpoch, coverageEnd, majorTicks, minorTicks, pendingRanges, quiet, slot, trackName, visible],
  );

  const reportFailure = useCallback(() => {
    if (failureReportedRef.current) return;
    failureReportedRef.current = true;
    onRasterFailure?.();
  }, [onRasterFailure]);

  const sizeBacking = useCallback((canvas: HTMLCanvasElement, block: RasterBlock): boolean => {
    const id = `${block.backingWidth}x${block.backingHeight}`;
    if (backingSizesRef.current.get(canvas) === id) return true;
    try {
      canvas.width = block.backingWidth;
      canvas.height = block.backingHeight;
    } catch {
      return false;
    }
    backingSizesRef.current.set(canvas, id);
    return true;
  }, []);

  /** Execute the planned commands on one block, in scene-band coordinates. */
  const paintBlock = useCallback((
    canvas: HTMLCanvasElement,
    block: RasterBlock,
    commands: readonly LaneDrawCommand[],
  ): boolean => {
    if (!sizeBacking(canvas, block)) return false;
    const ctx = contextOf(canvas);
    if (!ctx) return false;
    // Commands are planned in whole-band CSS coordinates; the transform maps
    // them into this block's backing, bleed pixels included.
    ctx.setTransform(
      block.scaleX, 0, 0, block.scaleY,
      -block.cssLeft * block.scaleX, -block.cssTop * block.scaleY,
    );
    executeLaneDrawCommands(ctx, commands);
    return true;
  }, [sizeBacking]);

  // ── Base layer ─────────────────────────────────────────────────────────────
  const dataIdentityRef = useRef<{ lane: TrackLaneSceneData | null; sounds: readonly string[] }>({ lane: null, sounds: [] });
  useEffect(() => {
    const element = containerRef.current;
    if (!plan || !element || !(size.width > 0) || !(size.height > 0)) {
      baseDrawnRef.current = { epoch: '', keys: new Set() };
      dataIdentityRef.current = { lane: null, sounds: [] };
      return;
    }
    const epoch = `${plan.rasterVersion}|${contentEpoch}`;
    // A fresh scene batch or sound dictionary repaints everything: block
    // ownership only stabilises geometry, never data.
    const dataChanged = dataIdentityRef.current.lane !== lane || dataIdentityRef.current.sounds !== sounds;
    const full = baseDrawnRef.current.epoch !== epoch || dataChanged;
    dataIdentityRef.current = { lane, sounds };
    const colors = resolvedColors(element, slot);
    const projection = laneProjection(bandBegin, bandEnd, size.width);
    const commands = planLaneBase({
      lane: lane ?? { trackId: trackName, representation: 'density', rawEventCount: 0 },
      sounds,
      projection,
      cssHeight: size.height,
      colors,
      quiet,
      minorTicks,
      majorTicks,
      coverageEnd,
      pendingRanges,
      pixelSnap: plan.devicePixelRatio,
    });
    if (full) baseDrawnRef.current.keys.clear();
    for (const block of plan.blocks) {
      const key = blockKey(block);
      if (baseDrawnRef.current.keys.has(key)) continue;
      const canvas = baseCanvasesRef.current.get(key);
      if (!canvas) continue;
      if (paintBlock(canvas, block, commands)) baseDrawnRef.current.keys.add(key);
      else reportFailure();
    }
    baseDrawnRef.current.epoch = epoch;
  }, [bandBegin, bandEnd, contentEpoch, coverageEnd, lane, majorTicks, minorTicks, paintBlock, pendingRanges, plan, quiet, reportFailure, size, slot, sounds, trackName]);

  // ── Overlay layer ──────────────────────────────────────────────────────────
  const drawOverlay = useCallback(() => {
    const element = containerRef.current;
    if (!plan || !element || !(size.width > 0) || !(size.height > 0)) return;
    const colors = resolvedColors(element, slot);
    const projection = laneProjection(bandBegin, bandEnd, size.width);
    const commands = planLaneOverlay({
      lane: lane ?? { trackId: trackName, representation: 'density', rawEventCount: 0 },
      sounds,
      projection,
      cssHeight: size.height,
      colors,
      quiet,
      activeIds: activeRef.current?.ids,
      activeBins: activeRef.current?.bins,
      pixelSnap: plan.devicePixelRatio,
    });
    for (const block of plan.blocks) {
      const canvas = overlayCanvasesRef.current.get(blockKey(block));
      if (canvas) paintBlock(canvas, block, commands);
    }
  }, [bandBegin, bandEnd, lane, paintBlock, plan, quiet, size, slot, sounds, trackName]);

  useEffect(drawOverlay, [drawOverlay]);

  useImperativeHandle(forwardedRef, () => ({
    setActive: active => {
      activeRef.current = active;
      drawOverlay();
    },
  } satisfies TrackLaneCanvasHandle), [drawOverlay]);

  // Unmount: drop every bitmap reference at once.
  useEffect(() => () => {
    baseCanvasesRef.current.clear();
    overlayCanvasesRef.current.clear();
    baseDrawnRef.current = { epoch: '', keys: new Set() };
  }, []);

  const style = {
    '--track-note-color': `var(--track-hue-${slot})`,
    '--track-note-color-strong': `var(--track-hue-${slot}-strong)`,
  } as CSSProperties;
  const ariaLabel = `${trackName} · ${notesLabel} · ${representationLabel}`;

  return (
    <div ref={containerRef} data-track-scene data-track-lane-canvas className="track-lane-scene absolute inset-y-0 left-0" style={style}>
      <div
        role="img"
        aria-label={ariaLabel}
        data-track-representation={lane?.representation ?? 'pending'}
        data-track-events={rawEventCount}
        className="track-lane-canvas absolute inset-0"
      >
        {(plan?.blocks ?? []).map(block => {
          const key = blockKey(block);
          return (
            <div
              key={key}
              data-track-raster-block={`${block.column}:${block.row}`}
              className="track-lane-block"
              style={{
                left: `${block.cssOwnLeft}px`,
                top: `${block.cssOwnTop}px`,
                width: `${block.cssOwnWidth}px`,
                height: `${block.cssOwnHeight}px`,
              }}
            >
              <canvas
                ref={canvas => { if (canvas) baseCanvasesRef.current.set(key, canvas); else baseCanvasesRef.current.delete(key); }}
                className="track-lane-canvas-base track-lane-block-bitmap"
                aria-hidden="true"
                style={{
                  left: `${block.cssLeft - block.cssOwnLeft}px`,
                  top: `${block.cssTop - block.cssOwnTop}px`,
                  width: `${block.cssWidth}px`,
                  height: `${block.cssHeight}px`,
                }}
              />
              <canvas
                ref={canvas => { if (canvas) overlayCanvasesRef.current.set(key, canvas); else overlayCanvasesRef.current.delete(key); }}
                className="track-lane-canvas-overlay track-lane-block-bitmap"
                aria-hidden="true"
                style={{
                  left: `${block.cssLeft - block.cssOwnLeft}px`,
                  top: `${block.cssTop - block.cssOwnTop}px`,
                  width: `${block.cssWidth}px`,
                  height: `${block.cssHeight}px`,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}));

TrackLaneCanvas.displayName = 'TrackLaneCanvas';
export default TrackLaneCanvas;
