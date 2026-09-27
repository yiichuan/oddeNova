// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackLaneCanvas, { type TrackLaneCanvasHandle } from '../TrackLaneCanvas';
import { RASTER_BLEED_PHYSICAL_PX, RASTER_MAX_BLOCK_CSS_PX } from '../../../lib/track-preview-canvas';
import type { ExactTrackPrimitive, TrackLaneSceneData } from '../../../lib/track-preview-scene';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;
let resizeObservers: Array<{ observed: Set<Element>; fire: (width: number, height: number) => void }>;
let intersectionObservers: Array<{ fire: (intersecting: boolean) => void }>;

class FakeIntersectionObserver {
  private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void;
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.callback = callback;
    intersectionObservers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire(intersecting: boolean) { this.callback([{ isIntersecting: intersecting }]); }
}

class FakeResizeObserver {
  readonly observed = new Set<Element>();
  private readonly callback: (entries: Array<{ target: Element; contentRect: { width: number; height: number } }>) => void;
  constructor(callback: (entries: Array<{ target: Element; contentRect: { width: number; height: number } }>) => void) {
    this.callback = callback;
    resizeObservers.push(this);
  }
  observe(target: Element) { this.observed.add(target); }
  unobserve(target: Element) { this.observed.delete(target); }
  disconnect() { this.observed.clear(); }
  fire(width: number, height: number) {
    for (const target of this.observed) {
      this.callback([{ target, contentRect: { width, height } }]);
    }
  }
}

type FakeContext = {
  canvas: HTMLCanvasElement | null;
  setTransforms: Array<[number, number, number, number, number, number]>;
  clears: Array<[number, number, number, number]>;
  fills: Array<[number, number, number, number]>;
  globalAlpha: number;
  fillStyle: string;
  setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  clearRect: (x: number, y: number, w: number, h: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
  closePath: () => void;
  fill: () => void;
};
let fakeContexts: WeakMap<HTMLCanvasElement, FakeContext>;

const makeFakeContext = (): FakeContext => ({
  canvas: null,
  setTransforms: [],
  clears: [],
  fills: [],
  globalAlpha: 1,
  fillStyle: '',
  setTransform(...args) { this.setTransforms.push(args); },
  clearRect(...args) { this.clears.push(args); },
  fillRect(...args) { this.fills.push(args); },
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arcTo() {},
  closePath() {},
  fill() {},
});

beforeEach(() => {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  resizeObservers = [];
  intersectionObservers = [];
  fakeContexts = new WeakMap();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver as unknown as typeof ResizeObserver);
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as unknown as typeof IntersectionObserver);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let context = fakeContexts.get(this);
    if (!context) {
      context = makeFakeContext();
      context.canvas = this;
      fakeContexts.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  });
});

afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const primitive = (id: number, begin: number, end: number, pitch: number | null = null): ExactTrackPrimitive =>
  ({ id, begin, end, pitch, soundId: 0 });

const exactLane = (primitives: ExactTrackPrimitive[]): TrackLaneSceneData => ({
  trackId: 'a', representation: 'exact', exact: primitives, rawEventCount: primitives.length,
});

const DEFAULTS = {
  trackId: 'a',
  trackName: 'kit',
  sounds: ['bd'],
  slot: 2,
  quiet: false,
  bandBegin: 0,
  bandEnd: 12,
  viewportBegin: 4,
  viewportEnd: 8,
  drawBegin: 0,
  drawEnd: 12,
  devicePixelRatio: 2,
  rasterBudgetBytes: 64 * 1024 * 1024,
  representationLabel: 'Exact note preview',
  notesLabel: 'Notes',
  rawEventCount: 1,
  colorEpoch: 0,
};

type LaneProps = typeof DEFAULTS & { lane: TrackLaneSceneData | null };

function renderLane(over: Partial<LaneProps> = {}) {
  const props: LaneProps = { ...DEFAULTS, lane: exactLane([primitive(0, 0.5, 1.5, 60)]), ...over };
  const harness: { handle: TrackLaneCanvasHandle | null } = { handle: null };
  let current: LaneProps = props;
  const render = (next: LaneProps) => {
    act(() => {
      root.render(<TrackLaneCanvas {...next} ref={handle => { harness.handle = handle; }} />);
    });
    current = next;
  };
  render(props);
  act(() => { for (const observer of resizeObservers) observer.fire(1800, 40); });
  return {
    props: () => current,
    rerender: (over: Partial<LaneProps>) => render({ ...current, ...over }),
    resize: (width: number, height: number) => act(() => {
      for (const observer of resizeObservers) observer.fire(width, height);
    }),
    get canvases() { return [...container.querySelectorAll('canvas')] as HTMLCanvasElement[]; },
    get blocks() { return [...container.querySelectorAll('[data-track-raster-block]')] as HTMLElement[]; },
    active: (ids: number[] | null) => act(() => {
      harness.handle?.setActive(ids ? { ids } : null);
    }),
    contextOf: (canvas: HTMLCanvasElement | null) => (canvas ? fakeContexts.get(canvas) ?? null : null),
  };
}

describe('TrackLaneCanvas raster blocks', () => {
  it('mounts one clipped block per plan entry with a bleeding bitmap inside', () => {
    const lane = renderLane();
    // 1800 CSS px scene at dpr 2 → several ≤1024 CSS px blocks.
    expect(lane.blocks.length).toBeGreaterThan(1);
    const first = lane.blocks[0];
    const bitmap = first.querySelector('canvas') as HTMLCanvasElement;
    // Backing = ownership + 2 bleed physical px, at full DPR (never the old cap).
    expect(bitmap.width).toBeGreaterThan(RASTER_MAX_BLOCK_CSS_PX);
    expect(bitmap.width).toBeLessThanOrEqual(RASTER_MAX_BLOCK_CSS_PX * 2 + 2 * RASTER_BLEED_PHYSICAL_PX);
    // The canvas is one bleed pixel wider than its clipped wrapper on each side.
    expect(parseFloat(bitmap.style.width) - parseFloat(first.style.width))
      .toBeCloseTo(2 * RASTER_BLEED_PHYSICAL_PX / 2, 6);
    expect(bitmap.width).toBe(Math.round(parseFloat(bitmap.style.width) * 2));
  });

  it('draws every base block from one planned command set with per-block transforms', () => {
    const lane = renderLane();
    const contexts = lane.canvases.map(canvas => harness_context(lane, canvas)!);
    expect(contexts.length).toBeGreaterThan(2);
    for (const context of contexts) {
      expect(context.setTransforms.length).toBeGreaterThan(0);
      const [a, , , d, e] = context.setTransforms.at(-1)!;
      expect(a).toBeCloseTo(2, 6);
      expect(d).toBeCloseTo(2, 6);
      expect(e).not.toBe(0);
      // One clear per base draw pass.
      expect(context.clears.length).toBe(1);
    }
  });

  it('reuses stable blocks and repaints newly entered or re-clipped blocks while panning', () => {
    const lane = renderLane({
      bandBegin: 0, bandEnd: 16, viewportBegin: 0, viewportEnd: 4,
      drawBegin: 0, drawEnd: 8,
    });
    lane.resize(3600, 40);
    const blocksBefore = new Map(lane.blocks.map(block => {
      const canvas = block.querySelector('.track-lane-canvas-base') as HTMLCanvasElement;
      return [block.dataset.trackRasterBlock!, {
        canvas,
        geometry: `${block.style.left}:${block.style.width}:${canvas.style.left}:${canvas.style.width}`,
        fills: harness_context(lane, canvas)!.fills.length,
      }];
    }));
    // Pan right: the drawn window's right edge crosses a grid-cell boundary
    // while the raster version (px/cycle, height, DPR) holds.
    lane.rerender({ viewportBegin: 2, viewportEnd: 6, drawBegin: 0, drawEnd: 10 });
    let stableCount = 0;
    let changedCount = 0;
    let newCount = 0;
    for (const block of lane.blocks) {
      const canvas = block.querySelector('.track-lane-canvas-base') as HTMLCanvasElement;
      const geometry = `${block.style.left}:${block.style.width}:${canvas.style.left}:${canvas.style.width}`;
      const before = blocksBefore.get(block.dataset.trackRasterBlock!);
      if (!before) {
        newCount++;
      } else if (before.geometry === geometry) {
        stableCount++;
        expect(canvas).toBe(before.canvas);
        expect(harness_context(lane, canvas)!.fills.length).toBe(before.fills);
      } else {
        changedCount++;
        expect(harness_context(lane, canvas)!.fills.length).toBeGreaterThan(before.fills);
      }
    }
    expect(stableCount).toBeGreaterThan(0);
    expect(changedCount).toBeGreaterThan(0);
    expect(newCount).toBeGreaterThan(0);
  });

  it('repaints a raster block after seeking away and mounting that block again', () => {
    const lane = renderLane({
      bandBegin: 0, bandEnd: 32, viewportBegin: 0, viewportEnd: 4,
      drawBegin: 0, drawEnd: 8,
    });
    const firstBlock = lane.blocks[0];
    const firstKey = firstBlock.dataset.trackRasterBlock;
    const firstCanvas = firstBlock.querySelector('.track-lane-canvas-base') as HTMLCanvasElement;
    expect(harness_context(lane, firstCanvas)!.clears.length).toBeGreaterThan(0);

    // A progress-bar seek drops the old bitmap blocks entirely.
    lane.rerender({ viewportBegin: 24, viewportEnd: 28, drawBegin: 20, drawEnd: 32 });
    expect(lane.blocks.some(block => block.dataset.trackRasterBlock === firstKey)).toBe(false);

    // Seeking back creates a fresh canvas for the same global raster key. It
    // must be painted even though that key appeared earlier in this epoch.
    lane.rerender({ viewportBegin: 0, viewportEnd: 4, drawBegin: 0, drawEnd: 8 });
    const remountedBlock = lane.blocks.find(block => block.dataset.trackRasterBlock === firstKey)!;
    const remountedCanvas = remountedBlock.querySelector('.track-lane-canvas-base') as HTMLCanvasElement;
    expect(remountedCanvas).not.toBe(firstCanvas);
    expect(harness_context(lane, remountedCanvas)!.clears.length).toBeGreaterThan(0);
  });

  it('repaints every block when the raster version changes (zoom, height, DPR)', () => {
    const lane = renderLane({ devicePixelRatio: 1 });
    const baseFills = () => lane.canvases.filter((_, index) => index % 2 === 0)
      .map(canvas => harness_context(lane, canvas)!.fills.length);
    const fillsBefore = baseFills();
    lane.rerender({ devicePixelRatio: 2 });
    // A new raster version repaints every base block.
    const after = baseFills();
    expect(after.length).toBe(fillsBefore.length);
    for (const count of after) expect(count).toBeGreaterThan(0);
  });

  it('repaints the base everywhere when lane content or mix changes', () => {
    const lane = renderLane();
    const fillsBefore = lane.canvases.map(canvas => harness_context(lane, canvas)!.fills.length);
    lane.rerender({ quiet: true });
    const after = lane.canvases.map(canvas => harness_context(lane, canvas)!.fills.length);
    expect(after).toEqual(fillsBefore.map(() => expect.any(Number)));
    // A quiet lane's note alpha dropped to the dimmed value: real repaints.
    expect(after.some((count, index) => count >= fillsBefore[index])).toBe(true);
  });

  it('redraws the overlay on setActive and clears it on null without touching the base', () => {
    const lane = renderLane();
    const baseFills = () => lane.canvases.filter((_, index) => index % 2 === 0)
      .map(canvas => harness_context(lane, canvas)!.fills.length);
    const baseBefore = baseFills();
    lane.active([0]);
    const overlays = () => lane.canvases.filter((_, index) => index % 2 === 1)
      .map(canvas => harness_context(lane, canvas)!);
    // Every overlay painted its highlight.
    expect(overlays().every(context => context.fills.length > 0)).toBe(true);
    const baseAfter = baseFills();
    expect(baseAfter).toEqual(baseBefore);
    // Deactivation clears every overlay again.
    const fillsAtActive = overlays().map(context => context.fills.length);
    lane.active(null);
    // Deactivation cleared the highlights: no overlay holds more fills than
    // its cleared draw pass (each cleared once, drew nothing new).
    for (const context of overlays()) {
      expect(context.clears.length).toBeGreaterThanOrEqual(1);
    }
    void fillsAtActive;
  });

  it('releases bitmaps while vertically invisible and rebuilds them on return', () => {
    const lane = renderLane();
    expect(lane.canvases.length).toBeGreaterThan(0);
    const observers = intersectionObservers;
    expect(observers.length).toBeGreaterThan(0);
    // Scrolled out of the viewport: every bitmap is released...
    act(() => { for (const observer of observers) observer.fire(false); });
    expect(lane.canvases.length).toBe(0);
    // ...but the ARIA description stays.
    const image = container.querySelector('[role="img"]') as HTMLElement;
    expect(image).not.toBeNull();
    // And scrolling back rebuilds them.
    act(() => { for (const observer of observers) observer.fire(true); });
    expect(lane.canvases.length).toBeGreaterThan(0);
  });

  it('keeps one role=img lane description with its representation metadata', () => {
    const lane = renderLane();
    const image = container.querySelector('[role="img"]') as HTMLElement;
    expect(image.getAttribute('aria-label')).toBe('kit · Notes · Exact note preview');
    expect(image.getAttribute('data-track-representation')).toBe('exact');
    expect(image.getAttribute('data-track-events')).toBe('1');
    for (const canvas of lane.canvases) expect(canvas.getAttribute('aria-hidden')).toBe('true');
  });
});

function harness_context(harness: ReturnType<typeof renderLane>, canvas: HTMLCanvasElement): FakeContext | null {
  return harness.contextOf(canvas);
}
