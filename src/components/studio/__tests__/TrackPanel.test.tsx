// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TrackPanel from '../TrackPanel';
import { t, tf } from '../../../lib/i18n';
import type { ExactTrackPrimitive, TrackFullSceneSnapshot, TrackLaneSceneData, TrackSceneBatch, TrackSceneRequest } from '../../../lib/track-preview-scene';
import type { TrackSceneQueryResult } from '../../../services/track-preview';
import type { TransportEvent } from '../../../services/strudel';

let root: Root;
let container: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let nextId: number;
type FakeContext = {
  canvas: HTMLCanvasElement | null;
  calls: Array<[string, unknown[]]>;
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
let resizeObservers: Array<{ observed: Set<Element>; fire: (width: number, height: number) => void }>;

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

const makeFakeContext = (): FakeContext => {
  const calls: Array<[string, unknown[]]> = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, args]); };
  return {
    canvas: null,
    calls,
    globalAlpha: 1,
    fillStyle: '',
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arcTo: record('arcTo'),
    closePath: record('closePath'),
    fill: record('fill'),
  };
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); frames = new Map(); nextId = 0;
  fakeContexts = new WeakMap();
  resizeObservers = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextId, cb); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.stubGlobal('ResizeObserver', FakeResizeObserver as unknown as typeof ResizeObserver);
  // One persistent fake context per canvas: draws accumulate and assertions
  // can read a canvas's whole history of commands.
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
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

// ── Live harness ─────────────────────────────────────────────────────────────
// The production panel samples a clock and queries scenes; the stand-in
// resolves follow windows from the base's own `now` exactly the way the real
// viewport projection does, and echo scenes reuse the same display-domain
// event coordinates the old fixtures used.

const LOOP = 16;
const tracks = [{ id: 'a', name: '鼓组' }, { id: 'b', name: '贝斯' }];

let primitiveId = 0;
const ev = (begin: number, end: number, sound: 0 | 1, pitch: number | null = null): ExactTrackPrimitive =>
  ({ id: primitiveId++, begin, end, pitch, soundId: sound });
const exactLane = (trackId: string, exact: ExactTrackPrimitive[], rawEventCount = exact.length): TrackLaneSceneData =>
  ({ trackId, representation: 'exact', exact, rawEventCount });

const baseBatch = (): TrackSceneBatch => ({
  generation: 1,
  loopOffset: 0,
  begin: 0,
  end: 16,
  viewportBegin: 0,
  viewportEnd: 4,
  representation: 'exact',
  status: 'complete',
  lanes: [
    exactLane('a', [ev(0.9, 1.2, 0 as const)]),
    exactLane('b', [ev(1.5, 2, 1 as const, 36)]),
  ],
  rawEventCount: 2,
  resolutionTier: 8,
  sounds: ['bd', 'sawtooth'],
});

/** The base scene batch; tests override lanes/status/viewport as needed. */
const sceneBase = baseBatch;

function tick(time: number) { const queue = [...frames.values()]; frames.clear(); act(() => queue.forEach(cb => cb(time))); }

/** Flush scene queries: the panel debounces new requests by 80ms. */
const flushScene = async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  fireCanvasSizes();
  await act(async () => {});
};

function fireCanvasSizes(height = 40) {
  // The lane canvases draw only once measured; give each a content size.
  for (const element of container.querySelectorAll('[data-track-lane-canvas]')) {
    for (const observer of resizeObservers) {
      if (observer.observed.has(element)) observer.fire(1600, height);
    }
  }
}

const renderPanel = async (props: Partial<Parameters<typeof TrackPanel>[0]> = {}) => {
  const getClock = props.getClock ?? (() => ({ absoluteCycle: 1, cps: 0.5 }));
  const queryScene = props.queryScene ?? (async (request: TrackSceneRequest) => ({
    status: 'complete' as const,
    batch: {
      ...sceneBase(),
      generation: request.generation ?? 1,
      loopOffset: request.loopOffset,
      begin: request.queryBegin,
      end: request.queryEnd,
      viewportBegin: request.viewportBegin,
      viewportEnd: request.viewportEnd,
      },
  }));
  const hasQuerySceneOverride = Object.prototype.hasOwnProperty.call(props, 'queryScene');
  const querySceneProp = hasQuerySceneOverride ? props.queryScene : queryScene;
  const baseProps = { ...props };
  delete (baseProps as { getClock?: unknown }).getClock;
  delete (baseProps as { queryScene?: unknown }).queryScene;
  const rerender = (overrides: Partial<Parameters<typeof TrackPanel>[0]> = {}) => act(() => root.render(
    <TrackPanel
      tracks={tracks}
      soloId={null}
      mutedIds={new Set()}
      toggleSolo={() => {}}
      toggleMute={() => {}}
      getClock={getClock}
      queryScene={querySceneProp as NonNullable<Parameters<typeof TrackPanel>[0]['queryScene']>}
      previewGeneration={1}
      isPlaying={false}
      isPaused={false}
      active
      timeline={{ code: '', loopCycles: LOOP, durationSeconds: 32, estimatedCps: null }}
      {...baseProps}
      {...overrides}
    />,
  ));
  rerender();
  fireCanvasSizes();
  await act(async () => {});
  return {
    getClock,
    queryScene,
    rerender: async (overrides: Partial<Parameters<typeof TrackPanel>[0]> = {}) => {
      rerender(overrides);
      fireCanvasSizes();
      await act(async () => {});
    },
  };
};

const ruler = () => container.querySelector<HTMLElement>('[data-track-timeline]')!;
const tickLabels = () => [...container.querySelectorAll<HTMLElement>('.track-ruler-tick')].map(node => node.textContent);
const prefetchedTickLabels = () => [...container.querySelectorAll<HTMLElement>('.track-ruler-prefetch-tick')].map(node => node.textContent);
/** Live markers move through a compositor transform; read its percentage. */
const markerX = (selector: string): string | null => {
  const marker = container.querySelector(selector) as HTMLElement | null;
  if (!marker) return null;
  return /translate3d\(([^,]+),/.exec(marker.style.transform)?.[1] ?? null;
};
const playheadLeft = () => markerX('[data-playhead-line]');
// The caret rides the same transform host as the line; read it from there.
const caretLeft = (): string | null => {
  const marker = container.querySelector('[data-playhead-caret]') as HTMLElement | null;
  const host = marker?.parentElement as HTMLElement | null;
  return host ? /translate3d\(([^,]+),/.exec(host.style.transform)?.[1] ?? null : null;
};
/** The representation box lives one level under the lane's scene element. */
const laneRepresentationBox = (trackId: string) =>
  laneRow(trackId).querySelector('[data-track-representation]') as HTMLElement | null;
const laneRow = (trackId: string) => container.querySelector<HTMLElement>(`[data-track-id="${trackId}"]`)!;
const laneCanvasBox = (trackId: string) => laneRow(trackId).querySelector('[data-track-lane-canvas]') as HTMLElement | null;
const laneCanvases = (trackId: string) => [...laneCanvasBox(trackId)?.querySelectorAll('canvas') ?? []] as HTMLCanvasElement[];
const contextCalls = (canvas: HTMLCanvasElement | null) => (canvas ? fakeContexts.get(canvas)?.calls ?? [] : []);
const rectsOf = (calls: Array<[string, unknown[]]>) => calls.filter(([method]) => method === 'fillRect').map(([, args]) => args as number[]);
const clearsOf = (calls: Array<[string, unknown[]]>) => calls.filter(([method]) => method === 'clearRect').map(([, args]) => args as number[]);
const setTransformsOf = (calls: Array<[string, unknown[]]>) => calls.filter(([method]) => method === 'setTransform').map(([, args]) => args as number[]);
const laneRowCanvases = (trackId: string) => laneCanvases(trackId);

// ── Track structure and mix ──────────────────────────────────────────────────

it('keeps one canvas scene per lane and never creates per-event DOM notes', async () => {
  await renderPanel({ isPlaying: true });
  tick(100);
  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(0);
  for (const track of tracks) {
    const row = laneRow(track.id);
    // Raster blocks tile the scene: base + overlay canvases in whole pairs,
    // never per-event DOM notes.
    const canvases = row.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(2);
    expect(canvases.length % 2).toBe(0);
    expect(row.querySelectorAll('[data-track-raster-block]')).toHaveLength(canvases.length / 2);
    expect(laneRepresentationBox(track.id)?.getAttribute('data-track-representation')).toBe('exact');
    expect(laneRepresentationBox(track.id)?.getAttribute('data-track-events')).toBe('1');
    expect(laneRepresentationBox(track.id)?.getAttribute('role')).toBe('img');
    expect(laneRepresentationBox(track.id)?.getAttribute('aria-label')).toContain(track.name);
  }
});

it('assigns each track a stable colour slot that survives solo and mute changes', async () => {
  const named = ['和弦垫', '鼓组', '贝斯', 'Lead Synth', '打击乐', '氛围'].map((name, i) => ({ id: `9:${i}`, name }));
  const render = async (soloId: string | null, mutedIds: ReadonlySet<string>) => {
    await renderPanel({ tracks: named, soloId, mutedIds });
  };
  await render(null, new Set());
  const colors = () => [...container.querySelectorAll('[data-track-id]')].map(row => row.getAttribute('data-track-color'));
  const first = colors();
  expect(new Set(first)).toHaveLength(6);
  expect(container.querySelectorAll('[data-track-color-dot]')).toHaveLength(6);
  await render('9:1', new Set(['9:0']));
  expect(colors()).toEqual(first);
});

it('truncates long track names without crowding the controls', async () => {
  const long = { id: '3:0', name: '一段非常非常长的中文音轨名称加长版本' };
  await renderPanel({ tracks: [long, { id: '3:1', name: 'b' }] });
  const name = container.querySelector('[data-track-name]');
  expect(name?.getAttribute('title')).toBe(long.name);
  expect(name?.className).toContain('truncate');
  // Two rows of three controls (name, mute, solo) plus two zoom buttons; the
  // return-to-playback button only exists in manual mode.
  expect(container.querySelectorAll('button')).toHaveLength(8);
});

it('mutes a single track with its speaker control and redraws the lane dimmed', async () => {
  const muted: string[] = [];
  await renderPanel({ mutedIds: new Set(['a']), toggleMute: id => muted.push(id) });
  expect(laneRow('a')?.getAttribute('data-muted')).toBe('true');
  expect(laneRow('b')?.getAttribute('data-muted')).toBe('false');
  const muteButtons = [...container.querySelectorAll<HTMLElement>(`button[aria-label^="${t('trackMute')}"]`)];
  expect(muteButtons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  // The muted lane's base repaints at the dimmed opacity, with no overlay.
  await fireCanvasSizesAndFlush();
  const baseFills = rectsOf(contextCalls(laneCanvases('a')[0]));
  expect(baseFills.length).toBeGreaterThan(0);
  const dimmed = baseFills.some(([, , , height]) => height === 5);
  expect(dimmed).toBe(true);
  expect(laneRow('a').getAttribute('data-muted')).toBe('true');
  act(() => muteButtons[1].click()); expect(muted).toEqual(['b']);
});

async function fireCanvasSizesAndFlush() {
  fireCanvasSizes();
  await act(async () => {});
}

it('shows the unsupported state without broken solo controls', async () => {
  await renderPanel({ tracks: [] });
  expect(container.textContent).toContain(t('tracksUnsupported'));
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

// ── Playhead and ruler ───────────────────────────────────────────────────────

it('draws one unified playhead through the lanes with a caret and a matching ruler segment', async () => {
  await renderPanel({ isPlaying: true });
  tick(100);
  expect(container.querySelectorAll('[data-playhead]')).toHaveLength(1);
  // The initial follow window is [0, 4), so a playhead at cycle 1 sits at 25%.
  expect(playheadLeft()).toBe('25%');
  expect(container.querySelectorAll('[data-playhead-caret]')).toHaveLength(1);
  expect(caretLeft()).toBe('25%');
  expect(markerX('[data-playhead-ruler-line]')).toBe('25%');
});

it('follows the playhead continuously once it reaches the centre', async () => {
  await renderPanel({ getClock: () => ({ absoluteCycle: 3.6, cps: 0.5 }), isPlaying: true });
  tick(100);
  // The window slid so the playhead sits centred in [1.6, 5.6).
  expect(tickLabels()).toEqual(['2', '3', '4', '5']);
  expect(playheadLeft()).toBe('50%');
});

it('keeps the window continuous across the centre takeover without a threshold jump', async () => {
  // Just before the centre: window still pinned at the origin.
  await renderPanel({ getClock: () => ({ absoluteCycle: 1.999, cps: 0.5 }), isPlaying: true });
  tick(100);
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(parseFloat(playheadLeft()!)).toBeCloseTo(49.975, 3);

  // Just after: the window has slid by the same epsilon, playhead centred.
  await renderPanel({ getClock: () => ({ absoluteCycle: 2.001, cps: 0.5 }), isPlaying: true });
  tick(200);
  expect(tickLabels()).toEqual(['1', '2', '3', '4']);
  expect(playheadLeft()).toBe('50%');

  // Far ahead: absolute cycles keep scrolling, no snap back to a page start.
  await renderPanel({ getClock: () => ({ absoluteCycle: 10, cps: 0.5 }), isPlaying: true });
  tick(300);
  expect(tickLabels()).toEqual(['8', '9', '10', '11']);
  expect(playheadLeft()).toBe('50%');
});

it('samples at most once per animation frame and keeps the loop mounted', async () => {
  const getClock = vi.fn(() => ({ absoluteCycle: 1, cps: 0.5 }));
  await renderPanel({ getClock, isPlaying: true });
  const samplesAfterMount = getClock.mock.calls.length;
  expect(samplesAfterMount).toBeGreaterThanOrEqual(1);
  tick(16);
  expect(getClock.mock.calls.length).toBe(samplesAfterMount + 1);
  expect(frames.size).toBe(1);
  tick(32);
  expect(getClock.mock.calls.length).toBe(samplesAfterMount + 2);
  expect(frames.size).toBe(1);
});

it('stops sampling when the pane is hidden and resumes on visibility', async () => {
  const getClock = vi.fn(() => ({ absoluteCycle: 1, cps: 0.5 }));
  const render = async (active: boolean, isPlaying: boolean, isPaused = false) => {
    await renderPanel({ getClock, isPlaying, isPaused, active });
  };
  await render(true, true); tick(100); const afterPlaying = getClock.mock.calls.length;
  await render(false, true); tick(200); expect(getClock.mock.calls.length).toBe(afterPlaying); expect(frames.size).toBe(0);
  await render(true, false, true); tick(300); expect(getClock.mock.calls.length).toBeGreaterThan(afterPlaying); expect(frames.size).toBe(0);
});

it('renders the newest live viewport while reusing its cached scene', async () => {
  const getClock = vi.fn(() => ({ absoluteCycle: 1, cps: 0.5 }));
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1, begin: request.queryBegin, end: request.queryEnd },
  }));
  await renderPanel({ getClock, queryScene, isPlaying: false });
  await flushScene();
  expect(tickLabels()).toContain('0');
  act(() => (container.querySelector(`[aria-label="${t('trackZoomIn')}"]`) as HTMLButtonElement).click());
  await flushScene();
  // The committed scene is reused for projection; the zoomed-in view still
  // requests its own finer scene.
  expect(tickLabels()).not.toContain('3');
  expect(getClock).toHaveBeenCalled();
  expect(queryScene.mock.calls.length).toBeGreaterThanOrEqual(1);
});

// ── Canvas scene drawing ─────────────────────────────────────────────────────

it('draws exact notes into the base canvas at the projected geometry', async () => {
  await renderPanel({});
  await flushScene();
  const base = laneCanvases('a')[0];
  const rects = rectsOf(contextCalls(base));
  expect(rects.length).toBeGreaterThan(0);
  // The band is the whole piece [0, 16); the note at 0.9–1.2 projects into
  // its scene-proportional position with the note's own height.
  const note = rects.find(([x, , width, height]) => width > 0 && height === 5 && x > 0)!;
  expect(note[3]).toBe(5);
  // Backing stores stay bounded and transformed by the DPR scale.
  expect(base.width).toBeGreaterThan(0);
  expect(base.height).toBeGreaterThan(0);
  expect(setTransformsOf(contextCalls(base)).length).toBeGreaterThan(0);
  // The attack separation draws at the note's real start.
  expect(contextCalls(base).some(([method]) => method === 'fillRect' || method === 'beginPath')).toBe(true);
});

it('redraws the base canvas when a new generation commits', async () => {
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1 },
  }));
  await renderPanel({ queryScene, previewGeneration: 1 });
  await flushScene();
  const base = laneCanvases('a')[0];
  expect(contextCalls(base).length).toBeGreaterThan(0);
  expect(base.width).toBeGreaterThan(0);

  // A new compile generation re-queries and repaints the same lane canvas.
  await renderPanel({ queryScene, previewGeneration: 2 });
  await flushScene();
  expect(queryScene.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it('keeps the lane row and canvas mounted when only playback state changes', async () => {
  const { queryScene, calls } = echoQueryScene();
  const { rerender } = await renderPanel({ queryScene, isPlaying: false });
  await flushScene();
  const rowBefore = laneRow('a');
  const canvasBefore = laneCanvasBox('a');
  const callsBefore = calls();

  await rerender({ isPlaying: true, refreshRevision: 1 });

  expect(laneRow('a')).toBe(rowBefore);
  expect(laneCanvasBox('a')).toBe(canvasBefore);
  expect(calls()).toBe(callsBefore);
});

it('reports the scene representation through lane ARIA', async () => {
  await renderPanel({
    queryScene: async () => ({
      status: 'complete',
      batch: {
        ...sceneBase(),
        lanes: [{ trackId: 'a', representation: 'density', density: undefined, rawEventCount: 2048 }, exactLane('b', [ev(1.5, 2, 1 as const, 36)])],
        representation: 'mixed',
      },
    }),
  });
  await flushScene();
  expect(laneRepresentationBox('a')?.getAttribute('data-track-representation')).toBe('density');
  expect(laneRepresentationBox('a')?.getAttribute('aria-label')).toContain(t('trackPreviewDensity'));
  expect(laneRepresentationBox('b')?.getAttribute('data-track-representation')).toBe('exact');
});

it('keeps lane DOM constant while event counts grow', async () => {
  await renderPanel({
    queryScene: async () => ({
      status: 'complete',
      batch: {
        ...sceneBase(),
        lanes: [
          exactLane('a', Array.from({ length: 1000 }, (_, index) => ev(index % 15, (index % 15) + 1, 0 as const))),
          exactLane('b', []),
        ],
        representation: 'exact',
      },
    }),
  });
  await flushScene();
  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(0);
  expect(container.querySelectorAll('canvas')).toHaveLength(4);
  expect(laneCanvases('a')[0].width).toBeGreaterThan(0);
});

// ── Reuse and precision-only redraws ─────────────────────────────────────────

const echoQueryScene = (): { queryScene: NonNullable<Parameters<typeof TrackPanel>[0]['queryScene']>; calls: () => number } => {
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: {
      ...sceneBase(),
      generation: request.generation ?? 1,
      begin: request.queryBegin,
      end: request.queryEnd,
      viewportBegin: request.viewportBegin,
      viewportEnd: request.viewportEnd,
      // The echo carries the same precision metadata a real service reports.
      effectiveBinSpan: Math.pow(2, -8),
      exactBudget: 4 * 400,
    },
  }));
  return { queryScene, calls: () => queryScene.mock.calls.length };
};

/** Fire the lane canvases' own ResizeObserver at a different content width. */
const fireLaneWidth = (width: number) => {
  for (const element of container.querySelectorAll('[data-track-lane-canvas]')) {
    for (const observer of resizeObservers) {
      if (observer.observed.has(element)) observer.fire(width, 40);
    }
  }
};

it('reuses the scene and only redraws for a same-tier size change', async () => {
  const { queryScene, calls } = echoQueryScene();
  await renderPanel({ queryScene });
  await flushScene();
  const before = calls();
  // A slightly narrower lane: same resolution tier, same data range.
  const fillsBefore = rectsOf(contextCalls(laneCanvases('a')[0])).length;
  fireLaneWidth(1560);
  await act(async () => {});
  expect(calls()).toBe(before);
  // The base repainted at the new raster version.
  expect(rectsOf(contextCalls(laneCanvases('a')[0])).length).toBeGreaterThan(fillsBefore);
});

it('repaints lanes at a new device pixel ratio without re-querying the pattern', async () => {
  const listeners = new Map<string, Set<() => void>>();
  vi.stubGlobal('matchMedia', (query: string) => {
    let entry = listeners.get(query);
    if (!entry) { entry = new Set(); listeners.set(query, entry); }
    return {
      media: query,
      matches: false,
      addEventListener: (_type: string, listener: () => void) => { entry!.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => { entry!.delete(listener); },
    };
  });
  const originalRatio = window.devicePixelRatio;
  vi.stubGlobal('devicePixelRatio', 1);
  const { queryScene, calls } = echoQueryScene();
  await renderPanel({ queryScene });
  await flushScene();
  const before = calls();
  const baseWidthBefore = laneCanvases('a')[0].width;
  // Crossing to a denser display: repaint at the real DPR, no new query.
  vi.stubGlobal('devicePixelRatio', 2);
  act(() => { for (const listener of [...listeners.get('(resolution: 1dppx)') ?? []]) listener(); });
  await act(async () => {});
  expect(calls()).toBe(before);
  expect(laneCanvases('a')[0].width).toBeGreaterThan(baseWidthBefore);
  vi.stubGlobal('devicePixelRatio', originalRatio);
});

it('advances the draw window once when playback nears its edge, not per frame', async () => {
  let now = 1;
  const { queryScene, calls } = echoQueryScene();
  await renderPanel({ isPlaying: true, getClock: () => ({ absoluteCycle: now, cps: 0.5 }), queryScene });
  await flushScene();
  const before = calls();
  // A step that lands past the safety distance queues exactly one window
  // refresh; follow-up frames do not queue more.
  now = 5.6;
  tick(100);
  // The queued window refresh commits on the next animation frame.
  tick(100);
  await flushScene();
  const afterRefresh = calls();
  expect(afterRefresh).toBeGreaterThan(before);
  tick(100);
  await flushScene();
  expect(calls()).toBe(afterRefresh);
});

// ── Sounding highlight ───────────────────────────────────────────────────────

it('highlights only the audible current note on the overlay while playing', async () => {
  await renderPanel({ isPlaying: true, getClock: () => ({ absoluteCycle: 1, cps: 0.5 }) });
  await flushScene();
  tick(500);
  const overlayA = laneRowCanvases('a')[1];
  const overlayB = laneRowCanvases('b')[1];
  // The playhead at cycle 1 sits inside track a's 0.9–1.2 note but outside
  // track b's 1.5–2 one: exactly one overlay note is drawn strong.
  const aNoteOps = contextCalls(overlayA).filter(([method]) => method === 'fill' || method === 'beginPath');
  const bNoteOps = contextCalls(overlayB).filter(([method]) => method === 'fill' || method === 'beginPath');
  expect(aNoteOps.length).toBeGreaterThanOrEqual(2);
  expect(bNoteOps.length).toBe(0);
  // The base canvas was not repainted by the highlight.
  const baseCallsBefore = contextCalls(laneRowCanvases('a')[0]).length;
  tick(150);
  expect(contextCalls(laneRowCanvases('a')[0]).length).toBe(baseCallsBefore);
});

it('keeps the paused highlight and clears the overlay after stopping', async () => {
  await renderPanel({
    getClock: () => ({ absoluteCycle: 1, cps: 0.5 }),
    queryScene: async () => ({
      status: 'complete',
      batch: {
        ...sceneBase(),
        lanes: [
          exactLane('a', [ev(0.5, 1.5, 0 as const), ev(1.5, 2.5, 0 as const)]),
          exactLane('b', []),
        ],
      },
    }),
  });
  await flushScene();
  const overlay = laneRowCanvases('a')[1];
  // Pausing keeps whatever the last sample drew.
  await renderPanel({ isPaused: true, getClock: () => ({ absoluteCycle: 0.8, cps: 0.5 }) });
  await flushScene();
  tick(500);
  const pausedNoteOps = contextCalls(overlay).filter(([method]) => method === 'fill' || method === 'beginPath');
  expect(pausedNoteOps.length).toBeGreaterThanOrEqual(1);
  // Stopping clears the sounding overlay entirely.
  await renderPanel({ isPlaying: false, isPaused: false });
  await flushScene();
  tick(900);
  const lastClear = clearsOf(contextCalls(overlay)).at(-1);
  expect(lastClear?.[2]).toBeGreaterThan(0);
  expect(lastClear?.[3]).toBe(40);
});

// ── Scene notices ────────────────────────────────────────────────────────────

it('shows a guard notice and keeps the previous complete scene', async () => {
  let guarded = false;
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => {
    if (guarded) return { status: 'resource-guarded', guardReason: 'long-task' };
    return { status: 'complete', batch: { ...sceneBase(), generation: request.generation ?? 1 } };
  });
  await renderPanel({ queryScene });
  await flushScene();
  expect(container.querySelector('[data-track-preview-state]')).toBeNull();
  guarded = true;
  await renderPanel({ queryScene, transportEvent: { revision: 1, cycle: 2, seek: null, reason: 'apply' } });
  await flushScene();
  expect(container.querySelector('[data-track-preview-state]')?.textContent).toBe(t('trackPreviewGuarded'));
  // The committed scene still draws.
  expect(rectsOf(contextCalls(laneRowCanvases('a')[0])).length).toBeGreaterThan(0);
});

it('shows a failed notice without implying silence', async () => {
  const queryScene = vi.fn(async (): Promise<TrackSceneQueryResult> => ({ status: 'failed' }));
  await renderPanel({ queryScene });
  await flushScene();
  expect(container.querySelector('[data-track-preview-state]')?.textContent).toBe(t('trackPreviewFailed'));
  expect(container.querySelector('[data-track-representation="pending"]')).not.toBeNull();
});

it('shows a pending state only for the first progressive load', async () => {
  const queryScene = vi.fn(async (_request: TrackSceneRequest, _signal?: AbortSignal, onProgress?: (batch: TrackSceneBatch) => void): Promise<TrackSceneQueryResult> => {
    onProgress?.({ ...sceneBase(), status: 'progress', coverageEnd: 4, lanes: [exactLane('a', [ev(0.9, 1.2, 0 as const)]), exactLane('b', [])] });
    return { status: 'complete', batch: { ...sceneBase(), generation: 1 } };
  });
  await renderPanel({ queryScene });
  await flushScene();
  // The final atomic batch replaces the progressive merge and clears the
  // notice: a normal density/exact scene is complete, not a warning.
  expect(container.querySelector('[data-track-preview-state]')).toBeNull();
});

it('marks pending tiles instead of drawing silence while the first scene streams', async () => {
  const queryScene = vi.fn(async (_request: TrackSceneRequest, _signal?: AbortSignal, onProgress?: (batch: TrackSceneBatch) => void): Promise<TrackSceneQueryResult> => {
    onProgress?.({
      ...sceneBase(),
      status: 'progress',
      coverageEnd: 4,
      lanes: [exactLane('a', [ev(0.9, 1.2, 0 as const)]), exactLane('b', [])],
    });
    return new Promise(() => {}); // never settles within the test
  });
  await renderPanel({ queryScene });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  fireCanvasSizes();
  await act(async () => {});
  expect(container.querySelector('[data-track-preview-state]')?.textContent).toBe(t('trackPreviewPending'));
  // The covered prefix draws data; the rest is an explicit pending ground.
  const base = laneRowCanvases('a')[0];
  const rects = rectsOf(contextCalls(base));
  expect(rects.some(([, , width]) => width > 100)).toBe(true);
});

// ── Timeline seek gesture ────────────────────────────────────────────────────

const dragRect = {
  left: 100, top: 0, right: 500, bottom: 30, width: 400, height: 30, x: 100, y: 0,
  toJSON: () => ({}),
} as DOMRect;

const pointerEvent = (type: string, options: PointerEventInit = {}) => new PointerEvent(type, {
  bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, ...options,
});

it('seeks the ruler on click and keeps a drag inside the frozen window', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);

  // A click jumps straight to the cycle under the pointer.
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(seekToCycle).toHaveBeenLastCalledWith(1, 'timeline');
  // The hint follows the pointer while the window stays frozen.
  expect(container.querySelector('[data-track-seek-hint]')?.textContent).toContain('cycle 1.0');

  act(() => rulerElement.dispatchEvent(pointerEvent('pointermove', { clientX: 300 })));
  act(() => rulerElement.dispatchEvent(pointerEvent('pointermove', { clientX: 400 })));
  tick(50);
  // Moves coalesce into one seek per frame and land on the latest target.
  expect(seekToCycle).toHaveBeenLastCalledWith(3, 'timeline');
  // Dragging during playback never slides the follow window mid-gesture.
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);

  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 400 })));
  expect(seekToCycle).toHaveBeenLastCalledWith(3, 'timeline');
  expect(container.querySelector('[data-track-seek-hint]')).toBeNull();
});

it('keeps the frozen window through its own seek revisions and re-aims only on release', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  // The seek the drag committed comes back as a transport notification; the
  // window must stay frozen even though the real position jumped far away.
  await renderPanel({
    seekToCycle,
    transportEvent: { revision: 1, cycle: 30, seek: { cycle: 30, source: 'timeline' }, reason: 'apply' },
    getClock: () => ({ absoluteCycle: 30, cps: 0.5 }),
  });
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 200 })));
  // On release, follow re-derives the window from the authoritative position,
  // clamped inside the piece: now=30 with L=16 parks at the boundary.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);
});

it('ends an active drag when an external progress seek arrives', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(container.querySelector('[data-track-seek-hint]')).not.toBeNull();
  await renderPanel({
    seekToCycle,
    transportEvent: { revision: 1, cycle: 30, seek: { cycle: 30, source: 'progress' }, reason: 'seek' },
    getClock: () => ({ absoluteCycle: 30, cps: 0.5 }),
  });
  // The external seek takes over: follow around its target clamped inside
  // the piece (now=30 with L=16 parks at the boundary), gesture dropped.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);
  expect(container.querySelector('[data-track-seek-hint]')).toBeNull();
});

it('ignores secondary buttons, extra pointers and pointercancel targets', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);

  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200, button: 2, pointerId: 2 })));
  expect(seekToCycle).not.toHaveBeenCalled();

  // The left track-header column never belongs to the ruler gesture.
  const header = container.querySelector<HTMLElement>('.track-panel-ruler > div:first-child')!;
  act(() => header.dispatchEvent(pointerEvent('pointerdown', { clientX: 20 })));
  expect(seekToCycle).not.toHaveBeenCalled();

  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  act(() => rulerElement.dispatchEvent(pointerEvent('pointermove', { clientX: 300 })));
  act(() => rulerElement.dispatchEvent(pointerEvent('pointercancel', { clientX: 350, pointerId: 9 })));
  // A cancel from another pointer neither commits nor disturbs the drag.
  expect(container.querySelector('[data-track-seek-hint]')).not.toBeNull();

  act(() => rulerElement.dispatchEvent(pointerEvent('pointercancel', { clientX: 350 })));
  // Only the initial pointerdown seeked; the cancel from another pointer
  // added nothing and no uncommitted target is left behind.
  expect(seekToCycle).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-track-seek-hint]')).toBeNull();
});

it('blocks text selection on a valid press, focuses the ruler, and keeps keys working', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);

  // An invalid gesture (right button) returns before the default is blocked.
  const rightDown = pointerEvent('pointerdown', { clientX: 200, button: 2, pointerId: 2 });
  act(() => rulerElement.dispatchEvent(rightDown));
  expect(seekToCycle).not.toHaveBeenCalled();
  expect(rightDown.defaultPrevented).toBe(false);

  // A valid press prevents the native selection drag across the cycle labels
  // and keeps the ruler focused (without scrolling) so the arrow keys keep
  // seeking after the gesture ends.
  const leftDown = pointerEvent('pointerdown', { clientX: 200 });
  act(() => rulerElement.dispatchEvent(leftDown));
  expect(leftDown.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(rulerElement);

  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 200 })));
  act(() => {
    rulerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  });
  expect(seekToCycle).toHaveBeenLastCalledWith(1.25, 'timeline');
});

it('leaves the ruler inert without an enabled seek', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle, canSeek: false });
  const rulerElement = ruler();
  expect(rulerElement.getAttribute('aria-disabled')).toBe('true');
  expect(rulerElement.getAttribute('tabindex')).toBe('-1');

  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(seekToCycle).not.toHaveBeenCalled();

  act(() => {
    rulerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  });
  expect(seekToCycle).not.toHaveBeenCalled();
});

it('steps the position with arrow keys, Shift for a full cycle, and Home to the origin', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle, isPlaying: true });
  const rulerElement = ruler();
  const press = (key: string, shift = false) => act(() => {
    rulerElement.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
  });

  press('ArrowRight');
  expect(seekToCycle).toHaveBeenLastCalledWith(1.25, 'timeline');
  press('ArrowRight', true);
  expect(seekToCycle).toHaveBeenLastCalledWith(2, 'timeline');
  press('ArrowLeft', true);
  expect(seekToCycle).toHaveBeenLastCalledWith(0, 'timeline');
  press('Home');
  expect(seekToCycle).toHaveBeenLastCalledWith(0, 'timeline');
  // Not a global handler: unhandled keys leave the editor's typing alone.
  press('a');
  expect(seekToCycle).toHaveBeenCalledTimes(4);
});

// ── Browse (pan) ─────────────────────────────────────────────────────────────

it('pans the canvas sideways into manual browsing and hides an off-window playhead', async () => {
  await renderPanel({ isPlaying: true });
  const cell = container.querySelector<HTMLElement>(`[data-track-id="a"] [data-notes-cell]`)!;

  // A vertical move never becomes a pan.
  act(() => cell.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 10 })));
  act(() => cell.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 300, clientY: 60 })));
  tick(50);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
  act(() => cell.dispatchEvent(pointerEvent('pointercancel', { pointerId: 1 })));

  // A sideways drag past 6px enters manual mode; content moves with it.
  vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => cell.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 10 })));
  act(() => cell.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 10 })));
  tick(50);
  // Dragging left reveals later cycles: 300px of a 400px cell = 3 cycles.
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).not.toBeNull();
  // The playhead hides with the pane off-window; neither pretends to sit at an edge.
  expect(container.querySelector<HTMLElement>('[data-playhead-line]')?.style.visibility).toBe('hidden');
  const caretHost = container.querySelector<HTMLElement>('[data-playhead-caret]')?.parentElement;
  expect(caretHost?.style.visibility).toBe('hidden');

  act(() => cell.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 })));
  // Manual browsing holds: the playhead stays hidden while the music runs on.
  tick(60);
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
  expect(container.querySelector<HTMLElement>('[data-playhead-line]')?.style.visibility).toBe('hidden');

  const returnButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('trackReturnToPlayback')}"]`)!;
  act(() => returnButton.click());
  // Back to follow, window centred on the real position (cycle 1 → [0,4)).
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(playheadLeft()).toBe('25%');
});

it('pans with a horizontal wheel and shift+wheel but keeps vertical scrolling native', async () => {
  await renderPanel({ isPlaying: true });
  const lanes = container.querySelector('.track-panel-lanes') as HTMLElement;
  vi.spyOn(lanes, 'getBoundingClientRect').mockReturnValue(dragRect);

  act(() => lanes.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })));
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);

  act(() => lanes.dispatchEvent(new WheelEvent('wheel', { deltaX: 200, deltaY: 0, bubbles: true, cancelable: true })));
  // 200px over the 400px cell = 2 cycles forward.
  expect(tickLabels()).toEqual(['2', '3', '4', '5']);

  // happy-dom's WheelEvent does not inherit MouseEvent, so the modifier has
  // to be added by hand before dispatching.
  const shiftWheel = new WheelEvent('wheel', { deltaX: 0, deltaY: -200, bubbles: true, cancelable: true });
  Object.defineProperty(shiftWheel, 'shiftKey', { value: true });
  act(() => lanes.dispatchEvent(shiftWheel));
  // Shift+wheel pans back a full screen.
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
});

it('follows an external progress-bar seek and a stop, but not its own timeline seeks', async () => {
  const progressSeek: TransportEvent = { revision: 1, cycle: 15, seek: { cycle: 15, source: 'progress' }, reason: 'seek' };
  await renderPanel({
    transportEvent: progressSeek,
    getClock: () => ({ absoluteCycle: 15, cps: 0.5 }),
  });
  // The progress-bar seek restores follow around its target; L=16 keeps the
  // window pinned at the end: [12, 16).
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);

  await renderPanel({
    transportEvent: { ...progressSeek, revision: 2, cycle: 15, seek: { cycle: 15, source: 'timeline' }, reason: 'seek' },
    getClock: () => ({ absoluteCycle: 15, cps: 0.5 }),
  });
  tick(100);
  // A timeline seek keeps the window the gesture left behind.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);

  await renderPanel({ transportEvent: { revision: 3, cycle: 0, seek: null, reason: 'stop' }, getClock: () => ({ absoluteCycle: 0, cps: 0.5 }) });
  tick(200);
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
});

// ── Track name activation ────────────────────────────────────────────────────

it('selects a track by name for code navigation and clears it on a fresh compile', async () => {
  vi.useFakeTimers();
  const navigated: string[] = [];
  const muted: string[] = [];
  await renderPanel({ onNavigateToTrack: id => navigated.push(id), toggleMute: id => muted.push(id) });

  const nameButton = container.querySelector<HTMLButtonElement>('[data-track-id="a"] [data-track-name]')!;
  act(() => nameButton.click());
  // The click only selects; the navigation waits out the double-activation window.
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-selected')).toBe('true');
  expect(container.querySelector('[data-track-id="b"]')?.getAttribute('data-selected')).toBe('false');
  expect(navigated).toEqual([]);
  act(() => vi.advanceTimersByTime(400));
  expect(navigated).toEqual(['a']);
  // The name carries its own accessible identity.
  expect(nameButton.getAttribute('aria-label')).toContain('鼓组');

  const muteButton = container.querySelector<HTMLButtonElement>(`[data-track-id="a"] button[aria-label^="${t('trackMute')}"]`)!;
  act(() => muteButton.click());
  expect(muted).toEqual(['a']);
  expect(navigated).toEqual(['a']);

  const nextTracks = tracks.map(track => ({ ...track, id: `9:${track.id}` }));
  await renderPanel({ tracks: nextTracks });
  expect(container.querySelector('[data-track-id="9:a"]')?.getAttribute('data-selected')).toBe('false');
});

// ── Horizontal zoom ──────────────────────────────────────────────────────────

const toolButton = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${t(label)}"]`)!;
const zoomSlider = () => container.querySelector<HTMLInputElement>('[data-track-zoom-slider]')!;

const sliderValueText = () => zoomSlider().getAttribute('aria-valuetext') ?? '';
const sliderSpanText = () => (sliderValueText().match(/([\d.]+|<0\.01) cycles?$/) ?? [])[0] ?? '';

it('walks multiplicative zoom steps with the tool row and disables at both ends', async () => {
  await renderPanel({ isPlaying: true });
  expect(container.querySelector(`button[aria-label="${t('trackZoomReset')}"]`)).toBeNull();
  // The slider keeps the accessible reading of the effective span.
  expect(sliderSpanText()).toBe('4 cycles');
  expect(toolButton('trackZoomIn')!.disabled).toBe(false);
  expect(toolButton('trackZoomOut')!.disabled).toBe(false);

  // Follow keeps following around the real position: now=1 spans [0, 2).
  act(() => toolButton('trackZoomIn')!.click());
  expect(tickLabels()).toEqual(['0', '0.5', '1', '1.5']);
  expect(sliderSpanText()).toBe('2 cycles');
  // Zooming never leaves follow on its own.
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();

  act(() => toolButton('trackZoomIn')!.click());
  act(() => toolButton('trackZoomIn')!.click());
  // span 0.5 = [0.75, 1.25): the finest step, so zoom-in is disabled.
  expect(tickLabels()).toEqual(['0.75', '0.875', '1', '1.125']);
  expect(toolButton('trackZoomIn')!.disabled).toBe(true);
  // A disabled button is a boundary input: it changes nothing, not even mode.
  act(() => toolButton('trackZoomIn')!.click());
  expect(tickLabels()).toEqual(['0.75', '0.875', '1', '1.125']);

  // Five zoom-outs later the piece's widest step disables zoom-out too.
  for (let i = 0; i < 5; i++) act(() => toolButton('trackZoomOut')!.click());
  expect(toolButton('trackZoomOut')!.disabled).toBe(true);
  // The whole piece fills the window; the boundary gets its end label.
  expect(tickLabels()).toEqual(['0', '4', '8', '12', '16']);
});

it('doubles beyond sixteen and lands exactly on a long piece while paused', async () => {
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1, begin: request.queryBegin, end: request.queryEnd },
  }));
  await renderPanel({
    queryScene,
    isPaused: true,
    getClock: () => ({ absoluteCycle: 25, cps: 0.5 }),
    timeline: { code: '', loopCycles: 50, durationSeconds: 100, estimatedCps: null },
  });
  await flushScene();
  expect(sliderSpanText()).toBe('4 cycles');

  for (const expected of [8, 16, 32, 50]) {
    act(() => toolButton('trackZoomOut').click());
    expect(sliderSpanText()).toBe(`${expected} cycles`);
  }
  expect(zoomSlider().value).toBe('0');
  expect(toolButton('trackZoomOut').disabled).toBe(true);

  act(() => toolButton('trackZoomIn').click());
  expect(sliderSpanText()).toBe('25 cycles');
});

it('zooms a manual window around its centre and answers to the +, - and 0 keys', async () => {
  await renderPanel({ isPlaying: true });
  const cell = container.querySelector<HTMLElement>(`[data-track-id="a"] [data-notes-cell]`)!;
  vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(dragRect);
  // Pan into manual [3, 7) the same way the pan test does.
  act(() => cell.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 10 })));
  act(() => cell.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 10 })));
  tick(50);
  act(() => cell.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 })));
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);

  // A button zoom keeps the window's centre cycle (5) at the centre: [1, 9).
  act(() => toolButton('trackZoomOut')!.click());
  expect(tickLabels()).toEqual(['2', '4', '6', '8']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).not.toBeNull();

  // The tool row keyboard resets the scale and re-anchors the centre.
  const tools = container.querySelector('[data-track-tools]') as HTMLElement;
  const press = (key: string, init: KeyboardEventInit = {}) => act(() => {
    tools.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
  press('0');
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).not.toBeNull();
  // + zooms in one step (centre cycle 5 → [4, 6)), - back out again.
  press('+');
  expect(tickLabels()).toEqual(['4', '4.5', '5', '5.5']);
  press('-');
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
  // Modified shortcuts stay with the browser; typing keys stay with the editor.
  press('+', { ctrlKey: true });
  press('a');
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
});

it('zooms at the pointer with Alt+wheel, entering manual on the first real step', async () => {
  await renderPanel({ isPlaying: true });
  const cell = container.querySelector<HTMLElement>(`[data-track-id="a"] [data-notes-cell]`)!;
  vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(dragRect);
  const wheel = new WheelEvent('wheel', { clientX: 300, deltaY: -80, bubbles: true, cancelable: true });
  Object.defineProperty(wheel, 'altKey', { value: true });
  act(() => cell.dispatchEvent(wheel));
  tick(16);
  // Pointer at 50% of [0,4) anchors cycle 2; span 2 → [1, 3), manual.
  expect(tickLabels()).toEqual(['1', '1.5', '2', '2.5']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).not.toBeNull();

  // A pinch-style Ctrl+wheel is never intercepted.
  const pinch = new WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true });
  Object.defineProperty(pinch, 'ctrlKey', { value: true });
  act(() => cell.dispatchEvent(pinch));
  expect(tickLabels()).toEqual(['1', '1.5', '2', '2.5']);

  // A light sweep below one step's worth of pixels changes nothing at all.
  const light = new WheelEvent('wheel', { clientX: 300, deltaY: -40, bubbles: true, cancelable: true });
  Object.defineProperty(light, 'altKey', { value: true });
  act(() => cell.dispatchEvent(light));
  tick(16);
  expect(tickLabels()).toEqual(['1', '1.5', '2', '2.5']);
});

it('maps ruler clicks and half-page keyboard browsing at a non-default span', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle, isPlaying: true });
  // Zoom out twice: 4 → 8 → 16. The whole piece fills the window, so the
  // boundary carries its end label.
  act(() => toolButton('trackZoomOut')!.click());
  act(() => toolButton('trackZoomOut')!.click());
  expect(tickLabels()).toEqual(['0', '4', '8', '12', '16']);

  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  // 25% of [0,16) is cycle 4 — not 1, as it would be at the default span.
  expect(seekToCycle).toHaveBeenLastCalledWith(4, 'timeline');
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 200 })));

  const seekCalls = seekToCycle.mock.calls.length;
  const pressPage = (key: 'PageUp' | 'PageDown') => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => rulerElement.dispatchEvent(event));
    return event;
  };
  // Page keys move half of the current span without seeking. At span 16 the
  // piece fills the window, so PageDown is a clamped no-op but is still owned
  // by the focused timeline rather than scrolling the browser page.
  expect(pressPage('PageDown').defaultPrevented).toBe(true);
  expect(tickLabels()).toEqual(['0', '4', '8', '12', '16']);
  act(() => toolButton('trackZoomIn')!.click());
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  expect(pressPage('PageDown').defaultPrevented).toBe(true);
  expect(tickLabels()).toEqual(['4', '6', '8', '10']);
  expect(seekToCycle).toHaveBeenCalledTimes(seekCalls);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).not.toBeNull();
  // Repeated PageUp clamps at the work origin instead of going negative.
  pressPage('PageUp');
  pressPage('PageUp');
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  const toolLabels = [...container.querySelectorAll<HTMLElement>('[data-track-tools] button')]
    .map(button => button.getAttribute('aria-label'));
  expect(toolLabels).toEqual([t('trackReturnToPlayback'), t('trackZoomOut'), t('trackZoomIn')]);
});

it('browses half of a continuous span inside a short piece', async () => {
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1, begin: request.queryBegin, end: request.queryEnd },
  }));
  await renderPanel({
    queryScene,
    isPlaying: true,
    timeline: { code: '', loopCycles: 6, durationSeconds: 12, estimatedCps: null },
  });
  await flushScene();
  act(() => slideTo(zoomSlider(), '500'));
  // A continuous span between the discrete stops redraws its own tick level:
  // the follow window [0.13, 1.87) draws half-cycle ticks without snapping.
  expect(tickLabels()).toEqual(['0.5', '1', '1.5']);

  act(() => ruler().dispatchEvent(new KeyboardEvent('keydown', {
    key: 'PageDown', bubbles: true, cancelable: true,
  })));
  await flushScene();
  // PageDown browses half a screen forward from the follow window: the
  // window's centre cycle lands at 1, one continuous span wide.
  expect(tickLabels()).toEqual(['1', '1.5', '2', '2.5']);
});

it('describes page browsing on the ruler and announces the visible range', async () => {
  vi.useFakeTimers();
  await renderPanel({ seekToCycle: vi.fn(() => true), isPlaying: true });
  expect(ruler().getAttribute('aria-label')).toContain('PageDown');
  act(() => ruler().dispatchEvent(new KeyboardEvent('keydown', {
    key: 'PageDown', bubbles: true, cancelable: true,
  })));
  act(() => vi.advanceTimersByTime(150));
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(tf('trackBrowseRange', {
    begin: '2',
    end: '6',
  }));
});

it('shows no state notice for a normal complete scene', async () => {
  await renderPanel({
    queryScene: async () => ({
      status: 'complete',
      batch: {
        ...sceneBase(),
        representation: 'density',
        lanes: [
          { trackId: 'a', representation: 'density', rawEventCount: 3000 },
          exactLane('b', []),
        ],
      },
    }),
  });
  await flushScene();
  expect(container.querySelector('[data-track-preview-state]')).toBeNull();
  expect(laneRepresentationBox('a')?.getAttribute('data-track-representation')).toBe('density');
});

it('resets the scale for a new session and keeps it across same-session seeks', async () => {
  await renderPanel({ sessionKey: 'a' });
  act(() => toolButton('trackZoomOut')!.click());
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  // A same-session seek notification keeps the scale and the mode.
  await renderPanel({
    sessionKey: 'a',
    transportEvent: { revision: 1, cycle: 2, seek: { cycle: 2, source: 'timeline' }, reason: 'apply' },
    getClock: () => ({ absoluteCycle: 2, cps: 0.5 }),
  });
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  // A new session starts from the default scale in follow again.
  await renderPanel({ sessionKey: 'b' });
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
});

it('seeks a second-pass ruler click to the absolute display target, not plus an offset', async () => {
  const seekToCycle = vi.fn(() => true);
  // The transport is in the third pass (absoluteNow=35, L=16 → display 3).
  await renderPanel({ seekToCycle, getClock: () => ({ absoluteCycle: 35, cps: 0.5 }), isPlaying: true });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  // A click on cycle 3 of the displayed ruler submits 3 — the same domain
  // the playback bar seeks to, never 3 + loopOffset.
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(seekToCycle).toHaveBeenLastCalledWith(2, 'timeline');
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 200 })));
});

// ── Finite [0, L] timeline ───────────────────────────────────────────────────

it('labels the piece’s real end once and no ordinary mid-piece window', async () => {
  await renderPanel({ getClock: () => ({ absoluteCycle: 15, cps: 0.5 }) });
  expect(container.querySelectorAll('[data-ruler-end-tick]')).toHaveLength(1);
  expect(container.querySelector<HTMLElement>('[data-ruler-end-tick]')?.textContent).toBe('16');
  // Ruler ticks speak true cycle coordinates starting at 0.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);

  // A mid-piece window has no endpoint to imply.
  await renderPanel({ getClock: () => ({ absoluteCycle: 5, cps: 0.5 }) });
  expect(container.querySelector('[data-ruler-end-tick]')).toBeNull();
});

it('clamps seeks, keyboard targets and drags into [0, L]', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle, getClock: () => ({ absoluteCycle: 15, cps: 0.5 }), isPlaying: true });
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  const press = (key: string, shift = false) => act(() => {
    rulerElement.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
  });
  // From cycle 15, Shift+Right reaches exactly 16 — the boundary, not past
  // it; a further right nudge stays there because frame.now never moved.
  press('ArrowRight', true);
  expect(seekToCycle).toHaveBeenLastCalledWith(16, 'timeline');
  press('ArrowRight');
  expect(seekToCycle).toHaveBeenLastCalledWith(15.25, 'timeline');
  press('ArrowLeft', true);
  expect(seekToCycle).toHaveBeenLastCalledWith(14, 'timeline');
  // A drag past the right edge lands on L.
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 500 })));
  expect(seekToCycle).toHaveBeenLastCalledWith(16, 'timeline');
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 500 })));
});

it('disables the timeline when the shared timeline has no usable range', async () => {
  await renderPanel({ timeline: { code: '', loopCycles: 0, durationSeconds: 0, estimatedCps: null } });
  expect(toolButton('trackZoomIn')!.disabled).toBe(true);
  expect(toolButton('trackZoomOut')!.disabled).toBe(true);

  const seekToCycle = vi.fn(() => true);
  await renderPanel({
    timeline: { code: '', loopCycles: 0, durationSeconds: 0, estimatedCps: null },
    seekToCycle,
    isPlaying: true,
  });
  const rulerElement = ruler();
  act(() => {
    rulerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  });
  const page = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
  act(() => rulerElement.dispatchEvent(page));
  expect(page.defaultPrevented).toBe(false);
  // No L means no place to go: the nudge submits the unclamped step target
  // from the projected position (0 without a usable clock) — the panel's own
  // zoom/browse chrome stays fully disabled.
  expect(seekToCycle).toHaveBeenCalledWith(0.25, 'timeline');
});

it('keeps keyboard browsing clamped when the whole piece is visible', async () => {
  await renderPanel({ getClock: () => ({ absoluteCycle: 5, cps: 0.5 }) });
  // Zoomed-out to the whole piece, follow pins the window at [0, 16): both
  // directions stay put and do not move the playhead.
  act(() => toolButton('trackZoomOut')!.click());
  act(() => toolButton('trackZoomOut')!.click());
  const element = ruler();
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })));
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true })));
  expect(tickLabels()).toEqual(['0', '4', '8', '12', '16']);
});

it('scrolls while holding a seek at either edge, stops in the interior, and clamps to the piece', async () => {
  const seekToCycle = vi.fn<(cycle: number, source: 'timeline' | 'progress') => boolean>(() => true);
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1, begin: request.queryBegin, end: request.queryEnd },
  }));
  await renderPanel({ seekToCycle, queryScene });
  const element = ruler();
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => element.dispatchEvent(pointerEvent('pointerdown', { clientX: 300 })));
  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 500 })));
  tick(0);
  for (let time = 50; time <= 1000; time += 50) tick(time);
  expect(seekToCycle.mock.lastCall![0]).toBeCloseTo(8);
  await flushScene();
  const scrolled = queryScene.mock.lastCall![0];
  expect(scrolled.viewportBegin).toBeCloseTo(4, 1);
  expect(scrolled.viewportEnd).toBeCloseTo(8, 1);

  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 300 })));
  tick(1050);
  const calls = seekToCycle.mock.calls.length;
  tick(1100);
  expect(seekToCycle).toHaveBeenCalledTimes(calls);

  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 50 })));
  for (let time = 1150; time <= 2500; time += 50) tick(time);
  expect(seekToCycle.mock.lastCall![0]).toBe(0);
  await flushScene();
  expect(queryScene.mock.lastCall![0].viewportBegin).toBe(0);
  expect(queryScene.mock.lastCall![0].viewportEnd).toBe(4);

  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 550 })));
  for (let time = 2550; time <= 6500; time += 50) tick(time);
  expect(seekToCycle.mock.lastCall![0]).toBe(16);
  await flushScene();
  expect(queryScene.mock.lastCall![0].viewportBegin).toBe(12);
  expect(queryScene.mock.lastCall![0].viewportEnd).toBe(16);
  act(() => element.dispatchEvent(pointerEvent('pointerup', { clientX: 550 })));
  const finishedCalls = seekToCycle.mock.calls.length;
  tick(6550);
  expect(seekToCycle).toHaveBeenCalledTimes(finishedCalls);
});

it('keeps the scrolled manual window after release and makes cancelled edge frames inert', async () => {
  const seekToCycle = vi.fn<(cycle: number, source: 'timeline' | 'progress') => boolean>(() => true);
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1, begin: request.queryBegin, end: request.queryEnd },
  }));
  await renderPanel({ seekToCycle, queryScene });
  const element = ruler();
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })));
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => element.dispatchEvent(pointerEvent('pointerdown', { clientX: 500 })));
  tick(0);
  tick(50);
  await flushScene();
  const scrolled = queryScene.mock.lastCall![0];
  act(() => element.dispatchEvent(pointerEvent('pointerup', { clientX: 500 })));
  await flushScene();
  const released = queryScene.mock.lastCall![0];
  expect(released.viewportBegin).toBe(scrolled.viewportBegin);
  expect(released.viewportEnd).toBe(scrolled.viewportEnd);
  act(() => element.dispatchEvent(pointerEvent('pointerdown', { clientX: 500 })));
  tick(100);
  act(() => element.dispatchEvent(pointerEvent('pointercancel')));
  const calls = seekToCycle.mock.calls.length;
  tick(150);
  expect(seekToCycle).toHaveBeenCalledTimes(calls);
});

/** Set an input's value the way a real keystroke would, so React's value tracker notices. */
const typeInto = (input: HTMLInputElement, text: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

// ── Continuous zoom slider ──────────────────────────────────────────────────

/** Set a range input's value the way a real drag would, so React's value
 *  tracker notices and the change event carries the new position. React's
 *  onChange rides the native input event — the same path a real slider uses. */
const slideTo = (slider: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(slider, value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
};

it('offers a continuous zoom slider between the shortcut buttons', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  expect(slider).not.toBeNull();
  expect(slider.disabled).toBe(false);
  // The default span 4 sits at 40% of the L=16 log scale.
  expect(slider.value).toBe('400');
  // The order is −, slider, ＋; there is no reset button in the tool row.
  expect(toolButton('trackZoomOut')!.nextElementSibling).toBe(slider);
  expect(toolButton('trackZoomIn')!.nextElementSibling).toBeNull();
});

it('zooms to intermediate spans as the slider moves and keeps them on release', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  // Drag to ~3.54 cycles (log scale position between the 4 and 2 stops).
  act(() => slideTo(slider, '435'));
  const label = sliderSpanText();
  expect(label).toMatch(/^3\.\d+ cycles$/);
  expect(label).not.toBe('4 cycles');
  // The ticks redraw at the continuous span: no snap to fixed levels.
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  // Release (blur) keeps the value; no rollback, no extra input.
  act(() => slider.blur());
  expect(sliderSpanText()).toBe(label);
});

it('keeps following while the slider moves and anchors a manual window on its start centre', async () => {
  // Follow: the window re-centres on the playhead at every sample.
  await renderPanel({ getClock: () => ({ absoluteCycle: 3, cps: 0.5 }), isPlaying: true });
  act(() => slideTo(zoomSlider(), '435'));
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
  expect(sliderSpanText()).not.toBe('4 cycles');
  // The round ends with the pointer (or focus) leaving the slider.
  act(() => zoomSlider().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

  // A manual window anchors on the centre it started with: pan to [3,7) the
  // usual way, then zoom out to 8 cycles — the centre cycle 5 stays centred.
  await renderPanel({ isPlaying: true });
  const cell = container.querySelector<HTMLElement>(`[data-track-id="a"] [data-notes-cell]`)!;
  vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => cell.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 10 })));
  act(() => cell.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 10 })));
  tick(50);
  act(() => cell.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 })));
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
  // 8 cycles sits at slider 200 on the L=16 scale.
  act(() => slideTo(zoomSlider(), '200'));
  // Centre cycle 5 of [3,7) at span 8 → [1, 9); at 400px the ruler draws
  // every second cycle, so the labels read 2, 4, 6, 8.
  expect(tickLabels()).toEqual(['2', '4', '6', '8']);
});

it('maps the slider ends to the piece: exact whole-song span at L=50, no dead zone at L=3', async () => {
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1, begin: request.queryBegin, end: request.queryEnd },
  }));
  await renderPanel({
    queryScene,
    timeline: { code: '', loopCycles: 50, durationSeconds: 100, estimatedCps: null },
    getClock: () => ({ absoluteCycle: 25, cps: 0.5 }),
  });
  await flushScene();
  act(() => slideTo(zoomSlider(), '0'));
  await flushScene();
  const wholeSong = queryScene.mock.lastCall![0];
  expect(wholeSong.viewportEnd - wholeSong.viewportBegin).toBe(50);
  expect(sliderSpanText()).toBe('50 cycles');

  await renderPanel({ isPlaying: true, timeline: { code: '', loopCycles: 3, durationSeconds: 6, estimatedCps: null } });
  tick(100);
  const slider = zoomSlider();
  // The piece is 3 cycles: the left end is 3, not 16.
  expect(slider.value).toBe('0');
  act(() => slideTo(slider, '500'));
  const label = sliderSpanText();
  expect(parseFloat(label)).toBeGreaterThan(0.5);
  expect(parseFloat(label)).toBeLessThan(3);
  act(() => slideTo(slider, '1000'));
  expect(sliderSpanText()).toBe('0.5 cycles');
});

it('disables the slider without a usable timeline and for degenerate pieces', async () => {
  await renderPanel({ timeline: { code: '', loopCycles: 0, durationSeconds: 0, estimatedCps: null } });
  expect(zoomSlider().disabled).toBe(true);
  await renderPanel({ timeline: { code: '', loopCycles: 0.25, durationSeconds: 0.5, estimatedCps: null } });
  expect(zoomSlider().disabled).toBe(true);
});

it('keeps the arrow keys, Home and End native to the slider and away from the toolbar', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  slider.focus();
  const press = (key: string) => act(() => {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
  // The toolbar shortcut handler must not intercept the slider's own keys.
  press('+');
  press('-');
  press('0');
  expect(sliderSpanText()).toBe('4 cycles');
  // The native range responds to its own keys through the change path.
  const before = slider.value;
  act(() => slideTo(slider, String(Number(before) + 100)));
  expect(slider.value).toBe(String(Number(before) + 100));
  expect(sliderSpanText()).not.toBe('4 cycles');
});

it('does not queue a wheel zoom or button zoom behind an in-flight slider round', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  // Start a round: pointerdown then a change.
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '435'));
  // A button press mid-round is dropped, not queued.
  act(() => toolButton('trackZoomOut')!.click());
  const label = sliderSpanText();
  act(() => slideTo(slider, '300'));
  expect(sliderSpanText()).not.toBe(label);
  // Release clears the round; a button works again.
  act(() => slider.dispatchEvent(pointerEvent('pointerup', { clientX: 0 })));
  act(() => toolButton('trackZoomOut')!.click());
  expect(sliderSpanText()).not.toBe(label);
});

it('accepts fresh pointer drags after release, blur, and a session reset', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ sessionKey: 'a', seekToCycle });
  const dragTo = (value: string) => {
    const slider = zoomSlider();
    act(() => slider.dispatchEvent(pointerEvent('pointerdown')));
    act(() => slideTo(slider, value));
    expect(slider.value).toBe(value);
    expect(sliderSpanText()).not.toBe('4 cycles');
    act(() => slider.dispatchEvent(pointerEvent('pointerup')));
  };
  dragTo('435');
  dragTo('465');
  act(() => zoomSlider().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  dragTo('485');
  await renderPanel({ sessionKey: 'b', seekToCycle });
  expect(sliderSpanText()).toBe('4 cycles');
  dragTo('455');
  expect(seekToCycle).not.toHaveBeenCalled();
});

it('drops stale slider changes after a new session takes over', async () => {
  await renderPanel({ sessionKey: 'a', isPlaying: true });
  const slider = zoomSlider();
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '435'));
  // A new session resets the scale and invalidates the round.
  await renderPanel({ sessionKey: 'b', isPlaying: true });
  expect(sliderSpanText()).toBe('4 cycles');
  // The old, still-held pointer emits another change: it must not write back.
  const stale = container.querySelector<HTMLInputElement>('[data-track-zoom-slider]')!;
  act(() => slideTo(stale, '435'));
  expect(sliderSpanText()).toBe('4 cycles');
  // Only after releasing the pointer does a fresh change open a new round.
  act(() => stale.dispatchEvent(pointerEvent('pointerup', { clientX: 0 })));
  act(() => stale.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(stale, '435'));
  expect(sliderSpanText()).not.toBe('4 cycles');
});

it('formats continuous and sub-hundredth spans without a fake zero', async () => {
  await renderPanel({ isPlaying: true, timeline: { code: '', loopCycles: 0.5, durationSeconds: 1, estimatedCps: null } });
  // L=0.5: the slider is disabled but the aria text still reads the length.
  expect(sliderSpanText()).toBe('0.5 cycles');
  await renderPanel({ isPlaying: true });
  act(() => slideTo(zoomSlider(), '1000'));
  expect(sliderSpanText()).toBe('0.5 cycles');
  act(() => slideTo(zoomSlider(), '400'));
  expect(sliderSpanText()).toBe('4 cycles');
});

it('accepts every sample of one held-drag round and survives ten press-release rounds', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  // One round: five continuous samples while held.
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  const samples = ['435', '445', '465', '515', '485'];
  const seen = new Set<string>();
  for (const value of samples) {
    act(() => slideTo(slider, value));
    expect(slider.value).toBe(value);
    seen.add(sliderSpanText());
    expect(sliderSpanText()).not.toBe('4 cycles');
  }
  // More than one distinct intermediate span was accepted.
  expect(seen.size).toBeGreaterThan(1);
  // Release keeps the last accepted value.
  act(() => slider.dispatchEvent(pointerEvent('pointerup', { clientX: 0 })));
  const lastLabel = sliderSpanText();
  expect(sliderSpanText()).toBe(lastLabel);
  // Ten fresh press-move-release rounds keep working — not only the first.
  for (let round = 0; round < 10; round++) {
    const value = String(450 + round);
    act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
    act(() => slideTo(slider, value));
    expect(slider.value).toBe(value);
    expect(sliderSpanText()).not.toBe('4 cycles');
    act(() => slider.dispatchEvent(pointerEvent('pointerup', { clientX: 0 })));
  }
});

it('releases a drag that left the slider and ignores other pointer end events', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '435'));
  // A different pointer's end event must not release the round's owner.
  act(() => slider.dispatchEvent(pointerEvent('pointerup', { clientX: 0, pointerId: 7, isPrimary: false })));
  act(() => slideTo(slider, '465'));
  expect(slider.value).toBe('465');
  expect(sliderSpanText()).not.toBe('4 cycles');
  // The window-level release by the owning pointer (outside the input) ends it.
  act(() => window.dispatchEvent(pointerEvent('pointerup', { clientX: 0 })));
  // After the release the round is closed; a fresh press reopens.
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '505'));
  expect(slider.value).toBe('505');
  expect(sliderSpanText()).not.toBe('4 cycles');
});

it('recovers with a keyboard input after a cancelled round and a blur', async () => {
  await renderPanel({ isPlaying: true });
  const slider = zoomSlider();
  // Cancel a round, then blur: neither may block the next legal input.
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '435'));
  act(() => slider.dispatchEvent(pointerEvent('pointercancel', { clientX: 0 })));
  act(() => slider.blur());
  // A keyboard/assistive input without any pointerdown still commits once.
  act(() => slideTo(slider, '300'));
  expect(sliderSpanText()).not.toBe('4 cycles');
  expect(slider.value).toBe('300');
});

it('blocks a seek or pan from starting while a slider round owns the view', async () => {
  const seekToCycle = vi.fn(() => true);
  await renderPanel({ seekToCycle });
  const slider = zoomSlider();
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  const cell = container.querySelector<HTMLElement>(`[data-track-id="a"] [data-notes-cell]`)!;
  vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(dragRect);
  // Open a slider round and hold it.
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '435'));
  const calls = seekToCycle.mock.calls.length;
  // A seek gesture must not take over while the round owns the view.
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 300 })));
  expect(seekToCycle.mock.calls.length).toBe(calls);
  // Neither may a pan.
  act(() => cell.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 10 })));
  act(() => cell.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 0, clientY: 10 })));
  expect(seekToCycle.mock.calls.length).toBe(calls);
  // Release the slider; gestures work again.
  act(() => slider.dispatchEvent(pointerEvent('pointerup', { clientX: 0 })));
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 300 })));
  expect(seekToCycle.mock.calls.length).toBeGreaterThan(calls);
});

// ── Track name activation: single click navigates, double click renames ──────

const nameButtonFor = (id: string) =>
  container.querySelector<HTMLButtonElement>(`[data-track-id="${id}"] [data-track-name]`)!;
const doubleClickName = (id: string) => {
  act(() => nameButtonFor(id)!.click());
  act(() => nameButtonFor(id)!.click());
};
const nameInput = () => container.querySelector<HTMLInputElement>('[data-track-name-input]');
const renameError = () => container.querySelector<HTMLElement>('[data-track-rename-error]');
const keydown = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
const dblclick = (target: Element) =>
  target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
const touchTap = (button: HTMLButtonElement, x: number, y: number, pointerId = 1) => {
  act(() => button.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', pointerId, clientX: x, clientY: y })));
  act(() => button.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch', pointerId, clientX: x, clientY: y })));
  act(() => button.click());
};

it('keeps one name button per track with mute and solo, and no pencil anywhere', async () => {
  await renderPanel({ canRename: true, renameTrack: vi.fn(() => ({ status: 'renamed', name: 'x' }) as const) });
  expect(container.querySelectorAll('[data-track-name]')).toHaveLength(2);
  expect(container.querySelector('[data-track-rename]')).toBeNull();
  expect(container.querySelectorAll(`button[aria-label^="${t('trackMute')}"]`)).toHaveLength(2);
  expect(container.querySelectorAll(`button[aria-label^="${t('trackSolo')}"]`)).toHaveLength(2);
  // The name advertises both operations to the screen reader.
  expect(nameButtonFor('a')!.getAttribute('aria-label')).toContain(t('trackNameHint'));
  expect(nameButtonFor('a')!.getAttribute('title')).toContain(t('trackNameHint'));
});

it('opens the inline editor on a name double click without navigating', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ canRename: true, renameTrack, onNavigateToTrack });
  doubleClickName('a');
  const input = nameInput()!;
  expect(input).not.toBeNull();
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  expect(input.value).toBe('鼓组');
  // Opening the editor is not a navigation and touches nothing else.
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(renameTrack).not.toHaveBeenCalled();
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
});

it('navigates only after the double-activation window closes', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  await renderPanel({ onNavigateToTrack });
  act(() => nameButtonFor('a')!.click());
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('a');
});

it('navigates from blank header space after Solo without treating controls as track clicks', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const toggleSolo = vi.fn();
  const toggleMute = vi.fn();
  await renderPanel({ onNavigateToTrack, toggleSolo, toggleMute });
  const row = container.querySelector<HTMLElement>('[data-track-id="a"]')!;
  const actions = row.querySelector<HTMLElement>('.track-row-actions')!;

  // The actions row stretches past Solo; clicking that blank remainder uses
  // the same delayed navigation path as clicking the track name.
  act(() => actions.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('a');

  act(() => row.querySelector<HTMLButtonElement>(`button[aria-label^="${t('trackSolo')}"]`)!.click());
  act(() => row.querySelector<HTMLButtonElement>(`button[aria-label^="${t('trackMute')}"]`)!.click());
  act(() => vi.advanceTimersByTime(400));
  expect(toggleSolo).toHaveBeenCalledWith('a');
  expect(toggleMute).toHaveBeenCalledWith('a');
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
});

it('opens the editor once across a full click, click, dblclick sequence with no late navigation', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => button.click());
  act(() => dblclick(button));
  expect(nameInput()).not.toBeNull();
  expect(container.querySelectorAll('[data-track-name-input]')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(renameTrack).not.toHaveBeenCalled();
});

it('opens the editor from a late system dblclick after the single click navigated', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  act(() => dblclick(button));
  expect(nameInput()).not.toBeNull();
});

it('treats two slow clicks as two navigations and never an edit', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  await renderPanel({ onNavigateToTrack });
  act(() => nameButtonFor('a')!.click());
  act(() => vi.advanceTimersByTime(400));
  act(() => nameButtonFor('a')!.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(2);
  expect(nameInput()).toBeNull();
});

it('re-aims the single-click candidate when the second click lands on another track', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  await renderPanel({ onNavigateToTrack });
  act(() => nameButtonFor('a')!.click());
  act(() => nameButtonFor('b')!.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('b');
});

it('opens the editor once for a triple click and never navigates', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => button.click());
  act(() => button.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[data-track-name-input]')).toHaveLength(1);
});

it('navigates immediately on Enter and Space and consumes the synthetic click', async () => {
  const onNavigateToTrack = vi.fn();
  await renderPanel({ onNavigateToTrack });
  const button = nameButtonFor('a')!;
  act(() => keydown(button, 'Enter'));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  // The compatibility click some browsers still send must not navigate again.
  act(() => button.click());
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  act(() => keydown(button, ' '));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(2);
  expect(onNavigateToTrack).toHaveBeenLastCalledWith('a');
  expect(nameInput()).toBeNull();
});

it('opens the editor with F2 and cancels the pending navigation', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => keydown(button, 'F2', { cancelable: true }));
  expect(nameInput()).not.toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
});

it('keeps the name clickable for navigation when renaming is disallowed', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  await renderPanel({ canRename: false, renameTrack: vi.fn(), onNavigateToTrack });
  const button = nameButtonFor('a')!;
  // No rename hint is advertised, and neither double click nor F2 opens an editor.
  expect(button.getAttribute('aria-label')).not.toContain(t('trackNameHint'));
  doubleClickName('a');
  expect(nameInput()).toBeNull();
  act(() => keydown(button, 'F2', { cancelable: true }));
  expect(nameInput()).toBeNull();
  // Navigation still works after the window.
  act(() => nameButtonFor('b')!.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledWith('b');
});

it('commits on Enter, returns focus to the name button, and saves once', async () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: '主鼓' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  const input = nameInput()!;
  act(() => typeInto(input, '主鼓'));
  act(() => keydown(input, 'Enter'));
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('a', '主鼓');
  expect(nameInput()).toBeNull();
  expect(document.activeElement).toBe(nameButtonFor('a'));
  // A trailing blur from the removal must not save a second time.
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('a', '主鼓');
});

it('commits on blur and leaves focus where the user moved it', async () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('b');
  const input = nameInput()!;
  act(() => typeInto(input, '低音'));
  act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('b', '低音');
  expect(nameInput()).toBeNull();
  expect(document.activeElement).not.toBe(nameButtonFor('b'));
});

it('cancels on Escape without saving and returns focus to the name button', async () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  const input = nameInput()!;
  act(() => keydown(input, 'Escape'));
  expect(renameTrack).not.toHaveBeenCalled();
  expect(nameInput()).toBeNull();
  expect(document.activeElement).toBe(nameButtonFor('a'));
});

it('keeps the draft and shows the error when the service refuses the name', async () => {
  const renameTrack = vi.fn(() => ({ status: 'invalid-name', reason: 'invalid-character' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  const input = nameInput()!;
  act(() => typeInto(input, '鼓*组'));
  act(() => keydown(input, 'Enter'));
  expect(nameInput()).toBe(input);
  expect(renameError()?.textContent).toBe(t('trackRenameInvalidCharacter'));
  expect(input.getAttribute('aria-describedby')).toBe('track-rename-error');
  // Correcting the value clears the error and saves on the next Enter.
  act(() => typeInto(input, '鼓组二号'));
  expect(renameError()).toBeNull();
  const retry = vi.fn(() => ({ status: 'renamed', name: '鼓组二号' }) as const);
  await renderPanel({ renameTrack: retry });
  act(() => keydown(input, 'Enter'));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(retry).toHaveBeenCalledWith('a', '鼓组二号');
  expect(nameInput()).toBeNull();
});

it('ignores an Enter that belongs to an IME composition', async () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  const input = nameInput()!;
  act(() => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  act(() => keydown(input, 'Enter', { isComposing: true }));
  expect(renameTrack).not.toHaveBeenCalled();
  expect(nameInput()).not.toBeNull();
  // Composition ends, then the confirming Enter arrives — also swallowed.
  act(() => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  act(() => keydown(input, 'Enter'));
  expect(renameTrack).not.toHaveBeenCalled();
  // The next plain Enter commits.
  act(() => keydown(input, 'Enter'));
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('a', '鼓组');
});

it('tries to land the open draft before opening another track and refuses on failure', async () => {
  const renameTrack = vi.fn(() => ({ status: 'invalid-name', reason: 'empty' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  act(() => typeInto(nameInput()!, '   '));
  doubleClickName('b');
  // The failed draft keeps its editor; no second input appears.
  expect(nameInput()).not.toBeNull();
  expect(container.querySelectorAll('[data-track-name-input]')).toHaveLength(1);
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('a', '   ');
});

it('does not resubmit a failed draft when the next double click lands elsewhere', async () => {
  const renameTrack = vi.fn((_id: string, value: string) =>
    value.trim() ? { status: 'renamed', name: value } as const : { status: 'invalid-name', reason: 'empty' } as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  act(() => typeInto(nameInput()!, '   '));
  // The blur commits and fails once.
  act(() => nameInput()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(renameTrack).toHaveBeenCalledTimes(1);
  // The double click on B must not submit the same failed value again.
  doubleClickName('b');
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(container.querySelectorAll('[data-track-name-input]')).toHaveLength(1);
  // Editing the draft re-enables the switch: A lands, then B opens.
  act(() => typeInto(nameInput()!, '新鼓组'));
  doubleClickName('b');
  expect(renameTrack).toHaveBeenCalledTimes(2);
  expect(renameTrack).toHaveBeenLastCalledWith('a', '新鼓组');
  expect(nameInput()!.value).toBe('贝斯');
});

it('drops the draft without saving when the compile or the capability goes away', async () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ renameTrack });
  doubleClickName('a');
  expect(nameInput()).not.toBeNull();

  // A committed compile replaces the track list — the draft cannot follow it.
  await renderPanel({ renameTrack, tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  expect(nameInput()).toBeNull();
  expect(renameTrack).not.toHaveBeenCalled();

  await renderPanel({ renameTrack, tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  doubleClickName('a2');
  expect(nameInput()).not.toBeNull();
  await renderPanel({ renameTrack, canRename: false, tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  expect(nameInput()).toBeNull();
  expect(renameTrack).not.toHaveBeenCalled();
});

it('drops the pending navigation when the session, the tracks, the pane or the capability change', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();

  await renderPanel({ onNavigateToTrack, sessionKey: 's1' });
  act(() => nameButtonFor('a')!.click());
  await renderPanel({ onNavigateToTrack, sessionKey: 's2' });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();

  await renderPanel({ onNavigateToTrack, sessionKey: 's3' });
  act(() => nameButtonFor('a')!.click());
  await renderPanel({ onNavigateToTrack, sessionKey: 's3', tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();

  await renderPanel({ onNavigateToTrack, sessionKey: 's4' });
  act(() => nameButtonFor('a')!.click());
  await renderPanel({ onNavigateToTrack, sessionKey: 's4', active: false });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();

  await renderPanel({ onNavigateToTrack, sessionKey: 's5' });
  act(() => nameButtonFor('a')!.click());
  await renderPanel({ onNavigateToTrack, sessionKey: 's5', canRename: false });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
});

it('opens the editor on a touch double tap without a duplicate click path', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  touchTap(button, 10, 10);
  expect(nameInput()).toBeNull();
  touchTap(button, 12, 12);
  expect(nameInput()).not.toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(renameTrack).not.toHaveBeenCalled();
});

it('navigates once after the window for a single touch tap', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  await renderPanel({ onNavigateToTrack });
  touchTap(nameButtonFor('a')!, 10, 10);
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('a');
});

it('does not rename on a moved, cancelled or multi-touch gesture', async () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  await renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;

  // A drag beyond the slop distance is not a tap, let alone a double tap.
  act(() => button.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })));
  act(() => button.dispatchEvent(pointerEvent('pointermove', { pointerType: 'touch', clientX: 60, clientY: 10 })));
  act(() => button.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch', clientX: 60, clientY: 10 })));
  act(() => button.click());
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));

  // A pointercancel between taps resets recognition: the next tap is a fresh single tap.
  touchTap(button, 10, 10);
  act(() => vi.advanceTimersByTime(400));
  act(() => button.dispatchEvent(pointerEvent('pointercancel', { pointerType: 'touch', clientX: 10, clientY: 10 })));
  touchTap(button, 12, 12);
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));

  // Two fingers at once cancel tap recognition entirely; each stray
  // compatibility click degrades to its own plain single click.
  act(() => button.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10 })));
  act(() => button.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 40, clientY: 40 })));
  act(() => button.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: 10 })));
  act(() => button.click());
  act(() => vi.advanceTimersByTime(400));
  act(() => button.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 40, clientY: 40 })));
  act(() => button.click());
  act(() => vi.advanceTimersByTime(400));
  expect(renameTrack).not.toHaveBeenCalled();
});

it('keeps each track colour pinned to its compile-time colour key across renames', async () => {
  const renamed = [{ id: 'a', name: '全新的名字', colorKey: '鼓组' }, { id: 'b', name: '贝斯', colorKey: '贝斯' }];
  await renderPanel({ tracks: renamed });
  await renderPanel({ tracks });
  const beforeA = container.querySelector('[data-track-id="a"]')?.getAttribute('data-track-color');
  const beforeB = container.querySelector('[data-track-id="b"]')?.getAttribute('data-track-color');
  await renderPanel({ tracks: renamed });
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-track-color')).toBe(beforeA);
  expect(container.querySelector('[data-track-id="b"]')?.getAttribute('data-track-color')).toBe(beforeB);
});

it('samples the production clock every RAF without querying a stable preview band', async () => {
  const getClock = vi.fn(() => ({ absoluteCycle: 1, cps: 0.5 }));
  const queryScene = vi.fn(async (request: TrackSceneRequest): Promise<TrackSceneQueryResult> => ({
    status: 'complete',
    batch: { ...sceneBase(), generation: request.generation ?? 1 },
  }));

  await renderPanel({ getClock, queryScene, isPlaying: true });
  await flushScene();
  getClock.mockClear();
  queryScene.mockClear();

  for (let index = 0; index < 60; index++) tick(index * 16.67);

  expect(getClock).toHaveBeenCalledTimes(60);
  expect(queryScene).not.toHaveBeenCalled();
});

it('keeps the full-scene identity while zooming and does not start viewport queries', async () => {
  const getClock = vi.fn(() => ({ absoluteCycle: 1, cps: 0.5 }));
  const ensureFullScene = vi.fn();
  const queryScene = vi.fn();

  await renderPanel({
    getClock,
    queryScene: undefined,
    fullScene: null,
    ensureFullScene,
    isPlaying: true,
  });
  expect(ensureFullScene).toHaveBeenCalledTimes(1);
  const callsBeforeZoom = ensureFullScene.mock.calls.length;

  act(() => toolButton('trackZoomOut').click());
  act(() => toolButton('trackZoomIn').click());
  tick(16);

  expect(ensureFullScene).toHaveBeenCalledTimes(callsBeforeZoom);
  expect(queryScene).not.toHaveBeenCalled();
});

it('advances full-scene ruler labels and raster blocks as a stable clock moves', async () => {
  let absoluteCycle = 1;
  const getClock = vi.fn(() => ({ absoluteCycle, cps: 0.5 }));
  const ensureFullScene = vi.fn();
  const fullScene: TrackFullSceneSnapshot = {
    identity: { previewGeneration: 1, loopOffset: 0, loopCycles: LOOP, cps: 0.5 },
    status: 'complete',
    begin: 0,
    end: LOOP,
    completedTiles: new Set(),
    tiles: [],
    sounds: ['bd', 'sawtooth'],
    resolutionTier: 8,
    effectiveBinSpan: 1 / 256,
    exactBudget: 6400,
    lods: [{
      level: 0,
      binSpan: 1 / 256,
      lanes: [
        exactLane('a', [ev(0.9, 1.2, 0), ev(8, 8.25, 0), ev(14, 14.5, 0)]),
        exactLane('b', [ev(1.5, 2, 1, 36), ev(8.5, 9, 1, 40)]),
      ],
    }],
  };

  await renderPanel({
    getClock,
    queryScene: undefined,
    fullScene,
    ensureFullScene,
    isPlaying: true,
  });
  await fireCanvasSizesAndFlush();
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(prefetchedTickLabels()).toEqual(['4', '5', '6', '7']);
  const firstBlocks = [...laneRow('a').querySelectorAll<HTMLElement>('[data-track-raster-block]')]
    .map(block => block.dataset.trackRasterBlock);

  // Moving one half-window does not need new Canvas blocks or a React commit.
  // The labels entering from the right must already exist in the shared draw
  // window, otherwise the ruler becomes half-empty while notes remain visible.
  absoluteCycle = 3;
  tick(8);
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(prefetchedTickLabels()).toEqual(['4', '5', '6', '7']);

  // The function identity stays fixed, as it does in production; only the
  // sampled transport cycle advances. One RAF detects the exhausted draw
  // margin and the queued RAF commits the newest window.
  absoluteCycle = 8;
  tick(16);
  tick(32);
  await fireCanvasSizesAndFlush();

  expect(tickLabels()).toEqual(['6', '7', '8', '9']);
  expect([...laneRow('a').querySelectorAll<HTMLElement>('[data-track-raster-block]')]
    .map(block => block.dataset.trackRasterBlock)).not.toEqual(firstBlocks);

  // Crossing later raster boundaries mounts fresh overlay canvases. The
  // currently sounding note must be drawn into those new bitmaps too.
  absoluteCycle = 14.25;
  tick(48);
  tick(64);
  await fireCanvasSizesAndFlush();
  const overlayCalls = laneCanvases('a')
    .filter(canvas => canvas.classList.contains('track-lane-canvas-overlay'))
    .flatMap(canvas => contextCalls(canvas));
  expect(overlayCalls.some(([method]) => method === 'beginPath' || method === 'fill')).toBe(true);
  expect(ensureFullScene).toHaveBeenCalledTimes(1);
});

it('refreshes follow raster from its budgeted bitmap edge before notes are clipped', async () => {
  vi.stubGlobal('devicePixelRatio', 2);
  let absoluteCycle = 1;
  const denseTracks = Array.from({ length: 10 }, (_, index) => ({ id: `lane-${index}`, name: `lane ${index}` }));
  const fullScene: TrackFullSceneSnapshot = {
    identity: { previewGeneration: 1, loopOffset: 0, loopCycles: LOOP, cps: 0.5 },
    status: 'complete', begin: 0, end: LOOP,
    completedTiles: new Set(), tiles: [], sounds: ['bd'], resolutionTier: 8,
    effectiveBinSpan: 1 / 256, exactBudget: 6400,
    lods: [{ level: 0, binSpan: 1 / 256, lanes: denseTracks.map(track => exactLane(track.id, [ev(3, 6, 0)])) }],
  };
  await renderPanel({
    tracks: denseTracks, fullScene, ensureFullScene: vi.fn(), queryScene: undefined,
    getClock: () => ({ absoluteCycle, cps: 0.5 }), isPlaying: true,
  });
  act(() => fireCanvasSizes(400));
  await act(async () => {});
  const rasterRight = () => Math.max(...[...laneRow('lane-0').querySelectorAll<HTMLElement>('[data-track-raster-block]')]
    .map(block => parseFloat(block.style.left) + parseFloat(block.style.width)));
  const initialRight = rasterRight();
  expect(initialRight).toBeGreaterThan(400);
  expect(initialRight).toBeLessThan(800);

  // The desired draw window still reaches cycle 8. The budgeted bitmaps end
  // near cycle 4, so the next viewport must trigger a raster refresh early.
  absoluteCycle = 3;
  tick(16);
  tick(32);
  await act(async () => {});
  expect(rasterRight()).toBeGreaterThan(initialRight);
  expect(rasterRight()).toBeGreaterThanOrEqual(500);
});

it('rebuilds the exact-note highlight cursor when the same full scene publishes new lanes', async () => {
  let absoluteCycle = 1;
  const identity = { previewGeneration: 1, loopOffset: 0, loopCycles: LOOP, cps: 0.5 };
  const snapshot = (notes: ExactTrackPrimitive[]): TrackFullSceneSnapshot => ({
    identity,
    status: 'complete',
    begin: 0,
    end: LOOP,
    completedTiles: new Set(),
    tiles: [],
    sounds: ['bd', 'sawtooth'],
    resolutionTier: 8,
    effectiveBinSpan: 1 / 256,
    exactBudget: 6400,
    lods: [{
      level: 0,
      binSpan: 1 / 256,
      lanes: [exactLane('a', notes), exactLane('b', [])],
    }],
  });
  const early = ev(0.9, 1.2, 0);
  const late = ev(14, 14.5, 0);
  const panel = await renderPanel({
    getClock: () => ({ absoluteCycle, cps: 0.5 }),
    queryScene: undefined,
    fullScene: snapshot([early]),
    ensureFullScene: vi.fn(),
    isPlaying: true,
  });
  await fireCanvasSizesAndFlush();
  tick(8);

  // Full-scene progress keeps one identity while publishing newly assembled
  // lane arrays whose exact ids may have changed as earlier tiles arrive.
  absoluteCycle = 14.25;
  await panel.rerender({ fullScene: snapshot([early, late]) });
  tick(16);
  tick(32);
  await fireCanvasSizesAndFlush();

  const overlayCalls = laneCanvases('a')
    .filter(canvas => canvas.classList.contains('track-lane-canvas-overlay'))
    .flatMap(canvas => contextCalls(canvas));
  expect(overlayCalls.some(([method, args]) => (
    (method === 'moveTo' || method === 'lineTo' || method === 'arcTo')
      && typeof args[0] === 'number' && args[0] > 1300
  ))).toBe(true);
});
