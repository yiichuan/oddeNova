import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRACK_VIEW_SPAN,
  MAX_ZOOM_SPAN,
  MIN_ZOOM_SPAN,
  ZOOM_SLIDER_STEPS,
  ZOOM_SPANS,
  anchoredWindowBegin,
  browseStepCycles,
  canStepZoom,
  centeredWindowBegin,
  clampCycle,
  clampZoomSpan,
  cycleFromClientX,
  cycleTickLabel,
  effectiveZoomSpan,
  endTickLabel,
  followWindowAt,
  nextEffectiveZoomSpan,
  pannedBegin,
  ratioFromClientX,
  rulerTicks,
  stepZoomSpan,
  viewportForBegin,
  wheelDeltaToCycles,
  windowContains,
  zoomSliderToSpan,
  zoomSpanToSlider,
} from '../track-timeline';

const rect = { left: 100, width: 400 };

describe('pointer coordinate conversion', () => {
  it('clamps a pointer anywhere on the timeline to the visible bounds', () => {
    expect(ratioFromClientX(100, rect)).toBe(0);
    expect(ratioFromClientX(300, rect)).toBe(0.5);
    expect(ratioFromClientX(500, rect)).toBe(1);
    // Off the ruler clamps to the nearest edge, not a value outside it.
    expect(ratioFromClientX(40, rect)).toBe(0);
    expect(ratioFromClientX(900, rect)).toBe(1);
  });

  it('rejects unusable rectangles and non-finite input', () => {
    expect(ratioFromClientX(120, { left: 0, width: 0 })).toBeNull();
    expect(ratioFromClientX(Number.NaN, rect)).toBeNull();
    expect(ratioFromClientX(120, { left: Number.NaN, width: 100 })).toBeNull();
    expect(ratioFromClientX(120, { left: 0, width: Number.NaN })).toBeNull();
  });

  it('maps a pointer onto the frozen drag window', () => {
    expect(cycleFromClientX(100, rect, 8, DEFAULT_TRACK_VIEW_SPAN)).toBe(8);
    expect(cycleFromClientX(300, rect, 8, DEFAULT_TRACK_VIEW_SPAN)).toBe(10);
    expect(cycleFromClientX(500, rect, 8, DEFAULT_TRACK_VIEW_SPAN)).toBe(12);
  });

  it('never produces a negative cycle', () => {
    expect(cycleFromClientX(0, rect, -2, DEFAULT_TRACK_VIEW_SPAN)).toBe(0);
  });

  it('rejects a degenerate span', () => {
    expect(cycleFromClientX(100, rect, 0, 0)).toBeNull();
    expect(cycleFromClientX(100, rect, Number.NaN, DEFAULT_TRACK_VIEW_SPAN)).toBeNull();
  });
});

describe('follow window', () => {
  const span = DEFAULT_TRACK_VIEW_SPAN;
  const cases: Array<[number, number, number]> = [
    // [now, expected begin, expected playhead percent] — the contract table
    [0, 0, 0],
    [0.5, 0, 12.5],
    [1, 0, 25],
    [1.999, 0, 49.975],
    [2, 0, 50],
    [2.001, 0.001, 50],
    [3, 1, 50],
    [10, 8, 50],
  ];
  it.each(cases)('now=%f pins the playhead per the contract table', (now, begin, percent) => {
    const window = followWindowAt(now, span);
    expect(window.begin).toBeCloseTo(begin, 10);
    expect(window.playheadRatio * 100).toBeCloseTo(percent, 10);
  });

  it('keeps position continuous across the centre takeover', () => {
    // No 85% threshold jump: the window slides cycle by cycle from now on.
    const epsilon = 1e-6;
    const before = followWindowAt(2 - epsilon, span);
    const at = followWindowAt(2, span);
    const after = followWindowAt(2 + epsilon, span);
    // The begin moves by exactly one epsilon per epsilon of playhead — never
    // a full-screen displacement.
    expect(after.begin - at.begin).toBeCloseTo(epsilon, 9);
    expect(at.begin - before.begin).toBeCloseTo(0, 9);
    // Centred playhead stays exactly at 50% while the background scrolls.
    expect(after.playheadRatio).toBeCloseTo(0.5, 9);
  });

  it('uses the same formula when resuming from any position', () => {
    // No negative cycles and no half-screen blank just to centre early starts.
    expect(followWindowAt(0, span)).toEqual({ begin: 0, playheadRatio: 0 });
    expect(followWindowAt(-3, span).begin).toBe(0);
    expect(followWindowAt(-3, span).playheadRatio).toBe(0);
    const resumed = followWindowAt(6.5, span);
    expect(resumed.begin).toBeCloseTo(4.5);
    expect(resumed.playheadRatio).toBeCloseTo(0.5);
  });

  it('never emits a begin below 0 nor a playhead outside the window', () => {
    for (let now = -2; now <= 20; now += 0.125) {
      const window = followWindowAt(now, span);
      expect(window.begin).toBeGreaterThanOrEqual(0);
      expect(window.playheadRatio).toBeGreaterThanOrEqual(0);
      expect(window.playheadRatio).toBeLessThanOrEqual(1);
    }
  });

  it('clamps non-finite cycles to the origin window', () => {
    expect(followWindowAt(Number.NaN, span)).toEqual({ begin: 0, playheadRatio: 0 });
    expect(followWindowAt(Number.POSITIVE_INFINITY, span)).toEqual({ begin: 0, playheadRatio: 0 });
  });
});

describe('zoom ladder', () => {
  it('keeps the documented default and six shortcut levels from half a cycle to sixteen', () => {
    expect(DEFAULT_TRACK_VIEW_SPAN).toBe(4);
    expect(ZOOM_SPANS).toEqual([0.5, 1, 2, 4, 8, 16]);
    expect(MIN_ZOOM_SPAN).toBe(0.5);
    expect(MAX_ZOOM_SPAN).toBe(16);
  });

  it('clamps any span into the continuous bounds and rescues unusable values', () => {
    for (const span of ZOOM_SPANS) expect(clampZoomSpan(span)).toBe(span);
    // Intermediate values stay continuous — no snapping to the ladder.
    expect(clampZoomSpan(3.7)).toBe(3.7);
    expect(clampZoomSpan(0.75)).toBe(0.75);
    expect(clampZoomSpan(2.6)).toBe(2.6);
    expect(clampZoomSpan(0.2)).toBe(0.5);
    expect(clampZoomSpan(20)).toBe(16);
    expect(clampZoomSpan(Number.NaN)).toBe(DEFAULT_TRACK_VIEW_SPAN);
    // Non-finite input keeps the existing fallback to the default.
    expect(clampZoomSpan(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TRACK_VIEW_SPAN);
    expect(clampZoomSpan(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_TRACK_VIEW_SPAN);
  });

  it('walks the ladder from the nearest shortcut level and stops at both ends', () => {
    expect(stepZoomSpan(DEFAULT_TRACK_VIEW_SPAN, 1)).toBe(2);
    expect(stepZoomSpan(DEFAULT_TRACK_VIEW_SPAN, -1)).toBe(8);
    expect(stepZoomSpan(0.5, 1)).toBe(0.5);
    expect(stepZoomSpan(0.5, -1)).toBe(1);
    expect(stepZoomSpan(16, -1)).toBe(16);
    expect(stepZoomSpan(16, 1)).toBe(8);
    // An off-ladder span steps from its neighbouring levels, not after a snap.
    expect(stepZoomSpan(3, 1)).toBe(2);
    expect(stepZoomSpan(3, -1)).toBe(4);
    expect(stepZoomSpan(3.7, 1)).toBe(2);
    expect(stepZoomSpan(3.7, -1)).toBe(4);
  });

  it('moves half of the current span per browse button press', () => {
    expect(browseStepCycles(DEFAULT_TRACK_VIEW_SPAN)).toBe(2);
    expect(browseStepCycles(0.5)).toBe(0.25);
    expect(browseStepCycles(16)).toBe(8);
    expect(browseStepCycles(3.7)).toBeCloseTo(1.85);
  });
});

describe('effective zoom stepping', () => {
  it('finds the neighbouring shortcut spans of the effective span', () => {
    // The plan's contract table for L ≥ 16.
    expect(nextEffectiveZoomSpan(3.2, 16, 1)).toBe(2);
    expect(nextEffectiveZoomSpan(3.2, 16, -1)).toBe(4);
    expect(nextEffectiveZoomSpan(2, 16, 1)).toBe(1);
    expect(nextEffectiveZoomSpan(2, 16, -1)).toBe(4);
    // L=3 with P=4: the effective span is 3, magnify reaches 2, zoom-out
    // has no wider usable span and stays put.
    expect(nextEffectiveZoomSpan(4, 3, 1)).toBe(2);
    expect(nextEffectiveZoomSpan(4, 3, -1)).toBe(3);
    // A continuous 2.6 steps onto 2 / 3 — the 4 candidate clips back to L=3.
    expect(nextEffectiveZoomSpan(2.6, 3, 1)).toBe(2);
    expect(nextEffectiveZoomSpan(2.6, 3, -1)).toBe(3);
    // L=3 with an exact 2: the wider neighbour is 4 → clipped to 3.
    expect(nextEffectiveZoomSpan(2, 3, -1)).toBe(3);
    // A degenerate piece offers nothing in either direction.
    expect(nextEffectiveZoomSpan(4, 0.25, 1)).toBe(0.25);
    expect(nextEffectiveZoomSpan(4, 0.25, -1)).toBe(0.25);
  });

  it('treats float-noise spans as their exact neighbours', () => {
    // 1.9999999999999998 must read as 2, not leave a micro-step "to 2".
    expect(nextEffectiveZoomSpan(1.9999999999999998, 16, 1)).toBe(1);
    expect(nextEffectiveZoomSpan(1.9999999999999998, 16, -1)).toBe(4);
    expect(canStepZoom(1.9999999999999998, 16, 1)).toBe(true);
  });

  it('judges zoom steps by whether they change the visible width', () => {
    // L=3, full at span 3: magnifying still helps, zooming out cannot.
    expect(canStepZoom(4, 3, 1)).toBe(true);
    expect(canStepZoom(4, 3, -1)).toBe(false);
    // The default ladder ends still hold without a piece.
    expect(canStepZoom(8, null, -1)).toBe(true);
    expect(canStepZoom(16, null, -1)).toBe(false);
    expect(canStepZoom(16, null, 1)).toBe(true);
    expect(canStepZoom(0.5, null, 1)).toBe(false);
    expect(canStepZoom(0.5, null, -1)).toBe(true);
    // L shorter than the finest step: both directions are dead.
    expect(canStepZoom(0.5, 0.25, 1)).toBe(false);
    expect(canStepZoom(0.5, 0.25, -1)).toBe(false);
    // A continuous span keeps both directions alive mid-range.
    expect(canStepZoom(3.7, 16, 1)).toBe(true);
    expect(canStepZoom(3.7, 16, -1)).toBe(true);
    // Buttons lit by canStepZoom always have a real step to take.
    for (const L of [3, 5, 16, 20]) {
      for (let span = 0.5; span <= 16; span += 0.3) {
        for (const direction of [-1, 1] as const) {
          if (!canStepZoom(span, L, direction)) continue;
          expect(nextEffectiveZoomSpan(span, L, direction))
            .not.toBeCloseTo(effectiveZoomSpan(span, L), 10);
        }
      }
    }
  });
});

describe('continuous zoom slider mapping', () => {
  it('maps the six shortcut spans onto evenly spaced slider stops when L ≥ 16', () => {
    // 16, 8, 4, 2, 1, 0.5 → 0%, 20%, 40%, 60%, 80%, 100%.
    expect(zoomSpanToSlider(16, 16)).toBe(0);
    expect(zoomSpanToSlider(8, 16)).toBe(200);
    expect(zoomSpanToSlider(4, 16)).toBe(400);
    expect(zoomSpanToSlider(2, 16)).toBe(600);
    expect(zoomSpanToSlider(1, 16)).toBe(800);
    expect(zoomSpanToSlider(0.5, 16)).toBe(1000);
    // Continuous values land between the stops.
    expect(zoomSpanToSlider(3.7, 16)).toBeGreaterThan(400);
    expect(zoomSpanToSlider(3.7, 16)).toBeLessThan(600);
  });

  it('round-trips a span through the slider with bounded error', () => {
    for (let span = 0.5; span <= 16; span *= 1.1) {
      const slider = zoomSpanToSlider(span, 16);
      const back = zoomSliderToSpan(slider, 16);
      expect(back).toBeGreaterThan(span * 0.98);
      expect(back).toBeLessThan(span * 1.02);
 expect(zoomSpanToSlider(back, 16)).toBe(slider);
    }
  });

  it('returns the exact ends without a rounding error', () => {
    expect(zoomSliderToSpan(0, 16)).toBe(16);
    expect(zoomSliderToSpan(1000, 16)).toBe(0.5);
    expect(zoomSliderToSpan(0, null)).toBe(16);
    expect(zoomSliderToSpan(1000, null)).toBe(0.5);
    expect(zoomSpanToSlider(MAX_ZOOM_SPAN, null)).toBe(0);
    expect(zoomSpanToSlider(MIN_ZOOM_SPAN, null)).toBe(1000);
  });

  it('keeps the mapping monotonic and inside the bounds', () => {
    let previous = Infinity;
    for (let value = 0; value <= ZOOM_SLIDER_STEPS; value += 10) {
      const span = zoomSliderToSpan(value, 16);
      expect(span).toBeLessThanOrEqual(16 + 1e-9);
      expect(span).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(span).toBeLessThan(previous);
      previous = span;
    }
  });

  it('maps from the piece\u2019s own length when L < 16, leaving no dead zone', () => {
    // L=3: the left end is 3, not 16 — the whole track is usable.
    expect(zoomSpanToSlider(3, 3)).toBe(0);
    expect(zoomSpanToSlider(0.5, 3)).toBe(1000);
    expect(zoomSliderToSpan(0, 3)).toBe(3);
    expect(zoomSliderToSpan(1000, 3)).toBe(0.5);
    // P=4 (hidden preference) maps from the effective span 3.
    expect(zoomSpanToSlider(4, 3)).toBe(0);
    // A mid-track stop inverts onto a span between 0.5 and 3.
    const mid = zoomSliderToSpan(500, 3);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(3);
  });

  it('has no travel for a degenerate piece and never divides by zero', () => {
    // L ≤ 0.5: the slider pins to the finest end; the label still shows L.
    expect(zoomSpanToSlider(4, 0.25)).toBe(1000);
    expect(zoomSliderToSpan(0, 0.25)).toBe(0.25);
    expect(zoomSliderToSpan(500, 0.25)).toBe(0.25);
    expect(zoomSliderToSpan(1000, 0.5)).toBe(0.5);
    // Without a loop length the full ladder is the range.
    expect(zoomSpanToSlider(4, null)).toBe(400);
    // Unusable input falls back to the default span's position.
    expect(zoomSliderToSpan(Number.NaN, 16)).toBe(DEFAULT_TRACK_VIEW_SPAN);
  });

  it('rejects NaN spans in the mapping input the way the bounds do', () => {
    // zoomSpanToSlider over an unusable preference clamps, never propagates.
    expect(Number.isFinite(zoomSpanToSlider(Number.NaN, 16))).toBe(true);
    expect(zoomSpanToSlider(Number.NaN, 16)).toBe(zoomSpanToSlider(4, 16));
  });
});

describe('zoom anchors', () => {
  it('holds the anchored cycle at its ratio across the plan example', () => {
    // [8,12) with the pointer at 25% anchors cycle 9; zooming to span 2 keeps
    // cycle 9 at 25% of [8.5, 10.5).
    expect(anchoredWindowBegin(8, 4, 0.25, 2)).toBe(8.5);
  });

  it('centres a button zoom on the window middle', () => {
    expect(anchoredWindowBegin(8, 4, 0.5, 8)).toBe(6);
    expect(anchoredWindowBegin(8, 4, 0.5, 2)).toBe(9);
  });

  it('clamps at the work origin instead of showing negative time', () => {
    // Near the origin the anchor may drift left; no blank window is kept.
    expect(anchoredWindowBegin(0, 4, 0.25, 8)).toBe(0);
    expect(anchoredWindowBegin(1, 4, 0.5, 16)).toBe(0);
  });

  it('keeps the anchor stable for every ratio and span combination', () => {
    for (let ratio = 0; ratio <= 1; ratio += 0.05) {
      const begin = anchoredWindowBegin(8, 4, ratio, 2);
      expect(begin).toBeGreaterThanOrEqual(0);
      expect(begin).toBeLessThanOrEqual(12);
      // When the window is not clamped, the anchored cycle is preserved.
      if (begin > 0) expect(begin + ratio * 2).toBeCloseTo(8 + ratio * 4, 10);
    }
  });

  it('rescues unusable anchors without moving the window', () => {
    expect(anchoredWindowBegin(Number.NaN, 4, 0.5, 2)).toBe(0);
    expect(anchoredWindowBegin(8, Number.NaN, 0.5, 2)).toBe(8);
    expect(anchoredWindowBegin(8, 0, 0.5, 2)).toBe(8);
    expect(anchoredWindowBegin(8, 4, Number.NaN, 2)).toBe(8);
    expect(anchoredWindowBegin(8, 4, 0.5, Number.NaN)).toBe(8);
  });
});

describe('window arithmetic', () => {
  it('centres a window on a cycle and clamps at the work origin', () => {
    expect(centeredWindowBegin(10, DEFAULT_TRACK_VIEW_SPAN)).toBe(8);
    expect(centeredWindowBegin(0, DEFAULT_TRACK_VIEW_SPAN)).toBe(0);
    expect(centeredWindowBegin(1, DEFAULT_TRACK_VIEW_SPAN)).toBe(0);
    expect(centeredWindowBegin(Number.NaN, DEFAULT_TRACK_VIEW_SPAN)).toBe(0);
  });

  it('pans with a delta and clamps left at 0', () => {
    expect(pannedBegin(8, -2)).toBe(6);
    expect(pannedBegin(2, -6)).toBe(0);
    expect(pannedBegin(2, 10)).toBe(12);
    expect(pannedBegin(Number.NaN, 2)).toBe(0);
    expect(pannedBegin(2, Number.NaN)).toBe(2);
  });

  it('reports containment inside [begin, begin + span)', () => {
    expect(windowContains(4, 2, DEFAULT_TRACK_VIEW_SPAN)).toBe(true);
    expect(windowContains(6, 2, DEFAULT_TRACK_VIEW_SPAN)).toBe(false);
    expect(windowContains(1.99, 2, DEFAULT_TRACK_VIEW_SPAN)).toBe(false);
    expect(windowContains(Number.NaN, 0, DEFAULT_TRACK_VIEW_SPAN)).toBe(false);
  });

  it('builds a viewport ready to hand to the preview query', () => {
    expect(viewportForBegin(0)).toEqual({ begin: 0, end: DEFAULT_TRACK_VIEW_SPAN });
    expect(viewportForBegin(-5)).toEqual({ begin: 0, end: DEFAULT_TRACK_VIEW_SPAN });
    expect(viewportForBegin(Number.NaN)).toEqual({ begin: 0, end: DEFAULT_TRACK_VIEW_SPAN });
    expect(viewportForBegin(6, 2)).toEqual({ begin: 6, end: 8 });
  });
});

describe('wheel deltas', () => {
  it('maps pixel deltas across the visible width', () => {
    expect(wheelDeltaToCycles(200, 0, 400, DEFAULT_TRACK_VIEW_SPAN)).toBeCloseTo(2);
    expect(wheelDeltaToCycles(-200, 0, 400, DEFAULT_TRACK_VIEW_SPAN)).toBeCloseTo(-2);
  });

  it('converts line and page modes through a pixel equivalent', () => {
    expect(wheelDeltaToCycles(1, 1, 400, DEFAULT_TRACK_VIEW_SPAN)).toBeCloseTo(16 / 400 * DEFAULT_TRACK_VIEW_SPAN);
    expect(wheelDeltaToCycles(1, 2, 400, DEFAULT_TRACK_VIEW_SPAN)).toBeCloseTo(DEFAULT_TRACK_VIEW_SPAN);
  });

  it('refuses unusable input', () => {
    expect(wheelDeltaToCycles(Number.NaN, 0, 400, DEFAULT_TRACK_VIEW_SPAN)).toBe(0);
    expect(wheelDeltaToCycles(10, 0, 0, DEFAULT_TRACK_VIEW_SPAN)).toBe(0);
  });
});

describe('ruler ticks', () => {
  it('picks the smallest step that keeps labels about 72px apart', () => {
    // 800px over 4 cycles = 200px per cycle: half-cycle labels fit at 100px.
    const wide = rulerTicks(0, 4, 800);
    expect(wide.majorStep).toBe(0.5);
    expect(wide.major).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    // 300px over 4 cycles: only whole-cycle labels clear the bar.
    const narrow = rulerTicks(0, 4, 300);
    expect(narrow.majorStep).toBe(1);
    expect(narrow.major).toEqual([0, 1, 2, 3]);
  });

  it('reduces labels at the widest span and keeps fraction labels when zoomed in', () => {
    // 800px over 16 cycles = 50px per cycle: two-cycle labels at 100px.
    const zoomedOut = rulerTicks(0, 16, 800);
    expect(zoomedOut.majorStep).toBe(2);
    expect(zoomedOut.major).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    // 1200px over 0.5 cycles: the smallest step still clears 72px.
    const zoomedIn = rulerTicks(4, 4.5, 1200);
    expect(zoomedIn.majorStep).toBe(1 / 16);
    expect(zoomedIn.major).toEqual([4, 4.0625, 4.125, 4.1875, 4.25, 4.3125, 4.375, 4.4375]);
  });

  it('anchors ticks at absolute multiples so a slide never shifts them', () => {
    const first = rulerTicks(0.3, 4.3, 800);
    expect(first.major[0]).toBe(0.5);
    const slid = rulerTicks(1.3, 5.3, 800);
    expect(slid.major[0]).toBe(1.5);
    expect(slid.major).toEqual(first.major.map(c => c + 1));
  });

  it('subdivides majors with minors that clear about 16px and never overlap a label', () => {
    const ticks = rulerTicks(0, 4, 800);
    expect(ticks.minorStep).toBe(0.125);
    expect(ticks.minor.every(c => c % 0.5 !== 0)).toBe(true);
    expect(ticks.minor.length).toBe((4 / 0.125) - (4 / 0.5));
    // Whole-cycle majors on a 300px pane subdivide into quarter-cycles.
    const sparse = rulerTicks(0, 4, 300);
    expect(sparse.majorStep).toBe(1);
    expect(sparse.minorStep).toBe(0.25);
    expect(sparse.minor).toEqual([
      0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.25, 2.5, 2.75, 3.25, 3.5, 3.75,
    ]);
    // Sixteenth majors never subdivide below a sixteenth again.
    const densest = rulerTicks(4, 4.5, 1200);
    expect(densest.minorStep).toBe(0);
    expect(densest.minor).toEqual([]);
    // A drawn minor that would collide with a major is not kept: the level
    // rules re-derive which minors survive next to the current majors.
    const colliding = rulerTicks(0, 4, 800, { majorStep: 0.5, minorStep: 0.5 });
    expect(colliding.majorStep).toBe(0.5);
    expect(colliding.minor.every(c => c % 0.5 !== 0)).toBe(true);
  });

  it('keeps the drawn level inside a small hysteresis band near the threshold', () => {
    // A window at 520px/4 cycles sits just under the 72px bar for half-cycle
    // majors (65px); keeping the drawn level avoids flapping at the threshold.
    expect(rulerTicks(0, 4, 520, { majorStep: 0.5, minorStep: 0.125 }).majorStep).toBe(0.5);
    // Without a drawn level the same width picks the next coarser step.
    expect(rulerTicks(0, 4, 520).majorStep).toBe(1);
    // Once the finer neighbour clears the full bar again it is adopted.
    expect(rulerTicks(0, 4, 800, { majorStep: 1, minorStep: 0.25 }).majorStep).toBe(0.5);
    // Below the band the coarser neighbour wins after all.
    expect(rulerTicks(0, 4, 400, { majorStep: 0.5, minorStep: 0.125 }).majorStep).toBe(1);
  });

  it('rides the hysteresis across continuous zoom spans, not just exact repeats', () => {
    // 700px over 4.3 cycles ≈ 163px per cycle: the finer candidate (0.25)
    // misses the 72px bar, the drawn 0.5 level clears the keep bar — and the
    // span is *not* the one the level was chosen for. A span-equality gate
    // would have dropped the hysteresis exactly while dragging.
    const dragged = rulerTicks(0, 4.3, 700, { majorStep: 0.5, minorStep: 0.125 });
    expect(dragged.majorStep).toBe(0.5);
    // …and crossing far past the band still switches promptly: at 400px the
    // drawn level sits below the keep bar and the coarser level wins.
    expect(rulerTicks(0, 4.3, 400, { majorStep: 0.5, minorStep: 0.125 }).majorStep).toBe(1);
  });

  it('keeps the minor level inside its own 14–16px hysteresis band', () => {
    // At 240px/4 cycles (60px per cycle) a quarter-cycle minor spans 15px:
    // under the 16px entry bar, so a fresh choice picks the half-cycle minor
    // — but the drawn quarter-cycle minor survives at 15px.
    const fresh = rulerTicks(0, 4, 240);
    expect(fresh.majorStep).toBe(2);
    expect(fresh.minorStep).toBe(0.5);
    const kept = rulerTicks(0, 4, 240, { majorStep: 2, minorStep: 0.25 });
    expect(kept.minorStep).toBe(0.25);
    // Below 14px the drawn minor is dropped after all.
    expect(rulerTicks(0, 4, 200, { majorStep: 2, minorStep: 0.25 }).minorStep).toBe(0.5);
    // 16px and above still enters without history.
    expect(rulerTicks(0, 4, 520).minorStep).toBe(0.25);
  });

  it('re-validates a kept minor when the major level changes', () => {
    // The major coarsened 1 → 2 (60px per cycle) and the drawn quarter-cycle
    // minor still divides it, stays above the minimum and clears 14px: kept.
    const kept = rulerTicks(0, 4, 240, { majorStep: 1, minorStep: 0.25 });
    expect(kept.majorStep).toBe(2);
    expect(kept.minorStep).toBe(0.25);
    // A minor finer than the minimum never survives, even with history.
    expect(rulerTicks(0, 4, 640, { majorStep: 1, minorStep: 1 / 64 }).minorStep).toBe(0.125);
  });

  it('refuses unusable windows', () => {
    expect(rulerTicks(0, 0, 800)).toEqual({ major: [], minor: [], majorStep: 0, minorStep: 0 });
    expect(rulerTicks(0, 4, 0)).toEqual({ major: [], minor: [], majorStep: 0, minorStep: 0 });
    expect(rulerTicks(Number.NaN, 4, 800).major).toEqual([]);
    // A stale history for an invalid window is simply ignored, not kept.
    expect(rulerTicks(0, 0, 800, { majorStep: 0.5, minorStep: 0.125 })).toEqual({ major: [], minor: [], majorStep: 0, minorStep: 0 });
  });

  it('reaches the finest usable level exactly at its own boundary and keeps the coarsest', () => {
    // A sixteenth label needs 72px of spacing, i.e. 1152px per cycle: over a
    // half-cycle window the bar lands at 576px, and one pixel narrower the
    // next coarser level steps in.
    expect(rulerTicks(4, 4.5, 576).majorStep).toBe(1 / 16);
    expect(rulerTicks(4, 4.5, 575).majorStep).toBe(1 / 8);
    // The coarsest level has no wider neighbour to hysteresis against.
    expect(rulerTicks(0, 16, 72).majorStep).toBe(16);
  });
});

describe('tick labels', () => {
  it('labels ticks in true cycle coordinates starting at 0', () => {
    expect(cycleTickLabel(0)).toBe('0');
    expect(cycleTickLabel(3)).toBe('3');
    expect(cycleTickLabel(0.5)).toBe('0.5');
    expect(cycleTickLabel(1.25)).toBe('1.25');
    expect(cycleTickLabel(0.0625)).toBe('0.0625');
    expect(cycleTickLabel(2.1875)).toBe('2.1875');
    expect(cycleTickLabel(Number.NaN)).toBe('0');
  });

  it('draws the end label only at the piece\u2019s real boundary with room to spare', () => {
    // The visible right edge is the piece's end: the boundary is labelled.
    expect(endTickLabel(16, 16, 4)).toBe('16');
    // A mid-piece window must not imply an endpoint it does not have.
    expect(endTickLabel(8, 16, 4)).toBeNull();
    // No usable range: no boundary to label.
    expect(endTickLabel(0, null, 4)).toBeNull();
    expect(endTickLabel(Number.NaN, 16, 4)).toBeNull();
    // Too close to the last regular label to fit without crowding: a tail
    // inside half a step of the boundary is skipped.
    expect(endTickLabel(2.2, 2.2, 2)).toBeNull();
    // Half a step of clearance still fits.
    expect(endTickLabel(3, 3, 4)).toBe('3');
  });
});

describe('finite timeline', () => {
  const L = 16;

  it('clamps every cycle into [0, L] when a loop length is given', () => {
    expect(clampCycle(18.5, L)).toBe(16);
    expect(clampCycle(-1, L)).toBe(0);
    expect(clampCycle(Number.NaN, L)).toBe(0);
    expect(clampCycle(5, L)).toBe(5);
    // Without a loop length only the left edge applies.
    expect(clampCycle(18.5)).toBe(18.5);
    expect(clampCycle(18.5, 0)).toBe(18.5);
  });

  it('follows the playhead with a window pinned inside the piece', () => {
    const span = 4;
    expect(followWindowAt(0, span, L).begin).toBe(0);
    expect(followWindowAt(8, span, L)).toEqual({ begin: 6, playheadRatio: 0.5 });
    // Near the end the window pins against the boundary; the playhead walks
    // to the right edge instead of the window following past L.
    expect(followWindowAt(15, span, L)).toEqual({ begin: 12, playheadRatio: 0.75 });
    expect(followWindowAt(16, span, L)).toEqual({ begin: 12, playheadRatio: 1 });
  });

  it('pans and centres inside the piece without showing past its end', () => {
    // A pan target clamps to the boundary; windows then cap at L.
    expect(pannedBegin(12, 4, L)).toBe(16);
    expect(pannedBegin(13, 4, L)).toBe(16);
    expect(centeredWindowBegin(15, 4, L)).toBe(12);
    expect(centeredWindowBegin(16, 4, L)).toBe(12);
  });

  it('builds viewports that never exceed the piece', () => {
    expect(viewportForBegin(14, 4, L)).toEqual({ begin: 12, end: 16 });
    expect(viewportForBegin(0, 4, L)).toEqual({ begin: 0, end: 4 });
  });
});

describe('effective zoom span', () => {
  it('caps the ladder span at the piece\u2019s length', () => {
    expect(effectiveZoomSpan(4, 16)).toBe(4);
    expect(effectiveZoomSpan(8, 3)).toBe(3);
    expect(effectiveZoomSpan(4, 0.25)).toBe(0.25);
    expect(effectiveZoomSpan(4, null)).toBe(4);
    expect(effectiveZoomSpan(Number.NaN, 16)).toBe(DEFAULT_TRACK_VIEW_SPAN);
    // Continuous values pass through unclipped by any ladder.
    expect(effectiveZoomSpan(3.7, 16)).toBe(3.7);
    expect(effectiveZoomSpan(2.6, 3)).toBe(2.6);
  });

  it('walks the browse step from the effective span', () => {
    expect(browseStepCycles(8, 3)).toBe(1.5);
    expect(browseStepCycles(4, 16)).toBe(2);
  });
});

describe('clampCycle', () => {
  it('keeps finite non-negative cycles and clamps the rest to 0', () => {
    expect(clampCycle(18.5)).toBe(18.5);
    expect(clampCycle(-1)).toBe(0);
    expect(clampCycle(Number.NaN)).toBe(0);
    expect(clampCycle(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
