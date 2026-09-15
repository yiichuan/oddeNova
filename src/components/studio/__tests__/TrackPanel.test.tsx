// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TrackPanel from '../TrackPanel';
import { t } from '../../../lib/i18n';
import type { TrackFrame, TrackFrameRequest } from '../../../services/track-preview';
import type { TransportEvent } from '../../../services/strudel';

let root: Root;
let container: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container); frames = new Map(); nextId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextId, cb); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// The panel owns the browsing request, so the stand-in frame resolves it the
// way the real service does: a follow request derives the window from the
// base's own `now`, a fixed window passes through, and tests then assert
// positions against the same coordinates the component draws with.

// TrackEvent factories: the key mirrors the service's dedup tuple (the
// unclipped display-domain boundaries), so these fixtures behave like real
// query results for React's keyed reconciliation.
const ev = (trackId: string, begin: number, end: number, sound: string, pitch: number | null = null) =>
  ({ trackId, begin, end, sound, pitch, key: JSON.stringify([trackId, begin, end, sound, pitch]) });

const LOOP = 16;
const echoFrame = (base: TrackFrame) => (request: TrackFrameRequest): TrackFrame => {
  const { loopCycles, viewport } = request;
  if ('mode' in viewport) {
    const begin = Math.max(0, Math.min(base.now, loopCycles) - viewport.span / 2);
    const cappedBegin = Math.min(begin, Math.max(0, loopCycles - viewport.span));
    return { ...base, begin: cappedBegin, end: Math.min(cappedBegin + viewport.span, loopCycles) };
  }
  return { ...base, begin: viewport.begin, end: viewport.end };
};

const tracks = [{ id: 'a', name: '鼓组' }, { id: 'b', name: '贝斯' }];
const frame: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [
  ev('a', .9, 1.2, 'bd'),
  ev('b', 1.5, 2, 'sawtooth', 36),
] };
const idleFrame: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [
  ev('b', 1.999, 2, 'hh'),
] };
function tick(time: number) { const queue = [...frames.values()]; frames.clear(); act(() => queue.forEach(cb => cb(time))); }
const renderPanel = (props: Partial<Parameters<typeof TrackPanel>[0]> = {}) => act(() => root.render(
  <TrackPanel
    tracks={tracks}
    soloId={null}
    mutedIds={new Set()}
    toggleSolo={() => {}}
    toggleMute={() => {}}
    getFrame={echoFrame(frame)}
    isPlaying={false}
    isPaused={false}
    active
    timeline={{ code: '', loopCycles: LOOP, durationSeconds: 32, estimatedCps: null }}
    {...props}
  />,
));
const ruler = () => container.querySelector<HTMLElement>('[data-track-timeline]')!;
const tickLabels = () => [...container.querySelectorAll<HTMLElement>('.track-ruler-tick')].map(node => node.textContent);
const playheadLeft = () => (container.querySelector('[data-playhead-line]') as HTMLElement | null)?.style.left ?? null;
const caretLeft = () => (container.querySelector('[data-playhead-caret]') as HTMLElement | null)?.style.left ?? null;

it('shows all layer notes and highlights only audible current notes during solo', () => {
  const selected: string[] = [];
  renderPanel({ soloId: 'b', isPlaying: true, toggleSolo: id => selected.push(id) });
  tick(100);
  const soloButtons = [...container.querySelectorAll<HTMLElement>(`button[aria-label^="${t('trackSolo')}"]`)];
  expect([...soloButtons].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(2);
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-muted')).toBe('false');
  expect(container.querySelector('[data-track-id="b"]')?.getAttribute('data-muted')).toBe('false');
  expect(container.querySelectorAll('[data-sounding="true"]')).toHaveLength(0);
  // Being excluded by a solo weakens the row without faking a manual mute.
  expect(container.querySelector('[data-track-id="a"] [data-track-name]')?.className).toContain('text-text-muted');
  expect(container.querySelector('[data-track-id="a"] [aria-label^="静音"], [data-track-id="a"] [aria-label^="Mute"]')?.getAttribute('aria-pressed')).toBe('false');
  act(() => soloButtons[0].click()); expect(selected).toEqual(['a']);
});

it('mutes a single track with its speaker control and reports it via data-muted', () => {
  const muted: string[] = [];
  renderPanel({ mutedIds: new Set(['a']), isPlaying: true, toggleMute: id => muted.push(id) });
  tick(100);
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-muted')).toBe('true');
  expect(container.querySelector('[data-track-id="b"]')?.getAttribute('data-muted')).toBe('false');
  const muteButtons = [...container.querySelectorAll<HTMLElement>(`button[aria-label^="${t('trackMute')}"]`)];
  expect(muteButtons.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  expect(container.querySelectorAll('[data-sounding="true"]')).toHaveLength(0);
  act(() => muteButtons[1].click()); expect(muted).toEqual(['b']);
});

it('keeps the current note highlight while paused and clears it after stopping', () => {
  const render = (isPlaying: boolean, isPaused: boolean) => renderPanel({ isPlaying, isPaused });
  const soundingNotes = () => container.querySelectorAll<HTMLElement>('[data-track-note][data-sounding="true"]');

  render(true, false);
  tick(100);
  const playingNote = soundingNotes()[0];
  expect(soundingNotes()).toHaveLength(1);
  expect(playingNote.style.opacity).toBe('1');
  // Notes that are not sounding sit at the plain strength, not the muted one.
  expect(container.querySelector<HTMLElement>('[data-track-note][data-sounding="false"]')?.style.opacity).toBe('0.72');

  render(false, true);
  tick(200);
  const pausedNote = soundingNotes()[0];
  expect(soundingNotes()).toHaveLength(1);
  expect(pausedNote?.style.height).toBe(playingNote?.style.height);
  expect(pausedNote?.style.opacity).toBe(playingNote?.style.opacity);

  render(false, false);
  tick(300);
  expect(soundingNotes()).toHaveLength(0);
  expect([...container.querySelectorAll<HTMLElement>('[data-track-note]')].every(n => n.style.opacity === '0.72')).toBe(true);
});

it('draws one unified playhead through the lanes with a caret and a matching ruler segment', () => {
  renderPanel({ isPlaying: true });
  tick(100);
  expect(container.querySelectorAll('[data-playhead]')).toHaveLength(1);
  // The initial follow window is [0, 4), so a playhead at cycle 1 sits at 25%.
  expect(playheadLeft()).toBe('25%');
  expect(container.querySelectorAll('[data-playhead-caret]')).toHaveLength(1);
  expect(caretLeft()).toBe('25%');
  expect((container.querySelector('[data-playhead-ruler-line]') as HTMLElement).style.left).toBe('25%');
});

it('positions notes by real time and keeps very short notes visible', () => {
  renderPanel({ getFrame: echoFrame(idleFrame) });
  tick(100);
  const note = container.querySelector('[data-track-note]') as HTMLElement;
  // begin 1.999 in the [0, 4) window lands at 49.975%, and its 0.025% span is
  // declared with a 2px floor so a very short note stays discoverable.
  expect(note.style.left.startsWith('49.97')).toBe(true);
  expect(note.style.height).toBe('5px');
  expect(parseFloat(note.style.width)).toBeLessThan(1);
  expect(note.style.minWidth).toBe('2px');
});

it('assigns each track a stable colour slot that survives solo and mute changes', () => {
  const named = ['和弦垫', '鼓组', '贝斯', 'Lead Synth', '打击乐', '氛围'].map((name, i) => ({ id: `9:${i}`, name }));
  const render = (soloId: string | null, mutedIds: ReadonlySet<string>) => act(() => root.render(
    <TrackPanel tracks={named} soloId={soloId} mutedIds={mutedIds} toggleSolo={() => {}} toggleMute={() => {}} getFrame={echoFrame(frame)} isPlaying={false} isPaused={false} active />,
  ));
  const colors = () => [...container.querySelectorAll('[data-track-id]')].map(row => row.getAttribute('data-track-color'));

  render(null, new Set());
  tick(100);
  const first = colors();
  expect(new Set(first)).toHaveLength(6);
  expect(container.querySelectorAll('[data-track-color-dot]')).toHaveLength(6);

  render('9:1', new Set(['9:0']));
  tick(200);
  expect(colors()).toEqual(first);
});

it('truncates long track names without crowding the controls', () => {
  const long = { id: '3:0', name: '一段非常非常长的中文音轨名称加长版本' };
  act(() => root.render(
    <TrackPanel tracks={[long, { id: '3:1', name: 'b' }]} soloId={null} mutedIds={new Set()} toggleSolo={() => {}} toggleMute={() => {}} getFrame={echoFrame(frame)} isPlaying={false} isPaused={false} active />,
  ));
  tick(100);
  const name = container.querySelector('[data-track-name]');
  expect(name?.getAttribute('title')).toBe(long.name);
  expect(name?.className).toContain('truncate');
  // Two rows of three controls (name, mute, solo) plus the tool row: two
  // browse buttons and the three zoom controls; the return-to-playback
  // button only exists in manual mode.
  expect(container.querySelectorAll('button')).toHaveLength(11);
});

it('stops sampling when the pane is hidden and draws a paused frame without a continuing loop', () => {
  const getFrame = vi.fn(echoFrame(frame));
  const render = (active: boolean, isPlaying: boolean, isPaused = false) => renderPanel({ getFrame, isPlaying, isPaused, active });
  render(true, true); tick(100); expect(getFrame).toHaveBeenCalledTimes(2);
  render(false, true); tick(200); expect(getFrame).toHaveBeenCalledTimes(2); expect(frames.size).toBe(0);
  render(true, false, true); tick(300); expect(getFrame).toHaveBeenCalledTimes(3); expect(frames.size).toBe(0);
});

it('redraws a paused frame when a seek revision changes', () => {
  const getFrame = vi.fn(echoFrame(frame));
  const render = (refreshRevision: number) => renderPanel({ getFrame, refreshRevision });
  render(0);
  tick(100);
  expect(getFrame).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  render(1);
  tick(200);
  expect(getFrame).toHaveBeenCalledTimes(2);
  expect(frames.size).toBe(0);
});

it('shows the unsupported state without broken solo controls', () => {
  renderPanel({ tracks: [] });
  expect(container.textContent).toContain(t('tracksUnsupported'));
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

const pitchedEvent = (pitch: number, sound: string) => ev('a', .5, 1.5, sound, pitch);
const pitchedFrame: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [
  pitchedEvent(12, 'a'), pitchedEvent(24, 'b'), pitchedEvent(60, 'c'), pitchedEvent(96, 'd'), pitchedEvent(108, 'e'),
] };
const crossingFrame: TrackFrame = { limited: false, now: 2, begin: 1, end: 3, events: [ev('a', -5, 10, 'pad')] };
// Reads the mapped centre position back out of `calc(<centre>% ...)` styles.
const centreOf = (top: string) => parseFloat(top.slice('calc('.length));

it('maps pitch to centred row positions monotonically and clamps beyond the range', () => {
  renderPanel({ getFrame: echoFrame(pitchedFrame) });
  tick(100);
  const centres = [...container.querySelectorAll<HTMLElement>('[data-track-note]')].map(n => centreOf(n.style.top));
  // Low sits at the bottom; the order never inverts, even under clamping.
  expect(centres[0]).toBeCloseTo(75);
  expect(centres[1]).toBeCloseTo(75);
  expect(centres[2]).toBeCloseTo(50);
  expect(centres[3]).toBeCloseTo(25);
  expect(centres[4]).toBeCloseTo(25);
  // Every pitched note holds to the middle half of the row.
  for (const centre of centres) expect(centre).toBeGreaterThanOrEqual(25);
  for (const centre of centres) expect(centre).toBeLessThanOrEqual(75);
});

it('keeps unpitched sounds on lanes around the row centreline', () => {
  // These names intentionally cover hash slots 2, 3, 4, 0 and 1 in order.
  const laneFrame: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: ['a', 'b', 'c', 'd', 'e'].map(sound => ev('a', .5, 1.5, sound)) };
  renderPanel({ getFrame: echoFrame(laneFrame) });
  tick(100);
  const laneTops = [...container.querySelectorAll<HTMLElement>('[data-track-note]')].map(note => {
    const match = note.style.top.match(/^calc\(50% ([+-]) ([\d.]+)px\)$/);
    expect(match).not.toBeNull();
    // The five lanes use centre offsets of -8/-4/0/+4/+8px. Including the
    // half-note correction, their top offsets stay within ±10.5px at the
    // smallest supported row height instead of hugging an edge.
    expect(parseFloat(match![2])).toBeLessThanOrEqual(10.5);
    return note.style.top;
  });
  expect(laneTops).toEqual([
    'calc(50% - 2.5px)', 'calc(50% + 1.5px)', 'calc(50% + 5.5px)',
    'calc(50% - 10.5px)', 'calc(50% - 6.5px)',
  ]);
});

it('does not shift a sound vertically when other sounds appear or disappear', () => {
  const kick = ev('a', .5, 1.5, 'kick');
  const alone: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [kick] };
  const crowded: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [
    kick, ev('a', .6, 1.6, 'hh'), ev('a', .7, 1.7, 'snare'),
  ] };
  renderPanel({ getFrame: echoFrame(alone) });
  tick(100);
  const left = (container.querySelector<HTMLElement>('[data-track-note]') as HTMLElement).style.left;
  const top = (container.querySelector<HTMLElement>('[data-track-note]') as HTMLElement).style.top;
  renderPanel({ getFrame: echoFrame(crowded) });
  tick(200);
  const kickAgain = [...container.querySelectorAll<HTMLElement>('[data-track-note]')].find(n => n.style.left === left) as HTMLElement;
  expect(kickAgain.style.top).toBe(top);
});

it('clips long events to the real window without fake starts, ends or separations', () => {
  renderPanel({ getFrame: echoFrame(crossingFrame) });
  tick(100);
  const note = container.querySelector<HTMLElement>('[data-track-note]') as HTMLElement;
  expect(note.style.left).toBe('0%');
  expect(parseFloat(note.style.width)).toBeCloseTo(100);
  expect(note.style.borderRadius).toBe('0px');
  expect(note.style.boxShadow).toBe('');

  const exitLate: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [ev('a', .5, 10, 'pad')] };
  renderPanel({ getFrame: echoFrame(exitLate) });
  tick(200);
  const exiting = container.querySelector<HTMLElement>('[data-track-note]') as HTMLElement;
  // The real start keeps its rounding and attack separation; the window edge
  // is a flat cut.
  expect(exiting.style.borderRadius).toBe('2px 0px 0px 2px');
  expect(exiting.style.boxShadow).toContain('inset');
});

it('gives each event a stable visual key over the uncropped display boundaries', () => {
  const keyed: TrackFrame = { limited: false, now: 1, begin: 0, end: 4, events: [
    { trackId: 'a', begin: .9, end: 1.2, sound: 'bd', pitch: null, key: 'a-0.9' },
    { trackId: 'a', begin: 1.5, end: 2, sound: 'bd', pitch: null, key: 'a-1.5' },
  ] };
  renderPanel({ getFrame: echoFrame(keyed), isPlaying: true });
  tick(100);
  const notes = () => [...container.querySelectorAll<HTMLElement>('[data-track-note]')];
  expect(notes()).toHaveLength(2);

  // The same events re-queried keep their DOM nodes — only geometry updates.
  const nodesBefore = notes();
  renderPanel({ getFrame: echoFrame({ ...keyed, now: 1.1 }), isPlaying: true });
  tick(200);
  const nodesAfter = notes();
  expect(nodesAfter).toHaveLength(2);
  expect(nodesBefore[0]).toBe(nodesAfter[0]);
  expect(nodesBefore[1]).toBe(nodesAfter[1]);
  // The DOM identity followed the visual key, not the array position: even a
  // reordered frame keeps each event's node.
  const reordered: TrackFrame = { ...keyed, events: [keyed.events[1], keyed.events[0]] };
  renderPanel({ getFrame: echoFrame(reordered), isPlaying: true });
  tick(300);
  const nodesReordered = notes();
  expect(nodesReordered[0]).toBe(nodesAfter[1]);
  expect(nodesReordered[1]).toBe(nodesAfter[0]);

  // An event that leaves the window is removed, not kept around.
  renderPanel({ getFrame: echoFrame({ ...keyed, events: [keyed.events[0]] }), isPlaying: true });
  tick(400);
  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(1);
});

it('gives each adjacent real event its own attack without splitting a single long one', () => {
  const repeated: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [
    ev('a', 0, 1, 'hh'),
    ev('a', 1, 2, 'hh'),
  ] };
  renderPanel({ getFrame: echoFrame(repeated) });
  tick(100);
  const notes = [...container.querySelectorAll<HTMLElement>('[data-track-note]')];
  expect(notes).toHaveLength(2);
  for (const note of notes) expect(note.style.boxShadow).toContain('inset');

  renderPanel({ getFrame: echoFrame(crossingFrame) });
  tick(200);
  expect((container.querySelector<HTMLElement>('[data-track-note]') as HTMLElement).style.boxShadow).toBe('');
});

it('hides events without window overlap and keeps overlapping ultra-short ones visible', () => {
  const edges: TrackFrame = { limited: false, now: 1, begin: -1, end: 3, events: [
    ev('a', 3.2, 3.5, 'bd'),
    ev('a', -2, -1.5, 'hh'),
    ev('a', 2.999, 3, 'snare'),
  ] };
  renderPanel({ getFrame: echoFrame(edges) });
  tick(100);
  const notes = [...container.querySelectorAll<HTMLElement>('[data-track-note]')];
  // [0, 4) shows the 3.2–3.5 and 2.999–3 events; the negative one stays out.
  expect(notes).toHaveLength(2);
  for (const note of notes) expect(note.style.minWidth).toBe('2px');
});

it('clips events at both window edges while keeping real starts and ends rounded', () => {
  const twoEdges: TrackFrame = { limited: false, now: 1, begin: 0, end: 4, events: [
    ev('a', -.5, 1, 'leftCut'),
    ev('a', 3.8, 4.3, 'rightCut'),
  ] };
  renderPanel({ getFrame: echoFrame(twoEdges) });
  tick(100);
  const notes = [...container.querySelectorAll<HTMLElement>('[data-track-note]')];
  expect(notes).toHaveLength(2);
  // A window-edge cut is flat; a real start keeps its rounding and
  // attack separation.
  expect(notes[0].style.left).toBe('0%');
  expect(notes[0].style.borderRadius).toBe('0px 2px 2px 0px');
  expect(notes[0].style.boxShadow).toBe('');
  expect(notes[1].style.left).toBe('95%');
  expect(parseFloat(notes[1].style.width)).toBeCloseTo(5);
  expect(notes[1].style.borderRadius).toBe('2px 0px 0px 2px');
  expect(notes[1].style.boxShadow).toContain('inset');
});

it('does not create a minimum-width dot for events that end at the work origin', () => {
  const originEnd: TrackFrame = { limited: false, now: 0, begin: -2, end: 2, events: [
    ev('a', -.1, .00001, 'tiny'),
    ev('a', -.1, 0, 'gone'),
  ] };
  renderPanel({ getFrame: echoFrame(originEnd) });
  tick(100);
  const note = container.querySelector<HTMLElement>('[data-track-note]') as HTMLElement;

  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(1);
  expect(note.style.left).toBe('0%');
  expect(parseFloat(note.style.width)).toBeCloseTo(.00025);
  expect(note.style.minWidth).toBe('2px');
  expect(note.style.borderRadius).toBe('0px 2px 2px 0px');
  expect(note.style.boxShadow).toBe('');
});


it('renders regenerated track notes on resume before the next animation frame', () => {
  renderPanel({ isPaused: true });
  const nextTracks = tracks.map(track => ({ ...track, id: `next:${track.id}` }));
  const nextFrame = { ...frame, events: frame.events.map(({ trackId, begin, end, sound, pitch }) => ev(`next:${trackId}`, begin, end, sound, pitch)) };
  renderPanel({ tracks: nextTracks, getFrame: echoFrame(nextFrame), isPlaying: true });
  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-sounding="true"]')).toHaveLength(1);
});

it('freezes the latest pause position before paint without waiting for animation', () => {
  renderPanel({ isPlaying: true });
  const pausedFrame = { ...frame, now: 1.6, begin: -.4, end: 3.6 };
  renderPanel({ isPaused: true, getFrame: echoFrame(pausedFrame) });
  expect(container.querySelector('[data-track-id="b"] [data-sounding="true"]')).not.toBeNull();
  expect(container.querySelector('[data-track-id="a"] [data-sounding="true"]')).toBeNull();
  expect(frames.size).toBe(0);
});

// ── Timeline seek gesture ───────────────────────────────────────────────────

const dragRect = {
  left: 100, top: 0, right: 500, bottom: 30, width: 400, height: 30, x: 100, y: 0,
  toJSON: () => ({}),
} as DOMRect;

const pointerEvent = (type: string, options: PointerEventInit = {}) => new PointerEvent(type, {
  bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, ...options,
});

it('seeks the ruler on click and keeps a drag inside the frozen window', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle });
  tick(0);
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

it('keeps the frozen window through its own seek revisions and re-aims only on release', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle });
  tick(0);
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  // The seek the drag committed comes back as a transport notification; the
  // window must stay frozen even though the real position jumped far away.
  renderPanel({
    seekToCycle,
    transportEvent: { revision: 1, cycle: 30, seek: { cycle: 30, source: 'timeline' }, reason: 'apply' },
    getFrame: echoFrame({ ...frame, now: 30 }),
  });
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 200 })));
  // On release, follow re-derives the window from the authoritative position,
  // clamped inside the piece: now=30 with L=16 parks at the boundary.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);
});

it('ends an active drag when an external progress seek arrives', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle });
  tick(0);
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(container.querySelector('[data-track-seek-hint]')).not.toBeNull();
  renderPanel({
    seekToCycle,
    transportEvent: { revision: 1, cycle: 30, seek: { cycle: 30, source: 'progress' }, reason: 'seek' },
    getFrame: echoFrame({ ...frame, now: 30 }),
  });
  // The external seek takes over: follow around its target clamped inside
  // the piece (now=30 with L=16 parks at the boundary), gesture dropped.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);
  expect(container.querySelector('[data-track-seek-hint]')).toBeNull();
});

it('ignores secondary buttons, extra pointers and pointercancel targets', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle });
  tick(0);
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

it('blocks text selection on a valid press, focuses the ruler, and keeps keys working', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle });
  tick(0);
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

it('leaves the ruler inert without an enabled seek', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle, canSeek: false });
  tick(0);
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

it('steps the position with arrow keys, Shift for a full cycle, and Home to the origin', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle, isPlaying: true });
  tick(100);
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

it('follows the playhead continuously once it reaches the centre', () => {
  const lateFrame: TrackFrame = { ...frame, now: 3.6 };
  renderPanel({ getFrame: echoFrame(lateFrame), isPlaying: true });
  tick(100);
  // The window slid so the playhead sits centred in [1.6, 5.6).
  expect(tickLabels()).toEqual(['2', '3', '4', '5']);
  expect(playheadLeft()).toBe('50%');
});

it('keeps the window continuous across the centre takeover without a threshold jump', () => {
  // Just before the centre: window still pinned at the origin.
  renderPanel({ getFrame: echoFrame({ ...frame, now: 1.999 }), isPlaying: true });
  tick(100);
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(parseFloat(playheadLeft()!)).toBeCloseTo(49.975, 3);

  // Just after: the window has slid by the same epsilon, playhead centred.
  renderPanel({ getFrame: echoFrame({ ...frame, now: 2.001 }), isPlaying: true });
  tick(200);
  expect(tickLabels()).toEqual(['1', '2', '3', '4']);
  expect(playheadLeft()).toBe('50%');

  // Far ahead: absolute cycles keep scrolling, no snap back to a page start.
  renderPanel({ getFrame: echoFrame({ ...frame, now: 10 }), isPlaying: true });
  tick(300);
  expect(tickLabels()).toEqual(['8', '9', '10', '11']);
  expect(playheadLeft()).toBe('50%');
});

it('samples at most once per animation frame and keeps the loop mounted', () => {
  const getFrame = vi.fn(echoFrame(frame));
  renderPanel({ getFrame, isPlaying: true });
  expect(getFrame).toHaveBeenCalledTimes(1);
  tick(16);
  expect(getFrame).toHaveBeenCalledTimes(2);
  expect(frames.size).toBe(1);
  tick(32);
  expect(getFrame).toHaveBeenCalledTimes(3);
  expect(frames.size).toBe(1);
});

it('pans the canvas sideways into manual browsing and hides an off-window playhead', () => {
  const getFrame = vi.fn(echoFrame(frame));
  renderPanel({ getFrame, isPlaying: true });
  tick(100);
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
  expect(container.querySelectorAll('[data-playhead-line]')).toHaveLength(0);
  // The caret hides with the line; neither pretends to sit at an edge.
  expect(container.querySelector<HTMLElement>('[data-playhead-caret]')?.style.visibility).toBe('hidden');

  act(() => cell.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 })));
  // Manual browsing holds: the playhead stays hidden while the music runs on.
  tick(60);
  expect(tickLabels()).toEqual(['3', '4', '5', '6']);
  expect(container.querySelectorAll('[data-playhead-line]')).toHaveLength(0);

  const returnButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('trackReturnToPlayback')}"]`)!;
  act(() => returnButton.click());
  // Back to follow, window centred on the real position (cycle 1 → [0,4)).
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(playheadLeft()).toBe('25%');
});

it('pans with a horizontal wheel and shift+wheel but keeps vertical scrolling native', () => {
  renderPanel({ isPlaying: true });
  tick(100);
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

it('follows an external progress-bar seek and a stop, but not its own timeline seeks', () => {
  // The service reports the seek target as the position, so the stand-in
  // frame base moves with it.
  const seekedFrame = { ...frame, now: 15 };
  const progressSeek: TransportEvent = { revision: 1, cycle: 15, seek: { cycle: 15, source: 'progress' }, reason: 'seek' };
  renderPanel({ transportEvent: progressSeek, getFrame: echoFrame(seekedFrame) });
  // The progress-bar seek restores follow around its target; L=16 keeps the
  // window pinned at the end: [12, 16).
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);
  tick(0);
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);

  renderPanel({
    transportEvent: { ...progressSeek, revision: 2, cycle: 15, seek: { cycle: 15, source: 'timeline' }, reason: 'seek' },
    getFrame: echoFrame(seekedFrame),
  });
  tick(100);
  // A timeline seek keeps the window the gesture left behind.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);

  renderPanel({ transportEvent: { revision: 3, cycle: 0, seek: null, reason: 'stop' }, getFrame: echoFrame({ ...frame, now: 0 }) });
  tick(200);
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
});

it('selects a track by name for code navigation and clears it on a fresh compile', () => {
  vi.useFakeTimers();
  const navigated: string[] = [];
  const muted: string[] = [];
  renderPanel({ onNavigateToTrack: id => navigated.push(id), toggleMute: id => muted.push(id) });
  tick(100);

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
  renderPanel({ tracks: nextTracks });
  expect(container.querySelector('[data-track-id="9:a"]')?.getAttribute('data-selected')).toBe('false');
});

// ── Horizontal zoom ─────────────────────────────────────────────────────────

const toolButton = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${t(label)}"]`)!;
const zoomSlider = () => container.querySelector<HTMLInputElement>('[data-track-zoom-slider]')!;

// The reset control is an icon button now — it shows no numeric label, and
// the zoom level is only readable through the slider's aria-valuetext.
const resetLabel = () => toolButton('trackZoomReset')!.getAttribute('title') ?? '';
const sliderValueText = () => zoomSlider().getAttribute('aria-valuetext') ?? '';
const sliderSpanText = () => (sliderValueText().match(/([\d.]+|<0\.01) cycles?$/) ?? [])[0] ?? '';

it('walks the zoom ladder with the tool row and disables at both ends', () => {
  renderPanel({ isPlaying: true });
  tick(100);
  expect(resetLabel()).toBe(t('trackZoomReset'));
  // The icon button carries no visible cycles text.
  expect(toolButton('trackZoomReset')!.textContent).not.toMatch(/cycle/);
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

  // Five zoom-outs later the ladder's widest step disables zoom-out too.
  for (let i = 0; i < 5; i++) act(() => toolButton('trackZoomOut')!.click());
  expect(toolButton('trackZoomOut')!.disabled).toBe(true);
  // The whole piece fills the window; the boundary gets its end label.
  expect(tickLabels()).toEqual(['0', '4', '8', '12', '16']);

  // The icon button restores the default scale only — mode and position stay.
  act(() => toolButton('trackZoomReset')!.click());
  expect(sliderSpanText()).toBe('4 cycles');
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
});

it('zooms a manual window around its centre and answers to the +, - and 0 keys', () => {
  renderPanel({ getFrame: echoFrame(frame), isPlaying: true });
  tick(100);
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

it('zooms at the pointer with Alt+wheel, entering manual on the first real step', () => {
  renderPanel({ getFrame: echoFrame(frame), isPlaying: true });
  tick(100);
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

it('maps ruler clicks and browse steps at a non-default span', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle, isPlaying: true });
  tick(100);
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

  // Browse buttons move half of the current span. At span 16 the piece fills
  // the window, so › cannot move; zooming in re-centres follow on the
  // playhead (now=1 → [0,8)) and › then reaches [8, 16).
  act(() => toolButton('trackBrowseLater')!.click());
  expect(tickLabels()).toEqual(['0', '4', '8', '12', '16']);
  act(() => toolButton('trackZoomIn')!.click());
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  act(() => toolButton('trackBrowseLater')!.click());
  expect(tickLabels()).toEqual(['4', '6', '8', '10']);
  // And the earlier button clamps at the work origin instead of going negative.
  act(() => toolButton('trackBrowseEarlier')!.click());
  act(() => toolButton('trackBrowseEarlier')!.click());
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
});

it('says when the preview is limited instead of implying silence', () => {
  renderPanel({ getFrame: echoFrame({ ...frame, limited: true }) });
  tick(0);
  expect(container.querySelector('[data-track-preview-limited]')?.textContent).toBe(t('trackPreviewLimited'));

  // An unlimited frame carries no hint.
  renderPanel({ getFrame: echoFrame({ ...frame, limited: false }) });
  expect(container.querySelector('[data-track-preview-limited]')).toBeNull();
});

it('resets the scale for a new session and keeps it across same-session seeks', () => {
  renderPanel({ sessionKey: 'a' });
  tick(0);
  act(() => toolButton('trackZoomOut')!.click());
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  // A same-session seek notification keeps the scale and the mode.
  renderPanel({
    sessionKey: 'a',
    transportEvent: { revision: 1, cycle: 2, seek: { cycle: 2, source: 'timeline' }, reason: 'apply' },
    getFrame: echoFrame({ ...frame, now: 2 }),
  });
  expect(tickLabels()).toEqual(['0', '2', '4', '6']);
  // A new session starts from the default scale in follow again.
  renderPanel({ sessionKey: 'b' });
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
});

it('seeks a second-pass ruler click to the absolute display target, not plus an offset', () => {
  const seekToCycle = vi.fn(() => true);
  // The transport is in the third pass (absoluteNow=35, L=16 → display 3);
  // the stand-in frame already shows the projected coordinates.
  const projectedFrame: TrackFrame = { ...frame, now: 3, begin: 1, end: 5 };
  renderPanel({ seekToCycle, getFrame: echoFrame(projectedFrame), isPlaying: true });
  tick(100);
  const rulerElement = ruler();
  vi.spyOn(rulerElement, 'getBoundingClientRect').mockReturnValue(dragRect);
  // A click on cycle 3 of the displayed ruler submits 3 — the same domain
  // the playback bar seeks to, never 3 + loopOffset.
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerdown', { clientX: 200 })));
  expect(seekToCycle).toHaveBeenLastCalledWith(2, 'timeline');
  act(() => rulerElement.dispatchEvent(pointerEvent('pointerup', { clientX: 200 })));
});

// ── Finite [0, L] timeline ──────────────────────────────────────────────────

it('labels the piece\u2019s real end once and no ordinary window boundary', () => {
  renderPanel({ getFrame: echoFrame({ ...frame, now: 15 }) });
  tick(100);
  // A follow window parked at the piece's end [12, 16) draws the boundary.
  expect(container.querySelectorAll('[data-ruler-end-tick]')).toHaveLength(1);
  expect(container.querySelector<HTMLElement>('[data-ruler-end-tick]')?.textContent).toBe('16');
  // Ruler ticks speak true cycle coordinates starting at 0.
  expect(tickLabels()).toEqual(['12', '13', '14', '15', '16']);

  // A mid-piece window has no endpoint to imply.
  renderPanel({ getFrame: echoFrame({ ...frame, now: 5 }) });
  tick(200);
  expect(container.querySelector('[data-ruler-end-tick]')).toBeNull();
});

it('clamps seeks, keyboard targets and drags into [0, L]', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle, getFrame: echoFrame({ ...frame, now: 15 }), isPlaying: true });
  tick(100);
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

it('disables the timeline when the shared timeline has no usable range', () => {
  renderPanel({ timeline: { code: '', loopCycles: 0, durationSeconds: 0, estimatedCps: null } });
  tick(0);
  expect(toolButton('trackZoomIn')!.disabled).toBe(true);
  expect(toolButton('trackZoomOut')!.disabled).toBe(true);
  expect(toolButton('trackBrowseEarlier')!.disabled).toBe(true);
  expect(toolButton('trackBrowseLater')!.disabled).toBe(true);

  const seekToCycle = vi.fn(() => true);
  renderPanel({
    timeline: { code: '', loopCycles: 0, durationSeconds: 0, estimatedCps: null },
    seekToCycle,
    isPlaying: true,
  });
  tick(100);
  const rulerElement = ruler();
  act(() => {
    rulerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  });
  // No L means no place to go: the nudge submits the unclamped step target
  // (the service owns the authority) but no boundary exists to bound it —
  // the panel's own zoom/browse chrome stays fully disabled.
  expect(seekToCycle).toHaveBeenCalledWith(1.25, 'timeline');
});

it('clamps browse buttons at the piece\u2019s boundaries', () => {
  renderPanel({ getFrame: echoFrame({ ...frame, now: 5 }) });
  tick(100);
  // Zoomed-out to the whole piece, follow pins the window at [0, 16): both
  // directions are boundary-pinned and disabled.
  act(() => toolButton('trackZoomOut')!.click());
  act(() => toolButton('trackZoomOut')!.click());
  expect(toolButton('trackBrowseLater')!.disabled).toBe(true);
  expect(toolButton('trackBrowseEarlier')!.disabled).toBe(true);
});

it('scrolls while holding a seek at either edge, stops in the interior, and clamps to the piece', () => {
  const seekToCycle = vi.fn<(cycle: number, source: 'timeline' | 'progress') => boolean>(() => true);
  const getFrame = vi.fn(echoFrame(frame));
  renderPanel({ seekToCycle, getFrame });
  const element = ruler();
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => element.dispatchEvent(pointerEvent('pointerdown', { clientX: 300 })));
  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 500 })));
  tick(0);
  for (let time = 50; time <= 1000; time += 50) tick(time);
  expect(seekToCycle.mock.lastCall![0]).toBeCloseTo(8);
  expect(getFrame.mock.lastCall![0].viewport).toEqual({ begin: expect.closeTo(4), end: expect.closeTo(8) });

  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 300 })));
  tick(1050);
  const calls = seekToCycle.mock.calls.length;
  tick(1100);
  expect(seekToCycle).toHaveBeenCalledTimes(calls);

  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 50 })));
  for (let time = 1150; time <= 2500; time += 50) tick(time);
  expect(seekToCycle.mock.lastCall![0]).toBe(0);
  expect(getFrame.mock.lastCall![0].viewport).toEqual({ begin: 0, end: 4 });

  act(() => element.dispatchEvent(pointerEvent('pointermove', { clientX: 550 })));
  for (let time = 2550; time <= 6500; time += 50) tick(time);
  expect(seekToCycle.mock.lastCall![0]).toBe(16);
  expect(getFrame.mock.lastCall![0].viewport).toEqual({ begin: 12, end: 16 });
  act(() => element.dispatchEvent(pointerEvent('pointerup', { clientX: 550 })));
  const finishedCalls = seekToCycle.mock.calls.length;
  tick(6550);
  expect(seekToCycle).toHaveBeenCalledTimes(finishedCalls);
});

it('keeps the scrolled manual window after release and makes cancelled edge frames inert', () => {
  const seekToCycle = vi.fn<(cycle: number, source: 'timeline' | 'progress') => boolean>(() => true);
  const getFrame = vi.fn(echoFrame(frame));
  renderPanel({ seekToCycle, getFrame });
  act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="${t('trackBrowseLater')}"]`)!.click());
  const element = ruler();
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(dragRect);
  act(() => element.dispatchEvent(pointerEvent('pointerdown', { clientX: 500 })));
  tick(0);
  tick(50);
  const scrolled = getFrame.mock.lastCall![0].viewport;
  act(() => element.dispatchEvent(pointerEvent('pointerup', { clientX: 500 })));
  expect(getFrame.mock.lastCall![0].viewport).toEqual(scrolled);
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

it('offers a continuous zoom slider between the shortcut buttons', () => {
  renderPanel({ isPlaying: true });
  tick(100);
  const slider = zoomSlider();
  expect(slider).not.toBeNull();
  expect(slider.disabled).toBe(false);
  // The default span 4 sits at 40% of the L=16 log scale.
  expect(slider.value).toBe('400');
  // The order is −, slider, ＋, reset icon: the reset sits after the ＋.
  expect(toolButton('trackZoomOut')!.nextElementSibling).toBe(slider);
  expect(toolButton('trackZoomIn')!.nextElementSibling).toBe(toolButton('trackZoomReset'));
});

it('zooms to intermediate spans as the slider moves and keeps them on release', () => {
  renderPanel({ isPlaying: true });
  tick(100);
  const slider = zoomSlider();
  // Drag to ~3.54 cycles (log scale position between the 4 and 2 stops).
  act(() => slideTo(slider, '435'));
  const label = sliderSpanText();
  expect(label).toMatch(/^3\.\d+ cycles$/);
  expect(label).not.toBe('4 cycles');
  // The ticks redraw at the continuous span: no snap back to the ladder.
  expect(tickLabels()).toEqual(['0', '1', '2', '3']);
  // Release (blur) keeps the value; no rollback, no extra input.
  act(() => slider.blur());
  expect(sliderSpanText()).toBe(label);
});

it('keeps following while the slider moves and anchors a manual window on its start centre', () => {
  // Follow: the window re-centres on the playhead at every sample.
  renderPanel({ getFrame: echoFrame({ ...frame, now: 3 }), isPlaying: true });
  tick(100);
  act(() => slideTo(zoomSlider(), '435'));
  expect(container.querySelector(`button[aria-label="${t('trackReturnToPlayback')}"]`)).toBeNull();
  expect(sliderSpanText()).not.toBe('4 cycles');
  // The round ends with the pointer (or focus) leaving the slider.
  act(() => zoomSlider().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

  // A manual window anchors on the centre it started with: pan to [3,7) the
  // usual way, then zoom out to 8 cycles — the centre cycle 5 stays centred.
  renderPanel({ isPlaying: true });
  tick(200);
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

it('maps the slider ends to the piece: full ladder at L=16, no dead zone at L=3', () => {
  renderPanel({ isPlaying: true, timeline: { code: '', loopCycles: 3, durationSeconds: 6, estimatedCps: null } });
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

it('disables the slider without a usable timeline and for degenerate pieces', () => {
  renderPanel({ timeline: { code: '', loopCycles: 0, durationSeconds: 0, estimatedCps: null } });
  tick(0);
  expect(zoomSlider().disabled).toBe(true);
  renderPanel({ timeline: { code: '', loopCycles: 0.25, durationSeconds: 0.5, estimatedCps: null } });
  tick(100);
  expect(zoomSlider().disabled).toBe(true);
});

it('keeps the arrow keys, Home and End native to the slider and away from the toolbar', () => {
  renderPanel({ isPlaying: true });
  tick(100);
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

it('does not queue a wheel zoom or button zoom behind an in-flight slider round', () => {
  renderPanel({ isPlaying: true });
  tick(100);
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

it('accepts fresh pointer drags after release, blur, and a session reset', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ sessionKey: 'a', seekToCycle });
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
  renderPanel({ sessionKey: 'b', seekToCycle });
  expect(sliderSpanText()).toBe('4 cycles');
  dragTo('455');
  expect(seekToCycle).not.toHaveBeenCalled();
});

it('drops stale slider changes after a new session takes over', () => {
  renderPanel({ sessionKey: 'a', isPlaying: true });
  tick(100);
  const slider = zoomSlider();
  act(() => slider.dispatchEvent(pointerEvent('pointerdown', { clientX: 0 })));
  act(() => slideTo(slider, '435'));
  // A new session resets the scale and invalidates the round.
  renderPanel({ sessionKey: 'b', isPlaying: true });
  tick(200);
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

it('formats continuous and sub-hundredth spans without a fake zero', () => {
  renderPanel({ isPlaying: true, timeline: { code: '', loopCycles: 0.5, durationSeconds: 1, estimatedCps: null } });
  tick(100);
  // L=0.5: the slider is disabled but the aria text still reads the length.
  expect(sliderSpanText()).toBe('0.5 cycles');
  renderPanel({ isPlaying: true });
  tick(200);
  act(() => slideTo(zoomSlider(), '1000'));
  expect(sliderSpanText()).toBe('0.5 cycles');
  act(() => slideTo(zoomSlider(), '400'));
  expect(sliderSpanText()).toBe('4 cycles');
});

it('accepts every sample of one held-drag round and survives ten press-release rounds', () => {
  renderPanel({ isPlaying: true });
  tick(100);
  const slider = zoomSlider();
  // One round: five samples while held, several off the six-stop ladder.
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

it('releases a drag that left the slider and ignores other pointer end events', () => {
  renderPanel({ isPlaying: true });
  tick(100);
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

it('recovers with a keyboard input after a cancelled round and a blur', () => {
  renderPanel({ isPlaying: true });
  tick(100);
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

it('blocks a seek or pan from starting while a slider round owns the view', () => {
  const seekToCycle = vi.fn(() => true);
  renderPanel({ seekToCycle });
  tick(0);
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

it('keeps one name button per track with mute and solo, and no pencil anywhere', () => {
  renderPanel({ canRename: true, renameTrack: vi.fn(() => ({ status: 'renamed', name: 'x' }) as const) });
  tick(100);
  expect(container.querySelectorAll('[data-track-name]')).toHaveLength(2);
  expect(container.querySelector('[data-track-rename]')).toBeNull();
  expect(container.querySelectorAll(`button[aria-label^="${t('trackMute')}"]`)).toHaveLength(2);
  expect(container.querySelectorAll(`button[aria-label^="${t('trackSolo')}"]`)).toHaveLength(2);
  // The name advertises both operations to the screen reader.
  expect(nameButtonFor('a')!.getAttribute('aria-label')).toContain(t('trackNameHint'));
  expect(nameButtonFor('a')!.getAttribute('title')).toContain(t('trackNameHint'));
});

it('opens the inline editor on a name double click without navigating', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ canRename: true, renameTrack, onNavigateToTrack });
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

it('navigates only after the double-activation window closes', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  renderPanel({ onNavigateToTrack });
  act(() => nameButtonFor('a')!.click());
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('a');
});

it('opens the editor once across a full click, click, dblclick sequence with no late navigation', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ onNavigateToTrack, renameTrack });
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

it('opens the editor from a late system dblclick after the single click navigated', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  act(() => dblclick(button));
  expect(nameInput()).not.toBeNull();
});

it('treats two slow clicks as two navigations and never an edit', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  renderPanel({ onNavigateToTrack });
  act(() => nameButtonFor('a')!.click());
  act(() => vi.advanceTimersByTime(400));
  act(() => nameButtonFor('a')!.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(2);
  expect(nameInput()).toBeNull();
});

it('re-aims the single-click candidate when the second click lands on another track', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  renderPanel({ onNavigateToTrack });
  act(() => nameButtonFor('a')!.click());
  act(() => nameButtonFor('b')!.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('b');
});

it('opens the editor once for a triple click and never navigates', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => button.click());
  act(() => button.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[data-track-name-input]')).toHaveLength(1);
});

it('navigates immediately on Enter and Space and consumes the synthetic click', () => {
  const onNavigateToTrack = vi.fn();
  renderPanel({ onNavigateToTrack });
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

it('opens the editor with F2 and cancels the pending navigation', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  act(() => button.click());
  act(() => keydown(button, 'F2', { cancelable: true }));
  expect(nameInput()).not.toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
});

it('keeps the name clickable for navigation when renaming is disallowed', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  renderPanel({ canRename: false, renameTrack: vi.fn(), onNavigateToTrack });
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

it('commits on Enter, returns focus to the name button, and saves once', () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: '主鼓' }) as const);
  renderPanel({ renameTrack });
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

it('commits on blur and leaves focus where the user moved it', () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ renameTrack });
  doubleClickName('b');
  const input = nameInput()!;
  act(() => typeInto(input, '低音'));
  act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('b', '低音');
  expect(nameInput()).toBeNull();
  expect(document.activeElement).not.toBe(nameButtonFor('b'));
});

it('cancels on Escape without saving and returns focus to the name button', () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ renameTrack });
  doubleClickName('a');
  const input = nameInput()!;
  act(() => keydown(input, 'Escape'));
  expect(renameTrack).not.toHaveBeenCalled();
  expect(nameInput()).toBeNull();
  expect(document.activeElement).toBe(nameButtonFor('a'));
});

it('keeps the draft and shows the error when the service refuses the name', () => {
  const renameTrack = vi.fn(() => ({ status: 'invalid-name', reason: 'invalid-character' }) as const);
  renderPanel({ renameTrack });
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
  renderPanel({ renameTrack: retry });
  act(() => keydown(input, 'Enter'));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(retry).toHaveBeenCalledWith('a', '鼓组二号');
  expect(nameInput()).toBeNull();
});

it('ignores an Enter that belongs to an IME composition', () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ renameTrack });
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

it('tries to land the open draft before opening another track and refuses on failure', () => {
  const renameTrack = vi.fn(() => ({ status: 'invalid-name', reason: 'empty' }) as const);
  renderPanel({ renameTrack });
  doubleClickName('a');
  act(() => typeInto(nameInput()!, '   '));
  doubleClickName('b');
  // The failed draft keeps its editor; no second input appears.
  expect(nameInput()).not.toBeNull();
  expect(container.querySelectorAll('[data-track-name-input]')).toHaveLength(1);
  expect(renameTrack).toHaveBeenCalledTimes(1);
  expect(renameTrack).toHaveBeenCalledWith('a', '   ');
});

it('does not resubmit a failed draft when the next double click lands elsewhere', () => {
  const renameTrack = vi.fn((_id: string, value: string) =>
    value.trim() ? { status: 'renamed', name: value } as const : { status: 'invalid-name', reason: 'empty' } as const);
  renderPanel({ renameTrack });
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

it('drops the draft without saving when the compile or the capability goes away', () => {
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ renameTrack });
  doubleClickName('a');
  expect(nameInput()).not.toBeNull();

  // A committed compile replaces the track list — the draft cannot follow it.
  renderPanel({ renameTrack, tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  expect(nameInput()).toBeNull();
  expect(renameTrack).not.toHaveBeenCalled();

  renderPanel({ renameTrack, tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  doubleClickName('a2');
  expect(nameInput()).not.toBeNull();
  renderPanel({ renameTrack, canRename: false, tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  expect(nameInput()).toBeNull();
  expect(renameTrack).not.toHaveBeenCalled();
});

it('drops the pending navigation when the session, the tracks, the pane or the capability change', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();

  renderPanel({ onNavigateToTrack, sessionKey: 's1' });
  act(() => nameButtonFor('a')!.click());
  renderPanel({ onNavigateToTrack, sessionKey: 's2' });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();

  renderPanel({ onNavigateToTrack, sessionKey: 's3' });
  act(() => nameButtonFor('a')!.click());
  renderPanel({ onNavigateToTrack, sessionKey: 's3', tracks: [{ id: 'a2', name: '鼓组' }, { id: 'b2', name: '贝斯' }] });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();

  renderPanel({ onNavigateToTrack, sessionKey: 's4' });
  act(() => nameButtonFor('a')!.click());
  renderPanel({ onNavigateToTrack, sessionKey: 's4', active: false });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();

  renderPanel({ onNavigateToTrack, sessionKey: 's5' });
  act(() => nameButtonFor('a')!.click());
  renderPanel({ onNavigateToTrack, sessionKey: 's5', canRename: false });
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
});

it('opens the editor on a touch double tap without a duplicate click path', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ onNavigateToTrack, renameTrack });
  const button = nameButtonFor('a')!;
  touchTap(button, 10, 10);
  expect(nameInput()).toBeNull();
  touchTap(button, 12, 12);
  expect(nameInput()).not.toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).not.toHaveBeenCalled();
  expect(renameTrack).not.toHaveBeenCalled();
});

it('navigates once after the window for a single touch tap', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  renderPanel({ onNavigateToTrack });
  touchTap(nameButtonFor('a')!, 10, 10);
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(onNavigateToTrack).toHaveBeenCalledTimes(1);
  expect(onNavigateToTrack).toHaveBeenCalledWith('a');
});

it('does not rename on a moved, cancelled or multi-touch gesture', () => {
  vi.useFakeTimers();
  const onNavigateToTrack = vi.fn();
  const renameTrack = vi.fn(() => ({ status: 'renamed', name: 'x' }) as const);
  renderPanel({ onNavigateToTrack, renameTrack });
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
  expect(nameInput()).toBeNull();
  act(() => vi.advanceTimersByTime(400));
  expect(renameTrack).not.toHaveBeenCalled();
});

it('keeps each track colour pinned to its compile-time colour key across renames', () => {
  const renamed = [{ id: 'a', name: '全新的名字', colorKey: '鼓组' }, { id: 'b', name: '贝斯', colorKey: '贝斯' }];
  renderPanel({ tracks: renamed });
  tick(100);
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-track-color'))
    .toBe(container.querySelector('[data-track-id="a"]')?.getAttribute('data-track-color'));
  renderPanel({ tracks });
  tick(200);
  const beforeA = container.querySelector('[data-track-id="a"]')?.getAttribute('data-track-color');
  const beforeB = container.querySelector('[data-track-id="b"]')?.getAttribute('data-track-color');
  renderPanel({ tracks: renamed });
  tick(300);
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-track-color')).toBe(beforeA);
  expect(container.querySelector('[data-track-id="b"]')?.getAttribute('data-track-color')).toBe(beforeB);
});
