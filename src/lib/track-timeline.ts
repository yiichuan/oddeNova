import type { TrackFrameRequest, TrackViewport } from '../services/track-preview';

/**
 * Pure math for the track timeline: pointer coordinates, the browsing window,
 * the zoom controls, and the follow-the-playhead rules. The service owns the
 * transport position; this module only turns a viewport and a cycle into
 * positions on screen, so gestures can be unit-tested without a DOM or a
 * running scheduler.
 */

/** The default (and reset) visible window width in cycles. */
export const DEFAULT_TRACK_VIEW_SPAN = 4;
/** The narrowest ordinary zoom span. A shorter piece still fills the view. */
export const MIN_ZOOM_SPAN = 0.5;
/** Pure-math fallback when there is no usable piece. The UI disables zoom
 *  without a finite timeline; this only keeps invalid inputs deterministic. */
export const FALLBACK_MAX_ZOOM_SPAN = 16;
/** The slider's normalised range: 0..ZOOM_SLIDER_STEPS (step 1), so dragging
 *  offers ZOOM_SLIDER_STEPS + 1 positions without pretending the underlying
 *  span is quantised to them. */
export const ZOOM_SLIDER_STEPS = 1000;
/** Tolerance for float comparisons against the zoom bounds. */
const ZOOM_EPSILON = 1e-9;

/** A valid loop length: finite and positive. Anything else means "no timeline". */
export function validLoopCycles(loopCycles: number | null | undefined): loopCycles is number {
  return typeof loopCycles === 'number' && Number.isFinite(loopCycles) && loopCycles > 0;
}

/** The widest preferred span for the current piece. A sub-minimum piece keeps
 *  the preference floor at 0.5 while its effective span remains its own L. */
export function maxZoomSpan(loopCycles: number | null | undefined): number {
  return validLoopCycles(loopCycles)
    ? Math.max(MIN_ZOOM_SPAN, loopCycles)
    : FALLBACK_MAX_ZOOM_SPAN;
}

/**
 * The span a zoom request actually shows: never wider than the piece itself.
 * The zoom preference stays within the continuous bounds; a piece shorter
 * than the preferred span is simply drawn edge to edge instead of padded
 * with blank time.
 */
export function effectiveZoomSpan(preferredSpan: number, loopCycles: number | null | undefined): number {
  const clamped = clampZoomSpan(preferredSpan, loopCycles);
  if (!validLoopCycles(loopCycles)) return clamped;
  return Math.min(clamped, loopCycles);
}

/**
 * One multiplicative zoom step from the current *effective* span: magnifying
 * halves it and zooming out doubles it. The last step clips exactly to the
 * piece, so every finite song has a reachable whole-song overview even when
 * its length is not a power of two.
 */
export function nextEffectiveZoomSpan(
  preferredSpan: number,
  loopCycles: number | null | undefined,
  direction: -1 | 1,
): number {
  const current = effectiveZoomSpan(preferredSpan, loopCycles);
  const lower = validLoopCycles(loopCycles) ? Math.min(MIN_ZOOM_SPAN, loopCycles) : MIN_ZOOM_SPAN;
  const upper = validLoopCycles(loopCycles) ? loopCycles : FALLBACK_MAX_ZOOM_SPAN;
  if (direction === 1) return Math.max(lower, current / 2);
  return Math.min(upper, current * 2);
}

/**
 * Whether zooming one multiplicative step in `direction` can still change what is on
 * screen. Shares the candidate search with the actual stepping, so a lit
 * button always has a real step to take.
 */
export function canStepZoom(preferredSpan: number, loopCycles: number | null | undefined, direction: -1 | 1): boolean {
  const current = effectiveZoomSpan(preferredSpan, loopCycles);
  const next = nextEffectiveZoomSpan(preferredSpan, loopCycles, direction);
  return Math.abs(next - current) > ZOOM_EPSILON;
}

/** Half the current preferred span — the step the browse-earlier/later buttons move by. */
export function browseStepCycles(span: number, loopCycles?: number | null): number {
  return effectiveZoomSpan(span, loopCycles ?? Number.NaN) / 2;
}

/**
 * Keeps a preferred span inside the current piece's dynamic zoom bounds;
 * unusable values fall back to the default, itself clipped to the bound. No
 * snapping: 0.75, 2.6 or 3.7 stay as asked.
 */
export function clampZoomSpan(span: number, loopCycles?: number | null): number {
  const upper = maxZoomSpan(loopCycles);
  if (!Number.isFinite(span)) return Math.min(DEFAULT_TRACK_VIEW_SPAN, upper);
  return Math.min(upper, Math.max(MIN_ZOOM_SPAN, span));
}

// ── Continuous zoom slider mapping ──────────────────────────────────────────

/**
 * The normalised slider value for a span, 0..ZOOM_SLIDER_STEPS on a log
 * scale between the bounds. The usable range is the *effective* one — a
 * piece shorter than the fallback maximum starts the track at its own
 * length instead of leaving a dead zone. Degenerate ranges (L ≤ Smin) have
 * no travel: every position reads as the finest end. Rounds to the input
 * scale for display only — never feed this back as a span.
 */
export function zoomSpanToSlider(
  preferredSpan: number,
  loopCycles: number | null | undefined,
): number {
  const sMax = validLoopCycles(loopCycles) ? loopCycles : FALLBACK_MAX_ZOOM_SPAN;
  if (sMax <= MIN_ZOOM_SPAN + ZOOM_EPSILON) return ZOOM_SLIDER_STEPS;
  const span = Math.min(clampZoomSpan(preferredSpan, loopCycles), sMax);
  const t = Math.log(sMax / span) / Math.log(sMax / MIN_ZOOM_SPAN);
  return Math.round(Math.min(1, Math.max(0, t)) * ZOOM_SLIDER_STEPS);
}

/**
 * The span a slider position stands for: the exact inverse of
 * `zoomSpanToSlider`, with both ends returned precisely. Ordinary positions
 * keep full float precision — no snapping to fixed levels.
 */
export function zoomSliderToSpan(
  sliderValue: number,
  loopCycles: number | null | undefined,
): number {
  if (!Number.isFinite(sliderValue)) return DEFAULT_TRACK_VIEW_SPAN;
  const sMax = validLoopCycles(loopCycles) ? loopCycles : FALLBACK_MAX_ZOOM_SPAN;
  if (sMax <= MIN_ZOOM_SPAN + ZOOM_EPSILON) return Math.min(sMax, MIN_ZOOM_SPAN);
  const t = Math.min(1, Math.max(0, sliderValue / ZOOM_SLIDER_STEPS));
  const span = sMax * Math.pow(MIN_ZOOM_SPAN / sMax, t);
  if (t <= 0) return sMax;
  if (t >= 1) return MIN_ZOOM_SPAN;
  return span;
}

/**
 * The begin of the next window after a zoom that keeps the cycle at
 * `anchorRatio` across the old window under the same relative position,
 * clamped so it never starts below 0 (the anchor may drift left at the
 * origin — no blank time is ever introduced to hold it).
 */
export function anchoredWindowBegin(
  oldBegin: number,
  oldSpan: number,
  anchorRatio: number,
  nextSpan: number,
): number {
  if (!Number.isFinite(oldBegin) || !Number.isFinite(oldSpan) || oldSpan <= 0
    || !Number.isFinite(nextSpan) || nextSpan <= 0 || !Number.isFinite(anchorRatio)) {
    return Math.max(0, oldBegin || 0);
  }
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const anchorCycle = oldBegin + ratio * oldSpan;
  return Math.max(0, anchorCycle - ratio * nextSpan);
}

/**
 * Non-finite or negative cycles clamp to 0. With a valid loop length L the
 * timeline ends there: anything past L — or any unusable value — lands on the
 * boundary the piece actually has, never beyond it.
 */
export function clampCycle(cycle: number, loopCycles?: number | null): number {
  if (!Number.isFinite(cycle)) return 0;
  if (!validLoopCycles(loopCycles)) return Math.max(0, cycle);
  return Math.min(Math.max(0, cycle), loopCycles);
}

/** The ratio of `clientX` across `rect`, clamped to 0..1, or null when unusable. */
export function ratioFromClientX(clientX: number, rect: { left: number; width: number }): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

/**
 * The cycle a pointer lands on inside the *frozen* drag window. The window is
 * frozen at pointerdown so a seek that moves the playhead (and could move the
 * window) never changes what the same mouse position means mid-drag. The
 * result clamps to [0, L] when a loop length is given.
 */
export function cycleFromClientX(
  clientX: number,
  rect: { left: number; width: number },
  viewBegin: number,
  viewSpan: number,
  loopCycles?: number | null,
): number | null {
  const ratio = ratioFromClientX(clientX, rect);
  if (ratio === null || !Number.isFinite(viewBegin) || !Number.isFinite(viewSpan) || viewSpan <= 0) return null;
  return clampCycle(viewBegin + ratio * viewSpan, loopCycles);
}

/**
 * The begin for a window centred on `cycle`, clamped inside [0, L] when a
 * loop length is given — a centred window never hangs past the piece's end.
 */
export function centeredWindowBegin(cycle: number, span: number, loopCycles?: number | null): number {
  const clamped = clampCycle(cycle, loopCycles);
  let begin = clamped - span / 2;
  if (validLoopCycles(loopCycles)) begin = Math.min(begin, Math.max(0, loopCycles - span));
  return Math.max(0, begin);
}

/** A clock read kept separate from all preview and React work. */
export interface TrackClockSample {
  absoluteCycle: number;
  cps: number;
}

/** The finite-domain projection used by the playhead, viewport and queries. */
export interface TrackViewportFrame {
  displayNow: number;
  loopOffset: number;
  begin: number;
  end: number;
  span: number;
}

/** The cached scene's display-domain extent. */
export interface TrackSceneBand {
  begin: number;
  end: number;
}

/** CSS-friendly geometry for a scene translated through the live viewport. */
export interface TrackSceneTransform {
  widthPercent: number;
  offsetPercent: number;
}

/**
 * Project an absolute transport cycle into the finite display domain. A cycle
 * exactly on L remains a visible endpoint; a later pass wraps to its own
 * display coordinates while retaining its absolute loop offset for queries.
 */
export function projectTrackClock(absoluteCycle: number, loopCycles: number): Pick<TrackViewportFrame, 'displayNow' | 'loopOffset'> {
  if (!validLoopCycles(loopCycles)) return { displayNow: 0, loopOffset: 0 };
  const absolute = Number.isFinite(absoluteCycle) ? Math.max(0, absoluteCycle) : 0;
  if (absolute === loopCycles) return { displayNow: loopCycles, loopOffset: 0 };
  return {
    displayNow: absolute % loopCycles,
    loopOffset: Math.floor(absolute / loopCycles) * loopCycles,
  };
}

function validTrackViewport(viewport: TrackViewport | undefined, loopCycles: number): TrackViewport | null {
  if (!viewport || !Number.isFinite(viewport.begin) || !Number.isFinite(viewport.end)
    || viewport.end <= viewport.begin || viewport.begin < 0 || viewport.end > loopCycles) return null;
  return viewport;
}

/**
 * Resolve the exact viewport that a clock sample belongs to. Keeping this in
 * the timeline module makes RAF projection, query scheduling and tests share
 * one finite-cycle rule instead of each reimplementing follow/manual math.
 */
export function resolveTrackViewportFrame(
  absoluteCycle: number,
  request: TrackFrameRequest,
): TrackViewportFrame {
  const loopCycles = request.loopCycles;
  if (!validLoopCycles(loopCycles)) return { displayNow: 0, loopOffset: 0, begin: 0, end: 0, span: 0 };
  const clock = projectTrackClock(absoluteCycle, loopCycles);
  const viewport = request.viewport;
  let resolved: TrackViewport;
  if ('mode' in viewport && viewport.mode === 'follow') {
    const span = Number.isFinite(viewport.span) && viewport.span > 0 ? viewport.span : 4;
    const begin = centeredWindowBegin(clock.displayNow, span, loopCycles);
    resolved = { begin, end: Math.min(begin + span, loopCycles) };
  } else {
    const fixedRequest = viewport as { begin: number; end: number };
    const fixed = validTrackViewport(fixedRequest, loopCycles);
    if (fixed) resolved = fixed;
    else {
      const end = Math.min(Math.max(0, fixedRequest.end || 0), loopCycles);
      resolved = { begin: Math.min(Math.max(0, fixedRequest.begin || 0), end), end };
    }
  }
  return {
    ...clock,
    ...resolved,
    span: Math.max(0, resolved.end - resolved.begin),
  };
}

/**
 * Add one visible-span of prefetch on both sides. The result is at most three
 * screen widths and is always clipped to the finite piece.
 */
export function sceneBandForViewport(frame: Pick<TrackViewportFrame, 'begin' | 'end'>, loopCycles: number): TrackSceneBand {
  if (!validLoopCycles(loopCycles)) return { begin: 0, end: 0 };
  const span = frame.end - frame.begin;
  if (!Number.isFinite(span) || span <= 0 || span >= loopCycles) return { begin: 0, end: loopCycles };
  return {
    begin: Math.max(0, frame.begin - span),
    end: Math.min(loopCycles, frame.end + span),
  };
}

/** Whether a cached band has enough margin for the current viewport. Sides
 *  that sit on the piece's own boundary need no margin: a scene clipped at
 *  the work's beginning or end is complete there, and demanding margin would
 *  re-query forever. */
export function sceneBandContainsViewport(
  band: TrackSceneBand,
  frame: Pick<TrackViewportFrame, 'begin' | 'end'>,
  safetyRatio = 0.25,
  loopCycles?: number | null,
): boolean {
  const span = frame.end - frame.begin;
  if (!Number.isFinite(span) || span <= 0 || band.end <= band.begin) return false;
  const margin = span * Math.max(0, safetyRatio);
  const beginEdge = band.begin <= 0;
  const endEdge = validLoopCycles(loopCycles) && band.end >= loopCycles - 1e-9;
  const leftMargin = frame.begin - band.begin;
  const rightMargin = band.end - frame.end;
  return (beginEdge || leftMargin >= margin) && (endEdge || rightMargin >= margin);
}

/**
 * The cycle range the lane canvases commit to bitmaps: one visible span to
 * each side of the viewport, never beyond the data that actually exists.
 */
export function drawWindowForViewport(
  frame: Pick<TrackViewportFrame, 'begin' | 'end'>,
  band: TrackSceneBand,
): TrackSceneBand {
  const span = frame.end - frame.begin;
  if (!Number.isFinite(span) || span <= 0) return { begin: band.begin, end: band.end };
  return {
    begin: Math.max(band.begin, frame.begin - span),
    end: Math.min(band.end, frame.end + span),
  };
}

/**
 * Convert the band into one compositor scene. The scene width and translation
 * are shared by the ruler, grid and every lane so continuous follow motion
 * cannot introduce coordinate drift between them.
 */
export function sceneTransformFor(
  band: TrackSceneBand,
  frame: Pick<TrackViewportFrame, 'begin' | 'end'>,
): TrackSceneTransform {
  const bandSpan = band.end - band.begin;
  const visibleSpan = frame.end - frame.begin;
  if (!Number.isFinite(bandSpan) || bandSpan <= 0 || !Number.isFinite(visibleSpan) || visibleSpan <= 0) {
    return { widthPercent: 100, offsetPercent: 0 };
  }
  return {
    widthPercent: bandSpan / visibleSpan * 100,
    offsetPercent: -(frame.begin - band.begin) / bandSpan * 100,
  };
}

/**
 * The one continuous follow coordinate: the window begin for the displayed
 * playhead plus where it sits inside it (0–1). Before the playhead reaches
 * the centre (or past the work origin) the window stays pinned at 0; after
 * that it keeps sliding so the playhead stays centred — until the piece's
 * end, where the window pins against the finite boundary and the playhead
 * walks to the right edge. Position is always continuous within a pass;
 * crossing into the next pass folds back to the origin window by design.
 */
export function followWindowAt(
  now: number,
  span: number,
  loopCycles?: number | null,
): { begin: number; playheadRatio: number } {
  const clamped = clampCycle(now, loopCycles);
  const begin = centeredWindowBegin(clamped, span, loopCycles);
  return { begin, playheadRatio: (clamped - begin) / span };
}

/**
 * A panned window begin: manual, clamped inside [0, L] when a loop length is
 * given so no browse input can push the window past the piece.
 */
export function pannedBegin(begin: number, deltaCycles: number, loopCycles?: number | null): number {
  if (!Number.isFinite(begin)) return 0;
  const next = Number.isFinite(deltaCycles) ? begin + deltaCycles : begin;
  return clampCycle(next, loopCycles ?? null);
}

/** Whether a cycle is visible inside `[begin, begin + span)`. */
export function windowContains(cycle: number, begin: number, span: number): boolean {
  if (!Number.isFinite(cycle) || !Number.isFinite(begin) || !Number.isFinite(span) || span <= 0) return false;
  return cycle >= begin && cycle < begin + span;
}

/**
 * A wheel delta in the browser's `deltaMode` units, converted to cycles using
 * the currently visible width: pixels map 1:1 onto the pane, lines take the
 * usual ~16px, pages take the whole visible width.
 */
export function wheelDeltaToCycles(delta: number, deltaMode: number, visibleWidth: number, span: number): number {
  if (!Number.isFinite(delta) || !Number.isFinite(visibleWidth) || visibleWidth <= 0 || span <= 0) return 0;
  const pixels = deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * visibleWidth : delta;
  return (pixels / visibleWidth) * span;
}

/**
 * Viewport for the preview query — always finite, forward and inside [0, L]
 * when a loop length is given, ready to pass on. Near the piece's end the
 * begin pulls back so the window keeps its full span instead of shrinking.
 */
export function viewportForBegin(
  begin: number,
  span: number = DEFAULT_TRACK_VIEW_SPAN,
  loopCycles?: number | null,
): TrackViewport {
  if (validLoopCycles(loopCycles)) {
    const usableSpan = Math.min(span, loopCycles);
    const maxBegin = loopCycles - usableSpan;
    const start = Math.min(Math.max(0, begin), maxBegin);
    return { begin: start, end: start + usableSpan };
  }
  const clamped = Number.isFinite(begin) ? Math.max(0, begin) : 0;
  return { begin: clamped, end: clamped + span };
}

// ── Adaptive ruler ticks ─────────────────────────────────────────────────────

/** Major tick candidates, from a sixteenth up to the widest ladder span. */
const MAJOR_STEPS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16];
/** Minimum pixel distance between major tick labels. */
const MAJOR_MIN_PX = 72;
/** Minimum pixel distance between minor tick marks. */
const MINOR_MIN_PX = 16;
/** The kept minor level survives a bit under the entry bar: entering a finer
 *  minor level needs 16px, keeping the drawn one down to 14px. */
const MINOR_KEEP_PX = 14;
/** Minor ticks never subdivide below a sixteenth of a cycle. */
const MINOR_MIN_STEP = 1 / 16;
/** All ladder steps are dyadic, so tick positions stay float-exact. */
const EPSILON = 1e-9;

export interface RulerTicks {
  /** Aligned absolute cycles carrying labels. */
  major: number[];
  /** Fainter in-between marks, never overlapping a major position. */
  minor: number[];
  majorStep: number;
  minorStep: number;
}

/** The tick levels the last committed frame drew — display history only,
 *  never written back into the viewport. */
export interface RulerTickHistory {
  majorStep: number;
  minorStep: number;
}

/** The density rules' hysteresis bands: a finer level enters at the full bar
 *  and an already drawn one holds a bit under it, against flapping right at
 *  the threshold — for majors and minors alike. */
const LEVEL_ENTER_PX = { major: MAJOR_MIN_PX, minor: MINOR_MIN_PX };
const LEVEL_KEEP_PX = { major: MAJOR_MIN_PX * 0.875, minor: MINOR_KEEP_PX };

/**
 * Fixed-level ticks for one window. The level depends only on the span and
 * the measured content width — never on the playhead — and positions anchor
 * at absolute multiples of the step, so a continuous slide does not make the
 * scale drift. `history` carries the levels already on screen from the last
 * committed frame, regardless of which span it showed: continuous zoom moves
 * through spans that almost never repeat, so the hysteresis must ride the
 * drawn level itself, not a span match. A drawn level is kept while no finer
 * candidate clears the full entry bar, and dropped as soon as it falls below
 * the keep bar — crossing a large range still switches promptly.
 */
export function rulerTicks(
  begin: number,
  end: number,
  widthPx: number,
  history?: RulerTickHistory,
): RulerTicks {
  const span = end - begin;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(widthPx) || widthPx <= 0) {
    return { major: [], minor: [], majorStep: 0, minorStep: 0 };
  }
  const pxPerCycle = widthPx / span;
  let majorStep = MAJOR_STEPS[MAJOR_STEPS.length - 1];
  for (const step of MAJOR_STEPS) {
    if (step * pxPerCycle >= LEVEL_ENTER_PX.major) { majorStep = step; break; }
  }
  const historyMajor = history?.majorStep ?? 0;
  const historyIndex = MAJOR_STEPS.indexOf(historyMajor);
  if (historyIndex > 0) {
    const finer = MAJOR_STEPS[historyIndex - 1];
    if (finer * pxPerCycle < LEVEL_ENTER_PX.major && historyMajor * pxPerCycle >= LEVEL_KEEP_PX.major) {
      majorStep = historyMajor;
    }
  }
  // Minor hysteresis rides the same rules one level under the majors: the
  // drawn minor stays while it clears the keep bar and no finer candidate
  // clears the entry bar; a kept minor is always re-validated below.
  let minorStep = 0;
  for (const divisor of [4, 2]) {
    const step = majorStep / divisor;
    if (step < MINOR_MIN_STEP - EPSILON) continue;
    if (step * pxPerCycle < LEVEL_ENTER_PX.minor) continue;
    minorStep = step;
    break;
  }
  const drawnMinor = history?.minorStep ?? 0;
  if (drawnMinor > 0 && drawnMinor !== minorStep && drawnMinor < majorStep - EPSILON) {
    // The drawn minor may survive even where the plain rule would pick a
    // different (usually finer) one — but only if it stays legal: above the
    // minimum step, inside the keep bar, and not colliding with a major.
    const kept = drawnMinor * pxPerCycle >= LEVEL_KEEP_PX.minor
      && drawnMinor >= MINOR_MIN_STEP - EPSILON
      && majorStep % drawnMinor < EPSILON;
    const finerExists = minorStep > 0 && minorStep < drawnMinor - EPSILON;
    if (kept && !finerExists) minorStep = drawnMinor;
  }
  const major: number[] = [];
  const minor: number[] = [];
  const perMajor = minorStep > 0 ? Math.round(majorStep / minorStep) : 0;
  for (let index = Math.max(0, Math.ceil(begin / majorStep - EPSILON)); index * majorStep < end; index++) {
    major.push(index * majorStep);
  }
  if (minorStep > 0 && Number.isInteger(perMajor) && perMajor > 0) {
    for (let index = Math.max(0, Math.ceil(begin / minorStep - EPSILON)); index * minorStep < end; index++) {
      if (index % perMajor === 0) continue;
      minor.push(index * minorStep);
    }
  }
  return { major, minor, majorStep, minorStep };
}

/**
 * A tick label in true cycle coordinates starting at 0 — the same domain the
 * events, the playhead and the seek tooltip speak — with no floating-point
 * noise. The old convention added 1 and let a [0, L] ruler read "L+1",
 * implying a limit past the piece's own end.
 */
export function cycleTickLabel(cycle: number): string {
  if (!Number.isFinite(cycle)) return '0';
  if (Number.isInteger(cycle)) return String(cycle);
  return cycle.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * The boundary label for the ruler's right edge: shown only when the visible
 * window's end is the piece's real end, so an endpoint is never implied for
 * an ordinary mid-piece window. Dyadic steps keep the collision check exact.
 */
export function endTickLabel(
  windowEnd: number,
  loopCycles: number | null | undefined,
  majorStep: number,
): string | null {
  if (!validLoopCycles(loopCycles)) return null;
  if (!Number.isFinite(windowEnd) || Math.abs(windowEnd - loopCycles) > EPSILON) return null;
  // A boundary tick is not a full step: skip it when it would crowd the last
  // regular label — its spacing must still clear the same pixel bar the
  // majors keep (callers pass the step the majors actually drew).
  const lastMajor = Math.floor((loopCycles - EPSILON) / majorStep) * majorStep;
  if (loopCycles - lastMajor < majorStep * 0.5) return null;
  return cycleTickLabel(loopCycles);
}
