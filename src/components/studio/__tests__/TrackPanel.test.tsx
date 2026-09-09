// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TrackPanel from '../TrackPanel';
import { t } from '../../../lib/i18n';
import type { TrackFrame } from '../../../services/track-preview';

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
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const tracks = [{ id: 'a', name: '鼓组' }, { id: 'b', name: '贝斯' }];
const frame: TrackFrame = { now: 1, begin: -1, end: 3, events: [
  { trackId: 'a', begin: .9, end: 1.2, sound: 'bd', pitch: null },
  { trackId: 'b', begin: 1.5, end: 2, sound: 'sawtooth', pitch: 36 },
] };
function tick(time: number) { const queue = [...frames.values()]; frames.clear(); act(() => queue.forEach(cb => cb(time))); }

it('shows all layer notes and highlights only audible current notes during solo', () => {
  const selected: string[] = [];
  act(() => root.render(<TrackPanel tracks={tracks} soloId="b" toggleSolo={id => selected.push(id)} getFrame={() => frame} isPlaying={true} isPaused={false} active />));
  tick(100);
  const buttons = container.querySelectorAll('button');
  expect([...buttons].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  expect(container.querySelectorAll('[data-track-note]')).toHaveLength(2);
  expect(container.querySelector('[data-track-id="a"]')?.getAttribute('data-muted')).toBe('true');
  expect(container.querySelector('[data-track-id="b"]')?.getAttribute('data-muted')).toBe('false');
  expect(container.querySelectorAll('[data-sounding="true"]')).toHaveLength(0);
  act(() => buttons[0].click()); expect(selected).toEqual(['a']);
});

it('keeps the current note highlight while paused and clears it after stopping', () => {
  const render = (isPlaying: boolean, isPaused: boolean) => act(() => root.render(
    <TrackPanel tracks={tracks} soloId={null} toggleSolo={() => {}} getFrame={() => frame} isPlaying={isPlaying} isPaused={isPaused} active />,
  ));
  const soundingNotes = () => container.querySelectorAll('[data-track-note][data-sounding="true"]');

  render(true, false);
  tick(100);
  const playingNote = soundingNotes()[0];
  expect(soundingNotes()).toHaveLength(1);
  expect(playingNote).not.toBeUndefined();

  render(false, true);
  tick(200);
  const pausedNote = soundingNotes()[0];
  expect(soundingNotes()).toHaveLength(1);
  expect(pausedNote?.getAttribute('height')).toBe(playingNote?.getAttribute('height'));
  expect(pausedNote?.getAttribute('opacity')).toBe(playingNote?.getAttribute('opacity'));

  render(false, false);
  tick(300);
  expect(soundingNotes()).toHaveLength(0);
});

it('stops sampling when the pane is hidden and draws a paused frame without a continuing loop', () => {
  const getFrame = vi.fn(() => frame);
  const render = (active: boolean, isPlaying: boolean, isPaused = false) => act(() => root.render(<TrackPanel tracks={tracks} soloId={null} toggleSolo={() => {}} getFrame={getFrame} isPlaying={isPlaying} isPaused={isPaused} active={active} />));
  render(true, true); tick(100); expect(getFrame).toHaveBeenCalledTimes(1);
  render(false, true); tick(200); expect(getFrame).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  render(true, false, true); tick(300); expect(getFrame).toHaveBeenCalledTimes(2); expect(frames.size).toBe(0);
});

it('redraws a paused frame when a seek revision changes', () => {
  const getFrame = vi.fn(() => frame);
  const render = (refreshRevision: number) => act(() => root.render(
    <TrackPanel tracks={tracks} soloId={null} toggleSolo={() => {}} getFrame={getFrame} isPlaying={false} isPaused={false} active refreshRevision={refreshRevision} />,
  ));

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
  act(() => root.render(<TrackPanel tracks={[]} soloId={null} toggleSolo={() => {}} getFrame={() => frame} isPlaying={true} isPaused={false} active />));
  expect(container.textContent).toContain(t('tracksUnsupported'));
  expect(container.querySelectorAll('button')).toHaveLength(0);
});
