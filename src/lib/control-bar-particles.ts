/**
 * Characters — or motes, when the particle galaxy is the chosen visual —
 * falling through the control bar like snow.
 *
 * One mark is one flake. Four things carry the illusion:
 *
 *   fall      a slow, steady descent that wraps — the dominant motion, so the
 *             eye reads gravity rather than a scrolling marquee
 *   wind      a gust shared by every flake at once, leaning the whole field one
 *             way and then easing back; being *shared* is what makes it weather
 *             rather than each character wiggling to its own tune
 *   flutter   a small private wobble on top of the gust, so no two flakes ride
 *             it identically
 *   breath    each flake drifts in and out of focus on its own period, which
 *             is what stops a static depth ladder from looking like layered
 *             text and starts it looking like something moving through a
 *             volume with a shallow focal plane
 *
 * Wind and flutter together still have to leave a flake in roughly the column
 * it fell into: snow blows sideways, but it does not slide across the frame.
 *
 * Positions are closed-form functions of time rather than integrated state:
 * the layer can be stopped, resized, or resumed without flakes jumping or
 * accumulating drift, and every property below is directly testable.
 */

/**
 * The region flakes occupy, in coordinates local to the control bar's border
 * box. Matches `.code-panel-light-field`'s `inset: -18px -3%` in index.css —
 * the light's own reach — so the snow shares the volume the glow lives in and
 * falls in and out past the bar's clipped edges.
 */
const FIELD_INSET_X_RATIO = 0.03;
const FIELD_INSET_Y = 18;

export interface ParticleField {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function resolveParticleField(barWidth: number, barHeight: number): ParticleField {
  return {
    left: -barWidth * FIELD_INSET_X_RATIO,
    top: -FIELD_INSET_Y,
    width: barWidth * (1 + FIELD_INSET_X_RATIO * 2),
    height: barHeight + FIELD_INSET_Y * 2,
  };
}

export const PARTICLE_COUNT = 48;

/**
 * The visualizer's full ASCII ramp minus its two blank sentinels — all 24
 * assignable glyphs, light to heavy, so the collapsed bar draws on the same
 * alphabet as the pane it stands in for.
 */
export const PARTICLE_GLYPHS = [
  '·', '.', 'ι', '*', '+', '/', 'τ', 'γ', 'ν', 'λ',
  '=', 'σ', 'π', 'μ', '∇', 'Δ', 'Ξ',
  '%', 'Σ', 'Φ', 'Ψ', 'Π', 'Θ', 'Ω',
] as const;

// ── Playing ──────────────────────────────────────────────────────────────────
//
// While the piece is playing, some of the flakes burn orange. The set is
// redrawn once per beat, so the colour moves through the snow in time with the
// music without anything else about the snow changing — the flakes keep
// falling, breathing and blowing exactly as they would in silence.
//
// *How many* burn is the music's own doing: the louder the piece sounds, the
// more of the field catches. A sparse passage keeps a scattering lit, a dense
// one sets most of it going, and the swell between the two is the loudest
// thing the collapsed bar can say about what is playing.

/** #D9542B — the accent the rest of the app plays back in. */
export const PARTICLE_ACCENT_COLOR = '217, 84, 43';
/** #0668E5 — the same role in the light palette. */
export const PARTICLE_ACCENT_COLOR_LIGHT = '6, 104, 229';

/**
 * The two colours the field is painted in: the snow, and the accent burning
 * through it. Both are canvas fills rather than CSS, so unlike the rest of the
 * app they cannot read a custom property and have to be resolved here.
 *
 * A playing piece's own `.color()` outranks the theme for as long as it lasts;
 * without one — silence, a stop, or a piece that never set a hued colour — the
 * accent falls back to whichever palette is painted.
 */
export function resolveParticleColors(
  theme: 'dark' | 'light',
  accentColor?: string | null,
): { particle: string; accent: string } {
  const light = theme === 'light';
  return {
    particle: light ? PARTICLE_COLOR_LIGHT : PARTICLE_COLOR,
    accent: accentColor ?? `rgb(${light ? PARTICLE_ACCENT_COLOR_LIGHT : PARTICLE_ACCENT_COLOR})`,
  };
}
/**
 * Share of the field lit at the quietest the music gets, and at the most
 * intense. The floor is deliberately well above nothing — silence is the
 * absence of colour, so a quiet passage still has to look like music playing
 * rather than like playback having stopped. The ceiling stops short of the
 * whole field for the opposite reason: a fully orange bar has nowhere left to
 * go, and the snow stops reading as snow with colour moving through it.
 */
export const ACCENT_SHARE_MIN = 0.18;
export const ACCENT_SHARE_MAX = 0.78;
/**
 * How much of a beat the handover takes, as a fraction of one. Long enough that
 * the colour arrives rather than snapping, short enough to still land on the
 * beat rather than smearing across it.
 */
const ACCENT_FADE_BEATS = 0.32;

export const PARTICLE_FONT_SIZE = 8.5;
export const PARTICLE_FONT = `600 ${PARTICLE_FONT_SIZE}px "SFMono-Regular", "Cascadia Mono", "Noto Sans Mono", monospace`;
/** Warm off-white, matching the bar's own light. */
export const PARTICLE_COLOR = '248, 248, 244';
/**
 * On paper the snow is the shade the bar casts rather than the light it gives
 * off — the field blends `multiply` there, so the flakes have to be darker
 * than the page for the same drift to read at all.
 */
export const PARTICLE_COLOR_LIGHT = '77, 77, 83';

/**
 * Blur radii in px, sharp to soft. Quantised so the renderer can pre-blur one
 * sprite per (glyph, level) pair instead of running a canvas filter on every
 * glyph, every frame. The breathing sweeps a flake across these, so the ladder
 * has to be fine enough that the transition reads as focus pulling rather than
 * as stepping.
 */
export const PARTICLE_BLUR_LEVELS = [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.45] as const;
const BLUR_STEP = PARTICLE_BLUR_LEVELS[1];
const MAX_BLUR = PARTICLE_BLUR_LEVELS[PARTICLE_BLUR_LEVELS.length - 1];

/**
 * Alpha multiplier per blur level. A blurred glyph spreads the same ink over a
 * much larger area, so its peak brightness collapses; without this a flake
 * would visibly dim every time it breathed out of focus, which reads as
 * flickering rather than as defocusing.
 */
const BLUR_ALPHA_COMPENSATION = 0.55;
export const PARTICLE_BLUR_ALPHA_GAIN = PARTICLE_BLUR_LEVELS.map(
  (blur) => 1 + blur * BLUR_ALPHA_COMPENSATION,
);

// ── Shape ────────────────────────────────────────────────────────────────────
//
// The bar draws with whatever mark the visualizer pane below it is drawing
// with. The ASCII galaxy is made of characters, so the collapsed bar snows
// characters; the particle galaxy is made of round motes, so it snows dots and
// the two keep saying the same thing about what is hidden.
//
// Only the mark changes. Every flake keeps its depth, its fall, its breath and
// its place in the field, so the two are the same snow drawn twice rather than
// two effects.

export type ParticleShape = 'glyph' | 'dot';

/**
 * Mote radius in px at the light and heavy ends of the ramp. A flake takes the
 * radius of the glyph slot it was dealt — a speck where the ASCII field would
 * put '·', a full mote where it would put 'Ω' — so the same weight ladder
 * carries the depth in both shapes.
 *
 * The light end is held well clear of a single pixel: at this size the depth
 * blur spreads a mote over several times its own area, and anything smaller
 * disappears into the bar's own glow rather than reading as a distant speck.
 */
const DOT_RADIUS = [1.1, 2.7] as const;

export function particleDotRadius(glyphIndex: number): number {
  return lerp(DOT_RADIUS[0], DOT_RADIUS[1], glyphIndex / (PARTICLE_GLYPHS.length - 1));
}

/**
 * The sharpest each shape is allowed to get, in px.
 *
 * A character may come right into focus — crisp edges are most of what makes
 * it legible as a character at 8.5px. A mote may not: a hard-edged circle this
 * small stops being a speck of light in a volume and becomes a UI dot, a
 * bullet or a status light. The floor is what keeps it luminous.
 */
export const PARTICLE_MIN_BLUR: Record<ParticleShape, number> = {
  glyph: 0,
  dot: 0.7,
};

/**
 * A flake's blur once its shape's floor is in force.
 *
 * Lifted and compressed rather than clipped. The near end of the focus ladder
 * rests at 0.35px and the breath swings further than that, so clipping at a
 * 0.7px floor would pin the near flakes to it for most of their cycle — the
 * closest, largest motes would be the ones that stopped breathing, which is
 * exactly backwards. Squeezing the whole ladder into the room above the floor
 * costs a little of the swing and keeps all of the motion.
 */
export function shapedBlur(blur: number, shape: ParticleShape): number {
  const floor = PARTICLE_MIN_BLUR[shape];
  if (floor <= 0) return blur;
  return floor + clamp(blur, 0, MAX_BLUR) * (1 - floor / MAX_BLUR);
}

/** Alpha at the near and far planes, before the blur gain. */
const ALPHA_NEAR = 0.78;
const ALPHA_FAR = 0.3;
/** Fraction of a flake's alpha that its slow shimmer swings through. */
const SHIMMER_DEPTH = 0.18;

/** Seconds a flake takes to fall the height of the field, near to far. */
const FALL_SECONDS_NEAR = 13;
const FALL_SECONDS_FAR = 46;

/**
 * Sideways wobble, far to near, in px — each flake's own flutter, unrelated to
 * its neighbours'. Kept modest because the wind below supplies most of the
 * lateral motion, and the two together still have to leave the flake in the
 * column it fell into rather than sliding it across the bar. The vertical
 * counterpart is smaller still — just enough that the descent is not a
 * perfectly even crawl.
 */
const FLUTTER_AMPLITUDE = [3, 10] as const;
const FLUTTER_PERIOD_SECONDS = [4.5, 11] as const;
const FALL_WOBBLE_AMPLITUDE = 1.8;
const FALL_WOBBLE_PERIOD_SECONDS = [3.5, 9] as const;

/**
 * How far the wind carries a flake at full gust, far to near. Near flakes are
 * pushed further, which is the same parallax that sets their fall speed.
 */
const WIND_AMPLITUDE = [9, 26] as const;

// ── Appearing and leaving ────────────────────────────────────────────────────
//
// The flakes belong to the visualizer pane below the bar, and they commute.
// Collapsing that pane does not switch them on — it sends them *up* into the
// bar, which has just dropped to the bottom of the window to meet them.
// Expanding it sends them back down to where the pane reopens. The whole
// transition reads as one population moving between two places, which is why
// the direction matters: get it backwards and the bar looks like it is leaking
// characters rather than receiving them.
//
//   appearing  flakes vault up from below the bar's bottom edge, overshoot
//              once, and settle
//   leaving    flakes sink back down out of the bottom edge, accelerating away
//              toward the reopening pane and fading as they go

export const PARTICLE_ENTER_MS = 760;
export const PARTICLE_LEAVE_MS = 440;

/**
 * How far a flake travels on its way in or out, far to near, in px. Several
 * times the 48px bar at the near end: a heavy flake starts far below the bottom
 * edge and sweeps all the way in, which is what makes the movement read as a
 * journey from the pane below rather than a nudge inside the bar.
 */
const INERTIA_LAG = [50, 140] as const;
/**
 * Spring damping, near to far. Set high enough that the rebound past the
 * resting place stays a few percent of the travel — the rise is the gesture,
 * and a bounce that competes with it reads as wobble rather than arrival. Far
 * specks effectively do not rebound at all.
 */
const SPRING_DAMPING = [4, 6.5] as const;
/**
 * Sets when the rise crosses its resting place, and so how much of the
 * transition is spent travelling. Low enough that the sweep occupies most of
 * the entrance instead of finishing early and creeping the rest of the way.
 */
const SPRING_FREQUENCY = 4.2;
/**
 * Departures are free fall rather than a spring, so they cover the same ground
 * on a different curve — the distance is the constant, the shape is what tells
 * arriving and leaving apart.
 */
const LEAVE_LAG_SCALE = 1;
/** Extra blur, px, at the fastest point of a transition — motion blur. */
const TRANSITION_MOTION_BLUR = 2;

/** How far a flake's focus swings either side of its resting blur. */
const BREATH_SWING = [0.45, 1.15] as const;
const BREATH_PERIOD_SECONDS = [4, 13] as const;
const SHIMMER_PERIOD_SECONDS = [5, 14] as const;

/**
 * How far a flake's depth may stray from the one its glyph implies. Every
 * glyph is dealt out in turn so all 24 stay on screen, and heavy glyphs sit
 * nearest — a big flake close to the eye. The jitter keeps that from reading
 * as a sorted ladder of characters.
 */
const DEPTH_JITTER = 0.34;

export interface Particle {
  /** Stable identity, used to pick which flakes light up on a beat. */
  seed: number;
  /** 0 = nearest the viewer, 1 = deepest into the snow. */
  depth: number;
  glyphIndex: number;
  /** Start position as a fraction of the field, 0..1. */
  baseX: number;
  baseY: number;
  /** Field-heights per second, always downward. */
  fallSpeed: number;
  flutterAmplitude: number;
  flutterRate: number;
  flutterPhase: number;
  /** How far this flake is carried at full gust, px. */
  windAmplitude: number;
  fallWobbleRate: number;
  fallWobblePhase: number;
  /** Resting blur in px, and how far breathing carries it either side. */
  blurCenter: number;
  blurSwing: number;
  breathRate: number;
  breathPhase: number;
  shimmerRate: number;
  shimmerPhase: number;
  baseAlpha: number;
  /** How far this flake lags the bar during a transition, px. */
  inertiaLag: number;
  /** Its spring damping — how quickly that lag is worked off. */
  springDamping: number;
}

/** A layer-wide appearance or departure in progress. */
export interface ParticleTransition {
  /** true while the layer is arriving, false while it is leaving. */
  entering: boolean;
  /** 0..1 through the transition. */
  progress: number;
}

export interface ParticleFrame {
  /** Bar-local px. */
  x: number;
  y: number;
  glyphIndex: number;
  blurLevel: number;
  alpha: number;
}

/** Deterministic 0..1 hash — the same mixer the visualizer uses. */
export function hash01(value: number): number {
  let hash = value | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Seeded Fisher-Yates. Deterministic, like everything else about the field. */
function shuffledIndices(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(hash01(seed + index * 2654435761) * (index + 1)));
    const held = order[index];
    order[index] = order[swap];
    order[swap] = held;
  }
  return order;
}

const TAU = Math.PI * 2;

/**
 * Builds the field. Seeded rather than random so the snow is identical on
 * every mount — an arrangement that looked right stays that way, and
 * collapsing the visualizer twice does not deal a different hand.
 */
export function createParticles(count = PARTICLE_COUNT, seed = 0x9e37): Particle[] {
  const particles: Particle[] = [];
  const glyphCount = PARTICLE_GLYPHS.length;

  // Start positions are stratified rather than drawn at random: the field is
  // cut into `count` columns and `count` rows, and each flake gets one of each,
  // jittered inside it. Independent random coordinates clump — with this few
  // flakes on a bar this wide, that means visible bald patches next to knots of
  // three. One flake per column removes the gaps while the jitter keeps it off
  // a grid.
  //
  // Both orders are shuffled, and shuffled separately. Taking columns in
  // sequence would tie a flake's position to its index, and its index already
  // decides its glyph — the bar would read as a repeating heavy-to-light sweep
  // every 24 flakes. Sharing one order between the axes would line them all up
  // on a diagonal instead.
  const columnOrder = shuffledIndices(count, seed + 101);
  const rowOrder = shuffledIndices(count, seed + 211);

  for (let index = 0; index < count; index += 1) {
    const base = seed + index * 977;
    const random = (offset: number) => hash01(base + offset * 131);

    // Dealt round-robin so every glyph in the ramp is on screen, then depth
    // follows from weight: heavy glyphs near, specks far away.
    const glyphIndex = index % glyphCount;
    const depth = clamp(
      1 - glyphIndex / (glyphCount - 1) + (random(0) - 0.5) * DEPTH_JITTER,
      0,
      1,
    );

    // Resting blur tracks depth, but is held clear of both ends of the ladder
    // so breathing always has room to move in either direction.
    const blurCenter = lerp(BLUR_STEP, MAX_BLUR - BLUR_STEP, depth);

    particles.push({
      seed: base,
      depth,
      glyphIndex,
      baseX: (columnOrder[index] + random(1)) / count,
      baseY: (rowOrder[index] + random(2)) / count,
      fallSpeed: 1 / lerp(FALL_SECONDS_NEAR, FALL_SECONDS_FAR, depth),
      flutterAmplitude: lerp(FLUTTER_AMPLITUDE[1], FLUTTER_AMPLITUDE[0], depth)
        * (0.6 + random(3) * 0.8),
      flutterRate: TAU / lerp(FLUTTER_PERIOD_SECONDS[0], FLUTTER_PERIOD_SECONDS[1], random(4)),
      flutterPhase: random(5) * TAU,
      // No phase of its own: the gust is shared, which is the whole point of
      // it. Only how hard it bites varies from flake to flake.
      windAmplitude: lerp(WIND_AMPLITUDE[1], WIND_AMPLITUDE[0], depth)
        * (0.75 + random(13) * 0.5),
      fallWobbleRate: TAU / lerp(
        FALL_WOBBLE_PERIOD_SECONDS[0],
        FALL_WOBBLE_PERIOD_SECONDS[1],
        random(6),
      ),
      fallWobblePhase: random(7) * TAU,
      blurCenter,
      blurSwing: lerp(BREATH_SWING[0], BREATH_SWING[1], random(8)),
      breathRate: TAU / lerp(BREATH_PERIOD_SECONDS[0], BREATH_PERIOD_SECONDS[1], random(9)),
      breathPhase: random(10) * TAU,
      shimmerRate: TAU / lerp(SHIMMER_PERIOD_SECONDS[0], SHIMMER_PERIOD_SECONDS[1], random(11)),
      shimmerPhase: random(12) * TAU,
      baseAlpha: lerp(ALPHA_NEAR, ALPHA_FAR, depth),
      inertiaLag: lerp(INERTIA_LAG[1], INERTIA_LAG[0], depth) * (0.8 + random(14) * 0.4),
      springDamping: lerp(SPRING_DAMPING[0], SPRING_DAMPING[1], depth),
    });
  }

  return particles;
}

/** Wraps to 0..1 for any input, including negatives. */
function wrap01(value: number) {
  return value - Math.floor(value);
}

/**
 * Gust periods in seconds, and their share of the gust. Three coprime-ish
 * periods so the wind wanders instead of pulsing: a long swell that decides
 * which way the air is moving, a medium one that makes gusts arrive at uneven
 * intervals, and a short one that roughens the edges.
 */
const GUST_TERMS = [
  { period: 31, weight: 0.55, phase: 0 },
  { period: 17.4, weight: 0.3, phase: 1.7 },
  { period: 6.9, weight: 0.15, phase: 3.1 },
] as const;

/**
 * The wind at a moment in time, -1..1.
 *
 * Shared by every flake, which is what makes it read as weather rather than as
 * each character wiggling on its own: the whole field leans one way together,
 * eases off, and leans back. Individual flakes differ only in how far the same
 * gust carries them.
 */
export function windAt(timeSeconds: number): number {
  let total = 0;
  for (const term of GUST_TERMS) {
    total += term.weight * Math.sin((TAU / term.period) * timeSeconds + term.phase);
  }
  return total;
}

/**
 * The share of the field lit at a given loudness impression, 0..1 in and
 * `ACCENT_SHARE_MIN`..`ACCENT_SHARE_MAX` out. Straight-line: the intensity it
 * is fed has already been through the ear's own curves.
 */
export function accentShareFor(intensity: number): number {
  return lerp(ACCENT_SHARE_MIN, ACCENT_SHARE_MAX, clamp(intensity, 0, 1));
}

/**
 * The shares in force across a beat boundary — what the previous beat was drawn
 * with, and what this one is being drawn with.
 *
 * Two rather than one because the handover below crossfades between two whole
 * beats' worth of lit flakes, and a swell that arrived mid-beat would otherwise
 * light flakes retroactively in the outgoing set as well as the incoming one.
 */
export interface AccentShares {
  previous: number;
  current: number;
}

const QUIETEST_SHARES: AccentShares = {
  previous: ACCENT_SHARE_MIN,
  current: ACCENT_SHARE_MIN,
};

/**
 * Whether this flake is one of the lit ones on a given beat, at a given share.
 *
 * The hash depends only on the flake and the beat — the share is a moving
 * threshold over a fixed ranking. So a swell is purely additive: getting louder
 * recruits flakes that were dark, without disturbing the ones already burning.
 * If the share decided the set by reshuffling instead, every change in loudness
 * would scatter the colour to a different place and the growth would read as
 * noise rather than as the field catching.
 */
function isAccentedOn(particle: Particle, beatIndex: number, share: number): boolean {
  return hash01(particle.seed * 7919 + beatIndex * 104729) < share;
}

/**
 * How orange a flake is right now, 0..1, at `beatPosition` beats into the
 * piece. `null` — nothing playing — leaves the whole field white.
 *
 * The lit set is a pure function of (flake, beat, share), so it needs no state
 * and cannot drift out of time: whatever beat the music is on decides which
 * flakes are burning, and stepping to the next beat hands the colour to a new
 * handful. Crossfading between the two sets over the first third of each beat
 * is what makes that handover land *on* the beat instead of strobing at it.
 *
 * `shares` carries the loudness in. Omit it and the field sits at its quietest,
 * which is what a caller with no audio to listen to should show.
 */
export function particleAccentAt(
  particle: Particle,
  beatPosition: number | null,
  shares: AccentShares = QUIETEST_SHARES,
): number {
  if (beatPosition === null || !Number.isFinite(beatPosition)) return 0;

  const beatIndex = Math.floor(beatPosition);
  const previous = isAccentedOn(particle, beatIndex - 1, shares.previous) ? 1 : 0;
  const current = isAccentedOn(particle, beatIndex, shares.current) ? 1 : 0;
  if (previous === current) return current;

  const phase = Math.min(1, (beatPosition - beatIndex) / ACCENT_FADE_BEATS);
  const eased = phase * phase * (3 - 2 * phase);
  return previous + (current - previous) * eased;
}

interface TransitionEffect {
  /** Vertical lag against the bar, px. Positive is downward. */
  offsetY: number;
  /** Multiplier on the flake's steady alpha. */
  alphaScale: number;
  /** Extra blur, px. */
  blurBoost: number;
}

const NO_TRANSITION: TransitionEffect = { offsetY: 0, alphaScale: 1, blurBoost: 0 };

/**
 * The inertia a flake shows while the layer is arriving or leaving.
 *
 * Arriving is a damped spring released from below: the flake vaults up from
 * under the bar, rises past its resting place, and settles. Leaving is free
 * fall back the way it came — constant acceleration, so displacement grows with
 * the square of progress and the flake is still speeding up as it fades. That
 * asymmetry is the point: arriving somewhere and dropping away from it do not
 * move alike.
 *
 * Blur follows speed in both directions, fastest at the start of an entrance
 * and at the end of a departure.
 */
export function transitionEffectFor(
  particle: Particle,
  transition: ParticleTransition | null | undefined,
): TransitionEffect {
  if (!transition) return NO_TRANSITION;

  const progress = clamp(transition.progress, 0, 1);

  if (transition.entering) {
    const spring = (at: number) => Math.exp(-particle.springDamping * at)
      * Math.cos(SPRING_FREQUENCY * at);
    // Detrended so the spring is exactly zero when the transition ends. Damping
    // alone leaves about a pixel on the table, and a pixel appearing in one
    // frame at the moment the flake stops moving reads as a snap. The
    // correction is that same pixel spread linearly across the whole entrance,
    // which is invisible.
    const settled = progress * spring(1);
    return {
      // Positive is downward, so a full lag puts the flake below the bar and
      // the spring carries it up into place.
      offsetY: particle.inertiaLag * (spring(progress) - settled),
      // Sharp ease-out, so the flakes are already visible through the fast part
      // of the drop. A gentler fade hides the very movement it is fading in.
      alphaScale: 1 - (1 - progress) ** 4,
      blurBoost: TRANSITION_MOTION_BLUR * (1 - progress),
    };
  }

  return {
    offsetY: particle.inertiaLag * LEAVE_LAG_SCALE * progress * progress,
    alphaScale: (1 - progress) ** 2,
    blurBoost: TRANSITION_MOTION_BLUR * progress,
  };
}

/**
 * Where a flake is, and how it looks, at `timeSeconds`.
 *
 * The descent wraps through the field, so a flake that falls off the bottom
 * re-enters at the top — the snowfall never thins out, and nothing has to be
 * respawned to keep it going.
 *
 * `transition` layers the arrival/departure inertia on top of that steady
 * state; omit it and the flake is simply falling. `shape` changes nothing about
 * where the flake goes — only how sharp it is allowed to get on the way.
 */
export function particleFrameAt(
  particle: Particle,
  timeSeconds: number,
  field: ParticleField,
  transition?: ParticleTransition | null,
  shape: ParticleShape = 'glyph',
): ParticleFrame {
  const fallen = wrap01(particle.baseY + particle.fallSpeed * timeSeconds);
  const flutter = Math.sin(particle.flutterRate * timeSeconds + particle.flutterPhase);
  const wobble = Math.sin(particle.fallWobbleRate * timeSeconds + particle.fallWobblePhase);
  const breath = Math.sin(particle.breathRate * timeSeconds + particle.breathPhase);
  const shimmer = Math.sin(particle.shimmerRate * timeSeconds + particle.shimmerPhase);

  const arrival = transitionEffectFor(particle, transition);

  const blur = clamp(
    shapedBlur(particle.blurCenter + particle.blurSwing * breath, shape) + arrival.blurBoost,
    0,
    MAX_BLUR,
  );
  const blurLevel = clamp(
    Math.round(blur / BLUR_STEP),
    0,
    PARTICLE_BLUR_LEVELS.length - 1,
  );

  const wind = windAt(timeSeconds) * particle.windAmplitude;

  return {
    x: field.left + particle.baseX * field.width
      + flutter * particle.flutterAmplitude
      + wind,
    y: field.top + fallen * field.height
      + wobble * FALL_WOBBLE_AMPLITUDE
      + arrival.offsetY,
    glyphIndex: particle.glyphIndex,
    blurLevel,
    alpha: Math.min(
      1,
      particle.baseAlpha
        * (1 - SHIMMER_DEPTH + SHIMMER_DEPTH * shimmer)
        * PARTICLE_BLUR_ALPHA_GAIN[blurLevel],
    ) * arrival.alphaScale,
  };
}
