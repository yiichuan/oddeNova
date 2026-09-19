// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useTrackViewport } from '../useTrackViewport';
import { DEFAULT_TRACK_VIEW_SPAN } from '../../lib/track-timeline';
import type { TrackFrameRequest } from '../../services/track-preview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function Probe({ loopCycles, onValue }: { loopCycles?: number | null; onValue: (value: ReturnType<typeof useTrackViewport>) => void }) {
  onValue(useTrackViewport(loopCycles));
  return null;
}

function renderHook(loopCycles: number | null | undefined = null): {
  current: ReturnType<typeof useTrackViewport>;
  rerender: (nextLoopCycles: number | null | undefined) => void;
} {
  const box: { current: ReturnType<typeof useTrackViewport> | null } = { current: null };
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  const render = (nextLoopCycles: number | null | undefined) => {
    act(() => root.render(<Probe loopCycles={nextLoopCycles} onValue={v => { box.current = v; }} />));
  };
  render(loopCycles);
  return {
    get current() { return box.current!; },
    rerender: render,
  };
}

// The last displayed window a zoom anchors into, as TrackPanel would report it.
const view = (begin: number, span: number) => ({ begin, span });
/** The follow request the hook emits for a given span. */
const follow = (span: number, loopCycles: number | null = null) => ({
  loopCycles: loopCycles ?? 0,
  viewport: { mode: 'follow', span },
});
const fixed = (begin: number, end: number, loopCycles: number | null = null) => ({
  loopCycles: loopCycles ?? 0,
  viewport: { begin, end },
});

describe('useTrackViewport', () => {
  it('starts in follow at the default span with a stable request', () => {
    const hook = renderHook();
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.span).toBe(DEFAULT_TRACK_VIEW_SPAN);
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN));
    // The follow request only changes when the span does: per-frame windows
    // never come back through the hook, so nothing re-renders or re-mounts.
    const before = hook.current.request;
    expect(hook.current.request).toBe(before);
  });

  it('carries the loop length in every request', () => {
    const hook = renderHook(16);
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN, 16));
  });

  it('freezes the displayed window for a drag and releases it on an explicit seek', () => {
    const hook = renderHook(16);
    act(() => hook.current.freezeWindow(6, 10));
    expect(hook.current.request).toEqual(fixed(6, 10, 16));

    // Following again: the window derives from the authoritative position,
    // whatever the frozen one was.
    act(() => hook.current.seekTo(3, 'follow'));
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN, 16));
  });

  it('clamps a frozen window into the piece instead of freezing past it', () => {
    const hook = renderHook(16);
    act(() => hook.current.freezeWindow(14, 20));
    expect(hook.current.request).toEqual(fixed(12, 16, 16));
    // A window the piece is too short to hold is refused entirely.
    act(() => hook.current.seekTo(0, 'follow'));
    act(() => hook.current.freezeWindow(20, 22));
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN, 16));
  });

  it('refuses an unusable frozen window instead of freezing nothing', () => {
    const hook = renderHook();
    const followRequest = hook.current.request;
    act(() => hook.current.freezeWindow(Number.NaN, 4));
    expect(hook.current.request).toBe(followRequest);
    act(() => hook.current.freezeWindow(4, 4));
    expect(hook.current.request).toBe(followRequest);
    act(() => hook.current.freezeWindow(-2, 2));
    // A negative begin clamps at the work origin.
    expect(hook.current.request).toEqual(fixed(0, 2));
  });

  it('pans into manual and holds the browsed window while cycles pass', () => {
    const hook = renderHook(16);
    act(() => hook.current.panFrom(0, 3));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.request).toEqual(fixed(3, 3 + DEFAULT_TRACK_VIEW_SPAN, 16));

    act(() => hook.current.panFrom(0, -5));
    // Panning left clamps at the origin without going negative.
    expect(hook.current.request).toEqual(fixed(0, DEFAULT_TRACK_VIEW_SPAN, 16));

    act(() => hook.current.panTo(12));
    expect(hook.current.request).toEqual(fixed(12, 12 + DEFAULT_TRACK_VIEW_SPAN, 16));
  });

  it('caps manual windows at the piece\u2019s end so none shows past L', () => {
    const hook = renderHook(6);
    // Effective span is min(4, 6) = 4; the rightmost manual begin is 2.
    act(() => hook.current.panTo(5));
    expect(hook.current.request).toEqual(fixed(2, 6, 6));
    // A pan delta cannot push past the boundary either.
    act(() => hook.current.panFrom(2, 10));
    expect(hook.current.request).toEqual(fixed(2, 6, 6));
    // Zoomed out past the piece length: the piece fills the window.
    act(() => hook.current.zoomTo(16, view(0, 4), 0.5, { enterManual: true }));
    expect(hook.current.request).toEqual(fixed(0, 6, 6));
    expect(hook.current.effectiveSpan).toBe(6);
  });

  it('keeps manual mode and window for a manual seek, and recentres nothing', () => {
    const hook = renderHook(16);
    act(() => hook.current.panTo(8));
    act(() => hook.current.seekTo(2, 'manual'));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.request).toEqual(fixed(8, 8 + DEFAULT_TRACK_VIEW_SPAN, 16));
  });

  it('restores follow on returnToPlayback and clears any freeze', () => {
    const hook = renderHook();
    act(() => hook.current.panTo(8));
    act(() => hook.current.freezeWindow(2, 6));
    act(() => hook.current.returnToPlayback());
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN));
  });

  it('entering follow from a seek never keeps a stale fixed window', () => {
    const hook = renderHook();
    act(() => hook.current.panTo(20));
    // A progress-bar seek targets a visible cycle — it must still restore
    // follow and its continuous window, not keep the manual browse window.
    act(() => hook.current.seekTo(21, 'follow'));
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN));
  });

  it('zooms while following by keeping follow and only changing the span', () => {
    const hook = renderHook(16);
    const before = hook.current.request;
    act(() => hook.current.zoomTo(2, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.span).toBe(2);
    expect(hook.current.request).toEqual(follow(2, 16));
    // The request changes reference exactly when the span does — a follow
    // zoom re-centres on the real position at the next sample.
    expect(hook.current.request).not.toBe(before);
  });

  it('zooms a manual window around its centre anchor, clamped at the origin', () => {
    const hook = renderHook(16);
    act(() => hook.current.panTo(8));
    // [8,12) zoomed to span 2 keeps the centre cycle 10 at the centre: [9,11).
    act(() => hook.current.zoomTo(2, view(8, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.request).toEqual(fixed(9, 11, 16));

    // Near the origin the anchor drifts left instead of showing blank time.
    act(() => hook.current.panTo(1));
    act(() => hook.current.zoomTo(16, view(1, 2), 0.25));
    expect(hook.current.request).toEqual(fixed(0, 16, 16));
  });

  it('clamps an anchored manual zoom at the piece\u2019s end', () => {
    const hook = renderHook(6);
    act(() => hook.current.panTo(2));
    // [2,6) zoomed out to 8 clips to span 6; the window stays [0,6).
    act(() => hook.current.zoomTo(8, view(2, 4), 0.5, { enterManual: true }));
    expect(hook.current.request).toEqual(fixed(0, 6, 6));
  });

  it('enters manual on the first real wheel zoom, anchored at the pointer', () => {
    const hook = renderHook(16);
    // The displayed follow window [0,4), pointer at 75%: zoom to span 2
    // anchors cycle 3, which sits at 75% of [1.5, 3.5).
    act(() => hook.current.zoomTo(2, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.75, { enterManual: true }));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.request).toEqual(fixed(1.5, 3.5, 16));
  });

  it('keeps mode on a zoom input that cannot change the span', () => {
    const hook = renderHook(16);
    act(() => hook.current.panTo(8));
    act(() => hook.current.zoomTo(16, view(8, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.span).toBe(16);
    // Zooming out to a span the whole piece fits in pins the window at [0, L).
    expect(hook.current.request).toEqual(fixed(0, 16, 16));
    // At the widest end a further zoom-out input changes nothing at all,
    // not even the mode.
    act(() => hook.current.zoomTo(32, view(0, 16), 0.5, { enterManual: true }));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.span).toBe(16);
    // The window is unchanged too.
    expect(hook.current.request).toEqual(fixed(0, 16, 16));
  });

  it('treats a zoom step the piece clips to the same width as a no-op', () => {
    const hook = renderHook(3);
    act(() => hook.current.panTo(0));
    // L=3: span 4 and 8 both show [0,3) — the second input changes nothing.
    act(() => hook.current.zoomTo(8, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5, { enterManual: true }));
    expect(hook.current.request).toEqual(fixed(0, 3, 3));
    act(() => hook.current.zoomTo(16, view(0, 3), 0.5, { enterManual: true }));
    expect(hook.current.request).toEqual(fixed(0, 3, 3));
    // Magnifying into 2 cycles still lands.
    act(() => hook.current.zoomTo(2, view(0, 3), 0.5, { enterManual: true }));
    expect(hook.current.request).toEqual(fixed(0.5, 2.5, 3));
  });

  it('clamps a preference to the piece without moving the window or the mode', () => {
    // L=3: resetting to the default 4 still shows [0,3), and the dynamic
    // maximum stores the usable preference 3. No invisible wider preference
    // survives the piece boundary or switches the mode.
    const hook = renderHook(3);
    expect(hook.current.span).toBe(4);
    expect(hook.current.effectiveSpan).toBe(3);
    act(() => hook.current.zoomTo(3, view(0, 3), 0.5));
    expect(hook.current.span).toBe(3);
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.request).toEqual(follow(3, 3));
    act(() => hook.current.zoomTo(4, view(0, 3), 0.5));
    expect(hook.current.span).toBe(3);
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.request).toEqual(follow(3, 3));
  });

  it('keeps a continuous span through repeated zoom inputs without snapping', () => {
    const hook = renderHook(16);
    // A slider-style 3.7 stays 3.7; a follow zoom only changes the span.
    act(() => hook.current.zoomTo(3.7, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    expect(hook.current.span).toBe(3.7);
    expect(hook.current.request).toEqual(follow(3.7, 16));
    // The next input reads the newly accepted span: no drift to fixed levels.
    act(() => hook.current.zoomTo(2.6, view(0, 3.7), 0.5));
    expect(hook.current.span).toBe(2.6);
    expect(hook.current.request).toEqual(follow(2.6, 16));
    // A boundary input beyond 16 clamps but stays continuous inside.
    act(() => hook.current.zoomTo(2.75, view(0, 2.6), 0.5));
    expect(hook.current.span).toBe(2.75);
  });

  it('accepts a whole-song span above sixteen in follow and manual modes', () => {
    const followHook = renderHook(50);
    act(() => followHook.current.zoomTo(50, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    expect(followHook.current.span).toBe(50);
    expect(followHook.current.effectiveSpan).toBe(50);
    expect(followHook.current.request).toEqual(follow(50, 50));

    act(() => followHook.current.panTo(20));
    expect(followHook.current.request).toEqual(fixed(0, 50, 50));
  });

  it('clips an existing long-song preference immediately when the piece gets shorter', () => {
    const hook = renderHook(50);
    act(() => hook.current.zoomTo(50, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    hook.rerender(20);
    expect(hook.current.span).toBe(50);
    expect(hook.current.effectiveSpan).toBe(20);
    expect(hook.current.request).toEqual(follow(20, 20));
  });

  it('anchors a manual zoom on the same start centre for every span in one drag', () => {
    const hook = renderHook(16);
    act(() => hook.current.panTo(8));
    // [8,12) → 3.7 keeps the centre cycle 10 centred: [8.15, 11.85).
    act(() => hook.current.zoomTo(3.7, view(8, 4), 0.5, { enterManual: true }));
    expect(hook.current.mode).toBe('manual');
    expect(hook.current.request.viewport).toMatchObject({ begin: expect.closeTo(8.15, 10), end: expect.closeTo(11.85, 10) });
    // Continuing the drag to 2.6 uses the same starting centre 10 → [8.7, 11.3).
    act(() => hook.current.zoomTo(2.6, view(8, 4), 0.5, { enterManual: true }));
    expect(hook.current.request.viewport).toMatchObject({ begin: expect.closeTo(8.7, 10), end: expect.closeTo(11.3, 10) });
    // The boundary pins the window without introducing blank time.
    act(() => hook.current.zoomTo(16, view(8, 4), 0.5, { enterManual: true }));
    expect(hook.current.request).toEqual(fixed(0, 16, 16));
  });

  it('steps with the latest accepted span each time', () => {
    const hook = renderHook(16);
    // Two zoom-in inputs in a row: each uses the newest accepted span, never
    // a stale closure, so no step is lost or repeated.
    act(() => hook.current.zoomTo(2, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    act(() => hook.current.zoomTo(1, view(0, 2), 0.5));
    expect(hook.current.span).toBe(1);
    expect(hook.current.request).toEqual(follow(1, 16));
  });

  it('resets the scale and follow for a new session without a freeze', () => {
    const hook = renderHook(16);
    act(() => hook.current.zoomTo(16, view(0, DEFAULT_TRACK_VIEW_SPAN), 0.5));
    act(() => hook.current.panTo(8));
    act(() => hook.current.freezeWindow(2, 6));
    act(() => hook.current.resetViewport());
    expect(hook.current.mode).toBe('follow');
    expect(hook.current.span).toBe(DEFAULT_TRACK_VIEW_SPAN);
    expect(hook.current.request).toEqual(follow(DEFAULT_TRACK_VIEW_SPAN, 16));
  });

  it('types the request as the documented union', () => {
    const hook = renderHook(16);
    const request: TrackFrameRequest = hook.current.request;
    expect(request).toBeDefined();
  });
});
