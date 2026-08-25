import { useEffect, useRef } from 'react';
import {
  ACCENT_SHARE_MIN,
  PARTICLE_ACCENT_COLOR,
  PARTICLE_BLUR_LEVELS,
  PARTICLE_COLOR,
  PARTICLE_ENTER_MS,
  PARTICLE_FONT,
  PARTICLE_FONT_SIZE,
  PARTICLE_GLYPHS,
  PARTICLE_LEAVE_MS,
  type AccentShares,
  type ParticleShape,
  type ParticleTransition,
  accentShareFor,
  createParticles,
  particleAccentAt,
  particleDotRadius,
  particleFrameAt,
  resolveParticleField,
} from '../../lib/control-bar-particles';
import {
  type AudioSpectrum,
  followIntensity,
  perceivedIntensity,
} from '../../lib/audio-intensity';
import { useAnimationPreference } from '../../hooks/useAppearance';

interface ControlBarParticlesProps {
  /**
   * Whether the snow is falling. Fed by the visualizer pane's collapsed state:
   * the flakes stand in for the galaxy while it is hidden, and stop the moment
   * it comes back.
   */
  active: boolean;
  /** Whether a piece is playing — drives the orange accent. */
  isPlaying?: boolean;
  /** Tempo of that piece, used to put the accent on the beat. */
  bpm?: number;
  /**
   * A colour lifted from the playing piece's own `.color()`, replacing
   * `PARTICLE_ACCENT_COLOR` for as long as it is set. Absent — the ordinary
   * case — the field burns the studio's own orange, same as always.
   */
  accentColor?: string | null;
  /**
   * One frequency frame off the end of the audio chain, sampled per animation
   * frame. It decides *how much* of the field burns: the louder the piece
   * sounds, the more flakes catch. Absent — or returning null, as it does
   * before the engine is up — the field sits at its quietest.
   */
  sampleSpectrum?: () => AudioSpectrum | null;
  /** Freezes the field at t=0, matching the CSS reduced-motion branch. */
  motionless?: boolean;
}

/** ~30fps, same cadence as the galaxy visualizer. Motion this slow needs no more. */
const FRAME_INTERVAL = 1000 / 30;
/** How long the accent takes to arrive when playback starts, or leave when it stops. */
const ACCENT_FADE_MS = 280;

interface SpriteAtlas {
  canvas: HTMLCanvasElement;
  /** The same sheet filled with the accent colour, for flakes on the beat. */
  accentCanvas: HTMLCanvasElement;
  /** Cell size in CSS px; the buffer itself is scaled by the device ratio. */
  cellWidth: number;
  cellHeight: number;
  pixelRatio: number;
}

/**
 * Recolours a finished sheet without re-rendering it. `source-in` keeps the
 * alpha that is already there — every glyph edge and every blur halo — and
 * replaces only the colour, so the accent sheet costs one fill rather than a
 * second pass of 192 blurred glyphs.
 */
function tintedCopy(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * One mote: a bright core falling away to nothing at the rim, the same profile
 * the particle galaxy gives its point sprites. A flat disc would keep a defined
 * edge even under blur and read as a filled circle; the falloff is what makes
 * the mark a speck of light instead.
 */
function paintDot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgb(${PARTICLE_COLOR})`);
  gradient.addColorStop(0.45, `rgba(${PARTICLE_COLOR}, 0.85)`);
  gradient.addColorStop(1, `rgba(${PARTICLE_COLOR}, 0)`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/**
 * Bakes every (blur level, mark) pair into one tiled canvas — marks across,
 * blur levels down. The mark is a glyph or a mote depending on `shape`; both
 * lay out identically, so the renderer blits from either sheet the same way.
 *
 * Blur is the expensive part of this effect: `context.filter` forces a
 * temporary surface per draw, and the breathing means a flake's blur changes
 * continuously, so nothing could be cached frame to frame. The set of *values*
 * is tiny though — 24 marks at 8 radii — so the whole animation's blur can be
 * rendered once here and blitted afterwards. Breathing then costs a different
 * source rectangle, nothing more.
 *
 * It also degrades gracefully: a browser without canvas `filter` support gets
 * sharp flakes rather than a broken layer.
 */
function buildAtlas(pixelRatio: number, shape: ParticleShape, accentColor?: string | null): SpriteAtlas {
  const dots = shape === 'dot';
  const maxBlur = PARTICLE_BLUR_LEVELS[PARTICLE_BLUR_LEVELS.length - 1];
  // A Gaussian is effectively finished at 3σ; less padding than that and each
  // cell would clip its own halo into a visible square, or bleed into its
  // neighbour in the atlas.
  const padding = Math.ceil(maxBlur * 3) + 1;
  // A mote needs only its own diameter; a glyph needs the box its face draws
  // in, which is taller than it is wide.
  const markWidth = dots
    ? particleDotRadius(PARTICLE_GLYPHS.length - 1) * 2
    : PARTICLE_FONT_SIZE * 1.2;
  const markHeight = dots ? markWidth : PARTICLE_FONT_SIZE * 1.5;
  const cellWidth = Math.ceil(markWidth) + padding * 2;
  const cellHeight = Math.ceil(markHeight) + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cellWidth * PARTICLE_GLYPHS.length * pixelRatio));
  canvas.height = Math.max(1, Math.round(cellHeight * PARTICLE_BLUR_LEVELS.length * pixelRatio));

  const context = canvas.getContext('2d');
  if (!context) return { canvas, accentCanvas: canvas, cellWidth, cellHeight, pixelRatio };

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.font = PARTICLE_FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // Opaque here; per-flake alpha is applied at blit time via globalAlpha, so
  // one sprite serves every brightness the breathing passes through.
  context.fillStyle = `rgb(${PARTICLE_COLOR})`;
  // Condenses anything the font renders wider than one monospace advance, so a
  // Greek capital that falls back to another face cannot overflow its cell.
  const advance = context.measureText('@').width;

  PARTICLE_BLUR_LEVELS.forEach((blur, blurIndex) => {
    context.filter = blur > 0 ? `blur(${blur}px)` : 'none';
    PARTICLE_GLYPHS.forEach((glyph, glyphIndex) => {
      const x = glyphIndex * cellWidth + cellWidth / 2;
      const y = blurIndex * cellHeight + cellHeight / 2;
      // The mote takes the size of the glyph slot it replaces, so the weight
      // ramp still carries the depth: specks far away, full motes up close.
      if (dots) paintDot(context, x, y, particleDotRadius(glyphIndex));
      else context.fillText(glyph, x, y, advance);
    });
  });
  context.filter = 'none';

  return {
    canvas,
    accentCanvas: tintedCopy(canvas, accentColor ?? `rgb(${PARTICLE_ACCENT_COLOR})`),
    cellWidth,
    cellHeight,
    pixelRatio,
  };
}

/**
 * Marks falling through the control bar like snow, standing in for the
 * visualizer while it is collapsed — ASCII characters, or round motes when the
 * visual pane is set to the particle galaxy.
 */
export default function ControlBarParticles({
  active,
  isPlaying = false,
  bpm = 0,
  sampleSpectrum,
  motionless = false,
  accentColor = null,
}: ControlBarParticlesProps) {
  // The bar snows whatever the hidden pane is made of, so the two read as one
  // thing moving between them rather than two unrelated effects.
  const shape: ParticleShape = useAnimationPreference() === 'galaxy' ? 'dot' : 'glyph';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlayingRef = useRef(isPlaying);
  const bpmRef = useRef(bpm);
  const sampleSpectrumRef = useRef(sampleSpectrum);
  // The beat grid is anchored to the moment playback started, so the accent
  // lands on the beat rather than wherever the page clock happens to be.
  const playbackStartRef = useRef(0);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    sampleSpectrumRef.current = sampleSpectrum;
  }, [sampleSpectrum]);

  useEffect(() => {
    if (isPlaying && !isPlayingRef.current) playbackStartRef.current = performance.now();
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  // The render loop reads these rather than closing over props: a departure has
  // to keep drawing for PARTICLE_LEAVE_MS *after* `active` goes false, so the
  // effect cannot be torn down and rebuilt when it flips.
  const activeRef = useRef(active);
  const transitionRef = useRef<{ entering: boolean; startedAt: number } | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (activeRef.current === active) return;
    activeRef.current = active;

    // Reversing mid-transition resumes from where the old one got to instead of
    // restarting: toggling the pane twice in quick succession would otherwise
    // snap the flakes from wherever they had sunk to back up to full lag. A
    // reversal at progress p starts the opposite transition at 1 - p, so an
    // instant flip-back is a no-op and a flip-back after a full departure plays
    // the whole entrance.
    const now = performance.now();
    const pending = transitionRef.current;
    let rewind = 0;
    if (pending) {
      const previousDuration = pending.entering ? PARTICLE_ENTER_MS : PARTICLE_LEAVE_MS;
      const previousProgress = Math.min(1, (now - pending.startedAt) / previousDuration);
      rewind = (1 - previousProgress) * (active ? PARTICLE_ENTER_MS : PARTICLE_LEAVE_MS);
    }

    transitionRef.current = { entering: active, startedAt: now - rewind };
    resumeRef.current?.();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const particles = createParticles();

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrameTime = 0;
    let running = false;
    let accentMix = isPlayingRef.current ? 1 : 0;
    // How loud the piece currently sounds, 0..1, and the shares that reading
    // has been latched into for the beat either side of now.
    let intensity = 0;
    let beatShares: AccentShares & { index: number | null } = {
      index: null,
      previous: ACCENT_SHARE_MIN,
      current: ACCENT_SHARE_MIN,
    };
    let atlas = buildAtlas(Math.min(window.devicePixelRatio || 1, 2), shape, accentColor);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      const bufferWidth = Math.round(width * pixelRatio);
      const bufferHeight = Math.round(height * pixelRatio);
      // Assigning width/height wipes the canvas even when unchanged.
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (atlas.pixelRatio !== pixelRatio) atlas = buildAtlas(pixelRatio, shape, accentColor);
    };

    const clear = () => {
      if (width > 0 && height > 0) context.clearRect(0, 0, width, height);
    };

    /**
     * The transition state for this frame, or null once the layer has fully
     * arrived. A finished *departure* keeps reporting progress 1 — that is what
     * holds the flakes invisible instead of snapping them back to full alpha.
     */
    const transitionAt = (timeMs: number): ParticleTransition | null => {
      const pending = transitionRef.current;
      if (!pending) return null;
      const duration = pending.entering ? PARTICLE_ENTER_MS : PARTICLE_LEAVE_MS;
      const progress = (timeMs - pending.startedAt) / duration;
      if (progress < 1) return { entering: pending.entering, progress };
      if (pending.entering) {
        transitionRef.current = null;
        return null;
      }
      return { entering: false, progress: 1 };
    };

    const draw = (
      timeSeconds: number,
      transition: ParticleTransition | null,
      beatPosition: number | null,
      accentMix: number,
      shares?: AccentShares,
    ) => {
      if (width <= 0 || height <= 0) return;

      context.clearRect(0, 0, width, height);
      const field = resolveParticleField(width, height);
      const { cellWidth, cellHeight, pixelRatio } = atlas;
      const sourceWidth = cellWidth * pixelRatio;
      const sourceHeight = cellHeight * pixelRatio;

      for (const particle of particles) {
        const flake = particleFrameAt(particle, timeSeconds, field, transition, shape);
        const sourceX = flake.glyphIndex * sourceWidth;
        const sourceY = flake.blurLevel * sourceHeight;
        const left = flake.x - cellWidth / 2;
        const top = flake.y - cellHeight / 2;

        const blit = (sheet: HTMLCanvasElement, alpha: number) => {
          if (alpha <= 0.004) return;
          context.globalAlpha = alpha;
          context.drawImage(
            sheet,
            sourceX, sourceY, sourceWidth, sourceHeight,
            left, top, cellWidth, cellHeight,
          );
        };

        // Two sheets of the same shape, cross-dissolved. Painting the accent
        // over the white one instead would leave a pale ghost under every lit
        // flake, since both are additive against the dark bar.
        const accent = particleAccentAt(particle, beatPosition, shares) * accentMix;
        blit(atlas.canvas, flake.alpha * (1 - accent));
        blit(atlas.accentCanvas, flake.alpha * accent);
      }

      context.globalAlpha = 1;
    };

    /**
     * The shares to draw with this frame, re-read from the loudness once per
     * beat and held for the rest of it.
     *
     * The reading itself moves continuously, but the lit set is only allowed to
     * change on the beat — sampling it every frame would have flakes catching
     * and going out mid-beat, which is exactly the strobing the beat grid
     * exists to prevent. The outgoing beat keeps the share it was actually
     * drawn with, so a swell that arrives now cannot light flakes retroactively
     * in the set that is on its way out.
     */
    const sharesAt = (beatPosition: number | null): AccentShares => {
      if (beatPosition === null) {
        beatShares = { index: null, previous: ACCENT_SHARE_MIN, current: ACCENT_SHARE_MIN };
        return beatShares;
      }

      const index = Math.floor(beatPosition);
      if (index !== beatShares.index) {
        const share = accentShareFor(intensity);
        beatShares = {
          index,
          // The first beat of a piece has no predecessor to cross-fade out of;
          // giving it the same share on both sides starts it clean.
          previous: beatShares.index === null ? share : beatShares.current,
          current: share,
        };
      }
      return beatShares;
    };

    /** Beats elapsed since playback began, or null when nothing is playing. */
    const beatPositionAt = (timeMs: number) => {
      if (!isPlayingRef.current || bpmRef.current <= 0) return null;
      return ((timeMs - playbackStartRef.current) / 1000) * (bpmRef.current / 60);
    };

    /** One static frame — the reduced-motion path, and the resize repaint. */
    const drawStill = () => {
      if (activeRef.current) draw(0, null, null, 0);
      else clear();
    };

    const step = (timeMs: number) => {
      if (timeMs - lastFrameTime < FRAME_INTERVAL) {
        frame = requestAnimationFrame(step);
        return;
      }
      const elapsed = lastFrameTime === 0 ? FRAME_INTERVAL : timeMs - lastFrameTime;
      lastFrameTime = timeMs;

      // Eased rather than switched, so starting or stopping playback washes the
      // colour in and out instead of repainting the field between two frames.
      const accentTarget = isPlayingRef.current ? 1 : 0;
      accentMix += (accentTarget - accentMix) * Math.min(1, elapsed / ACCENT_FADE_MS);

      // Silence while stopped rather than a frozen last reading, so the field
      // is already back at its floor by the time playback resumes.
      const spectrum = isPlayingRef.current ? sampleSpectrumRef.current?.() ?? null : null;
      intensity = followIntensity(
        intensity,
        spectrum ? perceivedIntensity(spectrum) : 0,
        elapsed,
      );

      const transition = transitionAt(timeMs);
      const beatPosition = beatPositionAt(timeMs);
      draw(timeMs / 1000, transition, beatPosition, accentMix, sharesAt(beatPosition));

      // Idle once the flakes are gone and nothing is left to animate: an empty
      // canvas has no business holding a frame callback open.
      if (!activeRef.current && transition?.progress === 1) {
        running = false;
        clear();
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const resume = () => {
      if (motionless) {
        drawStill();
        return;
      }
      if (running) return;
      running = true;
      lastFrameTime = 0;
      frame = requestAnimationFrame(step);
    };
    resumeRef.current = resume;

    resize();
    if (activeRef.current) resume();

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        resize();
        if (motionless || !running) drawStill();
      });
    observer?.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      running = false;
      resumeRef.current = null;
      observer?.disconnect();
    };
    // `accentColor` rebuilds the whole field along with `shape`: both are rare,
    // deliberate changes (a latch at most twice a playback, a settings change
    // rarer still), so paying for a fresh `createParticles()` shuffle on either
    // is the same trade already made for `shape` — simpler than keeping a
    // second, narrower path just to re-tint one canvas in place.
  }, [motionless, shape, accentColor]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="code-panel-particle-field"
      className="code-panel-particle-field"
      data-active={active ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
