import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, tf } from '../../lib/i18n';
import {
  DEFAULT_TRACK_VIEW_SPAN,
  MIN_ZOOM_SPAN,
  ZOOM_SLIDER_STEPS,
  browseStepCycles,
  canStepZoom,
  clampCycle,
  cycleFromClientX,
  cycleTickLabel,
  endTickLabel,
  nextEffectiveZoomSpan,
  ratioFromClientX,
  rulerTicks,
  validLoopCycles,
  wheelDeltaToCycles,
  zoomSliderToSpan,
  zoomSpanToSlider,
} from '../../lib/track-timeline';
import type { RulerTickHistory } from '../../lib/track-timeline';
import type { PreviewTrack, TrackEvent, TrackFrame, TrackFrameRequest } from '../../services/track-preview';
import type { TrackRenameResult, TransportEvent } from '../../services/strudel';
import type { PlaybackTimeline } from '../../lib/strudel-timing';
import { formatPlaybackTime } from '../../lib/strudel-timing';
import { MutedVolumeIcon, VolumeIcon, ZoomResetIcon } from '../icons';
import { useTrackViewport } from '../../hooks/useTrackViewport';

interface TrackPanelProps {
  tracks: PreviewTrack[];
  soloId: string | null;
  mutedIds: ReadonlySet<string>;
  toggleSolo: (id: string) => void;
  toggleMute: (id: string) => void;
  getFrame: (request: TrackFrameRequest) => TrackFrame;
  isPlaying: boolean;
  isPaused: boolean;
  active: boolean;
  refreshRevision?: number;
  /** Discrete transport notifications; each one redraws once. */
  transportEvent?: TransportEvent;
  /** Engine ready and nothing (like an export) owns the audio path. */
  canSeek?: boolean;
  seekToCycle?: (cycle: number, source: 'timeline' | 'progress') => boolean;
  /** Requests the code editor to reveal this track's layer. */
  onNavigateToTrack?: (trackId: string) => void;
  /** Whether the current app mode allows renaming at all. */
  canRename?: boolean;
  /** Commits a rename through the service and reports the explicit result. */
  renameTrack?: (trackId: string, name: string) => TrackRenameResult;
  /**
   * The shared playback timeline (the sounding code's loop length, duration
   * and tempo). Its loopCycles is the finite range every window, playhead and
   * seek target lives in; without it the timeline stays disabled rather than
   * unbounded. Its estimatedCps converts time hints to seconds.
   */
  timeline?: PlaybackTimeline | null;
  /** One identity per work session: a change resets the scale, an edit does not. */
  sessionKey?: string;
}
const EMPTY_FRAME: TrackFrame = { now: 0, begin: 0, end: 0, limited: false, events: [] };
const HUE_COUNT = 6;
const NOTE_HEIGHT = 5;
const NOTE_RADIUS = 2;
const NOTE_MIN_WIDTH = 2;
const NOTE_SEP_WIDTH = 1;
const NOTE_OPACITY = 0.72;
const NOTE_DIMMED_OPACITY = 0.35;
const PAN_START_THRESHOLD_PX = 6;
/** One zoom step per ~80px of accumulated Alt+wheel; a light sweep must not cross every level. */
const ZOOM_STEP_PX = 80;
/** Idle time that drops an uncommitted wheel remainder. */
const ZOOM_IDLE_MS = 150;
/** Product-level double-activation window for a track name: the first click
 *  waits this long before navigating so a second click can become a rename.
 *  An app threshold, not the operating system's double-click setting. */
const TRACK_NAME_DOUBLE_ACTIVATION_MS = 400;
/** Two touch taps land within this distance to count as one double tap. */
const TRACK_NAME_TAP_SLOP_PX = 12;
/** Measured before the first ResizeObserver report — errs sparse on purpose. */
const FALLBACK_CONTENT_WIDTH = 400;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// Vertical placement is expressed through the note's *centre*, so a note reads
// as a point on the row. Pitched notes map MIDI 24–96 onto the middle half of
// the row (low at the bottom, clamped outside); percussion holds one of five
// fixed pixel lanes around the row's centreline, so a sound keeps its lane
// even as other sounds enter/leave the window and the row stretches.
function noteTop(event: TrackEvent): string {
  if (event.pitch !== null) return `calc(${(25 + (1 - clamp((event.pitch - 24) / 72, 0, 1)) * 50).toFixed(3)}% - ${NOTE_HEIGHT / 2}px)`;
  let hash = 0;
  for (const char of event.sound) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const offset = (hash % 5 - 2) * 4 - NOTE_HEIGHT / 2;
  return `calc(50% ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}px)`;
}

// Track colours key off a generation-stable colour key — the name the layer
// first compiled with — so a hue belongs to the layer rather than to what is
// happening to it: playback, seeking, muting, solo and later renames never
// move it. Clashes are walked off deterministically within one list.
function trackSlots(tracks: PreviewTrack[]): number[] {
  const slots: number[] = [];
  const taken = new Set<number>();
  for (const track of tracks) {
    const colorKey = track.colorKey ?? track.name;
    let hash = 2166136261;
    for (let i = 0; i < colorKey.length; i++) {
      hash ^= colorKey.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    let slot = hash % HUE_COUNT;
    if (taken.size < HUE_COUNT) while (taken.has(slot)) slot = (slot + 1) % HUE_COUNT;
    taken.add(slot); slots.push(slot);
  }
  return slots;
}

function timeHint(cycle: number, estimatedCps: number | null): string {
  const label = `cycle ${cycle.toFixed(1)}`;
  if (!estimatedCps || estimatedCps <= 0) return label;
  return `${formatPlaybackTime(cycle / estimatedCps)} · ${label}`;
}

/** The visible range label, always in cycles — never "bars" or "beats".
 *  At most two decimals, trailing zeros trimmed; a span that would format
 *  as 0 (too short a piece) reads as "<0.01" instead of an impossible 0.
 *  The singular form belongs to exactly 1. */
function spanLabel(span: number): string {
  const rounded = Math.round(span * 100) / 100;
  const text = span > 0 && rounded === 0 ? '<0.01' : String(rounded);
  return `${text} ${span === 1 ? 'cycle' : 'cycles'}`;
}

/** Human-readable copy for a failed rename; success never reaches this. */
function renameErrorMessage(result: TrackRenameResult): string {
  if (result.status === 'invalid-name') {
    if (result.reason === 'empty') return t('trackRenamePlaceholder');
    if (result.reason === 'too-long') return t('trackRenameTooLong');
    return t('trackRenameInvalidCharacter');
  }
  if (result.status === 'stale-code') return t('trackRenameStale');
  return t('trackRenameUnavailable');
}

export default function TrackPanel({
  tracks, soloId, mutedIds, toggleSolo, toggleMute, getFrame, isPlaying, isPaused, active,
  refreshRevision = 0, transportEvent, canSeek = true, seekToCycle, onNavigateToTrack, timeline,
  sessionKey = '', canRename = true, renameTrack,
}: TrackPanelProps) {
  // The piece's finite range: every window, playhead and seek target lives in
  // [0, L]. Null (no usable code) disables the timeline instead of unbounding it.
  const loopCycles = validLoopCycles(timeline?.loopCycles) ? timeline!.loopCycles : null;
  const estimatedCps = timeline?.estimatedCps ?? null;
  const [frame, setFrame] = useState<TrackFrame>(EMPTY_FRAME);
  const viewport = useTrackViewport(loopCycles);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [dragHint, setDragHint] = useState<{ cycle: number; clientX: number } | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announceTimerRef = useRef<number | null>(null);
  // The live sampling request, read by the RAF loop whose effect only depends
  // on lifecycle state — a per-frame window change must never re-mount it.
  const requestRef = useRef(viewport.request);
  requestRef.current = viewport.request;
  // The live displayed window, read by the non-passive wheel listener and by
  // zoom anchors whose effects only run once — state inside a closure goes stale.
  const frameBeginRef = useRef(frame.begin);
  frameBeginRef.current = frame.begin;
  const frameSpanRef = useRef(frame.end - frame.begin);
  frameSpanRef.current = frame.end - frame.begin;
  // The accepted zoom scale, read by wheel/keyboard handlers that may run
  // several times between renders.
  const zoomSpanRef = useRef(viewport.span);
  zoomSpanRef.current = viewport.span;
  // The measured width of the shared content area (ruler and notes draw at
  // the same width); 0 until the first ResizeObserver report.
  const [contentWidth, setContentWidth] = useState(0);
  // The tick levels already on screen, kept across renders as pure display
  // history: the density rules ride the drawn level itself, so a continuous
  // zoom — where spans almost never repeat — cannot make the scale flap at
  // a threshold. Cleared when the display history loses its meaning.
  const tickHistoryRef = useRef<RulerTickHistory | null>(null);
  // Alt+wheel zoom input: accumulated pixels, the pointer anchor of the last
  // event, the pending application frame and the idle drop timer.
  const wheelZoomRef = useRef<{ pixels: number; ratio: number; frame: number | null; idle: number | null }>({
    pixels: 0, ratio: 0.5, frame: null, idle: null,
  });
  // The zoom slider's round state, as a small discriminated state machine:
  // `idle` (no live round), `pointer` (a pointer owns the view and every
  // input of the round commits against the round's fixed anchor),
  // `cancelledPointer` (the round was invalidated — session change, external
  // takeover, hidden page — and that pointer's trailing inputs are rejected
  // until its end event or a fresh pointerdown). The temporary anchor lives
  // here only — the viewport hook keeps the state.
  type SliderRound =
    | { kind: 'idle' }
    | { kind: 'pointer'; pointerId: number; anchorBegin: number; anchorSpan: number }
    | { kind: 'cancelledPointer'; pointerId: number };
  const sliderZoomRef = useRef<SliderRound>({ kind: 'idle' });
  /** Whether a slider pointer currently owns the view — the guard seek, pan,
   *  browse, zoom buttons and Alt+wheel consume must respect. */
  const sliderPointerActive = () => sliderZoomRef.current.kind === 'pointer';
  // Gesture captures live in refs (shared across handlers and effects); the
  // frozen window itself lives in the viewport hook's state.
  const seekDragRef = useRef<{
    pointerId: number;
    rect: DOMRect;
    begin: number;
    span: number;
    mode: 'follow' | 'manual';
    target: number | null;
    clientX: number;
    lastTime: number | null;
    committedTarget: number;
    scrolled: boolean;
    frame: number | null;
  } | null>(null);
  const panDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rect: DOMRect;
    begin: number;
    span: number;
    panning: boolean;
    dx: number;
    frame: number | null;
  } | null>(null);

  const announce = useCallback((cycle: number) => {
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
    announceTimerRef.current = window.setTimeout(() => {
      announceTimerRef.current = null;
      setAnnouncement(timeHint(clampCycle(cycle), estimatedCps));
    }, 150);
  }, [estimatedCps]);
  useEffect(() => () => {
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
  }, []);

  /** Zoom input and gestures never queue behind each other: a drag owns the view. */
  const clearWheelZoom = useCallback(() => {
    const zoom = wheelZoomRef.current;
    zoom.pixels = 0;
    if (zoom.frame !== null) { cancelAnimationFrame(zoom.frame); zoom.frame = null; }
    if (zoom.idle !== null) { window.clearTimeout(zoom.idle); zoom.idle = null; }
  }, []);

  /** Invalidate an in-flight slider round: the old pointer's trailing change
   *  events are rejected until its end event or a fresh pointerdown. No
   *  rollback, no seek — the last accepted span stays. */
  const cancelSliderZoom = useCallback(() => {
    const round = sliderZoomRef.current;
    if (round.kind === 'pointer') {
      sliderZoomRef.current = { kind: 'cancelledPointer', pointerId: round.pointerId };
    } else if (round.kind === 'idle') {
      // No pointer holds the view; nothing to block afterwards.
      sliderZoomRef.current = { kind: 'idle' };
    }
  }, []);

  // A new session resets the scale to the default as well; mutes, solos and
  // refreshes share the session key and must not trigger this.
  const sessionRef = useRef(sessionKey);
  useEffect(() => {
    if (sessionRef.current === sessionKey) return;
    sessionRef.current = sessionKey;
    clearWheelZoom();
    // A new session invalidates any in-flight round; the old pointer's
    // trailing inputs are rejected until its end event.
    cancelSliderZoom();
    viewport.resetViewport();
    setRenameDraft(null);
    clearNameActivation();
    pendingNameFocusRef.current = null;
    // The old display history belongs to the old work; the new session
    // starts its tick levels from scratch.
    tickHistoryRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // ── Track rename editing ─────────────────────────────────────────────────
  // One draft at a time, owned entirely by this panel: the service does the
  // validation and the editor transaction, this state only mirrors what the
  // user sees. Refs shadow the state so gesture/blur handlers never read a
  // stale closure.
  const [renameDraft, setRenameDraftState] = useState<{ trackId: string; value: string; error: string | null } | null>(null);
  const renameDraftRef = useRef(renameDraft);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const trackNameButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  // The last submit that the service refused, keyed by the exact draft: the
  // click that follows a failed blur commit must not resubmit the same
  // unchanged value; editing the draft re-enables the retry.
  const failedSubmitRef = useRef<{ trackId: string; value: string } | null>(null);
  // A keyboard submit or Escape asks for the name button back once it is
  // remounted — the input unmounts the button, so an immediate .focus()
  // cannot reach it. A blur submit never requests focus.
  const pendingNameFocusRef = useRef<{ trackId: string; sessionKey: string } | null>(null);
  const composingRef = useRef(false);
  const compositionEndedRef = useRef(false);
  const blurAfterComposeRef = useRef(false);
  const submittingRef = useRef(false);
  const setRenameDraft = useCallback((next: { trackId: string; value: string; error: string | null } | null) => {
    renameDraftRef.current = next;
    setRenameDraftState(next);
  }, []);

  const finishRenameEdit = useCallback((viaKeyboard: boolean) => {
    const draft = renameDraftRef.current;
    if (!draft || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const result = renameTrack?.(draft.trackId, draft.value) ?? { status: 'unavailable' };
      if (result.status === 'renamed' || result.status === 'unchanged') {
        failedSubmitRef.current = null;
        setRenameDraft(null);
        // A keyboard submit hands focus back to the name button after it is
        // back in the DOM; a blur submit never steals focus the user has
        // already moved.
        if (viaKeyboard) pendingNameFocusRef.current = { trackId: draft.trackId, sessionKey: sessionKeyRef.current };
      } else {
        failedSubmitRef.current = { trackId: draft.trackId, value: draft.value };
        setRenameDraft({ ...draft, error: renameErrorMessage(result) });
      }
    } finally {
      submittingRef.current = false;
    }
  }, [renameTrack, setRenameDraft]);

  const beginRename = useCallback((track: PreviewTrack) => {
    if (!canRename || !renameTrack) return;
    const current = renameDraftRef.current;
    if (current?.trackId === track.id) return;
    if (current) {
      // The blur commit for this exact unchanged draft just failed as part of
      // the same switch attempt — do not submit the same value again.
      const failed = failedSubmitRef.current;
      if (failed && failed.trackId === current.trackId && failed.value === current.value) return;
      // Only one editor at a time: try to land the open draft first, and
      // refuse to open a second one while it still fails.
      finishRenameEdit(false);
      if (renameDraftRef.current) return;
    }
    failedSubmitRef.current = null;
    // A fresh draft must not inherit the previous one's composition state.
    composingRef.current = false;
    compositionEndedRef.current = false;
    blurAfterComposeRef.current = false;
    setRenameDraft({ trackId: track.id, value: track.name, error: null });
  }, [canRename, renameTrack, finishRenameEdit, setRenameDraft]);

  useEffect(() => {
    if (!renameDraft) return;
    const input = renameInputRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      input.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameDraft?.trackId]);

  // A committed compile replaces every track id, so a draft cannot describe
  // the new generation any more — and losing the capability or the pane
  // cancels it too. The key covers ids AND names, so a rename from the other
  // pane cancels a stale draft; a pure rename never moves the selection or
  // the browsing window.
  const trackIdentityKey = tracks.map(track => `${track.id}:${track.name}`).join('|');
  // Live mirrors for the deferred navigation callback: a timer must judge the
  // world as it is when it fires, not as it was when it was scheduled.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const activeRef = useRef(active);
  activeRef.current = active;
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const identityKeyRef = useRef(trackIdentityKey);
  identityKeyRef.current = trackIdentityKey;
  const onNavigateRef = useRef(onNavigateToTrack);
  onNavigateRef.current = onNavigateToTrack;
  useEffect(() => {
    setRenameDraft(null);
    clearNameActivation();
    pendingNameFocusRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIdentityKey]);
  useEffect(() => {
    if (!canRename) {
      setRenameDraft(null);
      clearNameActivation();
      pendingNameFocusRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRename]);

  // ── Track name activation: single click navigates, double activation renames ──
  // One candidate at a time, owned by this panel like the rename draft. The
  // first click on a name selects the track and waits one double-activation
  // window before navigating; a second click on the same name inside the
  // window becomes a rename instead, and a click on another name re-aims the
  // candidate. Keyboard activation never waits.
  const nameActivateRef = useRef<{ trackId: string; timer: number | null; sessionKey: string; identityKey: string } | null>(null);
  const touchTapRef = useRef<{ trackId: string; x: number; y: number; time: number } | null>(null);
  const touchGestureRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressNameClickRef = useRef(false);

  /** Drop the pending activation candidate and the touch tap recognition. */
  const cancelNameCandidate = useCallback(() => {
    const pending = nameActivateRef.current;
    if (pending?.timer !== null && pending) window.clearTimeout(pending.timer);
    nameActivateRef.current = null;
    touchTapRef.current = null;
    touchGestureRef.current = null;
  }, []);
  const clearNameActivation = useCallback(() => {
    cancelNameCandidate();
    suppressNameClickRef.current = false;
  }, [cancelNameCandidate]);

  const scheduleNameNavigation = useCallback((trackId: string) => {
    const timer = window.setTimeout(() => {
      const pending = nameActivateRef.current;
      nameActivateRef.current = null;
      if (!pending || pending.trackId !== trackId) return;
      if (!activeRef.current || pending.sessionKey !== sessionKeyRef.current) return;
      if (pending.identityKey !== identityKeyRef.current) return;
      if (renameDraftRef.current) return;
      if (!tracksRef.current.some(track => track.id === trackId)) return;
      onNavigateRef.current?.(trackId);
    }, TRACK_NAME_DOUBLE_ACTIVATION_MS);
    nameActivateRef.current = { trackId, timer, sessionKey: sessionKeyRef.current, identityKey: identityKeyRef.current };
  }, []);

  const handleNameClick = (track: PreviewTrack) => {
    if (suppressNameClickRef.current) { suppressNameClickRef.current = false; return; }
    setSelectedTrackId(track.id);
    const pending = nameActivateRef.current;
    if (pending && pending.trackId === track.id) {
      // Second activation inside the window: rename instead of navigating.
      cancelNameCandidate();
      beginRename(track);
      return;
    }
    if (pending) cancelNameCandidate();
    if (renameDraftRef.current) {
      // An editor is already open: the first activation only selects; the
      // second one goes through beginRename, which lands the open draft first.
      nameActivateRef.current = { trackId: track.id, timer: null, sessionKey: sessionKeyRef.current, identityKey: identityKeyRef.current };
      return;
    }
    scheduleNameNavigation(track.id);
  };

  const handleNameDoubleClick = (track: PreviewTrack, event: React.MouseEvent<HTMLButtonElement>) => {
    // The second click normally already opened the editor; this catches a
    // system dblclick that arrives outside the arbitration window — possibly
    // after its navigation already ran, which cannot be undone here.
    event.preventDefault();
    cancelNameCandidate();
    if (canRename && renameTrack) beginRename(track);
  };

  const handleNameKeyDown = (track: PreviewTrack, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'F2') {
      // Renaming disallowed: the key keeps its browser meaning.
      if (!canRename || !renameTrack) return;
      event.preventDefault();
      event.stopPropagation();
      cancelNameCandidate();
      beginRename(track);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Keyboard activation navigates immediately — no double-activation wait —
    // and the synthetic click some browsers add is consumed.
    event.preventDefault();
    suppressNameClickRef.current = true;
    setSelectedTrackId(track.id);
    cancelNameCandidate();
    onNavigateRef.current?.(track.id);
  };

  // Touch taps are recognised on Pointer Events and must stay exclusive with
  // the browser's compatibility click: the double tap consumes its click, so
  // one gesture is never counted twice.
  const handleNamePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // A fresh gesture consumes a stale suppression left by a click that
    // never fired.
    suppressNameClickRef.current = false;
    if (event.pointerType !== 'touch') return;
    if (touchGestureRef.current) {
      // A second finger cancels tap recognition and hands the gesture back
      // to the panel's own multi-touch paths.
      touchGestureRef.current = null;
      touchTapRef.current = null;
      return;
    }
    touchGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const handleNamePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = touchGestureRef.current;
    if (!gesture || event.pointerType !== 'touch' || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > TRACK_NAME_TAP_SLOP_PX) gesture.moved = true;
  };
  const handleNamePointerUp = (track: PreviewTrack, event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = touchGestureRef.current;
    if (!gesture || event.pointerType !== 'touch' || gesture.pointerId !== event.pointerId) return;
    touchGestureRef.current = null;
    if (gesture.moved) { touchTapRef.current = null; return; }
    const previous = touchTapRef.current;
    if (
      previous && previous.trackId === track.id &&
      event.timeStamp - previous.time <= TRACK_NAME_DOUBLE_ACTIVATION_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= TRACK_NAME_TAP_SLOP_PX
    ) {
      touchTapRef.current = null;
      cancelNameCandidate();
      suppressNameClickRef.current = true;
      if (canRename && renameTrack) beginRename(track);
      return;
    }
    touchTapRef.current = { trackId: track.id, x: event.clientX, y: event.clientY, time: event.timeStamp };
  };
  const handleNamePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = touchGestureRef.current;
    if (gesture && gesture.pointerId !== event.pointerId) return;
    touchGestureRef.current = null;
    touchTapRef.current = null;
  };
  useEffect(() => () => cancelNameCandidate(), [cancelNameCandidate]);

  // Focus returns to the name button only after the editor has actually
  // closed and the button is back in the DOM. The request is dropped when the
  // pane, the session or the track it names no longer exists.
  useLayoutEffect(() => {
    const request = pendingNameFocusRef.current;
    if (!request || renameDraftRef.current) return;
    if (!activeRef.current || request.sessionKey !== sessionKeyRef.current) {
      pendingNameFocusRef.current = null;
      return;
    }
    const button = trackNameButtonRefs.current.get(request.trackId);
    if (!button) { pendingNameFocusRef.current = null; return; }
    pendingNameFocusRef.current = null;
    button.focus({ preventScroll: true });
  });

  // Seeks and rewinds that did not come from a gesture in this panel (the top
  // progress bar, a stop, a code edit) re-aim the view; the panel's own
  // timeline seeks already adjusted it during the gesture. A notification
  // from this panel's own active drag only reports the real position — it
  // must never unfreeze the window or re-aim mid-gesture — while an external
  // seek ends the drag and takes over.
  const transportRevision = transportEvent?.revision ?? 0;
  useEffect(() => {
    if (!transportEvent) return;
    const { reason, cycle, seek } = transportEvent;
    const externalSeek = reason === 'seek' && seek?.source === 'progress';
    if (externalSeek || reason === 'stop' || reason === 'code-change') cancelSliderZoom();
    if (seekDragRef.current) {
      if (!externalSeek && reason !== 'stop' && reason !== 'code-change') return;
      // An external seek or rewind ends this panel's gesture and takes over.
      const drag = seekDragRef.current;
      if (drag.frame !== null) cancelAnimationFrame(drag.frame);
      seekDragRef.current = null;
      setDragHint(null);
    }
    if (externalSeek) {
      viewport.seekTo(seek!.cycle, 'follow');
    } else if (reason === 'stop' || reason === 'code-change') {
      viewport.returnToPlayback();
    } else if (reason === 'seek' && seek) {
      viewport.seekTo(seek.cycle, viewport.mode);
    } else if (reason === 'apply') {
      viewport.seekTo(cycle, viewport.mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportRevision]);

  // The stable RAF loop: one sample per visible animation frame while
  // playing, reading the latest request through the ref. Manual requests,
  // transport notifications and refreshes redraw discretely below.
  useLayoutEffect(() => {
    if (!active || !tracks.length || !isPlaying) return;
    let request = 0;
    const tick = () => {
      request = requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden') return;
      setFrame(getFrame(requestRef.current));
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [active, tracks, isPlaying, getFrame]);

  // One synchronous redraw per discrete change — first paint, pause/resume,
  // a manual pan or freeze, a seek or stop notification, a refresh — so the
  // picture is right even when no RAF loop is running.
  useLayoutEffect(() => {
    if (!active || !tracks.length) return;
    setFrame(getFrame(requestRef.current));
  }, [active, tracks, getFrame, viewport.request, isPlaying, isPaused, refreshRevision, transportRevision]);

  // Leaving the panel or the page cancels live gestures, any open rename
  // draft and the name activation; coming back redraws once from the current
  // authoritative position.
  useEffect(() => {
    if (!active) {
      setRenameDraft(null);
      seekDragRef.current = null;
      panDragRef.current = null;
      clearWheelZoom();
      cancelSliderZoom();
      setDragHint(null);
      clearNameActivation();
      pendingNameFocusRef.current = null;
    }
  }, [active, clearWheelZoom, cancelSliderZoom, setRenameDraft, clearNameActivation]);
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      seekDragRef.current = null;
      panDragRef.current = null;
      clearWheelZoom();
      cancelSliderZoom();
      setDragHint(null);
      clearNameActivation();
      pendingNameFocusRef.current = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active, clearWheelZoom, cancelSliderZoom, clearNameActivation]);

  const slots = useMemo(() => trackSlots(tracks), [tracks]);
  const grouped = useMemo(() => {
    const result = new Map<string, TrackEvent[]>();
    for (const event of frame.events) {
      const bucket = result.get(event.trackId) ?? [];
      bucket.push(event); result.set(event.trackId, bucket);
    }
    return result;
  }, [frame]);
  // Everything on screen — ruler, grid, notes, playhead — projects through
  // this one frame, so the window the events were queried for is exactly the
  // window they are drawn in. The tick level is fixed by the span and the
  // measured content width only; a slide keeps absolute multiples, and the
  // drawn level's own hysteresis rides across spans. Reading happens here in
  // render, but writing the history back waits for the layout commit below,
  // so an uncommitted render can never pollute the display history.
  const viewSpan = frame.end - frame.begin;
  const measuredWidth = contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH;
  const ticks = rulerTicks(frame.begin, frame.end, measuredWidth, tickHistoryRef.current ?? undefined);
  // Record the level only after the frame that drew it commits; a discarded
  // render must never leave its level in the display history.
  useLayoutEffect(() => {
    if (ticks.majorStep === 0) { tickHistoryRef.current = null; return; }
    tickHistoryRef.current = { majorStep: ticks.majorStep, minorStep: ticks.minorStep };
  });
  // The piece's real end is the only place a boundary tick is drawn: an
  // ordinary mid-piece window must not imply a limit it does not have.
  const endLabel = endTickLabel(frame.end, loopCycles, ticks.majorStep);
  const position = (cycle: number) => {
    const percent = (cycle - frame.begin) / (frame.end - frame.begin) * 100;
    // Four decimals kill float noise (a centred playhead lands at 50.000…007)
    // without disturbing the sub-pixel precision short notes rely on.
    return Math.round(percent * 10000) / 10000;
  };
  const visibleBegin = Math.max(0, frame.begin);
  // Inclusive at both ends: a playhead clamped onto the window's right edge is
  // still the real position and must draw there, not vanish.
  const playheadVisible = frame.now >= frame.begin && frame.now <= frame.end;

  // ── Timeline seek gesture ────────────────────────────────────────────────
  const commitSeek = useCallback((cycle: number) => {
    if (!canSeek || !seekToCycle) return;
    seekToCycle(clampCycle(cycle, loopCycles), 'timeline');
  }, [canSeek, seekToCycle, loopCycles]);

  const beginSeekDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSeek || !seekToCycle || !event.isPrimary || event.button !== 0) return;
    if (seekDragRef.current) return;
    // A slider round owns the view until its pointer is released.
    if (sliderPointerActive()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Freeze ordinary seeking; only the edge-scroll loop moves this window.
    const target = cycleFromClientX(event.clientX, rect, frame.begin, viewSpan, loopCycles);
    if (target === null) return;
    // A valid press must not start the browser's text selection across the
    // ruler's cycle labels — pointer capture keeps the events flowing but
    // does not stop the selection. Focus stays on the ruler explicitly (and
    // without scrolling) so the arrow keys keep seeking after the gesture.
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag = {
      pointerId: event.pointerId, rect, begin: frame.begin, span: viewSpan,
      mode: viewport.mode, target, frame: null as number | null,
      clientX: event.clientX, lastTime: null as number | null,
      committedTarget: target, scrolled: false,
    };
    seekDragRef.current = drag;
    viewport.freezeWindow(frame.begin, frame.end);
    commitSeek(target);
    setDragHint({ cycle: target, clientX: event.clientX });
    const tickDrag = (time: number) => {
      drag.frame = null;
      // Cancelled/replaced gestures must never seek or schedule another frame.
      if (seekDragRef.current !== drag) return;
      const elapsed = drag.lastTime === null ? 0 : Math.min(50, Math.max(0, time - drag.lastTime));
      drag.lastTime = time;
      const edge = Math.min(40, rect.width / 4);
      const x = drag.clientX - rect.left;
      const speed = x < edge ? -Math.min(1, (edge - x) / edge)
        : x > rect.width - edge ? Math.min(1, (x - rect.width + edge) / edge) : 0;
      const begin = Math.max(0, Math.min(
        Math.max(0, (loopCycles ?? Infinity) - drag.span),
        drag.begin + speed * drag.span * elapsed / 1000,
      ));
      if (begin !== drag.begin) {
        drag.begin = begin;
        drag.scrolled = true;
        viewport.freezeWindow(begin, begin + drag.span);
      }
      const next = cycleFromClientX(drag.clientX, rect, drag.begin, drag.span, loopCycles);
      if (next !== null) {
        drag.target = next;
        if (next !== drag.committedTarget) {
          drag.committedTarget = next;
          commitSeek(next);
          setDragHint({ cycle: next, clientX: drag.clientX });
        }
      }
      drag.frame = requestAnimationFrame(tickDrag);
    };
    drag.frame = requestAnimationFrame(tickDrag);
  };
  const moveSeekDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = seekDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = cycleFromClientX(event.clientX, drag.rect, drag.begin, drag.span, loopCycles);
    if (target === null) return;
    drag.clientX = event.clientX;
    drag.target = target;
    setDragHint({ cycle: target, clientX: event.clientX });
  };
  const finishSeekDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = seekDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frame !== null) { cancelAnimationFrame(drag.frame); drag.frame = null; }
    seekDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const target = drag.target ?? drag.begin;
    if (!cancelled) commitSeek(target);
    if (drag.scrolled && drag.mode === 'manual') viewport.panTo(drag.begin);
    else viewport.seekTo(target, drag.mode);
    setDragHint(null);
    announce(target);
  };

  useEffect(() => () => {
    const drag = seekDragRef.current;
    if (drag?.frame) cancelAnimationFrame(drag.frame);
    seekDragRef.current = null;
    sliderZoomRef.current = { kind: 'idle' };
  }, []);

  // ── Browse (pan) gesture ─────────────────────────────────────────────────
  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (panDragRef.current) return;
    // A slider round owns the view until its pointer is released.
    if (sliderPointerActive()) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
      begin: frame.begin,
      span: viewSpan,
      panning: false,
      dx: 0,
      frame: null,
    };
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panDragRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    pan.dx = event.clientX - pan.startX;
    if (!pan.panning) {
      // Only a deliberate sideways move becomes a pan; vertical gestures stay
      // with the native list scroll and a click stays a click.
      const dy = event.clientY - pan.startY;
      if (Math.abs(pan.dx) <= PAN_START_THRESHOLD_PX || Math.abs(pan.dx) <= Math.abs(dy)) return;
      pan.panning = true;
    }
    if (pan.frame !== null) return;
    pan.frame = requestAnimationFrame(() => {
      pan.frame = null;
      viewport.panFrom(pan.begin, -(pan.dx / Math.max(1, pan.rect.width)) * pan.span);
    });
  };
  const finishPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panDragRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (pan.frame !== null) { cancelAnimationFrame(pan.frame); pan.frame = null; }
    panDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => () => {
    const pan = panDragRef.current;
    if (pan?.frame) cancelAnimationFrame(pan.frame);
    panDragRef.current = null;
  }, []);

  // Horizontal wheel scrolls pan the window; plain vertical wheel keeps
  // scrolling the track list. Alt/Option+wheel zooms in place, anchored at
  // the pointer: deltas accumulate in pixels, ~80px cash in one ladder step,
  // and at most one step applies per animation frame — a light sweep must not
  // cross the whole ladder. Ctrl/Cmd stays with the browser's own zoom, and
  // an active seek/pan gesture owns the view until it ends.
  useEffect(() => {
    const lanes = lanesRef.current;
    const ruler = rulerRef.current;
    if (!lanes) return;
    const gestureActive = () => seekDragRef.current !== null || panDragRef.current !== null || sliderPointerActive();
    const consumeWheelZoom = () => {
      const zoom = wheelZoomRef.current;
      if (Math.abs(zoom.pixels) < ZOOM_STEP_PX) return;
      if (gestureActive() || sliderPointerActive()) { clearWheelZoom(); return; }
      const next = nextEffectiveZoomSpan(zoomSpanRef.current, loopCycles, zoom.pixels > 0 ? -1 : 1);
      if (next === viewport.effectiveSpan) { zoom.pixels = 0; return; }
      viewport.zoomTo(next, { begin: frameBeginRef.current, span: frameSpanRef.current }, zoom.ratio, { enterManual: true });
      zoom.pixels -= ZOOM_STEP_PX * (zoom.pixels > 0 ? 1 : -1);
      if (zoom.idle !== null) window.clearTimeout(zoom.idle);
      zoom.idle = window.setTimeout(() => { zoom.idle = null; zoom.pixels = 0; }, ZOOM_IDLE_MS);
      if (Math.abs(zoom.pixels) >= ZOOM_STEP_PX && zoom.frame === null) {
        zoom.frame = requestAnimationFrame(() => { zoom.frame = null; consumeWheelZoom(); });
      }
    };
    const zoomAt = (event: WheelEvent) => {
      event.preventDefault();
      const zoom = wheelZoomRef.current;
      // deltaMode first becomes pixels; a direction flip drops the remainder.
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 100 : event.deltaY;
      if (zoom.pixels !== 0 && Math.sign(delta) !== Math.sign(zoom.pixels)) zoom.pixels = 0;
      zoom.pixels += delta;
      const target = event.target instanceof Element ? event.target : null;
      const area = (target?.closest('[data-notes-cell]') ?? event.currentTarget) as HTMLElement;
      const ratio = ratioFromClientX(event.clientX, area.getBoundingClientRect());
      if (ratio !== null) zoom.ratio = ratio;
      if (zoom.frame === null) zoom.frame = requestAnimationFrame(() => { zoom.frame = null; consumeWheelZoom(); });
      if (zoom.idle !== null) window.clearTimeout(zoom.idle);
      zoom.idle = window.setTimeout(() => { zoom.idle = null; zoom.pixels = 0; }, ZOOM_IDLE_MS);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (event.altKey) { if (!gestureActive()) zoomAt(event); return; }
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!event.shiftKey && !horizontal) return;
      event.preventDefault();
      const rect = lanes.getBoundingClientRect();
      viewport.panFrom(frameBeginRef.current, wheelDeltaToCycles(
        event.shiftKey && !horizontal ? event.deltaY : event.deltaX,
        event.deltaMode,
        rect.width,
        frameSpanRef.current,
      ));
    };
    const onRulerWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || !event.altKey) return;
      if (gestureActive()) return;
      zoomAt(event);
    };
    lanes.addEventListener('wheel', onWheel, { passive: false });
    ruler?.addEventListener('wheel', onRulerWheel, { passive: false });
    return () => {
      lanes.removeEventListener('wheel', onWheel);
      ruler?.removeEventListener('wheel', onRulerWheel);
    };
    // loopCycles is read only through refs inside the handlers (the frame
    // and span refs carry the live geometry); the effect owns the listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, clearWheelZoom]);

  const handleRulerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek || !seekToCycle) return;
    const step = event.shiftKey ? 1 : 0.25;
    let target: number | null = null;
    // Keyboard targets walk the displayed playhead and clamp inside [0, L]:
    // the piece's end is a boundary, not a place to scroll past.
    if (event.key === 'ArrowLeft') target = clampCycle(frame.now - step, loopCycles);
    else if (event.key === 'ArrowRight') target = clampCycle(frame.now + step, loopCycles);
    else if (event.key === 'Home') target = 0;
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    commitSeek(target);
    viewport.seekTo(target, viewport.mode);
    announce(target);
  };

  // ── Zoom actions ─────────────────────────────────────────────────────────
  // One shortcut step per input, judged by the *effective* span: steps the
  // piece is too short to distinguish are skipped or disabled. Without a
  // usable L there is no scale to walk at all. While a gesture or the slider
  // owns the view the input is dropped, not queued. A paused or stopped
  // transport still zooms: the request changes and the discrete redraw paints
  // the new scale at once.
  const gestureActive = () => seekDragRef.current !== null || panDragRef.current !== null;
  const zoomBy = (direction: -1 | 1) => {
    if (gestureActive() || sliderPointerActive() || loopCycles === null) return;
    if (!canStepZoom(viewport.effectiveSpan, loopCycles, direction)) return;
    clearWheelZoom();
    const next = nextEffectiveZoomSpan(viewport.effectiveSpan, loopCycles, direction);
    if (next === viewport.effectiveSpan) return;
    viewport.zoomTo(next, { begin: frame.begin, span: viewSpan }, 0.5);
  };
  /** Back to the default scale only — follow/manual and the position stay. */
  const resetZoom = () => {
    if (gestureActive() || sliderPointerActive()) return;
    clearWheelZoom();
    viewport.zoomTo(DEFAULT_TRACK_VIEW_SPAN, { begin: frame.begin, span: viewSpan }, 0.5);
  };
  const handleToolsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomBy(-1); }
    else if (event.key === '0') { event.preventDefault(); resetZoom(); }
  };

  // ── Continuous zoom slider ───────────────────────────────────────────────
  // A native controlled range owns the drag; its single onChange path commits
  // the absolute span each sample. A pointer round opens on pointerdown (the
  // round and its anchor are set up there, before the first input, so no
  // other gesture can slip in between press and move) and stays open while
  // the pointer is held: every input of the round commits against the round's
  // fixed start anchor. A keyboard or assistive-tech input has no pointer and
  // is one single transaction anchored on the latest accepted window.
  const sliderSpanMin = loopCycles === null ? MIN_ZOOM_SPAN : Math.min(MIN_ZOOM_SPAN, loopCycles);
  const sliderDisabled = loopCycles === null || loopCycles <= sliderSpanMin + 1e-9;
  const sliderValue = zoomSpanToSlider(viewport.effectiveSpan, loopCycles);
  /** A fresh, legal pointer round may start: usable view, no seek/pan
   *  gesture in flight. The slider's own input must not be blocked by the
   *  slider's own ownership. */
  const canBeginSliderRound = () =>
    active && loopCycles !== null && !sliderDisabled && !gestureActive();
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (loopCycles === null) return;
    const round = sliderZoomRef.current;
    const raw = Number(event.target.value);
    if (!Number.isFinite(raw)) return;
    if (round.kind === 'cancelledPointer') {
      // A trailing sample from a pointer whose round was killed (session
      // change, external takeover) never writes back — the pointer must be
      // released first; a fresh pointerdown reopens a round.
      return;
    }
    let anchorBegin: number;
    let anchorSpan: number;
    if (round.kind === 'pointer') {
      ({ anchorBegin, anchorSpan } = round);
    } else {
      // No pointer round: a single keyboard/assistive transaction anchored
      // on the latest accepted window. A seek/pan gesture owns the view;
      // the slider does not queue behind it.
      if (gestureActive()) return;
      clearWheelZoom();
      anchorBegin = frameBeginRef.current;
      anchorSpan = frameSpanRef.current;
      sliderZoomRef.current = { kind: 'idle' };
    }
    const span = zoomSliderToSpan(raw, loopCycles);
    // Anchor at the centre of the window the round started from; follow keeps
    // deriving its own window from the real position.
    viewport.zoomTo(span, { begin: anchorBegin, span: anchorSpan }, 0.5);
  };
  const handleSliderPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    // A new press is a new beginning: it clears any stale cancelled round of
    // an earlier pointer and reopens ownership immediately, before the first
    // input, so other gestures cannot slip in between press and move.
    sliderZoomRef.current = { kind: 'idle' };
    if (!canBeginSliderRound()) return;
    clearWheelZoom();
    sliderZoomRef.current = {
      kind: 'pointer',
      pointerId: event.pointerId,
      anchorBegin: frameBeginRef.current,
      anchorSpan: frameSpanRef.current,
    };
  };
  /** Normal release: keep the last accepted span, clear ownership only. */
  const finishSliderPointer = (event: React.PointerEvent<HTMLInputElement>) => {
    const round = sliderZoomRef.current;
    if (round.kind === 'idle') return;
    if (round.kind === 'pointer' && round.pointerId !== event.pointerId) return;
    if (round.kind === 'cancelledPointer' && round.pointerId !== event.pointerId) return;
    // Only the round's own pointer ends it — even after a cancel — so no
    // other pointer's end event can release someone else's drag.
    sliderZoomRef.current = { kind: 'idle' };
  };
  /** Blur never poisons the next round: ownership of a live round ends with
   *  the pointer events, not focus, so a blur only cleans an ownerless
   *  cancelled marker — never a live pointer round. */
  const handleSliderBlur = () => {
    const round = sliderZoomRef.current;
    if (round.kind === 'cancelledPointer') sliderZoomRef.current = { kind: 'idle' };
  };

  // A drag that leaves the slider element (pointer capture is the native
  // range's business) must still end the round when the pointer is released
  // anywhere over the window. Window listeners observe pointerup/pointercancel
  // for the round's own pointerId only; the input's React handlers and these
  // window listeners are idempotent — the second one finds an idle round.
  useEffect(() => {
    if (!active) return;
    const endRound = (event: PointerEvent) => {
      const round = sliderZoomRef.current;
      if (round.kind === 'idle') return;
      if (round.kind === 'pointer' && round.pointerId !== event.pointerId) return;
      if (round.kind === 'cancelledPointer' && round.pointerId !== event.pointerId) return;
      sliderZoomRef.current = { kind: 'idle' };
    };
    window.addEventListener('pointerup', endRound);
    window.addEventListener('pointercancel', endRound);
    return () => {
      window.removeEventListener('pointerup', endRound);
      window.removeEventListener('pointercancel', endRound);
    };
  }, [active]);

  // The ruler measures its own content width — the same width the note cells
  // draw at — so the tick level follows the real pane, not the window. A
  // hidden pane reports 0 and keeps the last valid measurement until shown.
  useLayoutEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (!(width > 0)) continue;
        setContentWidth(width);
      }
    });
    observer.observe(ruler);
    return () => observer.disconnect();
  }, [active, tracks.length]);

  if (!tracks.length) return <div className="flex h-full min-h-24 items-center justify-center px-6 text-center text-sm text-text-secondary">{t('tracksUnsupported')}</div>;

  const rulerInteractions = canSeek ? {
    onPointerDown: beginSeekDrag,
    onPointerMove: moveSeekDrag,
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => finishSeekDrag(event, false),
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => finishSeekDrag(event, true),
  } : undefined;

  const panInteractions = {
    onPointerDown: beginPan,
    onPointerMove: movePan,
    onPointerUp: finishPan,
    onPointerCancel: finishPan,
  };

  return (
    <div className="track-panel relative flex h-full min-h-0 flex-col bg-[var(--track-canvas)]" aria-label={t('tracksView')}>
      {/* The compact tool row sits above the scrolling area: browse, follow and
          zoom share one row and never cover the ruler's click target. */}
      <div
        data-track-tools
        role="toolbar"
        aria-label={t('trackTools')}
        aria-orientation="horizontal"
        onKeyDown={handleToolsKeyDown}
        className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--track-rule)] bg-[var(--track-header)] px-2 py-1 text-[11px] text-text-secondary"
      >
        <div className="flex items-center gap-1">
          <button type="button" className="track-tool-button" aria-label={t('trackBrowseEarlier')} title={t('trackBrowseEarlier')}
            disabled={loopCycles === null || frame.begin <= 0}
            onClick={() => viewport.panTo(frame.begin - browseStepCycles(viewport.span, loopCycles))}>‹</button>
          <button type="button" className="track-tool-button" aria-label={t('trackBrowseLater')} title={t('trackBrowseLater')}
            disabled={loopCycles === null || frame.end >= loopCycles}
            onClick={() => viewport.panTo(frame.begin + browseStepCycles(viewport.span, loopCycles))}>›</button>
          {viewport.mode === 'manual' && (
            <button type="button" className="track-tool-button px-1.5" aria-label={t('trackReturnToPlayback')} title={t('trackReturnToPlayback')}
              onClick={() => viewport.returnToPlayback()}>◎</button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {frame.limited && (
            <span data-track-preview-limited role="status" className="w-full px-1 text-right text-[10px] text-text-secondary sm:w-auto sm:text-left">{t('trackPreviewLimited')}</span>
          )}
          <button type="button" className="track-tool-button" aria-label={t('trackZoomOut')} title={t('trackZoomOut')}
            disabled={loopCycles === null || !canStepZoom(viewport.effectiveSpan, loopCycles, -1)}
            onClick={() => zoomBy(-1)}>−</button>
          <input
            data-track-zoom-slider
            type="range"
            className="track-zoom-slider"
            min={0}
            max={ZOOM_SLIDER_STEPS}
            step={1}
            disabled={sliderDisabled}
            aria-label={t('trackZoomSlider')}
            aria-valuetext={tf('trackZoomSliderValue', { span: spanLabel(viewport.effectiveSpan) })}
            value={sliderValue}
            onChange={handleSliderChange}
            onPointerDown={handleSliderPointerDown}
            onPointerUp={finishSliderPointer}
            onPointerCancel={finishSliderPointer}
            onBlur={handleSliderBlur}
          />
          <button type="button" className="track-tool-button" aria-label={t('trackZoomIn')} title={t('trackZoomIn')}
            disabled={loopCycles === null || !canStepZoom(viewport.effectiveSpan, loopCycles, 1)}
            onClick={() => zoomBy(1)}>＋</button>
          <button type="button" className="track-tool-button px-1.5" aria-label={t('trackZoomReset')} title={t('trackZoomReset')}
            disabled={loopCycles === null}
            onClick={resetZoom}><ZoomResetIcon aria-hidden /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="track-panel-ruler track-panel-grid sticky top-0 z-20 border-b border-[var(--track-rule)] bg-[var(--track-canvas)]">
          <div className="flex min-w-0 items-center bg-[var(--track-header)] pl-3 pr-2 text-[11px] text-text-secondary">{t('tracksCycle')}</div>
          <div
            ref={rulerRef}
            data-track-timeline
            role="group"
            tabIndex={canSeek ? 0 : -1}
            aria-label={t('trackTimelineSeek')}
            aria-disabled={!canSeek}
            className={`track-ruler-surface relative mr-2 min-w-0 text-[11px] tabular-nums text-text-secondary ${canSeek ? 'cursor-ew-resize touch-none' : ''}`}
            {...rulerInteractions}
            onKeyDown={handleRulerKeyDown}
          >
            <span data-playhead-ruler-line aria-hidden className="track-playhead-ruler-line" style={{ left: `${position(frame.now)}%`, visibility: playheadVisible ? undefined : 'hidden' }} />
            <div className="track-ruler-minor-clip">
              {ticks.minor.map(cycle => <span key={`minor-${cycle}`} aria-hidden className="track-ruler-minor absolute bottom-0" style={{ left: `${position(cycle)}%` }} />)}
            </div>
            <div className="track-ruler-ticks-clip">
              {ticks.major.map(cycle => <span key={`major-${cycle}`} className="track-ruler-tick absolute top-2" style={{ left: `${position(cycle)}%` }}>{cycleTickLabel(cycle)}</span>)}
              {endLabel && <span data-ruler-end-tick className="track-ruler-tick absolute top-2 -translate-x-full" style={{ left: `${position(frame.end)}%` }}>{endLabel}</span>}
            </div>
            <span data-playhead-caret aria-hidden className="track-playhead-caret" style={{ left: `${position(frame.now)}%`, visibility: playheadVisible ? undefined : 'hidden' }} />
            <div className="track-ruler-hint-clip">
              {dragHint && (
                <span
                  data-track-seek-hint
                  className="pointer-events-none absolute top-0 z-[4] -translate-x-1/2 whitespace-nowrap rounded border border-[var(--track-control-border)] bg-[var(--track-header)] px-1.5 py-0.5 text-[10px] text-text-primary"
                  style={{ left: dragHint.clientX - (rulerRef.current?.getBoundingClientRect().left ?? 0) }}
                >
                  {timeHint(dragHint.cycle, estimatedCps)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div ref={lanesRef} className="track-panel-lanes relative isolate flex min-h-[calc(100%_-_var(--track-scale))] flex-col">
        {tracks.map((track, index) => {
          const soloed = soloId === track.id;
          // Quiet covers manual mute *and* being excluded by someone else's
          // solo; only the manual half may show the crossed speaker.
          const quiet = mutedIds.has(track.id) || (soloId !== null && !soloed);
          const hue = `var(--track-hue-${slots[index]})`;
          const hueStrong = `var(--track-hue-${slots[index]}-strong)`;
          const events = grouped.get(track.id) ?? [];
          const selected = selectedTrackId === track.id;
          return (
            <div key={track.id} data-track-id={track.id} data-muted={mutedIds.has(track.id)} data-selected={selected} data-track-color={slots[index]} className="track-row track-panel-grid border-b border-[var(--track-rule)]">
              <div className="track-row-header bg-[var(--track-header)] pl-3 pr-2">
                <div className="track-row-title">
                  <span data-track-color-dot aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hue }} />
                  {renameDraft?.trackId === track.id ? (
                  <input
                    ref={renameInputRef}
                    data-track-name-input
                    type="text"
                    aria-label={t('trackRenameLabel')}
                    aria-describedby={renameDraft.error ? 'track-rename-error' : undefined}
                    value={renameDraft.value}
                    placeholder={t('trackRenamePlaceholder')}
                    onChange={(event) => {
                      const draft = renameDraftRef.current;
                      if (!draft) return;
                      setRenameDraft({ ...draft, value: event.target.value, error: null });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        if (event.nativeEvent.isComposing || composingRef.current) return;
                        // Safari reports the Enter that confirmed a composition
                        // as a plain keydown — swallow that one.
                        if (compositionEndedRef.current) {
                          compositionEndedRef.current = false;
                          return;
                        }
                        event.preventDefault();
                        finishRenameEdit(true);
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        // Focus goes back to the name button once it is
                        // remounted, via the pending request below.
                        pendingNameFocusRef.current = { trackId: track.id, sessionKey: sessionKeyRef.current };
                        setRenameDraft(null);
                      }
                    }}
                    onBlur={() => {
                      // Composition runs past the blur: commit once, after it ends.
                      if (composingRef.current) {
                        blurAfterComposeRef.current = true;
                        return;
                      }
                      finishRenameEdit(false);
                    }}
                    onCompositionStart={() => { composingRef.current = true; }}
                    onCompositionEnd={() => {
                      composingRef.current = false;
                      compositionEndedRef.current = true;
                      if (blurAfterComposeRef.current) {
                        blurAfterComposeRef.current = false;
                        finishRenameEdit(false);
                      }
                    }}
                    className="min-w-0 flex-1 self-stretch rounded-md border border-[var(--track-control-border)] bg-transparent px-1.5 text-xs text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                ) : (
                  <button
                    type="button"
                    data-track-name
                    ref={(el) => {
                      if (el) trackNameButtonRefs.current.set(track.id, el);
                      else trackNameButtonRefs.current.delete(track.id);
                    }}
                    aria-label={canRename && renameTrack
                      ? `${t('trackNameNavigate')} · ${t('trackNameHint')} · ${track.name}`
                      : `${t('trackNameNavigate')} · ${track.name}`}
                    aria-pressed={selected}
                    title={canRename && renameTrack ? `${track.name} · ${t('trackNameHint')}` : track.name}
                    onClick={() => handleNameClick(track)}
                    onDoubleClick={(event) => handleNameDoubleClick(track, event)}
                    onKeyDown={(event) => handleNameKeyDown(track, event)}
                    onPointerDown={handleNamePointerDown}
                    onPointerMove={handleNamePointerMove}
                    onPointerUp={(event) => handleNamePointerUp(track, event)}
                    onPointerCancel={handleNamePointerCancel}
                    className={`min-w-0 flex-1 self-stretch cursor-pointer touch-manipulation truncate text-left text-xs font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${quiet ? 'text-text-muted' : 'text-text-primary'}`}
                  >{track.name}</button>
                )}
                </div>
                <div className="track-row-actions">
                <button type="button" aria-label={`${t('trackMute')} ${track.name}`} aria-pressed={mutedIds.has(track.id)} onClick={() => toggleMute(track.id)}
                  className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8 ${quiet ? 'text-text-muted' : mutedIds.has(track.id) ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {mutedIds.has(track.id) ? <MutedVolumeIcon size={14} /> : <VolumeIcon size={14} />}
                </button>
                <button type="button" aria-label={`${t('trackSolo')} ${track.name}`} aria-pressed={soloed} onClick={() => toggleSolo(track.id)} className="track-solo-button">
                  <span className="track-solo-button-mark" aria-hidden="true">S</span>
                </button>
                </div>
              </div>
              <div {...panInteractions} data-notes-cell className={`relative mr-2 min-h-0 min-w-0 overflow-hidden ${canSeek ? 'cursor-grab touch-pan-y active:cursor-grabbing' : ''}`}>
                {ticks.minor.map(cycle => <div key={`minor-${cycle}`} className="track-grid-line track-grid-line-minor pointer-events-none absolute inset-y-0 w-px bg-[var(--track-grid-minor)]" style={{ left: `${position(cycle)}%` }} />)}
                {ticks.major.map(cycle => <div key={`major-${cycle}`} className="track-grid-line pointer-events-none absolute inset-y-0 w-px bg-[var(--track-grid)]" style={{ left: `${position(cycle)}%` }} />)}
                <div role="img" aria-label={`${track.name} · ${t('trackNotes')}`} className="absolute inset-0">
                  {events.map(event => {
                  // Clip against both the visible window and the work's real
                  // origin before drawing. An event with no overlap stays
                  // invisible instead of turning into an edge dot from the
                  // min-width floor, and edges cut by either boundary read as
                  // flat cuts while real starts/ends stay rounded with a quiet
                  // attack separation.
                  const clippedBegin = Math.max(event.begin, visibleBegin);
                  const clippedEnd = Math.min(event.end, frame.end);
                  if (clippedEnd <= clippedBegin) return null;
                  const x = clamp(position(clippedBegin), 0, 100);
                  const width = clamp(position(clippedEnd), 0, 100) - x;
                  const startsInside = event.begin >= visibleBegin;
                  const endsInside = event.end <= frame.end;
                   const sounding = (isPlaying || isPaused) && !quiet && event.begin <= frame.now && event.end > frame.now;
                   // The service's dedup tuple doubles as the DOM identity: a
                   // shared event keeps its node across adjacent windows and
                   // only its geometry updates — no key/index mismatch churn.
                   return <div key={event.key} data-track-note data-sounding={sounding} className="absolute"
                    style={{
                      left: `${x}%`, top: noteTop(event), width: `${width}%`, minWidth: NOTE_MIN_WIDTH,
                      height: NOTE_HEIGHT,
                      borderRadius: `${startsInside ? NOTE_RADIUS : 0}px ${endsInside ? NOTE_RADIUS : 0}px ${endsInside ? NOTE_RADIUS : 0}px ${startsInside ? NOTE_RADIUS : 0}px`,
                      background: sounding ? hueStrong : hue,
                      boxShadow: startsInside ? `inset ${NOTE_SEP_WIDTH}px 0 0 var(--track-note-sep)` : undefined,
                      opacity: quiet ? NOTE_DIMMED_OPACITY : sounding ? 1 : NOTE_OPACITY,
                    }} />;
                })}
                </div>
              </div>
            </div>
          );
        })}
        <div data-playhead className="track-playhead-overlay track-panel-grid pointer-events-none absolute inset-0">
          <div />
          <div className="relative mr-2 min-w-0">
            {playheadVisible && <div data-playhead-line className="track-playhead-line" style={{ left: `${position(frame.now)}%` }} />}
          </div>
        </div>
        </div>
      </div>
      <span aria-live="polite" className="sr-only">{announcement}</span>
      {renameDraft?.error && (
        <div
          id="track-rename-error"
          data-track-rename-error
          role="status"
          className="pointer-events-none absolute bottom-2 left-1/2 z-30 max-w-[90%] -translate-x-1/2 truncate rounded-md border border-[var(--track-control-border)] bg-[var(--track-header)] px-2 py-1 text-[11px] text-text-primary shadow"
        >
          {renameDraft.error}
        </div>
      )}
    </div>
  );
}
