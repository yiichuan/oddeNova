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
  drawWindowForViewport,
  endTickLabel,
  nextEffectiveZoomSpan,
  ratioFromClientX,
  rulerTicks,
  resolveTrackViewportFrame,
  validLoopCycles,
  wheelDeltaToCycles,
  zoomSliderToSpan,
  zoomSpanToSlider,
  sceneBandContainsViewport,
  sceneBandForViewport,
  sceneTransformFor,
} from '../../lib/track-timeline';
import type { RulerTickHistory } from '../../lib/track-timeline';
import type { TrackClockSample } from '../../lib/track-timeline';
import type { PreviewTrack, TrackFullSceneRequest, TrackSceneQueryResult } from '../../services/track-preview';
import type { ExactTrackPrimitive, TrackFullSceneIdentity, TrackFullSceneSnapshot, TrackLaneSceneData, TrackSceneBatch, TrackSceneRequest } from '../../lib/track-preview-scene';
import { assembleFullSceneBatch, sameTrackFullSceneIdentity, TrackHighlightCursor, densityColumnAt, planPixelPrecision } from '../../lib/track-preview-scene';
import { RASTER_DEFAULT_BUDGET_BYTES } from '../../lib/track-preview-canvas';
import type { TrackRenameResult, TransportEvent } from '../../services/strudel';
import type { PlaybackTimeline } from '../../lib/strudel-timing';
import { formatPlaybackTime } from '../../lib/strudel-timing';
import { MutedVolumeIcon, VolumeIcon } from '../icons';
import { useTrackViewport } from '../../hooks/useTrackViewport';
import { useDevicePixelRatio } from '../../hooks/useDevicePixelRatio';
import TrackLaneCanvas, { type TrackLaneCanvasHandle } from './TrackLaneCanvas';

interface TrackPanelProps {
  tracks: PreviewTrack[];
  soloId: string | null;
  mutedIds: ReadonlySet<string>;
  toggleSolo: (id: string) => void;
  toggleMute: (id: string) => void;
  /** Clock-only high-frequency read used by the production panel. */
  getClock?: () => TrackClockSample;
  /** Cancellable low-frequency scene query used by the production panel. */
  queryScene?: (
    request: TrackSceneRequest,
    signal?: AbortSignal,
    onProgress?: (batch: TrackSceneBatch) => void,
  ) => Promise<TrackSceneQueryResult>;
  /** Fixed-range scene snapshot used by the production panel. */
  fullScene?: TrackFullSceneSnapshot | null;
  /** Starts or reuses one full-scene job for an identity. */
  ensureFullScene?: (request: TrackFullSceneRequest) => void;
  /** Prepares the next pass without replacing the current snapshot. */
  prewarmFullScene?: (request: TrackFullSceneRequest) => void;
  /** Pattern/track generation; mix-only revisions do not invalidate a scene. */
  previewGeneration?: number;
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
const HUE_COUNT = 6;
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
/** The sounding overlay samples at the same low rate as the preview work. */
const SOUNDING_INTERVAL_MS = 80;
/** Playback re-aims the draw window once the remaining off-screen margin
 *  falls under this share of one visible span. */
const DRAW_WINDOW_SAFETY_RATIO = 0.25;

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
  tracks, soloId, mutedIds, toggleSolo, toggleMute, getClock, queryScene, fullScene, ensureFullScene, prewarmFullScene, previewGeneration = 0, isPlaying, isPaused, active,
  refreshRevision = 0, transportEvent, canSeek = true, seekToCycle, onNavigateToTrack, timeline,
  sessionKey = '', canRename = true, renameTrack,
}: TrackPanelProps) {
  // The piece's finite range: every window, playhead and seek target lives in
  // [0, L]. Null (no usable code) disables the timeline instead of unbounding it.
  const loopCycles = validLoopCycles(timeline?.loopCycles) ? timeline!.loopCycles : null;
  const estimatedCps = timeline?.estimatedCps ?? null;
  const fullSceneMode = Boolean(getClock && ensureFullScene);
  const liveMode = fullSceneMode || Boolean(getClock && queryScene);
  const viewport = useTrackViewport(loopCycles);
  // One DPR subscription for the whole panel: every lane draws at the same
  // ratio, and a display change redraws without touching the query identity.
  const devicePixelRatio = useDevicePixelRatio();
  const [liveProjectionSnapshot, setLiveProjectionSnapshot] = useState(() => resolveTrackViewportFrame(0, viewport.request));
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [dragHint, setDragHint] = useState<{ cycle: number; clientX: number } | null>(null);
  // The measured width of the shared content area (ruler and canvas draw at
  // the same width); 0 until the first ResizeObserver report.
  const [contentWidth, setContentWidth] = useState(0);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const announceTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The scene state: one committed immutable batch plus the in-flight
  // progressive merge, shown only while no complete scene exists yet.
  const [committedScene, setCommittedScene] = useState<TrackSceneBatch | null>(null);
  const [progressScene, setProgressScene] = useState<TrackSceneBatch | null>(null);
  const [legacyQuerying, setLegacyQuerying] = useState(false);
  const [legacyPreviewFailure, setLegacyPreviewFailure] = useState<'resource-guarded' | 'failed' | null>(null);
  const [rasterFailure, setRasterFailure] = useState<'resource-guarded' | null>(null);
  const fullSceneBatch = fullSceneMode && fullScene && loopCycles !== null
    ? assembleFullSceneBatch(
      fullScene,
      tracks.map(track => track.id),
      liveProjectionSnapshot.begin,
      liveProjectionSnapshot.end,
      contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH,
    )
    : null;
  const legacyCurrentScene = committedScene?.generation === previewGeneration ? committedScene : null;
  const legacyDisplayScene = legacyCurrentScene
    ?? (progressScene?.generation === previewGeneration ? progressScene : null);
  const currentScene = fullSceneMode
    ? (fullSceneBatch?.status === 'complete' ? fullSceneBatch : null)
    : legacyCurrentScene;
  const displayScene = fullSceneMode ? fullSceneBatch : legacyDisplayScene;
  const querying = fullSceneMode ? fullScene?.status === 'preparing' : legacyQuerying;
  const previewFailure = fullSceneMode
    ? fullScene?.status === 'resource-guarded' ? 'resource-guarded' : fullScene?.status === 'failed' ? 'failed' : rasterFailure
    : legacyPreviewFailure;
  const displaySceneRef = useRef<TrackSceneBatch | null>(displayScene);
  displaySceneRef.current = displayScene;
  const committedSceneRef = useRef<TrackSceneBatch | null>(currentScene);
  committedSceneRef.current = currentScene;
  const laneHandlesRef = useRef(new Map<string, TrackLaneCanvasHandle>());
  const highlightTrackersRef = useRef(new Map<string, {
    primitives: readonly ExactTrackPrimitive[];
    cursor: TrackHighlightCursor;
  }>());
  const sceneBandRef = useRef<{ begin: number; end: number } | null>(null);
  const fullSceneIdentityRef = useRef<TrackFullSceneIdentity | null>(null);
  const fullSceneRef = useRef<TrackFullSceneSnapshot | null>(fullScene);
  fullSceneRef.current = fullScene ?? null;
  const lastSoundingUpdateRef = useRef(-Infinity);
  const lastSoundingNowRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const isPausedRef = useRef(isPaused);
  isPlayingRef.current = isPlaying;
  isPausedRef.current = isPaused;
  const previewJobRef = useRef<{
    timer: number | null;
    controller: AbortController | null;
    latest: TrackSceneRequest | null;
  }>({ timer: null, controller: null, latest: null });
  const liveDomRef = useRef<{
    playhead: HTMLElement | null;
    rulerLine: HTMLElement | null;
    caret: HTMLElement | null;
  }>({ playhead: null, rulerLine: null, caret: null });
  // The live sampling request, read by the RAF loop whose effect only depends
  // on lifecycle state — a per-frame window change must never re-mount it.
  const requestRef = useRef(viewport.request);
  requestRef.current = viewport.request;
  // The live displayed window, read by the non-passive wheel listener and by
  // zoom anchors whose effects only run once — state inside a closure goes stale.
  const liveProjectionRef = useRef(resolveTrackViewportFrame(0, viewport.request));
  const frameBeginRef = useRef(liveProjectionRef.current.begin);
  frameBeginRef.current = liveMode ? liveProjectionRef.current.begin : 0;
  const frameSpanRef = useRef(liveProjectionRef.current.span);
  frameSpanRef.current = liveMode ? liveProjectionRef.current.span : 0;
  // The accepted zoom scale, read by wheel/keyboard handlers that may run
  // several times between renders.
  const zoomSpanRef = useRef(viewport.span);
  zoomSpanRef.current = viewport.span;
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

  const scheduleAnnouncement = useCallback((message: string) => {
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current);
    // Clear first so repeating the same boundary/range is announced again.
    setAnnouncement('');
    announceTimerRef.current = window.setTimeout(() => {
      announceTimerRef.current = null;
      setAnnouncement(message);
    }, 150);
  }, []);
  const announce = useCallback((cycle: number) => {
    scheduleAnnouncement(timeHint(clampCycle(cycle), estimatedCps));
  }, [estimatedCps, scheduleAnnouncement]);
  const announceWindow = useCallback((begin: number, end: number) => {
    scheduleAnnouncement(tf('trackBrowseRange', {
      begin: cycleTickLabel(begin),
      end: cycleTickLabel(end),
    }));
  }, [scheduleAnnouncement]);
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

  const handleTrackHeaderClick = (track: PreviewTrack, event: React.MouseEvent<HTMLDivElement>) => {
    // The action row stretches across the whole header, so the space after
    // Solo belongs to that div rather than the outer header. Treat every
    // non-control part of the header like the name button while keeping mute,
    // Solo and the inline editor independent.
    if ((event.target as Element).closest('button, input')) return;
    handleNameClick(track);
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
  const handledTransportRevisionRef = useRef(transportRevision);
  const previewTransportRevisionRef = useRef(transportRevision);
  useEffect(() => {
    if (!transportEvent) return;
    if (handledTransportRevisionRef.current === transportRevision) return;
    handledTransportRevisionRef.current = transportRevision;
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

  /**
   * Register one lane's canvas handle; the sounding overlay reaches it
   * imperatively, never through a re-render.
   */
  const registerLaneHandle = useCallback((trackId: string, handle: TrackLaneCanvasHandle | null) => {
    if (handle) laneHandlesRef.current.set(trackId, handle);
    else laneHandlesRef.current.delete(trackId);
  }, []);

  /**
   * Sounding stays a low-frequency concern sampled at the preview's rate.
   * Exact lanes scan with a cursor over their sorted index; density lanes
   * highlight the column under the playhead. Nothing here touches React
   * state, the base canvas or the pattern.
   */
  const syncSounding = useCallback((displayNow: number, force = false) => {
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    if (!force && now - lastSoundingUpdateRef.current < SOUNDING_INTERVAL_MS) return;
    lastSoundingUpdateRef.current = now;
    const sounding = isPlayingRef.current || isPausedRef.current;
    const scene = displaySceneRef.current;
    for (const track of tracksRef.current) {
      const handle = laneHandlesRef.current.get(track.id);
      if (!handle) continue;
      if (!sounding) {
        handle.setActive(null);
        continue;
      }
      const lane = scene?.lanes.find(data => data.trackId === track.id) ?? null;
      if (!lane || lane.rawEventCount === 0) { handle.setActive(null); continue; }
      if (lane.representation === 'exact' && lane.exact) {
        let tracker = highlightTrackersRef.current.get(track.id);
        // Full-scene progress keeps the same identity while publishing newly
        // assembled lane arrays. Exact ids are lane-scoped and may be
        // renumbered as tiles arrive, so a cursor is valid only for the exact
        // primitive array it indexed.
        let rebuilt = false;
        if (!tracker || tracker.primitives !== lane.exact) {
          tracker = { primitives: lane.exact, cursor: new TrackHighlightCursor(lane.exact) };
          highlightTrackersRef.current.set(track.id, tracker);
          rebuilt = true;
        }
        const forward = displayNow >= lastSoundingNowRef.current - 1e-9;
        // A new cursor has no previous position even if the transport itself
        // moved forward; reset seeds every note already sounding at this time.
        const ids = rebuilt || !forward
          ? tracker.cursor.reset(displayNow)
          : tracker.cursor.advance(displayNow);
        handle.setActive({ ids });
      } else if (lane.density) {
        handle.setActive({ bins: [densityColumnAt(lane.density, displayNow)] });
      } else {
        handle.setActive(null);
      }
    }
    lastSoundingNowRef.current = displayNow;
  }, []);

  // A new scene rebuilds the highlight state: cursors are scene-scoped.
  useEffect(() => {
    highlightTrackersRef.current.clear();
  }, [committedScene, fullScene?.identity, progressScene]);

  /** Write only compositor-facing values during a clock sample. */
  const applyLiveProjection = useCallback((projection: ReturnType<typeof resolveTrackViewportFrame>) => {
    liveProjectionRef.current = projection;
    frameBeginRef.current = projection.begin;
    frameSpanRef.current = projection.span;
    if (!liveMode) return;
    const panel = panelRef.current;
    if (!panel) return;
    const band = fullSceneMode && loopCycles !== null
      ? { begin: 0, end: loopCycles }
      : sceneBandRef.current;
    if (band) {
      const transform = sceneTransformFor(band, projection);
      panel.style.setProperty('--track-scene-width', `${transform.widthPercent}%`);
      panel.style.setProperty('--track-scene-offset', `${transform.offsetPercent}%`);
    }
    const ratio = projection.span > 0
      ? (projection.displayNow - projection.begin) / projection.span * 100
      : 0;
    const visible = projection.displayNow >= projection.begin && projection.displayNow <= projection.end;
    const x = `${Math.round(ratio * 10000) / 10000}%`;
    panel.style.setProperty('--track-playhead-x', x);
    for (const marker of [liveDomRef.current.playhead, liveDomRef.current.rulerLine, liveDomRef.current.caret]) {
      if (!marker) continue;
      marker.style.transform = `translate3d(${x}, 0, 0)`;
      marker.style.visibility = visible ? '' : 'hidden';
    }
    syncSounding(projection.displayNow);
  }, [fullSceneMode, liveMode, loopCycles, syncSounding]);

  const sampleLiveClock = useCallback((forceSounding = false) => {
    if (!liveMode || !getClock || loopCycles === null) return null;
    const clock = getClock();
    const projection = resolveTrackViewportFrame(clock.absoluteCycle, requestRef.current);
    if (fullSceneMode && ensureFullScene && loopCycles !== null) {
      const identity: TrackFullSceneIdentity = Object.freeze({
        previewGeneration,
        loopOffset: projection.loopOffset,
        loopCycles,
        cps: clock.cps,
      });
      if (!sameTrackFullSceneIdentity(fullSceneIdentityRef.current, identity)) {
        fullSceneIdentityRef.current = identity;
        ensureFullScene({
          identity,
          initialViewport: { begin: projection.begin, end: projection.end },
          cssWidth: contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH,
        });
      }
      const currentFullScene = fullSceneRef.current;
      if (prewarmFullScene && isPlayingRef.current
        && currentFullScene?.status === 'complete'
        && sameTrackFullSceneIdentity(currentFullScene.identity, identity)) {
        prewarmFullScene({
          identity: Object.freeze({
            ...identity,
            loopOffset: identity.loopOffset + loopCycles,
          }),
          initialViewport: { begin: projection.begin, end: projection.end },
          cssWidth: contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH,
        });
      }
    }
    applyLiveProjection(projection);
    if (forceSounding) setLiveProjectionSnapshot(projection);
    if (forceSounding) syncSounding(projection.displayNow, true);
    return { clock, projection };
  }, [applyLiveProjection, contentWidth, ensureFullScene, fullSceneMode, getClock, liveMode, loopCycles, prewarmFullScene, previewGeneration, syncSounding]);

  const committedQueryRef = useRef<{
    generation: number;
    loopOffset: number;
    cps: number;
    begin: number;
    end: number;
    tier: number;
    binSpan: number;
    exactBudget: number;
  } | null>(null);
  // The last accepted target tier: recorded only from committed results, never
  // from a cancelled query. Requests carry it so the service can validate and
  // hold it against its own measurement.
  const acceptedTierRef = useRef<number | null>(null);
  // One queued draw window refresh: set when playback enters the safety
  // distance, committed at most once per animation frame.
  const drawWindowRefreshQueuedRef = useRef(false);
  // The raster blocks and ruler labels currently committed by React. The live
  // clock may move the shared scene transform every RAF without rendering, so
  // this boundary — rather than a window derived from that newest clock —
  // decides when React must advance its low-frequency drawing snapshot.
  const committedDrawWindowRef = useRef<ReturnType<typeof drawWindowForViewport> | null>(null);

  const makePreviewRequest = useCallback((force: boolean): TrackSceneRequest | null => {
    if (fullSceneMode || !liveMode || !getClock || !queryScene || !tracks.length || loopCycles === null) return null;
    const sampled = sampleLiveClock();
    if (!sampled) return null;
    const { clock, projection } = sampled;
    const committed = committedQueryRef.current;
    const currentBand = sceneBandRef.current;
    if (!force && committed && currentBand
      && committed.generation === previewGeneration
      && Math.abs(committed.loopOffset - projection.loopOffset) < 1e-9
      && Math.abs(committed.cps - clock.cps) < 1e-9
      && sceneBandContainsViewport(currentBand, projection, 0.25, loopCycles)) {
      // Precision-only compat check: only a genuinely finer target re-queries;
      // DPR or lane-height changes never do.
      const cssWidth = contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH;
      const target = planPixelPrecision({
        cssWidth,
        viewportBegin: projection.begin,
        viewportEnd: projection.end,
        bandBegin: currentBand.begin,
        bandEnd: currentBand.end,
        previousTier: acceptedTierRef.current ?? undefined,
        requestedTier: acceptedTierRef.current ?? undefined,
      });
      if (committed.tier >= target.resolutionTier
        && committed.binSpan > 0
        && committed.binSpan <= target.effectiveBinSpan + 1e-9
        && committed.exactBudget >= target.exactBudget) return null;
    }
    const band = sceneBandForViewport(projection, loopCycles);
    const cssWidth = contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH;
    return {
      generation: previewGeneration,
      loopOffset: projection.loopOffset,
      cps: clock.cps,
      queryBegin: band.begin,
      queryEnd: band.end,
      viewportBegin: projection.begin,
      viewportEnd: projection.end,
      cssWidth,
      devicePixelRatio,
      resolutionTier: acceptedTierRef.current ?? undefined,
    };
  }, [contentWidth, devicePixelRatio, fullSceneMode, getClock, liveMode, loopCycles, previewGeneration, queryScene, sampleLiveClock, tracks.length]);

  const startPreviewQuery = useCallback((request: TrackSceneRequest) => {
    if (fullSceneMode || !queryScene) return;
    const job = previewJobRef.current;
    job.controller?.abort();
    const controller = new AbortController();
    job.controller = controller;
    setLegacyQuerying(true);
    void queryScene(request, controller.signal, batch => {
      // Progressive tile merges arrive here; the committed scene below is
      // never replaced by a partial one.
      if (controller.signal.aborted || previewJobRef.current.controller !== controller) return;
      if (batch.generation !== previewGeneration) return;
      setProgressScene(batch);
    })
      .then(result => {
        if (controller.signal.aborted || previewJobRef.current.controller !== controller) return;
        if (result.status === 'complete' && result.batch && result.batch.generation === previewGeneration) {
          sceneBandRef.current = { begin: result.batch.begin, end: result.batch.end };
          committedQueryRef.current = {
            generation: result.batch.generation,
            loopOffset: result.batch.loopOffset,
            cps: request.cps,
            begin: result.batch.begin,
            end: result.batch.end,
            tier: result.batch.resolutionTier,
            binSpan: result.batch.effectiveBinSpan ?? 0,
            exactBudget: result.batch.exactBudget ?? 0,
          };
          acceptedTierRef.current = result.batch.resolutionTier;
          setCommittedScene(result.batch);
          setProgressScene(null);
          setLegacyPreviewFailure(null);
          highlightTrackersRef.current.clear();
          sampleLiveClock(true);
        } else if (result.status === 'resource-guarded' || result.status === 'failed') {
          // A cancelled or guarded result must not turn the accepted tier into
          // a lesser one; the previously committed scene stays in charge.
          setLegacyPreviewFailure(result.status);
        }
      })
      .catch(error => {
        // Cancellation is expected during seek, code changes and unmount. A
        // real query failure keeps the previous complete scene in place.
        if ((error as { name?: string })?.name !== 'AbortError') setLegacyPreviewFailure('failed');
      })
      .finally(() => {
        if (previewJobRef.current.controller === controller) {
          previewJobRef.current.controller = null;
          setLegacyQuerying(false);
        }
      });
  }, [fullSceneMode, previewGeneration, queryScene, sampleLiveClock]);

  const schedulePreviewQuery = useCallback((immediate: boolean, force: boolean) => {
    const request = makePreviewRequest(force);
    if (!request) return;
    const job = previewJobRef.current;
    job.latest = request;
    const run = () => {
      job.timer = null;
      const latest = job.latest;
      job.latest = null;
      if (latest) startPreviewQuery(latest);
    };
    if (immediate) {
      if (job.timer !== null) { window.clearTimeout(job.timer); job.timer = null; }
      run();
    } else if (job.timer === null) {
      job.timer = window.setTimeout(run, 80);
    }
  }, [makePreviewRequest, startPreviewQuery]);

  // One queued draw window refresh: set when playback enters the safety
  // distance, committed at most once per animation frame with the latest
  // target — never the stale frame that queued it.
  const refreshDrawWindowIfNeeded = useCallback(() => {
    if (!liveMode || loopCycles === null) return;
    const window = committedDrawWindowRef.current;
    if (!window) return;
    const projection = liveProjectionRef.current;
    if (sceneBandContainsViewport(window, projection, DRAW_WINDOW_SAFETY_RATIO, loopCycles)) return;
    if (drawWindowRefreshQueuedRef.current) return;
    drawWindowRefreshQueuedRef.current = true;
    requestAnimationFrame(() => {
      drawWindowRefreshQueuedRef.current = false;
      setLiveProjectionSnapshot(liveProjectionRef.current);
      // Full-scene mode already owns all music data. It only needs fresh ruler
      // labels and raster blocks; the compatibility path still extends its
      // queried scene when necessary.
      if (!fullSceneMode) schedulePreviewQuery(false, false);
    });
  }, [fullSceneMode, liveMode, loopCycles, schedulePreviewQuery]);

  // The production RAF samples only clock/viewport and writes transforms. It
  // never calls queryArc or updates React state — except for one queued draw
  // window refresh when playback nears the window's edge (at most one per
  // animation frame, and still only within the prefetch band).
  useLayoutEffect(() => {
    if (!liveMode || !active || !tracks.length || !isPlaying) return;
    let request = 0;
    const tick = () => {
      request = requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden') return;
      sampleLiveClock();
      refreshDrawWindowIfNeeded();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (request !== 0) { cancelAnimationFrame(request); request = 0; }
      } else if (request === 0) {
        request = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState !== 'hidden') request = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (request !== 0) cancelAnimationFrame(request);
    };
  }, [active, isPlaying, liveMode, refreshDrawWindowIfNeeded, sampleLiveClock, tracks.length]);

  // First compile, session change and paused/stopped transitions need one
  // synchronous coordinate sample before paint; the query itself stays in the
  // low-frequency path below.
  useLayoutEffect(() => {
    if (!liveMode || !active || !tracks.length) return;
    sampleLiveClock(true);
    if (fullSceneMode) return;
    schedulePreviewQuery(true, !committedSceneRef.current || committedSceneRef.current.generation !== previewGeneration);
  }, [active, fullSceneMode, isPaused, isPlaying, liveMode, previewGeneration, schedulePreviewQuery, sampleLiveClock, tracks.length]);

  // Transport seeks/pause/stop request one deterministic refresh, coalesced by
  // the 80ms merge window so repeated scrub notifications do not overlap jobs.
  useEffect(() => {
    if (!liveMode || !active || !tracks.length) return;
    if (previewTransportRevisionRef.current === transportRevision) return;
    previewTransportRevisionRef.current = transportRevision;
    sampleLiveClock(true);
    if (fullSceneMode) return;
    schedulePreviewQuery(false, true);
  }, [active, fullSceneMode, liveMode, schedulePreviewQuery, sampleLiveClock, tracks.length, transportRevision]);

  // Viewport gestures update transforms immediately; a new band is queried on
  // demand and merged with any already pending target.
  useEffect(() => {
    if (!liveMode || !active || !tracks.length) return;
    sampleLiveClock(true);
    if (fullSceneMode) return;
    schedulePreviewQuery(false, false);
  }, [active, fullSceneMode, liveMode, schedulePreviewQuery, sampleLiveClock, tracks.length, viewport.request]);

  // No hidden-page work or stale handle registration survives a lifecycle edge.
  useEffect(() => {
    if (!liveMode || active) return;
    const job = previewJobRef.current;
    if (job.timer !== null) { window.clearTimeout(job.timer); job.timer = null; }
    job.controller?.abort(); job.controller = null; job.latest = null;
  }, [active, liveMode]);
  useEffect(() => () => {
    const job = previewJobRef.current;
    if (job.timer !== null) window.clearTimeout(job.timer);
    job.controller?.abort();
    laneHandlesRef.current.clear();
  }, []);

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
      const job = previewJobRef.current;
      if (job.timer !== null) { window.clearTimeout(job.timer); job.timer = null; }
      job.controller?.abort(); job.controller = null; job.latest = null;
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
      const job = previewJobRef.current;
      if (job.timer !== null) { window.clearTimeout(job.timer); job.timer = null; }
      job.controller?.abort(); job.controller = null; job.latest = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active, clearWheelZoom, cancelSliderZoom, clearNameActivation]);

  // A failure keeps its scene; a new successful commit clears it. A guard or
  // a failure is the only state that occupies the warning slot — normal
  // density is a complete preview, not a warning.
  useEffect(() => {
    if (committedScene?.generation === previewGeneration) setLegacyPreviewFailure(null);
  }, [committedScene, previewGeneration]);

  const liveRenderProjection = liveMode ? liveProjectionSnapshot : null;
  const renderFrame = {
    now: liveRenderProjection?.displayNow ?? displayScene?.viewportBegin ?? 0,
    begin: liveRenderProjection?.begin ?? displayScene?.viewportBegin ?? 0,
    end: liveRenderProjection?.end ?? displayScene?.viewportEnd ?? 0,
  };
  const sceneBand = fullSceneMode && loopCycles !== null
    ? { begin: 0, end: loopCycles }
    : liveMode && currentScene
      ? { begin: currentScene.begin, end: currentScene.end }
    : liveMode && loopCycles !== null
      ? sceneBandForViewport(renderFrame, loopCycles)
      : { begin: renderFrame.begin, end: renderFrame.end };
  const sceneTransform = sceneTransformFor(sceneBand, {
    begin: renderFrame.begin,
    end: renderFrame.end,
  });
  // The drawing blocks commit at most one visible span to each side of the
  // viewport, always inside the data that exists.
  const drawWindow = drawWindowForViewport(renderFrame, sceneBand);
  // Publish the boundary only after this render commits. A discarded
  // concurrent render must not make the RAF believe its blocks are visible.
  useLayoutEffect(() => {
    committedDrawWindowRef.current = drawWindow;
  });
  // The panel owns the bitmap budget: one equal share per lane keeps the
  // estimate panel-level, and a lane whose visible area alone exceeds its
  // share may overrun that soft budget rather than losing clarity.
  const rasterBudgetPerLane = Math.floor(RASTER_DEFAULT_BUDGET_BYTES / Math.max(1, tracks.length));
  const notifyRasterFailure = useCallback(() => {
    setRasterFailure(previous => previous ?? 'resource-guarded');
  }, []);
  const slots = useMemo(() => trackSlots(tracks), [tracks]);
  // Everything on screen — ruler, grid, notes, playhead — projects through
  // this one frame, so the window the events were queried for is exactly the
  // window they are drawn in. The tick level is fixed by the span and the
  // measured content width only; a slide keeps absolute multiples, and the
  // drawn level's own hysteresis rides across spans. Reading happens here in
  // render, but writing the history back waits for the layout commit below,
  // so an uncommitted render can never pollute the display history.
  const viewSpan = renderFrame.end - renderFrame.begin;
  const measuredWidth = contentWidth > 0 ? contentWidth : FALLBACK_CONTENT_WIDTH;
  // The primary ruler labels describe the committed visible window. Extra
  // visual-only labels cover its raster draw window below, while lane grid
  // lines use the wider scene band.
  const ticks = rulerTicks(renderFrame.begin, renderFrame.end, measuredWidth, tickHistoryRef.current ?? undefined);
  // The DOM ruler needs the same ahead/behind coverage as the raster blocks.
  // Its scene transform moves every RAF, while React updates only when the
  // draw window nears an edge; without these off-screen ticks, the old visible
  // labels slide away before the shared draw window needs to advance.
  const rulerDrawSpan = drawWindow.end - drawWindow.begin;
  const rulerDrawTicks = liveMode && viewSpan > 0 && rulerDrawSpan > 0
    ? rulerTicks(
      drawWindow.begin,
      drawWindow.end,
      measuredWidth * rulerDrawSpan / viewSpan,
      tickHistoryRef.current ?? undefined,
    )
    : ticks;
  const visibleMajorTicks = new Set(ticks.major);
  const visibleMinorTicks = new Set(ticks.minor);
  const prefetchedMajorTicks = rulerDrawTicks.major.filter(cycle => !visibleMajorTicks.has(cycle));
  const prefetchedMinorTicks = rulerDrawTicks.minor.filter(cycle => !visibleMinorTicks.has(cycle));
  const sceneTicks = liveMode
    ? rulerTicks(sceneBand.begin, sceneBand.end, measuredWidth * sceneTransform.widthPercent / 100, tickHistoryRef.current ?? undefined)
    : ticks;
  // Record the level only after the frame that drew it commits; a discarded
  // render must never leave its level in the display history.
  useLayoutEffect(() => {
    if (ticks.majorStep === 0) { tickHistoryRef.current = null; return; }
    tickHistoryRef.current = { majorStep: ticks.majorStep, minorStep: ticks.minorStep };
  });
  // The piece's real end is the only place a boundary tick is drawn: an
  // ordinary mid-piece window must not imply a limit it does not have.
  const endLabel = endTickLabel(renderFrame.end, loopCycles, ticks.majorStep);
  const position = (cycle: number) => {
    const percent = (cycle - renderFrame.begin) / (renderFrame.end - renderFrame.begin) * 100;
    // Four decimals kill float noise (a centred playhead lands at 50.000…007)
    // without disturbing the sub-pixel precision short notes rely on.
    return Math.round(percent * 10000) / 10000;
  };
  const scenePosition = (cycle: number) => {
    const percent = (cycle - sceneBand.begin) / (sceneBand.end - sceneBand.begin) * 100;
    return Math.round(percent * 10000) / 10000;
  };
  const playheadVisible = renderFrame.now >= renderFrame.begin && renderFrame.now <= renderFrame.end;
  // Only a guard or a failure occupies the state slot; a running query over a
  // complete scene is stale-while-revalidate and stays quiet. A first-load
  // progress is a normal state, not an error.
  const previewNotice = previewFailure === 'resource-guarded'
    ? t('trackPreviewGuarded')
    : previewFailure === 'failed'
      ? t('trackPreviewFailed')
      : !currentScene && querying && (fullSceneMode ? Boolean(fullSceneBatch) : Boolean(progressScene))
        ? t('trackPreviewPending')
        : null;
  const representationLabelFor = (lane: TrackLaneSceneData | null): string => {
    if (!lane) return t('trackPreviewPending');
    return lane.representation === 'exact' ? t('trackPreviewExact') : t('trackPreviewDensity');
  };

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
    const liveFrame = liveMode ? liveProjectionRef.current : renderFrame;
    // Freeze ordinary seeking; only the edge-scroll loop moves this window.
    const target = cycleFromClientX(event.clientX, rect, liveFrame.begin, viewSpan, loopCycles);
    if (target === null) return;
    // A valid press must not start the browser's text selection across the
    // ruler's cycle labels — pointer capture keeps the events flowing but
    // does not stop the selection. Focus stays on the ruler explicitly (and
    // without scrolling) so the arrow keys keep seeking after the gesture.
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const drag = {
      pointerId: event.pointerId, rect, begin: liveFrame.begin, span: viewSpan,
      mode: viewport.mode, target, frame: null as number | null,
      clientX: event.clientX, lastTime: null as number | null,
      committedTarget: target, scrolled: false,
    };
    seekDragRef.current = drag;
    viewport.freezeWindow(liveFrame.begin, liveFrame.end);
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
    const liveFrame = liveMode ? liveProjectionRef.current : renderFrame;
    panDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
      begin: liveFrame.begin,
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
  // the pointer: deltas accumulate in pixels, ~80px cash in one zoom step,
  // and at most one step applies per animation frame — a light sweep must not
  // cross the whole zoom range. Ctrl/Cmd stays with the browser's own zoom, and
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
    if (!canSeek) return;
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      // The page keys browse the canvas, not the transport. Even a clamped
      // boundary press belongs to the focused timeline, so it must not scroll
      // the surrounding document. With no finite piece there is no page to
      // own, and the browser keeps its ordinary key behaviour.
      if (loopCycles === null) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === 'PageUp' ? -1 : 1;
      const span = Math.min(viewSpan, loopCycles);
      const maxBegin = Math.max(0, loopCycles - span);
      const begin = Math.min(maxBegin, Math.max(
        0,
        frameBeginRef.current + direction * browseStepCycles(viewport.span, loopCycles),
      ));
      if (Math.abs(begin - frameBeginRef.current) < 1e-9) return;
      viewport.panTo(begin);
      announceWindow(begin, Math.min(loopCycles, begin + span));
      return;
    }
    if (!seekToCycle) return;
    const step = event.shiftKey ? 1 : 0.25;
    let target: number | null = null;
    // Keyboard targets walk the displayed playhead and clamp inside [0, L]:
    // the piece's end is a boundary, not a place to scroll past.
    const targetNow = liveMode ? liveProjectionRef.current.displayNow : renderFrame.now;
    if (event.key === 'ArrowLeft') target = clampCycle(targetNow - step, loopCycles);
    else if (event.key === 'ArrowRight') target = clampCycle(targetNow + step, loopCycles);
    else if (event.key === 'Home') target = 0;
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    commitSeek(target);
    viewport.seekTo(target, viewport.mode);
    announce(target);
  };

  // ── Zoom actions ─────────────────────────────────────────────────────────
  // One multiplicative step per input, judged by the *effective* span: zoom
  // out doubles, zoom in halves, and the final step lands on the piece. Without a
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
    viewport.zoomTo(next, { begin: frameBeginRef.current, span: frameSpanRef.current }, 0.5);
  };
  /** Back to the default scale only — follow/manual and the position stay. */
  const resetZoom = () => {
    if (gestureActive() || sliderPointerActive()) return;
    clearWheelZoom();
    viewport.zoomTo(DEFAULT_TRACK_VIEW_SPAN, { begin: frameBeginRef.current, span: frameSpanRef.current }, 0.5);
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

  // The ruler measures its own content width — the same width the canvases
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

  // A paused/stopped panel still needs one deterministic sounding sync when
  // the mix or the scene changes; the RAF path covers playing states.
  useLayoutEffect(() => {
    if (!liveMode) return;
    syncSounding(liveProjectionRef.current.displayNow, true);
  }, [currentScene, isPaused, isPlaying, liveMode, mutedIds, refreshRevision, soloId, syncSounding]);

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

  const laneFor = (trackId: string): TrackLaneSceneData | null =>
    displayScene?.lanes.find(data => data.trackId === trackId) ?? null;

  return (
    <div ref={panelRef} className="track-panel relative flex h-full min-h-0 flex-col bg-[var(--track-canvas)]" aria-label={t('tracksView')}>
      {/* The compact tool row sits above the scrolling area: manual follow and
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
          {viewport.mode === 'manual' && (
            <button type="button" className="track-tool-button px-1.5" aria-label={t('trackReturnToPlayback')} title={t('trackReturnToPlayback')}
              onClick={() => viewport.returnToPlayback()}>◎</button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {previewNotice && (
            <span data-track-preview-state role="status" className="w-full px-1 text-right text-[10px] text-text-secondary sm:w-auto sm:text-left">{previewNotice}</span>
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
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="track-panel-ruler track-panel-grid sticky top-0 z-20 border-b border-[var(--track-rule)] bg-[var(--track-canvas)]">
          <div aria-hidden="true" className="flex min-w-0 items-center bg-[var(--track-header)] pl-3 pr-2 text-[11px] text-text-secondary" />
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
            {liveMode ? (
              <>
                <span ref={el => { liveDomRef.current.rulerLine = el; }} data-playhead-ruler-line data-live-playhead aria-hidden className="track-playhead-position track-playhead-ruler-position">
                  <span className="track-playhead-ruler-line" />
                </span>
                <div className="track-ruler-minor-clip track-ruler-scene-clip">
                  <div data-track-scene className="track-ruler-scene absolute inset-y-0 left-0">
                    {ticks.minor.map(cycle => <span key={`minor-${cycle}`} aria-hidden className="track-ruler-minor absolute bottom-0" style={{ left: `${scenePosition(cycle)}%` }} />)}
                    {prefetchedMinorTicks.map(cycle => <span key={`minor-prefetch-${cycle}`} aria-hidden className="track-ruler-minor absolute bottom-0" style={{ left: `${scenePosition(cycle)}%` }} />)}
                  </div>
                </div>
                <div className="track-ruler-ticks-clip track-ruler-scene-clip">
                  <div data-track-scene className="track-ruler-scene absolute inset-y-0 left-0">
                    {ticks.major.map(cycle => <span key={`major-${cycle}`} className="track-ruler-tick absolute top-2" style={{ left: `${scenePosition(cycle)}%` }}>{cycleTickLabel(cycle)}</span>)}
                    {prefetchedMajorTicks.map(cycle => <span key={`major-prefetch-${cycle}`} aria-hidden className="track-ruler-prefetch-tick absolute top-2" style={{ left: `${scenePosition(cycle)}%` }}>{cycleTickLabel(cycle)}</span>)}
                    {endLabel && <span data-ruler-end-tick className="track-ruler-tick absolute top-2 -translate-x-full" style={{ left: `${scenePosition(renderFrame.end)}%` }}>{endLabel}</span>}
                  </div>
                </div>
                <span ref={el => { liveDomRef.current.caret = el; }} data-live-playhead aria-hidden className="track-playhead-position">
                  <span data-playhead-caret className="track-playhead-caret" />
                </span>
              </>
            ) : (
              <>
                <span data-playhead-ruler-line aria-hidden className="track-playhead-ruler-line" style={{ left: `${position(renderFrame.now)}%`, visibility: playheadVisible ? undefined : 'hidden' }} />
                <div className="track-ruler-minor-clip">
                  {ticks.minor.map(cycle => <span key={`minor-${cycle}`} aria-hidden className="track-ruler-minor absolute bottom-0" style={{ left: `${position(cycle)}%` }} />)}
                </div>
                <div className="track-ruler-ticks-clip">
                  {ticks.major.map(cycle => <span key={`major-${cycle}`} className="track-ruler-tick absolute top-2" style={{ left: `${position(cycle)}%` }}>{cycleTickLabel(cycle)}</span>)}
                  {endLabel && <span data-ruler-end-tick className="track-ruler-tick absolute top-2 -translate-x-full" style={{ left: `${position(renderFrame.end)}%` }}>{endLabel}</span>}
                </div>
                <span data-playhead-caret aria-hidden className="track-playhead-caret" style={{ left: `${position(renderFrame.now)}%`, visibility: playheadVisible ? undefined : 'hidden' }} />
              </>
            )}
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
          const lane = laneFor(track.id);
          const selected = selectedTrackId === track.id;
          return (
            <div key={track.id} data-track-id={track.id} data-muted={mutedIds.has(track.id)} data-selected={selected} data-track-color={slots[index]} className="track-row track-panel-grid border-b border-[var(--track-rule)]">
              <div
                data-track-row-header
                className="track-row-header cursor-pointer bg-[var(--track-header)] pl-3 pr-2"
                onClick={(event) => handleTrackHeaderClick(track, event)}
              >
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
                <TrackLaneCanvas
                  ref={handle => registerLaneHandle(track.id, handle)}
                  trackName={track.name}
                  lane={lane}
                  sounds={displayScene?.sounds ?? []}
                  slot={slots[index]}
                  quiet={quiet}
                  bandBegin={sceneBand.begin}
                  bandEnd={sceneBand.end}
                  viewportBegin={renderFrame.begin}
                  viewportEnd={renderFrame.end}
                  drawBegin={drawWindow.begin}
                  drawEnd={drawWindow.end}
                  devicePixelRatio={devicePixelRatio}
                  rasterBudgetBytes={rasterBudgetPerLane}
                  onRasterFailure={notifyRasterFailure}
                  minorTicks={sceneTicks.minor}
                  majorTicks={sceneTicks.major}
                  coverageEnd={displayScene?.coverageEnd}
                  pendingRanges={displayScene?.pendingRanges}
                  representationLabel={representationLabelFor(lane)}
                  notesLabel={t('trackNotes')}
                  rawEventCount={lane?.rawEventCount ?? 0}
                />
              </div>
            </div>
          );
        })}
        <div data-playhead className="track-playhead-overlay track-panel-grid pointer-events-none absolute inset-0">
          <div />
          <div className="relative mr-2 min-w-0">
            {liveMode ? <div ref={el => { liveDomRef.current.playhead = el; }} data-playhead-line data-live-playhead className="track-playhead-position"><span className="track-playhead-line" /></div>
              : playheadVisible && <div data-playhead-line className="track-playhead-line" style={{ left: `${position(renderFrame.now)}%` }} />}
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
