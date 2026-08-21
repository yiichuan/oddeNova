import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DownloadIcon,
  MaximizeIcon,
  MinimizeIcon,
  MutedVolumeIcon,
  PauseIcon,
  PlayIcon,
  VolumeIcon,
} from '../icons';
import { t } from '../../lib/i18n';
import { strudelService } from '../../services/strudel';
import { isDemoMode } from '../../demo/demo-config';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  formatPlaybackTime,
  getStrudelLoopCycles,
  getStrudelLoopDurationSeconds,
} from '../../lib/strudel-timing';
import {
  ExportPopover,
  ShareButton,
  type GenerateTitleParams,
} from './TopActionBar';
import { useExportPopoverController, type ExportParams } from '../../hooks/useExportPopoverController';
import type { Session } from '../../hooks/useSessions';
import type { ChatMessage } from '../../hooks/useChat';
import ControlHoverLabel, { type ControlHoverLabelAnchor } from './ControlHoverLabel';
import ControlBarParticles from './ControlBarParticles';
import SessionSyncStatus from './SessionSyncStatus';
import type { SessionSyncStatus as SyncStatus } from '../../lib/session-cloud-sync';

interface CodePanelProps {
  code: string;
  error: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  engineReady: boolean;
  session: Session | null;
  messages: ChatMessage[];
  exportState: { status: 'idle' | 'exporting' | 'error'; progress: number; error?: string };
  onExport: (params: ExportParams) => Promise<boolean>;
  onGenerateTitle: (params: GenerateTitleParams) => Promise<string>;
  onResetExportState: () => void;
  bpm: number;
  onMount: (el: HTMLDivElement) => void;
  onPlay: () => void;
  onPause: () => void;
  onEditorFocusChange?: (focused: boolean) => void;
  /** Whether the visualizer pane below this panel is currently collapsed. */
  vizCollapsed?: boolean;
  /** Collapses/expands that pane; the footer then sits at the page bottom. */
  onToggleViz?: () => void;
  syncStatus?: SyncStatus;
  showSyncStatus?: boolean;
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
  // Diagonal, not vertical: stacked on one x these two land on the same spot
  // once the viewBox is squashed into a 48px bar, reading as a single clump
  // that occupies no width — which is what opened the 204px gaps either side.
  { balls: [
    { cx: 78, cy: 54, r: 43, x: [0, -20, 8, 22, 13, -15, 0], y: [0, 24, 54, 35, -13, -9, 0], duration: 8.9, delay: -5.2 },
    { cx: 122, cy: 108, r: 47, x: [0, 18, -9, -20, -12, 14, 0], y: [0, -22, -54, -32, 15, 10, 0], duration: 9.4, delay: -2.8 },
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

// Scale each metaball's area to 1.5× its previous size: √2 × √1.5 = √3.
const METABALL_LINEAR_SCALE = Math.sqrt(3);
const METABALL_DURATION_SCALE = 2;
const COMPOSITE_LIGHT_GROUP_ORDER = [0, 3, 1, 4, 2, 5] as const;


/**
 * The per-ball half of `code-panel-ball-drift`: the five interior stops of the
 * path this ball walks, plus its own tempo. The path is stated as offsets from
 * where the ball already sits, so it becomes a `transform` on the circle rather
 * than an animation of `cx`/`cy` — which is what lets CSS drive it at all.
 *
 * Stops 0 and 6 are both zero, the seam the loop closes on, so only 1..5 need
 * naming. The circle's transform composes inside the group's `scale()`, exactly
 * as an offset applied to `cx` used to, so the motion is unchanged in size.
 */
function ballDriftVars(ball: Metaball, motionScale = 1): CSSProperties {
  const vars: Record<string, string> = {
    '--ball-duration': `${ball.duration * METABALL_DURATION_SCALE}s`,
    '--ball-delay': `${ball.delay}s`,
  };
  for (let stop = 1; stop <= 5; stop += 1) {
    vars[`--ball-x${stop}`] = `${ball.x[stop] * motionScale}px`;
    vars[`--ball-y${stop}`] = `${ball.y[stop] * motionScale}px`;
  }
  return vars as CSSProperties;
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

function PlaybackProgress({ code, isPlaying, isPaused }: { code: string; isPlaying: boolean; isPaused: boolean }) {
  const totalSeconds = useMemo(() => getStrudelLoopDurationSeconds(code), [code]);
  const loopCycles = useMemo(() => code.trim() ? getStrudelLoopCycles(code) : 0, [code]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const elapsedRef = useRef(0);
  const seekInputRef = useRef<HTMLInputElement>(null);
  const pointerFocusedRef = useRef(false);
  const playbackOriginRef = useRef({ elapsedSeconds: 0, startedAt: 0 });
  const wasPlayingRef = useRef(false);

  const updateElapsedSeconds = useCallback((seconds: number) => {
    elapsedRef.current = seconds;
    setElapsedSeconds(seconds);
  }, []);

  // Stopping (unlike pausing) rewinds the playhead, and so does losing a
  // playable duration. Adjusted on the transition during render rather than in
  // an effect, which would cost a cascading render.
  const isRewound = (!isPlaying || totalSeconds <= 0) && !isPaused;
  const [wasRewound, setWasRewound] = useState(isRewound);
  if (isRewound !== wasRewound) {
    setWasRewound(isRewound);
    if (isRewound) setElapsedSeconds(0);
  }

  useEffect(() => {
    if (!isPlaying || totalSeconds <= 0) {
      // Rewinding the resume origin belongs here: refs cannot be written during render.
      if (!isPaused) elapsedRef.current = 0;
      wasPlayingRef.current = false;
      return;
    }

    wasPlayingRef.current = true;
    playbackOriginRef.current = {
      elapsedSeconds: elapsedRef.current,
      startedAt: performance.now(),
    };
    let frame = 0;
    const update = (now: number) => {
      const origin = playbackOriginRef.current;
      updateElapsedSeconds((origin.elapsedSeconds + (now - origin.startedAt) / 1000) % totalSeconds);
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [code, isPaused, isPlaying, totalSeconds, updateElapsedSeconds]);

  const progress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;
  const elapsedLabel = formatPlaybackTime(elapsedSeconds);
  const totalLabel = formatPlaybackTime(totalSeconds);
  const seekDisabled = totalSeconds <= 0 || loopCycles <= 0;

  const handleSeek = (nextProgress: number) => {
    if (seekDisabled) return;
    const normalizedProgress = Math.min(1, Math.max(0, nextProgress));
    const nextElapsedSeconds = normalizedProgress * totalSeconds;
    updateElapsedSeconds(nextElapsedSeconds);
    playbackOriginRef.current = {
      elapsedSeconds: nextElapsedSeconds,
      startedAt: performance.now(),
    };
    strudelService.seekPlayback(normalizedProgress, loopCycles);
  };

  return (
    <div
      data-testid="code-panel-playback-progress"
      className="code-panel-playback-layout relative z-10 flex min-w-0 flex-1 items-center"
    >
      <div
        className="group relative flex h-6 min-w-0 flex-1 items-center"
        onPointerLeave={() => {
          if (isDragging || !pointerFocusedRef.current) return;
          seekInputRef.current?.blur();
          pointerFocusedRef.current = false;
        }}
      >
        <div
          data-testid="code-panel-playback-track"
          className={`relative w-full rounded-full bg-current text-text-primary transition-[height] duration-[160ms] ease-out motion-reduce:transition-none group-hover:h-[4px] group-focus-within:h-[4px] ${isDragging ? 'h-[4px]' : 'h-[2px]'}`}
        >
          <span
            data-testid="code-panel-playback-progress-fill"
            className="absolute inset-y-0 left-0 rounded-full bg-[#CD5633]"
            style={{ width: `${progress * 100}%` }}
          />
          <span
            data-testid="code-panel-playback-progress-thumb"
            className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-[#CD5633] text-text-primary transition-[width,height,opacity] duration-[160ms] ease-out motion-reduce:transition-none group-hover:h-4 group-hover:w-4 group-hover:opacity-100 group-focus-within:h-4 group-focus-within:w-4 group-focus-within:opacity-100 ${isDragging ? 'h-4 w-4 opacity-100' : 'h-[10px] w-[10px] opacity-0'}`}
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <input
          ref={seekInputRef}
          data-testid="code-panel-playback-seek"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 1000)}
          disabled={seekDisabled}
          onChange={(event) => handleSeek(Number(event.target.value) / 1000)}
          onPointerDown={() => {
            pointerFocusedRef.current = true;
            setIsDragging(true);
          }}
          onPointerUp={() => setIsDragging(false)}
          onPointerCancel={() => {
            pointerFocusedRef.current = false;
            setIsDragging(false);
          }}
          onBlur={() => {
            pointerFocusedRef.current = false;
            setIsDragging(false);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label={t('playbackProgress')}
          aria-valuetext={`${elapsedLabel}/${totalLabel}`}
        />
      </div>
      <span
        data-testid="code-panel-playback-time"
        className="shrink-0 text-[12px] leading-none tabular-nums text-text-primary"
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
  isPaused,
  engineReady,
  session,
  messages,
  exportState,
  onExport,
  onGenerateTitle,
  onResetExportState,
  bpm,
  onMount,
  onPlay,
  onPause,
  onEditorFocusChange,
  vizCollapsed = false,
  onToggleViz,
  syncStatus,
  showSyncStatus = false,
}: CodePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);
  const volumePopoverRef = useRef<HTMLDivElement>(null);
  const volumeCloseTimerRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(() => isDemoMode() ? 0.1 : 1);
  const lastNonzeroVolumeRef = useRef(volume > 0 ? volume : 1);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volumeAnchor, setVolumeAnchor] = useState<{ right: number; bottom: number } | null>(null);
  const [exportAnchor, setExportAnchor] = useState<{ right: number; top: number } | null>(null);
  const [exportHoverAnchor, setExportHoverAnchor] = useState<ControlHoverLabelAnchor | null>(null);
  const [vizHoverAnchor, setVizHoverAnchor] = useState<ControlHoverLabelAnchor | null>(null);

  const isMobile = useIsMobile();
  const prefersReducedMotion = usePrefersReducedMotion();

  const exportWithVolumeRestore = useCallback(async (params: ExportParams) => {
    const ok = await onExport(params);
    await strudelService.setMasterVolume(volume);
    return ok;
  }, [onExport, volume]);
  const { exportOpen, setExportOpen, handleExport } = useExportPopoverController(
    exportWithVolumeRestore,
    onResetExportState,
  );

  const clearVolumeCloseTimer = useCallback(() => {
    if (volumeCloseTimerRef.current === null) return;
    window.clearTimeout(volumeCloseTimerRef.current);
    volumeCloseTimerRef.current = null;
  }, []);

  const openVolumePopover = useCallback((element: HTMLElement) => {
    clearVolumeCloseTimer();
    const rect = element.getBoundingClientRect();
    setVolumeAnchor({
      right: window.innerWidth - rect.right - 6,
      bottom: window.innerHeight - rect.top + 8,
    });
    setVolumeOpen(true);
  }, [clearVolumeCloseTimer]);

  const scheduleVolumeClose = useCallback(() => {
    clearVolumeCloseTimer();
    volumeCloseTimerRef.current = window.setTimeout(() => {
      volumeCloseTimerRef.current = null;
      setVolumeOpen(false);
    }, 150);
  }, [clearVolumeCloseTimer]);

  const setMasterVolume = useCallback((nextVolume: number) => {
    if (nextVolume > 0) lastNonzeroVolumeRef.current = nextVolume;
    setVolume(nextVolume);
    void strudelService.setMasterVolume(nextVolume).catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    setMasterVolume(volume > 0 ? 0 : lastNonzeroVolumeRef.current);
  }, [setMasterVolume, volume]);

  useEffect(() => clearVolumeCloseTimer, [clearVolumeCloseTimer]);

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
    if (!volumeOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (volumeButtonRef.current?.contains(target) || volumePopoverRef.current?.contains(target)) return;
      setVolumeOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [volumeOpen]);

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

  // Keep the bottom fade above the horizontal scrollbar only when that
  // scrollbar actually exists. Without overflow, the fade reaches the edge.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeObserver: ResizeObserver | null = null;
    let scroller: HTMLElement | null = null;

    const updateScrollbarState = () => {
      if (!scroller) return;
      const editor = scroller.closest<HTMLElement>('.cm-editor');
      if (!editor) return;
      editor.dataset.hasHorizontalScrollbar = String(scroller.scrollWidth > scroller.clientWidth + 1);
    };

    const attachScroller = (nextScroller: HTMLElement) => {
      if (scroller === nextScroller) {
        updateScrollbarState();
        return;
      }
      resizeObserver?.disconnect();
      scroller = nextScroller;
      resizeObserver = new ResizeObserver(updateScrollbarState);
      resizeObserver.observe(nextScroller);
      const content = nextScroller.querySelector('.cm-content');
      if (content instanceof HTMLElement) resizeObserver.observe(content);
      updateScrollbarState();
    };

    const mutationObserver = new MutationObserver(() => {
      const nextScroller = container.querySelector('.cm-scroller');
      if (nextScroller instanceof HTMLElement) attachScroller(nextScroller);
    });
    mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });

    const existingScroller = container.querySelector('.cm-scroller');
    if (existingScroller instanceof HTMLElement) attachScroller(existingScroller);

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  const handlePlayClick = () => {
    if (isPlaying) {
      onPause();
    } else if (engineReady) {
      onPlay();
    }
  };

  // Hover labels are portalled to <body>, so they need viewport coordinates:
  // centred on the control, sitting just above it.
  const anchorAbove = (element: HTMLElement): ControlHoverLabelAnchor => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + 8,
    };
  };

  const hasPlayableCode = code.trim().length > 0;
  const actionDisabled = !engineReady || !hasPlayableCode || exportState.status === 'exporting';

  return (
    <div ref={panelRef} className="h-full flex flex-col overflow-hidden rounded-region">
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
            data-testid="code-panel-runtime-error"
            className="absolute right-[8px] top-[8px] z-20 w-fit rounded-[4px] border border-[#E01A1A] bg-[#E01A1A]/10 p-2.5 text-xs text-[#E01A1A] font-mono whitespace-pre-wrap wrap-break-word"
            style={{ maxWidth: 'min(420px, calc(100% - 24px))' }}
          >
            {error}
          </div>
        )}

        {/* Sync status floats over the code without resizing it. The error
            banner lives at the top-right, so the capsule's position can never
            depend on whether the code is broken. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end">
          <SessionSyncStatus
            status={syncStatus}
            visible={!!showSyncStatus}
            className="ml-auto shrink-0 mr-3 mb-2"
          />
        </div>
      </div>

      {/* Footer — desktop playback control. On mobile transport lives next to
          App's code-pill toggle. */}
      {!isMobile && (
        <div
          data-testid="code-panel-controls-layer"
          className="code-panel-controls relative z-10 -mt-px -ml-px flex h-12 w-[calc(100%+2px)] shrink-0 items-stretch rounded-b-region border bg-conversation-surface"
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
                      <circle
                        key={ballIndex}
                        cx={ball.cx}
                        cy={ball.cy}
                        r={ball.r}
                        className="code-panel-light-ball"
                        style={ballDriftVars(ball, group.motionScale)}
                      />
                    ))}
                  </g>
                  </svg>
                </span>
              );
            })}
          </div>

          {/* Stands in for the visualizer while it is collapsed: the marks it
              is made of — ASCII characters, or motes under the particle galaxy
              — falling through the bar like snow, some of them burning orange
              on the beat while a piece plays, more of them the louder it
              sounds. */}
          <ControlBarParticles
            active={vizCollapsed}
            isPlaying={isPlaying}
            bpm={bpm}
            sampleSpectrum={strudelService.sampleAudioSpectrum}
            motionless={prefersReducedMotion}
          />

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
              className="control-button-surface flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#A8A8A8] transition-colors hover:text-[#C8C8C8] disabled:cursor-not-allowed disabled:text-[#686868] disabled:opacity-100"
              aria-label={isPlaying ? t('pause') : t('play')}
            >
              {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={18} />}
            </button>
          </div>
          {/* Keyed on the code so a new script remounts with a fresh playhead;
              deliberately not on the play state, so a pause keeps its position. */}
          <PlaybackProgress key={code} code={code} isPlaying={isPlaying} isPaused={isPaused} />

          <div
            data-testid="code-panel-right-actions"
            className="code-panel-right-actions relative z-10 ml-auto flex shrink-0 items-center"
          >
            <button
              ref={volumeButtonRef}
              type="button"
              onClick={() => {
                clearVolumeCloseTimer();
                toggleMute();
              }}
              onMouseEnter={(event) => openVolumePopover(event.currentTarget)}
              onMouseLeave={scheduleVolumeClose}
              onFocus={(event) => openVolumePopover(event.currentTarget)}
              onBlur={scheduleVolumeClose}
              className="control-button-surface flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#A8A8A8] transition-colors hover:text-[#C8C8C8]"
              aria-label={volume > 0 ? t('mute') : t('unmute')}
              aria-expanded={volumeOpen}
              aria-pressed={volume === 0}
            >
              {volume > 0 ? <VolumeIcon size={18} /> : <MutedVolumeIcon size={18} />}
            </button>

            <div
              data-testid="code-panel-share-export-capsule"
              className="control-button-surface control-button-capsule flex h-8 w-28 items-center justify-between px-1 rounded-full"
            >
              <ShareButton
                session={session}
                code={code}
                messages={messages}
                disabled={!session || !hasPlayableCode || exportState.status === 'exporting'}
                variant="icon"
              />

              <div
                className="flex h-8 w-8 items-center justify-center"
                onMouseEnter={(event) => setExportHoverAnchor(anchorAbove(event.currentTarget))}
                onMouseLeave={() => setExportHoverAnchor(null)}
                onFocusCapture={(event) => setExportHoverAnchor(anchorAbove(event.currentTarget))}
                onBlurCapture={() => setExportHoverAnchor(null)}
              >
                <button
                  type="button"
                  onClick={() => {
                    const rect = panelRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setExportAnchor({
                      right: window.innerWidth - rect.right,
                      top: rect.top,
                    });
                    setExportOpen((open) => !open);
                  }}
                  disabled={actionDisabled}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#A8A8A8] transition-colors hover:text-[#C8C8C8] disabled:cursor-not-allowed disabled:text-[#686868] disabled:opacity-100"
                  aria-label={t('download')}
                  aria-expanded={exportOpen}
                >
                  <DownloadIcon size={18} />
                </button>
                <ControlHoverLabel
                  anchor={exportHoverAnchor}
                  label={t('download')}
                  testId="code-panel-export-hover-label"
                />
              </div>

              <div
                className="flex h-8 w-8 items-center justify-center"
                onMouseEnter={(event) => setVizHoverAnchor(anchorAbove(event.currentTarget))}
                onMouseLeave={() => setVizHoverAnchor(null)}
                onFocusCapture={(event) => setVizHoverAnchor(anchorAbove(event.currentTarget))}
                onBlurCapture={() => setVizHoverAnchor(null)}
              >
                <button
                  type="button"
                  onClick={onToggleViz}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#A8A8A8] transition-colors hover:text-[#C8C8C8]"
                  aria-label={vizCollapsed ? t('expandViz') : t('collapseViz')}
                  aria-pressed={vizCollapsed}
                >
                  {vizCollapsed ? <MaximizeIcon size={16} /> : <MinimizeIcon size={16} />}
                </button>
                <ControlHoverLabel
                  anchor={vizHoverAnchor}
                  label={vizCollapsed ? t('expandViz') : t('collapseViz')}
                  testId="code-panel-viz-toggle-hover-label"
                />
              </div>

              <ExportPopover
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                exportState={exportState}
                onResetState={onResetExportState}
                onExport={handleExport}
                code={code}
                sessionTitle={session?.title}
                messages={messages}
                onGenerateTitle={onGenerateTitle}
                bpm={bpm}
                placement="above"
                anchorPosition={exportAnchor ?? undefined}
              />
            </div>
          </div>
        </div>
      )}

      {volumeOpen && volumeAnchor && typeof document !== 'undefined' && createPortal(
        <div
          ref={volumePopoverRef}
          data-testid="code-panel-volume-popover"
          className="fixed z-50 flex w-[44px] flex-col items-center gap-1 rounded-[6px] border border-[#323232] bg-[#111] px-2 py-2 shadow-[0_6px_18px_rgba(0,0,0,0.9)]"
          onMouseEnter={clearVolumeCloseTimer}
          onMouseLeave={scheduleVolumeClose}
          onFocusCapture={clearVolumeCloseTimer}
          onBlurCapture={scheduleVolumeClose}
          style={{
            ...volumeAnchor,
            fontFamily: "'ABeeZee', monospace",
          }}
        >
          <span className="text-[10px] tabular-nums text-text-primary">{Math.round(volume * 100)}%</span>
          <input
            data-testid="code-panel-volume-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(event) => {
              const nextVolume = Number(event.target.value) / 100;
              setMasterVolume(nextVolume);
            }}
            aria-label={t('volume')}
            aria-orientation="vertical"
            className="code-panel-volume-slider h-20 w-4 cursor-pointer"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              '--volume-progress': `${Math.round(volume * 100)}%`,
            } as React.CSSProperties}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
