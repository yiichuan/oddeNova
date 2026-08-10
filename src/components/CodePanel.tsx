import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayIcon, StopIcon } from './icons';
import { t } from '../lib/i18n';
import { strudelService } from '../services/strudel';
import { isDemoMode } from '../demo/demo-config';
import { useIsMobile } from '../hooks/useIsMobile';
import { formatPlaybackTime, getStrudelLoopDurationSeconds } from '../lib/strudel-timing';

interface CodePanelProps {
  code: string;
  error: string | null;
  isPlaying: boolean;
  engineReady: boolean;
  onMount: (el: HTMLDivElement) => void;
  onPlay: () => void;
  onStop: () => void;
  onEditorFocusChange?: (focused: boolean) => void;
}

interface Metaball {
  cx: number;
  cy: number;
  r: number;
  x: readonly number[];
  y: readonly number[];
  duration: number;
  delay: number;
}

interface MetaballGroup {
  balls: readonly Metaball[];
  motionScale?: number;
}

const ORGANIC_LIGHT_GROUPS: readonly MetaballGroup[] = [
  { balls: [
    { cx: 70, cy: 80, r: 46, x: [0, 24, 60, 38, -14, -8, 0], y: [0, -18, 6, 22, 13, -9, 0], duration: 8.6, delay: -4.1 },
    { cx: 130, cy: 80, r: 44, x: [0, -22, -60, -34, 16, 9, 0], y: [0, 17, -5, -20, -12, 11, 0], duration: 9.1, delay: -5.3 },
  ] },
  { balls: [
    { cx: 100, cy: 54, r: 43, x: [0, -20, 8, 22, 13, -15, 0], y: [0, 24, 54, 35, -13, -9, 0], duration: 8.9, delay: -5.2 },
    { cx: 100, cy: 108, r: 47, x: [0, 18, -9, -20, -12, 14, 0], y: [0, -22, -54, -32, 15, 10, 0], duration: 9.4, delay: -2.8 },
  ] },
  { balls: [
    { cx: 68, cy: 59, r: 45, x: [0, 29, 64, 43, -13, -8, 0], y: [0, 5, 42, 54, 18, -16, 0], duration: 9.2, delay: -4.5 },
    { cx: 132, cy: 101, r: 48, x: [0, -27, -64, -40, 15, 9, 0], y: [0, -7, -42, -51, -16, 18, 0], duration: 9.8, delay: -5.4 },
  ] },
  { motionScale: 1.25, balls: [
    { cx: 100, cy: 45, r: 41, x: [0, -18, -38, 0, 38, 20, 0], y: [0, 25, 60, 53, 61, 28, 0], duration: 9.7, delay: -3.6 },
    { cx: 62, cy: 105, r: 45, x: [0, 34, 76, 57, 38, 14, 0], y: [0, -12, 1, -29, -60, -32, 0], duration: 10.1, delay: -4.8 },
    { cx: 138, cy: 106, r: 43, x: [0, -18, -38, -57, -76, -38, 0], y: [0, -28, -61, -33, -1, 14, 0], duration: 10.5, delay: -6.2 },
  ] },
  { motionScale: 1.25, balls: [
    { cx: 47, cy: 82, r: 41, x: [0, 24, 53, 78, 106, 49, 0], y: [0, -18, -5, 13, 1, 17, 0], duration: 9.3, delay: -3.7 },
    { cx: 100, cy: 77, r: 37, x: [0, 28, 53, 25, -53, -27, 0], y: [0, 16, 6, -15, 5, -14, 0], duration: 9.8, delay: -6.1 },
    { cx: 153, cy: 83, r: 40, x: [0, -27, -53, -80, -106, -51, 0], y: [0, -15, -6, 14, -1, 16, 0], duration: 10.2, delay: -2.2 },
  ] },
  { motionScale: 1.25, balls: [
    { cx: 66, cy: 52, r: 41, x: [0, 7, 2, 35, 64, 30, 0], y: [0, 31, 59, 62, 53, 19, 0], duration: 9.6, delay: -5.4 },
    { cx: 68, cy: 111, r: 45, x: [0, 31, 62, 31, -2, -12, 0], y: [0, -18, -6, -35, -59, -28, 0], duration: 10, delay: -4.9 },
    { cx: 130, cy: 105, r: 42, x: [0, -32, -64, -63, -62, -30, 0], y: [0, -26, -53, -25, 6, 15, 0], duration: 10.4, delay: -7.3 },
  ] },
] as const;

const METABALL_KEY_TIMES = '0;0.16;0.33;0.5;0.67;0.84;1';
const METABALL_KEY_SPLINES = Array(6).fill('0.37 0 0.63 1').join(';');
// Scale each metaball's area to 1.5× its previous size: √2 × √1.5 = √3.
const METABALL_LINEAR_SCALE = Math.sqrt(3);
const METABALL_DURATION_SCALE = 1.4;
const COMPOSITE_LIGHT_GROUP_ORDER = [0, 3, 1, 4, 2, 5] as const;

function buildBallAxisValues(origin: number, offsets: Metaball['x'], motionScale = 1) {
  return offsets.map((offset) => origin + offset * motionScale).join(';');
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

function PlaybackProgress({ code, isPlaying }: { code: string; isPlaying: boolean }) {
  const totalSeconds = useMemo(() => getStrudelLoopDurationSeconds(code), [code]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isPlaying || totalSeconds <= 0) return;

    const startedAt = performance.now();
    let frame = 0;
    const update = (now: number) => {
      setElapsedSeconds(((now - startedAt) / 1000) % totalSeconds);
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying, totalSeconds]);

  const progress = isPlaying && totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;
  const elapsedLabel = formatPlaybackTime(elapsedSeconds);
  const totalLabel = formatPlaybackTime(totalSeconds);

  return (
    <div
      data-testid="code-panel-playback-progress"
      className="relative z-10 flex min-w-0 flex-1 items-center gap-3 pl-3 pr-5"
    >
      <div
        className="relative h-[2px] w-[100px] shrink-0 overflow-hidden rounded-full bg-current text-text-primary"
        role="progressbar"
        aria-label={t('playbackProgress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={`${elapsedLabel}/${totalLabel}`}
      >
        <span
          data-testid="code-panel-playback-progress-fill"
          className="absolute inset-0 origin-left rounded-full bg-[#EE6A2C]"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <span
        data-testid="code-panel-playback-time"
        className="shrink-0 text-[11px] leading-none tabular-nums text-text-primary"
      >
        {elapsedLabel}/{totalLabel}
      </span>
    </div>
  );
}

export default function CodePanel({
  code,
  error,
  isPlaying,
  engineReady,
  onMount,
  onPlay,
  onStop,
  onEditorFocusChange,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gutterWidth, setGutterWidth] = useState(0);

  const isMobile = useIsMobile();
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (containerRef.current) {
      onMount(containerRef.current);
    }
  // onMount is stable (useCallback), so this fires only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    strudelService.setAutocompletionEnabled(!isMobile);
    // Wrap instead of scrolling sideways in the narrow mobile drawer.
    strudelService.setLineWrappingEnabled(isMobile);
  }, [isMobile]);

  // Demo mode plays at a quiet 10% by default; the master engine otherwise
  // starts at full, so push the demo default down on mount.
  useEffect(() => {
    if (isDemoMode()) void strudelService.setMasterVolume(0.1);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onEditorFocusChange) return;

    let focusOutTimer: number | null = null;

    const clearFocusOutTimer = () => {
      if (focusOutTimer === null) return;
      window.clearTimeout(focusOutTimer);
      focusOutTimer = null;
    };

    const handleFocusIn = () => {
      clearFocusOutTimer();
      onEditorFocusChange(true);
    };

    const handleFocusOut = (event: FocusEvent) => {
      clearFocusOutTimer();
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && container.contains(nextTarget)) return;

      focusOutTimer = window.setTimeout(() => {
        focusOutTimer = null;
        const activeElement = document.activeElement;
        if (activeElement instanceof Node && container.contains(activeElement)) return;
        onEditorFocusChange(false);
      }, 0);
    };

    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);

    return () => {
      clearFocusOutTimer();
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, [onEditorFocusChange]);

  // Track .cm-gutters width so editor errors start after the gutter.
  // Keep MutationObserver alive so reinit (which clears + remounts the editor) is handled.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ro: ResizeObserver | null = null;

    const attachRo = (gutters: HTMLElement) => {
      ro?.disconnect();
      setGutterWidth(gutters.offsetWidth);
      ro = new ResizeObserver(() => setGutterWidth(gutters.offsetWidth));
      ro.observe(gutters);
    };

    const mo = new MutationObserver(() => {
      const gutters = container.querySelector('.cm-gutters') as HTMLElement | null;
      if (gutters) attachRo(gutters);
    });

    mo.observe(container, { childList: true, subtree: true });

    // Handle the case where gutters already exist on mount
    const existing = container.querySelector('.cm-gutters') as HTMLElement | null;
    if (existing) attachRo(existing);

    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, []);

  const handlePlayClick = () => {
    if (isPlaying) {
      onStop();
    } else if (engineReady) {
      onPlay();
    }
  };

  const hasPlayableCode = code.trim().length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-region">
      <style>{`
        @keyframes cmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .video-fade-in { animation: cmFadeIn 0.6s ease-out forwards; }
      `}</style>

      {/* StrudelMirror mounts here */}
      <div
        data-testid="code-panel-code-layer"
        className="relative z-0 flex-1 min-h-0 overflow-hidden rounded-t-region border border-border bg-conversation-surface"
      >
        <div
          ref={containerRef}
          data-testid="code-panel-editor-root"
          className="h-full flex flex-col justify-stretch items-stretch overflow-hidden *:h-full"
        />

        {error && (
          <div
            className="absolute -bottom-px p-2.5 bg-error/10 border border-[#B2370C] text-[#B2370C] text-xs font-mono whitespace-pre-wrap wrap-break-word"
            style={{
              left: gutterWidth ? gutterWidth - 1 : 0,
              maxWidth: `calc(100% - ${gutterWidth ? gutterWidth - 1 : 0}px)`,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Footer — desktop playback control. On mobile transport lives next to
          App's code-pill toggle. */}
      {!isMobile && (
        <div
          data-testid="code-panel-controls-layer"
          className="code-panel-controls-glass relative z-10 -mt-px -ml-px flex h-12 w-[calc(100%+2px)] shrink-0 items-stretch rounded-b-region border bg-conversation-surface"
          style={{ borderColor: 'transparent', fontFamily: "'ABeeZee', monospace" }}
        >
          <div
            data-testid="code-panel-light-field"
            className="code-panel-light-field"
            aria-hidden="true"
          >
            {COMPOSITE_LIGHT_GROUP_ORDER.map((groupIndex, index) => {
              const group = ORGANIC_LIGHT_GROUPS[groupIndex];
              return (
                <span className="code-panel-light-blob" key={groupIndex}>
                  <svg viewBox="0 0 200 160" preserveAspectRatio="none" focusable="false">
                  <defs>
                    <filter id={`code-panel-metaball-${index}`} x="-35%" y="-35%" width="170%" height="170%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="7.5" result="blur" />
                      <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
                      />
                    </filter>
                  </defs>
                  <g
                    filter={`url(#code-panel-metaball-${index})`}
                    transform={`translate(100 80) scale(${METABALL_LINEAR_SCALE}) translate(-100 -80)`}
                  >
                    {group.balls.map((ball, ballIndex) => (
                      <circle key={ballIndex} cx={ball.cx} cy={ball.cy} r={ball.r}>
                        {!prefersReducedMotion && (
                          <>
                            <animate
                              attributeName="cx"
                              values={buildBallAxisValues(ball.cx, ball.x, group.motionScale)}
                              dur={`${ball.duration * METABALL_DURATION_SCALE}s`}
                              begin={`${ball.delay}s`}
                              repeatCount="indefinite"
                              calcMode="spline"
                              keyTimes={METABALL_KEY_TIMES}
                              keySplines={METABALL_KEY_SPLINES}
                            />
                            <animate
                              attributeName="cy"
                              values={buildBallAxisValues(ball.cy, ball.y, group.motionScale)}
                              dur={`${ball.duration * METABALL_DURATION_SCALE}s`}
                              begin={`${ball.delay}s`}
                              repeatCount="indefinite"
                              calcMode="spline"
                              keyTimes={METABALL_KEY_TIMES}
                              keySplines={METABALL_KEY_SPLINES}
                            />
                          </>
                        )}
                      </circle>
                    ))}
                  </g>
                  </svg>
                </span>
              );
            })}
          </div>

          <span
            data-testid="code-panel-controls-light-border"
            className="code-panel-controls-light-border"
            aria-hidden="true"
          />

          {/* Playback position is anchored to the controls boundary, not CodeMirror's gutter. */}
          <div
            data-testid="code-panel-play-control"
            className="relative z-10 flex items-center justify-center py-[6px]"
            style={{ marginLeft: 'var(--code-panel-play-button-offset)' }}
          >
            <button
              onClick={handlePlayClick}
              disabled={!isPlaying && (!engineReady || !hasPlayableCode)}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-[#050505] text-text-primary transition-colors transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:bg-[#2A2A2A] disabled:text-[#686868] disabled:opacity-100"
              title={isPlaying ? t('stop') : t('play')}
            >
              {isPlaying ? <StopIcon size={14} /> : <PlayIcon size={16} />}
            </button>
          </div>
          <PlaybackProgress key={`${isPlaying}:${code}`} code={code} isPlaying={isPlaying} />
        </div>
      )}
    </div>
  );
}
