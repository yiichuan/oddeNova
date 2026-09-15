// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import StudioVisualizer from '../StudioVisualizer';
import { strudelService } from '../../../services/strudel';
import { t } from '../../../lib/i18n';

/** A real finite range so the ruler and its zoom chrome stay enabled. */
const timeline = { code: 'x', loopCycles: 16, durationSeconds: 32, estimatedCps: null };

afterEach(() => { strudelService.trackPreview.reset(); vi.restoreAllMocks(); });
it('switches views, restores the mix when leaving audition, and resets solo across sessions with identical code', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (scopeKey: string, animationEnabled = true, hasCode = true, engineReady = true) => act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={animationEnabled} scopeKey={scopeKey} hasCode={hasCode} engineReady={engineReady} playbackTimeline={timeline} />,
  ));
  render('a');
  act(() => strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } }));
  const tab = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent === text)!;
  expect(tab(t('animationView')).getAttribute('aria-selected')).toBe('true');
  act(() => tab(t('tracksView')).click());
  expect(tab(t('tracksView')).getAttribute('aria-selected')).toBe('true');
  const solo = () => container.querySelector<HTMLButtonElement>(`button[aria-label="${t('trackSolo')} 贝斯"]`)!;
  act(() => solo().click());
  expect(solo().getAttribute('aria-pressed')).toBe('true');
  render('b', true, true, false); expect(solo()).toBeNull();
  expect(container.textContent).toContain(t('tracksPreparing'));
  act(() => strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } }));
  render('b', true, true);
  act(() => solo().click()); act(() => tab(t('animationView')).click());
  expect(strudelService.trackPreview.snapshot.soloId).toBeNull();
  render('b', false);
  expect(solo()).not.toBeNull();
  expect(container.querySelector('iframe')).toBeNull();
  act(() => root.unmount());
});

it('resets the track scale for a new session but keeps it across solos', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const commitBass = () => act(() => strudelService.trackPreview.commit(
    { queryArc: () => [] },
    { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } },
  ));
  const render = (scopeKey: string) => act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={false} scopeKey={scopeKey} hasCode engineReady playbackTimeline={timeline} />,
  ));
  const rulerTicks = () => [...container.querySelectorAll<HTMLElement>('.track-ruler-tick')].map(node => node.textContent);
  const zoomOut = () => [...container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')]
    .find(b => b.getAttribute('aria-label') === t('trackZoomOut'))!;

  render('a');
  commitBass();
  expect(rulerTicks()).toEqual(['0', '1', '2', '3']);
  act(() => zoomOut().click());
  expect(rulerTicks()).toEqual(['0', '2', '4', '6']);
  // A solo (and a mute or refresh) shares the session and keeps the scale.
  act(() => [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => b.getAttribute('aria-label') === `${t('trackSolo')} 贝斯`)!.click());
  expect(rulerTicks()).toEqual(['0', '2', '4', '6']);
  // A new session starts from the default scale again.
  render('b');
  commitBass();
  expect(rulerTicks()).toEqual(['0', '1', '2', '3']);
  act(() => root.unmount());
  strudelService.trackPreview.reset();
});

it('prepares tracks on demand while stopped', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const prepare = vi.spyOn(strudelService, 'prepareTrackPreview').mockImplementation(async () => {
    strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] } });
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled scopeKey="stopped" hasCode engineReady playbackTimeline={timeline} />,
  ));
  const tracksTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find(button => button.textContent === t('tracksView'))!;

  await act(async () => {
    tracksTab.click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(prepare).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-track-id="bass"]')).not.toBeNull();
  expect(container.textContent).not.toContain('All tracks');
  expect(container.textContent).not.toContain('全部音轨');
  act(() => root.unmount());
});

it('shows a hint instead of scrolling when the code has drifted from the compile', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const service = strudelService as unknown as {
    editorInstance: { repl: object; editor: { dispatch: () => void; state: { doc: { toString(): string } } } } | null;
  };
  const dispatch = vi.fn();
  service.editorInstance = { repl: {}, editor: { dispatch, state: { doc: { toString: () => 'the user edited this' } } } };
  strudelService.trackPreview.commit({ queryArc: () => [] }, {
    oddenovaTracks: { tracks: [{ id: 'melody', name: 'MELODY', sourceRange: { from: 6, to: 13 } }], sourceCode: 'the compiled code' },
  });

  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () => act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={false} scopeKey="stale" hasCode engineReady playbackTimeline={timeline} />,
  ));
  render();
  const name = container.querySelector<HTMLButtonElement>('[data-track-id="melody"] [data-track-name]')!;
  vi.useFakeTimers();
  act(() => name.click());
  // The single click waits out the double-activation window first.
  expect(dispatch).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(400));
  expect(dispatch).not.toHaveBeenCalled();
  const hint = container.querySelector('[data-testid="track-code-stale-hint"]');
  expect(hint?.textContent).toBe(t('trackCodeStale'));
  vi.useRealTimers();
  act(() => root.unmount());
  service.editorInstance = null;
});

it('dispatches the reveal when the document still matches the compile', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = 'stack(/* @layer MELODY */ s("bd"))';
  const service = strudelService as unknown as {
    editorInstance: { repl: object; editor: { dispatch: () => void; state: { doc: { toString(): string } } } } | null;
  };
  const dispatch = vi.fn();
  service.editorInstance = { repl: {}, editor: { dispatch, state: { doc: { toString: () => code } } } };
  strudelService.trackPreview.commit({ queryArc: () => [] }, {
    oddenovaTracks: { tracks: [{ id: 'melody', name: 'MELODY', sourceRange: { from: 6, to: 13 } }], sourceCode: code },
  });

  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () => act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={false} scopeKey="match" hasCode engineReady playbackTimeline={timeline} />,
  ));
  render();
  const name = container.querySelector<HTMLButtonElement>('[data-track-id="melody"] [data-track-name]')!;
  vi.useFakeTimers();
  act(() => name.click());
  expect(dispatch).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(400));
  expect(dispatch).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-testid="track-code-stale-hint"]')).toBeNull();
  vi.useRealTimers();
  act(() => root.unmount());
  service.editorInstance = null;
});

it('gates renaming on the renameEnabled flag from the app mode', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (renameEnabled: boolean) => act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={false} scopeKey="rename" hasCode engineReady playbackTimeline={timeline} renameEnabled={renameEnabled} />,
  ));
  render(true);
  act(() => strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'a', name: '鼓组' }] } }));
  const name = () => container.querySelector<HTMLButtonElement>('[data-track-id="a"] [data-track-name]')!;
  expect(name().getAttribute('title')).toContain(t('trackNameHint'));
  act(() => root.unmount());
  container.remove();
});

it('calls onTrackReveal once after the single-click window and never on a double click', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const onTrackReveal = vi.fn(() => 'immediate' as const);
  act(() => strudelService.trackPreview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'melody', name: 'MELODY' }] } }));
  act(() => root.render(
    <StudioVisualizer isPlaying={false} isPaused={false} visible animationEnabled={false} scopeKey="reveal" hasCode engineReady playbackTimeline={timeline} onTrackReveal={onTrackReveal} />,
  ));
  const name = container.querySelector<HTMLButtonElement>('[data-track-id="melody"] [data-track-name]')!;
  vi.useFakeTimers();
  act(() => name.click());
  // A first click must not swap panes before the window closes.
  expect(onTrackReveal).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(400));
  expect(onTrackReveal).toHaveBeenCalledTimes(1);
  expect(onTrackReveal).toHaveBeenCalledWith('melody');
  // A double click opens the editor instead and never calls the reveal.
  act(() => name.click());
  act(() => name.click());
  act(() => vi.advanceTimersByTime(400));
  expect(onTrackReveal).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-track-name-input]')).not.toBeNull();
  vi.useRealTimers();
  act(() => root.unmount());
});
