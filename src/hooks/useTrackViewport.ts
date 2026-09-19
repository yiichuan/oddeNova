import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_TRACK_VIEW_SPAN,
  anchoredWindowBegin,
  clampCycle,
  clampZoomSpan,
  effectiveZoomSpan,
  pannedBegin,
  validLoopCycles,
} from '../lib/track-timeline';
import type { TrackFrameRequest } from '../services/track-preview';

export type TrackViewportMode = 'follow' | 'manual';

/**
 * The viewport lives in one state transaction: mode, span and the manual
 * window begin move together, so a zoom can never show a half-applied frame
 * (mode changed, range not yet). The follow request only changes its
 * reference when the span changes — per-frame windows are derived from the
 * cycle sampled in the same read, never from state here.
 */
interface ViewportState {
  mode: TrackViewportMode;
  /** The zoom preference in cycles, continuous up to the current piece's
   *  length; the *effective* span is always min(span, L). */
  span: number;
  manualBegin: number;
}

const INITIAL: ViewportState = { mode: 'follow', span: DEFAULT_TRACK_VIEW_SPAN, manualBegin: 0 };

/** The last displayed window a zoom anchors into, handed over by the caller. */
export interface ZoomAnchorView { begin: number; span: number }

/**
 * The track view's browsing request, independent of the transport.
 *
 * `follow` derives the window from the displayed playhead each sample
 * (continuous centred scrolling); `manual` holds whatever window the user
 * browsed to while the music keeps playing. A frozen window — captured when
 * a timeline drag starts — overrides both until the gesture ends, so a seek
 * that moves the playhead never moves what the same pointer position means.
 * Seeks made from the timeline restore the mode they started in; seeks made
 * from the top progress bar (and stops, and code rewinds) always restore
 * follow.
 *
 * Every request is constrained to the piece's finite [0, L] range before it
 * leaves the hook: manual and frozen windows are clamped in the same
 * transaction that accepts them, so no frame ever shows or queries time
 * beyond the song.
 */
export function useTrackViewport(loopCycles: number | null | undefined = null) {
  const [state, setState] = useState<ViewportState>(INITIAL);  // State, not a ref: freezing must redraw immediately, even while paused —
  // a ref alone would wait for the next playing frame that never comes.
  const [frozen, setFrozen] = useState<{ begin: number; end: number } | null>(null);

  /** Hold the window exactly as it is displayed while a seek drag moves the playhead. */
  const freezeWindow = useCallback((begin: number, end: number) => {
    if (!Number.isFinite(begin) || !Number.isFinite(end) || end <= begin) return;
    let clampedBegin = Math.max(0, begin);
    let clampedEnd = end;
    if (validLoopCycles(loopCycles)) {
      clampedEnd = Math.min(clampedEnd, loopCycles);
      clampedBegin = Math.min(clampedBegin, clampedEnd);
    }
    if (clampedEnd <= clampedBegin) return;
    setFrozen({ begin: clampedBegin, end: clampedEnd });
  }, [loopCycles]);

  /** A pan delta applied to the window a drag started from; enters manual. */
  const panFrom = useCallback((dragBegin: number, deltaCycles: number) => {
    setFrozen(null);
    setState(prev => {
      const span = effectiveZoomSpan(prev.span, loopCycles ?? null);
      const begin = pannedBegin(dragBegin, deltaCycles, loopCycles ?? null);
      return { ...prev, mode: 'manual', manualBegin: Math.min(begin, Math.max(0, (loopCycles ?? Infinity) - span)) };
    });
  }, [loopCycles]);

  /** Move the window to an absolute begin (browse buttons); enters manual. */
  const panTo = useCallback((begin: number) => {
    setFrozen(null);
    setState(prev => {
      const span = effectiveZoomSpan(prev.span, loopCycles ?? null);
      const clamped = clampCycle(begin, loopCycles ?? null);
      return { ...prev, mode: 'manual', manualBegin: Math.min(clamped, Math.max(0, (loopCycles ?? Infinity) - span)) };
    });
  }, [loopCycles]);

  /** An explicit seek to `cycle`. Following always adopts the continuous
   * follow window around the fresh position — even when the target was
   * already visible, a seek is a deliberate jump and must not keep a stale
   * manual or off-centre window. Manual keeps the browsed window as it is.
   */
  const seekTo = useCallback((_cycle: number, targetMode: TrackViewportMode) => {
    setFrozen(null);
    setState(prev => (prev.mode === targetMode ? prev : { ...prev, mode: targetMode }));
  }, []);

  /** Return to the real playhead and resume following it. */
  const returnToPlayback = useCallback(() => {
    setFrozen(null);
    setState(prev => (prev.mode === 'follow' ? prev : { ...prev, mode: 'follow' }));
  }, []);

  /**
   * Zoom to `nextSpan` in one transaction. Follow keeps following (the next
   * sample re-centres on the real position); manual re-anchors the window so
   * the cycle at `anchorRatio` of the last displayed frame stays put, clamped
   * inside the piece. The decision order matters: a preference-only change
   * (the effective width is the same — e.g. resetting a clipped span back to
   * the default while the piece stays shorter) updates the stored span and
   * nothing else; a real geometry change re-anchors the window; when neither
   * changes, the state is returned untouched — not even the mode.
   */
  const zoomTo = useCallback((
    nextSpan: number,
    view: ZoomAnchorView,
    anchorRatio: number,
    options?: { enterManual?: boolean },
  ) => {
    setState(prev => {
      const span = clampZoomSpan(nextSpan, loopCycles);
      const nextEffective = effectiveZoomSpan(span, loopCycles ?? null);
      const prevEffective = effectiveZoomSpan(prev.span, loopCycles ?? null);
      if (span === prev.span && nextEffective === prevEffective) return prev;
      // Preference-only: the screen would look the same, so keep the mode
      // and the window — no re-anchoring and no mode switch for an
      // invisible change.
      if (nextEffective === prevEffective) return { ...prev, span };
      const begin = anchoredWindowBegin(view.begin, view.span, anchorRatio, nextEffective);
      const clampedBegin = clampCycle(begin, loopCycles ?? null);
      const maxBegin = validLoopCycles(loopCycles) ? Math.max(0, loopCycles - nextEffective) : Infinity;
      if (prev.mode === 'manual' || options?.enterManual) {
        return {
          mode: 'manual',
          span,
          manualBegin: Math.min(clampedBegin, maxBegin),
        };
      }
      return { ...prev, span };
    });
  }, [loopCycles]);

  /** A new session starts from the default scale and follow, not a carried-over view. */
  const resetViewport = useCallback(() => {
    setFrozen(null);
    setState(prev => (
      prev.mode === INITIAL.mode && prev.span === INITIAL.span && prev.manualBegin === INITIAL.manualBegin
        ? prev
        : INITIAL
    ));
  }, []);

  const request = useMemo<TrackFrameRequest>(() => {
    const span = effectiveZoomSpan(state.span, loopCycles ?? null);
    const maxBegin = validLoopCycles(loopCycles) ? Math.max(0, loopCycles - span) : Infinity;
    let inner: TrackFrameRequest['viewport'];
    if (frozen) {
      let begin = Math.max(0, frozen.begin);
      let end = frozen.end;
      if (validLoopCycles(loopCycles)) {
        end = Math.min(end, loopCycles);
        begin = Math.min(begin, Math.max(0, end - span));
      }
      inner = { begin, end: Math.max(end, begin) };
    } else if (state.mode === 'follow') {
      inner = { mode: 'follow', span };
    } else {
      const begin = Math.min(Math.max(0, state.manualBegin), maxBegin);
      inner = { begin, end: begin + span };
    }
    return { loopCycles: loopCycles ?? 0, viewport: inner };
  }, [frozen, state, loopCycles]);

  return useMemo(() => ({
    mode: state.mode,
    /** The zoom preference in cycles, continuous; use the request's span for geometry. */
    span: state.span,
    /** The span this viewport actually shows: never wider than the piece. */
    effectiveSpan: effectiveZoomSpan(state.span, loopCycles ?? null),
    request,
    freezeWindow,
    panTo,
    panFrom,
    seekTo,
    returnToPlayback,
    zoomTo,
    resetViewport,
  }), [state, request, loopCycles, freezeWindow, panTo, panFrom, seekTo, returnToPlayback, zoomTo, resetViewport]);
}
