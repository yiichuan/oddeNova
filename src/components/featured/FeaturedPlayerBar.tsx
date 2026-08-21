import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SkipBack, SkipForward, SquareArrowOutUpRight } from 'lucide-react';
import { MutedVolumeIcon, PauseIcon, PlayIcon, VolumeIcon } from '../icons';
import { ShareButton } from '../studio/TopActionBar';
import ControlHoverLabel, { type ControlHoverLabelAnchor } from '../studio/ControlHoverLabel';
import { featuredSessionDraft } from '../../lib/featured-session';
import { t } from '../../lib/i18n';
import { featuredPlayer } from '../../services/featured-player';
import { strudelService } from '../../services/strudel';
import {
  formatPlaybackTime,
  getStrudelLoopCycles,
  getStrudelLoopDurationSeconds,
} from '../../lib/strudel-timing';
import type { FeaturedPiece } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';

interface FeaturedPlayerBarProps {
  /** The piece the bar is parked on — the last one picked, playing or not. */
  piece: FeaturedPiece | null;
  isPlaying: boolean;
  /** Stopped mid-play, holding its playhead — the read-out stays where it is. */
  isPaused: boolean;
  engineReady: boolean;
  /** True while the piece is being copied into a new session. */
  opening: boolean;
  onPlay: () => void;
  /** Pause rather than stop: the bar is a transport, and a transport resumes. */
  onPause: () => void;
  /** Left undefined when the collection has nothing on that side of the piece. */
  onPrev?: () => void;
  onNext?: () => void;
  onOpenInStudio: () => void;
}

/**
 * Every icon in the bar behaves the same under the pointer: a finger cursor and
 * a circle that fades in behind it. Tailwind's reset leaves buttons on the
 * default arrow, so `cursor-pointer` is part of the set rather than a stray fix.
 */
const BAR_ICON_BASE =
  'grid cursor-pointer place-items-center rounded-full text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary';
const BAR_ICON_DISABLED =
  'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted';
/** Flanking the play button, where they answer to it. */
const BAR_ICON = `${BAR_ICON_BASE} size-8`;
/** The bar's right-hand actions, which stand on their own. */
const BAR_ACTION_ICON = `${BAR_ICON_BASE} size-10`;

/**
 * The floating transport at the foot of the Featured page: what is loaded on
 * the left, the transport and its progress in the middle, what you can do with
 * the piece on the right.
 *
 * It sits flush with the foot of the page's column, which puts its bottom edge
 * on the same line as the primary nav's — the two glass shapes either side of
 * the page finish together.
 */
export default function FeaturedPlayerBar({
  piece,
  isPlaying,
  isPaused,
  engineReady,
  opening,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onOpenInStudio,
}: FeaturedPlayerBarProps) {
  const transportDisabled = !piece || (!engineReady && !isPlaying);

  return (
    <div
      data-testid="featured-player-bar"
      className="absolute inset-x-4 bottom-0 z-20 rounded-[14px] border border-white/10 bg-settings-surface/55 px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.55)] backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* Left — what is loaded. */}
        <div className="flex min-w-0 items-center gap-3">
          {piece ? (
            <>
              <FeaturedCover piece={piece} className="size-10 shrink-0 rounded-[5px]" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-text-primary">{piece.title}</span>
                <span className="block truncate text-[11px] text-text-muted">
                  {piece.originalArtist} · {t('featuredCodedBy')} {piece.coder}
                </span>
              </span>
            </>
          ) : (
            <span className="text-xs text-text-muted">{t('featuredNothingPlaying')}</span>
          )}
        </div>

        {/* Middle — transport, with the progress read-out under it. */}
        {/* Wide enough that a seek has somewhere to land: at 560px the track
            itself is ~470 after the two time read-outs, so a second of a
            three-minute loop is still a few pixels of travel. */}
        <div className="flex w-[min(560px,50vw)] flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <SkipButton
              label={t('featuredPrevPiece')}
              testId="featured-bar-prev"
              onClick={onPrev}
            >
              <SkipBack size={19} strokeWidth={1.8} fill="currentColor" aria-hidden="true" />
            </SkipButton>

            <button
              type="button"
              onClick={isPlaying ? onPause : onPlay}
              disabled={transportDisabled}
              title={!engineReady && !isPlaying ? t('engineStarting') : undefined}
              aria-label={isPlaying ? t('pause') : t('play')}
              data-testid="featured-bar-play"
              className="grid size-11 cursor-pointer place-items-center rounded-full bg-accent text-text-primary transition duration-200 hover:bg-[#525252] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={18} />}
            </button>

            <SkipButton
              label={t('featuredNextPiece')}
              testId="featured-bar-next"
              onClick={onNext}
            >
              <SkipForward size={19} strokeWidth={1.8} fill="currentColor" aria-hidden="true" />
            </SkipButton>
          </div>

          {/* Keyed on the piece so a switch starts its playhead at zero rather
              than inheriting the last one's position. */}
          <PlaybackProgress
            key={piece?.id ?? 'none'}
            piece={piece}
            isPlaying={isPlaying}
            isPaused={isPaused}
          />
        </div>

        {/* Right — what you can do with the piece. Volume sits outside the
            piece check: it is the page's output level, not the piece's.

            Both actions carry the piece into the studio — one for you, one for
            whoever you send it to — so they are built from the same draft and
            land on the same session. */}
        <div className="flex items-center justify-end gap-2">
          <VolumeControl />
          {piece && (
            <>
              <OpenInStudio opening={opening} onOpenInStudio={onOpenInStudio} />
              <FeaturedShare piece={piece} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Previous / next. Disabled rather than hidden when there is nothing on that
 * side: a transport that changes shape with the size of the collection is
 * harder to aim at than one that is always the same three buttons.
 */
function SkipButton({
  label,
  testId,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      data-testid={testId}
      className={`${BAR_ICON} ${BAR_ICON_DISABLED}`}
    >
      {children}
    </button>
  );
}

/**
 * The progress read-out, and the seek that goes with it.
 *
 * The playhead is driven locally rather than polled off the scheduler — one
 * rAF against a known loop length is cheaper and smoother than asking the
 * engine where it is sixty times a second. Seeking is the one place the two
 * have to meet: the origin moves here and the cycle moves in the page's own
 * scheduler, which is not the studio's.
 */
function PlaybackProgress({
  piece,
  isPlaying,
  isPaused,
}: {
  piece: FeaturedPiece | null;
  isPlaying: boolean;
  isPaused: boolean;
}) {
  const totalSeconds = useMemo(
    () => (piece ? getStrudelLoopDurationSeconds(piece.code) : 0),
    [piece],
  );
  const loopCycles = useMemo(() => (piece ? getStrudelLoopCycles(piece.code) : 0), [piece]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const elapsedRef = useRef(0);
  const seekInputRef = useRef<HTMLInputElement>(null);
  const pointerFocusedRef = useRef(false);
  const originRef = useRef({ elapsedSeconds: 0, startedAt: 0 });

  const updateElapsed = useCallback((seconds: number) => {
    elapsedRef.current = seconds;
    setElapsedSeconds(seconds);
  }, []);

  // Stopping rewinds the playhead; pausing is the whole point of not doing so.
  // Only on the transition into it, too, so a seek made while stopped keeps the
  // position the engine will start from. Adjusted during render rather than in
  // an effect, which would cost a cascading render.
  const isRewound = (!isPlaying || totalSeconds <= 0) && !isPaused;
  const [wasRewound, setWasRewound] = useState(isRewound);
  if (isRewound !== wasRewound) {
    setWasRewound(isRewound);
    if (isRewound) setElapsedSeconds(0);
  }

  useEffect(() => {
    if (!isPlaying || totalSeconds <= 0) {
      // Refs cannot be written during render, so the origin rewinds here.
      if (!isPaused) elapsedRef.current = 0;
      return;
    }
    originRef.current = { elapsedSeconds: elapsedRef.current, startedAt: performance.now() };
    let frame = 0;
    const tick = (now: number) => {
      const origin = originRef.current;
      updateElapsed((origin.elapsedSeconds + (now - origin.startedAt) / 1000) % totalSeconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPaused, isPlaying, totalSeconds, updateElapsed]);

  const progress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0;
  const elapsedLabel = formatPlaybackTime(elapsedSeconds);
  const totalLabel = formatPlaybackTime(totalSeconds);
  const seekDisabled = totalSeconds <= 0 || loopCycles <= 0;

  const handleSeek = (nextProgress: number) => {
    if (seekDisabled) return;
    const normalized = Math.min(1, Math.max(0, nextProgress));
    const nextElapsed = normalized * totalSeconds;
    updateElapsed(nextElapsed);
    originRef.current = { elapsedSeconds: nextElapsed, startedAt: performance.now() };
    featuredPlayer.seek(normalized, loopCycles);
  };

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
        {elapsedLabel}
      </span>

      <div
        className="group relative flex h-4 min-w-0 flex-1 items-center"
        onPointerLeave={() => {
          if (isDragging || !pointerFocusedRef.current) return;
          seekInputRef.current?.blur();
          pointerFocusedRef.current = false;
        }}
      >
        <div
          className={`relative w-full rounded-full bg-white/10 transition-[height] duration-[160ms] ease-out motion-reduce:transition-none group-hover:h-[5px] group-focus-within:h-[5px] ${
            isDragging ? 'h-[5px]' : 'h-[3px]'
          }`}
        >
          <span
            data-testid="featured-progress-fill"
            className="absolute inset-y-0 left-0 rounded-full bg-[#CD5633]"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
          <span
            data-testid="featured-progress-thumb"
            className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-[#CD5633] text-text-primary transition-[width,height,opacity] duration-[160ms] ease-out motion-reduce:transition-none group-hover:size-3 group-hover:opacity-100 group-focus-within:size-3 group-focus-within:opacity-100 ${
              isDragging ? 'size-3 opacity-100' : 'size-2.5 opacity-0'
            }`}
            style={{ left: `${Math.min(100, progress * 100)}%` }}
          />
        </div>

        <input
          ref={seekInputRef}
          data-testid="featured-seek"
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
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label={t('playbackProgress')}
          aria-valuetext={`${elapsedLabel}/${totalLabel}`}
        />
      </div>

      <span className="w-9 shrink-0 text-[10px] tabular-nums text-text-muted">{totalLabel}</span>
    </div>
  );
}

/**
 * Output level, worked and coloured the way the studio's control bar does it:
 * hovering the button brings up a vertical slider, clicking it mutes and
 * unmutes.
 *
 * Deliberately not separate from the studio's: the two pages drive their own
 * schedulers but share one audio backend, and the master volume belongs to that
 * backend. The two controls keep their own copy of the number and meet at the
 * engine — there is one master volume, but no way to read it back out.
 */
function VolumeControl() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(1);
  const lastNonzeroRef = useRef(1);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ right: number; bottom: number } | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openPopover = useCallback((element: HTMLElement) => {
    clearCloseTimer();
    const rect = element.getBoundingClientRect();
    setAnchor({
      right: window.innerWidth - rect.right - 6,
      bottom: window.innerHeight - rect.top + 8,
    });
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 150);
  }, [clearCloseTimer]);

  const setMasterVolume = useCallback((next: number) => {
    if (next > 0) lastNonzeroRef.current = next;
    setVolume(next);
    void strudelService.setMasterVolume(next).catch(() => {});
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          clearCloseTimer();
          setMasterVolume(volume > 0 ? 0 : lastNonzeroRef.current);
        }}
        onMouseEnter={(event) => openPopover(event.currentTarget)}
        onMouseLeave={scheduleClose}
        onFocus={(event) => openPopover(event.currentTarget)}
        onBlur={scheduleClose}
        data-testid="featured-bar-volume"
        aria-label={volume > 0 ? t('mute') : t('unmute')}
        aria-expanded={open}
        aria-pressed={volume === 0}
        className={BAR_ACTION_ICON}
      >
        {volume > 0 ? <VolumeIcon size={19} /> : <MutedVolumeIcon size={19} />}
      </button>

      {open && anchor && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          data-testid="featured-volume-popover"
          className="fixed z-50 flex w-[44px] flex-col items-center gap-1 rounded-[6px] border border-white/10 bg-settings-surface/95 px-2 py-2 shadow-[0_3px_10px_rgba(0,0,0,0.4)] backdrop-blur-xl"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          onFocusCapture={clearCloseTimer}
          onBlurCapture={scheduleClose}
          style={{ ...anchor, fontFamily: "'ABeeZee', monospace" }}
        >
          <span className="text-[10px] tabular-nums text-text-primary">
            {Math.round(volume * 100)}%
          </span>
          <input
            data-testid="featured-volume-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(event) => setMasterVolume(Number(event.target.value) / 100)}
            aria-label={t('volume')}
            aria-orientation="vertical"
            className="featured-volume-slider h-20 w-4 cursor-pointer"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              '--volume-progress': `${Math.round(volume * 100)}%`,
            } as React.CSSProperties}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

/** Where a hover label goes: centred over the control, sitting on top of it. */
function labelAnchor(element: HTMLElement): ControlHoverLabelAnchor {
  const rect = element.getBoundingClientRect();
  return { left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 8 };
}

/**
 * Taking the piece into the studio. The name is on a hover label rather than a
 * `title` attribute so it reads like the share button beside it — same shape,
 * same delay, same place on screen.
 */
function OpenInStudio({
  opening,
  onOpenInStudio,
}: {
  opening: boolean;
  onOpenInStudio: () => void;
}) {
  const [hoverAnchor, setHoverAnchor] = useState<ControlHoverLabelAnchor | null>(null);

  return (
    <div
      className="relative grid size-10 place-items-center"
      onMouseEnter={(event) => setHoverAnchor(labelAnchor(event.currentTarget))}
      onMouseLeave={() => setHoverAnchor(null)}
      onFocusCapture={(event) => setHoverAnchor(labelAnchor(event.currentTarget))}
      onBlurCapture={() => setHoverAnchor(null)}
    >
      <button
        type="button"
        onClick={onOpenInStudio}
        disabled={opening}
        aria-label={t('featuredOpenInStudio')}
        data-testid="featured-bar-open-in-studio"
        className={`${BAR_ACTION_ICON} ${BAR_ICON_DISABLED}`}
      >
        <SquareArrowOutUpRight size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>
      <ControlHoverLabel
        anchor={hoverAnchor}
        label={t('featuredOpenInStudio')}
        testId="featured-bar-open-in-studio-label"
      />
    </div>
  );
}

/**
 * Sharing the piece, on the studio's own share button so the link is made the
 * one way the app makes links. What goes into it is the session the piece would
 * open as — the receiver lands where "open in studio" would have put them.
 *
 * Rebuilt whenever the parked piece changes and not before: the draft carries a
 * fresh message id and timestamp, which are the only parts of it that are not
 * a function of the piece.
 */
function FeaturedShare({ piece }: { piece: FeaturedPiece }) {
  const draft = useMemo(() => featuredSessionDraft(piece), [piece]);

  return (
    <ShareButton
      session={null}
      title={draft.title}
      code={draft.code}
      messages={draft.messages}
      variant="icon"
      buttonClassName={`${BAR_ACTION_ICON} ${BAR_ICON_DISABLED}`}
      wrapperClassName="relative grid size-10 place-items-center"
    />
  );
}
