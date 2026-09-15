import type { TrackViewport } from '../services/track-preview';

/**
 * Pure math for the track timeline: pointer coordinates, the browsing window,
 * the zoom ladder, and the follow-the-playhead rules. The service owns the
 * transport position; this module only turns a viewport and a cycle into
 * positions on screen, so gestures can be unit-tested without a DOM or a
 * running scheduler.
 */

/** The default (and reset) visible window width in cycles. */
export const DEFAULT_TRACK_VIEW_SPAN = 4;
/** The zoom ladder in cycles: half a cycle up to sixteen, doubling each step.
 *  A shortcut table only — the slider and any continuous input keep every
 *  value between the bounds. */
export const ZOOM_SPANS = [0.5, 1, 2, 4, 8, 16];
/** The continuous zoom bounds: the narrowest and widest spans allowed. */
export const MIN_ZOOM_SPAN = ZOOM_SPANS[0];
export const MAX_ZOOM_SPAN = ZOOM_SPANS[ZOOM_SPANS.length - 1];
/** The slider's normalised range: 0..ZOOM_SLIDER_STEPS (step 1), so dragging
 *  offers ZOOM_SLIDER_STEPS + 1 positions without pretending the underlying
 *  span is quantised to them. */
export const ZOOM_SLIDER_STEPS = 1000;
/** Tolerance for float comparisons against the bounds and the ladder. */
const ZOOM_EPSILON = 1e-9;

/** A valid loop length: finite and positive. Anything else means "no timeline". */
export function validLoopCycles(loopCycles: number | null | undefined): loopCycles is number {
  return typeof loopCycles === 'number' && Number.isFinite(loopCycles) && loopCycles > 0;
}

/**
 * The span a zoom request actually shows: never wider than the piece itself.
 * The zoom preference stays within the continuous bounds; a piece shorter
 * than the preferred span is simply drawn edge to edge instead of padded
 * with blank time.
 */
export function effectiveZoomSpan(preferredSpan: number, loopCycles: number | null | undefined): number {
  const clamped = clampZoomSpan(preferredSpan);
  if (!validLoopCycles(loopCycles)) return clamped;
  return Math.min(clamped, loopCycles);
}

/**
 * The nearest ladder span strictly finer (`direction = +1`, magnify) or
 * strictly wider (`direction = -1`, zoom out) than the current *effective*
 * span, then clipped by the piece: a candidate the piece is too short to
 * show folds down to the widest usable span. Ties are decided with a small
 * tolerance so a float-noise span like 0.9999999999 still reads as 1.
 * Returns the current span when no distinct step exists — the ladder ends,
 * or the piece already fills the window.
 */
export function nextEffectiveZoomSpan(
  preferredSpan: number,
  loopCycles: number | null | undefined,
  direction: -1 | 1,
): number {
  const current = effectiveZoomSpan(preferredSpan, loopCycles);
  let best: number | null = null;
  for (const span of ZOOM_SPANS) {
    const finer = direction === 1 ? span < current - ZOOM_EPSILON : span > current + ZOOM_EPSILON;
    if (!finer) continue;
    if (best === null
      || (direction === 1 ? span > best : span < best)) best = span;
  }
  if (best === null) return current;
  return effectiveZoomSpan(best, loopCycles);
}

/**
 * Whether zooming one ladder step in `direction` can still change what is on
 * screen. Shares the candidate search with the actual stepping, so a lit
 * button always has a real step to take.
 */
export function canStepZoom(preferredSpan: number, loopCycles: number | null | undefined, direction: -1 | 1): boolean {
  if (!validLoopCycles(loopCycles)) {
    const current = clampZoomSpan(preferredSpan);
    return direction === 1 ? current > MIN_ZOOM_SPAN + ZOOM_EPSILON : current < MAX_ZOOM_SPAN - ZOOM_EPSILON;
  }
  const current = effectiveZoomSpan(preferredSpan, loopCycles);
  if (current < MIN_ZOOM_SPAN + ZOOM_EPSILON && direction === 1) return false;
  if (current > Math.min(MAX_ZOOM_SPAN, loopCycles) - ZOOM_EPSILON && direction === -1) return false;
  return nextEffectiveZoomSpan(preferredSpan, loopCycles, direction) !== current;
}

/** One zoom step: `+1` magnifies (span halves), `-1` zooms out (span doubles).
 *  Judged from the *effective* span, so an off-ladder preference like 3.7
 *  still walks to the neighbouring shortcut steps instead of snapping first. */
export function stepZoomSpan(span: number, direction: -1 | 1): number {
  const current = clampZoomSpan(span);
  let best: number | null = null;
  for (const candidate of ZOOM_SPANS) {
    const finer = direction === 1 ? candidate < current - ZOOM_EPSILON : candidate > current + ZOOM_EPSILON;
    if (!finer) continue;
    if (best === null
      || (direction === 1 ? candidate > best : candidate < best)) best = candidate;
  }
  return best ?? current;
}

/** Half the current preferred span — the step the browse-earlier/later buttons move by. */
export function browseStepCycles(span: number, loopCycles?: number | null): number {
  return effectiveZoomSpan(span, loopCycles ?? Number.NaN) / 2;
}

/**
 * Keeps a span inside the continuous zoom bounds [0.5, 16]; unusable values
 * fall back to the default. No snapping: 0.75, 2.6 or 3.7 stay as asked.
 */
export function clampZoomSpan(span: number): number {
  if (!Number.isFinite(span)) return DEFAULT_TRACK_VIEW_SPAN;
  return Math.min(MAX_ZOOM_SPAN, Math.max(MIN_ZOOM_SPAN, span));
}

// ── Continuous zoom slider mapping ──────────────────────────────────────────

/**
 * The normalised slider value for a span, 0..ZOOM_SLIDER_STEPS on a log
 * scale between the bounds. The usable range is the *effective* one — a
 * piece shorter than the ladder's widest step starts the track at its own
 * length instead of leaving a dead zone. Degenerate ranges (L ≤ Smin) have
 * no travel: every position reads as the finest end. Rounds to the input
 * scale for display only — never feed this back as a span.
 */
export function zoomSpanToSlider(
  preferredSpan: number,
  loopCycles: number | null | undefined,
): number {
  const sMax = validLoopCycles(loopCycles) ? Math.min(MAX_ZOOM_SPAN, loopCycles) : MAX_ZOOM_SPAN;
  if (sMax <= MIN_ZOOM_SPAN + ZOOM_EPSILON) return ZOOM_SLIDER_STEPS;
  const span = Math.min(clampZoomSpan(preferredSpan), sMax);
  const t = Math.log(sMax / span) / Math.log(sMax / MIN_ZOOM_SPAN);
  return Math.round(Math.min(1, Math.max(0, t)) * ZOOM_SLIDER_STEPS);
}

/**
 * The span a slider position stands for: the exact inverse of
 * `zoomSpanToSlider`, with both ends returned precisely. Ordinary positions
 * keep full float precision — no snapping to the ladder.
 */
export function zoomSliderToSpan(
  sliderValue: number,
  loopCycles: number | null | undefined,
): number {
  if (!Number.isFinite(sliderValue)) return DEFAULT_TRACK_VIEW_SPAN;
  const sMax = validLoopCycles(loopCycles) ? Math.min(MAX_ZOOM_SPAN, loopCycles) : MAX_ZOOM_SPAN;
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
