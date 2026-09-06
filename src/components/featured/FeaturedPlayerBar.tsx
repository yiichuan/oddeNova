import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, SkipBack, SkipForward, SquareArrowOutUpRight } from 'lucide-react';
import { MutedVolumeIcon, PauseIcon, PlayIcon, VolumeIcon } from '../icons';
import { ShareButton } from '../studio/TopActionBar';
import ControlHoverLabel from '../studio/ControlHoverLabel';
import type { ControlHoverLabelAnchor } from '../studio/control-hover-anchor';
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
import { FLIGHT_DURATION_MS } from './featured-cover-flight';

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
  /**
   * Open, as it stands on a piece: the full transport, its progress, and every
   * action. Closed, as it stands under the collection: a pill the height of a
   * nav button carrying the transport and the one action worth keeping.
   */
  expanded?: boolean;
}

/**
 * Every icon in the bar behaves the same under the pointer: a finger cursor and
 * a circle that fades in behind it. Tailwind's reset leaves buttons on the
 * default arrow, so `cursor-pointer` is part of the set rather than a stray fix.
 */
const BAR_ICON_BASE =
  'grid cursor-pointer place-items-center rounded-full text-icon-idle transition-colors hover:bg-[var(--featured-wash)] hover:text-text-primary';
const BAR_ICON_DISABLED =
  'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-icon-idle';
/** Flanking the play button, where they answer to it. */
const BAR_ICON = `${BAR_ICON_BASE} size-8`;
/**
 * The bar's right-hand actions: each is its own mark and nothing else. They
 * brighten rather than lighting a disc behind themselves, so each takes up
 * exactly the room its icon does and the spacing between them is the group's
 * own rather than the padding inside three buttons.
 *
 * The hit area is put back with a pseudo-element, which costs no layout: 18px
 * is a mark, not a target. It reaches half-way into the gaps either side and no
 * further, so it never takes a click meant for the action next to it.
 */
const BAR_BARE_ICON =
  'relative grid cursor-pointer place-items-center text-icon-idle transition-colors hover:text-text-primary after:absolute after:-inset-2';

/** 12px of padding, a 44px transport, 12px, a 16px progress row, 12px, and two
 *  hairlines. The piece's view reserves exactly this much beneath itself. */
const EXPANDED_HEIGHT = 98;
/**
 * The account lobe the nav settles into on this page: a 40px row inside 12px of
 * inset either side of it. Matching it makes the two glass shapes at the foot
 * of the page the same object seen twice — and it leaves the bar's own contents
 * their full size, since 12px of padding around a 40px row is exactly what the
 * cover and the transport already stand in.
 */
const COMPACT_HEIGHT = 64;
/** The inset the cover keeps from the left edge, and the action from the right:
 *  one number, so the two ends of the closed bar are the same. */
const COMPACT_PADDING = 12;
/** The transport's clearance on both sides — from the credits on its left, and
 *  from the action on its right. One number again, for the same reason, and a
 *  good deal wider than the 8px the transport's own three buttons sit at, so
 *  they read as one group rather than as five things in a row — twice the
 *  inset the bar keeps at its two ends. */
const COMPACT_GAP = 24;
/** The transport's three buttons and the two gaps between them. */
const COMPACT_TRANSPORT_WIDTH = 124;
/* Each right-hand action is as wide as its own mark. */
const BAR_VOLUME_WIDTH = 19;
const BAR_STUDIO_WIDTH = 18;
const BAR_SHARE_WIDTH = 18;
/** The same clearance the transport keeps: without a disc around each of them,
 *  three bare marks need the room to read as three things. */
const BAR_ACTION_GAP = 24;
/** The volume slider's own width, which the popover is anchored by. */
const VOLUME_POPOVER_WIDTH = 44;
/** The corner source mark, which stands alone and answers to nothing beside it,
 *  so it is drawn a size up from the marks that stand in a row inside the bar. */
const SOURCE_MARK_SIZE = 28;
const BAR_COVER_SIZE = 40;
/** Between the cover and the credits beside it — `gap-3` on the group. */
const BAR_SUMMARY_GAP = 12;
/** Stands in until the credits have been measured, which is before the first
 *  paint; only a page mounted behind `display: none` ever shows it. */
const FALLBACK_CREDITS_WIDTH = 150;

const TITLE_LINE = 'block text-sm text-text-primary';
const CREDIT_LINE = 'block text-[11px] text-text-muted';

/**
 * The bar changes shape over exactly the time the cover takes to fly between
 * the two views, on the same curve — one movement happening in two places.
 */
const MORPH = {
  transitionDuration: `${FLIGHT_DURATION_MS}ms`,
  transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

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
  expanded = false,
}: FeaturedPlayerBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const creditsRef = useRef<HTMLSpanElement>(null);
  const [creditsWidth, setCreditsWidth] = useState<number | null>(null);
  const [galleryOffset, setGalleryOffset] = useState(0);
  const [volume, setVolume] = useState(1);
  const lastAudibleRef = useRef(1);

  /* One master volume, and no way to read it back out of the engine, so the
     page keeps the number itself. Both of the controls that answer to it are
     held here — the mark in the corner and the slider the bar unfolds over a
     piece — or the two would disagree the moment either was used. */
  const setMasterVolume = useCallback((next: number) => {
    if (next > 0) lastAudibleRef.current = next;
    setVolume(next);
    void strudelService.setMasterVolume(next).catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    setMasterVolume(volume > 0 ? 0 : lastAudibleRef.current);
  }, [setMasterVolume, volume]);

  /* Closed, the bar is cut to its contents: the credits are laid out once at
     their natural width and the bar is built outwards from that, so the title
     is never the thing that gives. Watched rather than read once — the page
     stays mounted behind `display: none`, where everything measures zero. */
  useLayoutEffect(() => {
    const node = creditsRef.current;
    if (!node) return undefined;

    const read = () => {
      const width = node.offsetWidth;
      if (width > 0) setCreditsWidth(width);
    };
    read();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [piece]);

  /* The sleeve on the stage is centred on the window, not on this column — the
     stage runs the full width of the page behind the nav. Closed, the bar lines
     up with the sleeve rather than with the column it lives in, so it carries
     the difference between the two centres. */
  useLayoutEffect(() => {
    const column = barRef.current?.parentElement;
    if (!column) return undefined;

    const read = () => {
      const rect = column.getBoundingClientRect();
      if (rect.width <= 0) return;
      setGalleryOffset(window.innerWidth / 2 - (rect.left + rect.width / 2));
    };
    read();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  const transportDisabled = !piece || (!engineReady && !isPlaying);
  /* The credits column at its natural width, and the bar built out from it:
     an inset, the credits, the transport with matching clearance either side,
     one action, and the same inset again. */
  const summaryWidth = (creditsWidth ?? FALLBACK_CREDITS_WIDTH)
    + (piece ? BAR_COVER_SIZE + BAR_SUMMARY_GAP : 0);
  const compactWidth = 2
    + COMPACT_PADDING * 2
    + summaryWidth
    + COMPACT_GAP * 2
    + COMPACT_TRANSPORT_WIDTH
    + BAR_STUDIO_WIDTH;
  /* Both side columns are cut to what stands in them, so the transport's two
     clearances are the one grid gap. Written as a share of the flexible space
     rather than as a length: two column templates only move between each other
     if every track keeps its type. */
  const compactActionFr = BAR_STUDIO_WIDTH / summaryWidth;

  return (
    <>
    {/* Centred on the page and given both its measurements, rather than pinned
        to the column's two edges: a bar that changes size has to have a size to
        change between, and `auto` interpolates to nothing. */}
    <div
      ref={barRef}
      data-testid="featured-player-bar"
      data-expanded={expanded}
      // No clipping on the bar itself: each part that collapses already clips
      // its own contents, and the share and volume popovers open out of it.
      // `featured-bar-glass` is the hook the light theme re-materialises this
      // surface off, and the hook the nav's grey edge is drawn on as a masked
      // ring — the border here is transparent and only holds the width open.
      // See index.css.
      className="featured-bar-glass absolute bottom-0 left-1/2 z-20 rounded-[14px] border border-transparent bg-settings-surface/55 backdrop-blur-2xl backdrop-saturate-150 transition-[width,height,padding,transform,box-shadow] motion-reduce:transition-none"
      style={{
        ...MORPH,
        height: expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT,
        padding: expanded ? '12px 16px' : `${COMPACT_PADDING}px`,
        // Half its own width back, plus whatever it takes to sit under the
        // sleeve rather than under the middle of the column.
        transform: `translateX(calc(-50% + ${expanded ? 0 : galleryOffset}px))`,
        width: expanded ? 'calc(100% - 32px)' : compactWidth,
      }}
    >
      {/* The credits again, at the width they would like to be. Never seen and
          never in the way — it is only here to be measured. */}
      <span
        ref={creditsRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-max"
      >
        {piece ? (
          <>
            <span className={`${TITLE_LINE} whitespace-nowrap`}>{piece.title}</span>
            <span className={`${CREDIT_LINE} whitespace-nowrap`}>
              {piece.originalArtist} · {t('featuredCodedBy')} {piece.coder}
            </span>
          </>
        ) : (
          <span className="whitespace-nowrap text-xs text-text-muted">
            {t('featuredNothingPlaying')}
          </span>
        )}
      </span>
      {/* Open, the transport is centred on the page and the two side columns
          share what is left. Closed, the right-hand column shrinks to the one
          button still in it and the transport comes across to meet it, which is
          what leaves the title room to be read. */}
      <div
        className="grid h-full w-full items-center transition-[gap,grid-template-columns] motion-reduce:transition-none"
        style={{
          ...MORPH,
          gap: expanded ? 16 : COMPACT_GAP,
          gridTemplateColumns: expanded
            ? 'minmax(0, 1fr) auto 1fr'
            : `minmax(0, 1fr) auto ${compactActionFr}fr`,
        }}
      >
        {/* Left — what is loaded. */}
        {/* Nothing here is resized between the two states: the closed bar is
            built around the same 40px row the open one is, so the cover and its
            credits only ever move. */}
        <div className="flex min-w-0 items-center gap-3">
          {piece ? (
            <>
              <FeaturedCover piece={piece} className="size-10 shrink-0 rounded-[5px]" />
              <span className="min-w-0">
                <span className={`${TITLE_LINE} truncate`}>{piece.title}</span>
                <span className={`${CREDIT_LINE} truncate`}>
                  {piece.originalArtist} · {t('featuredCodedBy')} {piece.coder}
                </span>
              </span>
            </>
          ) : (
            <span className="text-xs text-text-muted">{t('featuredNothingPlaying')}</span>
          )}
        </div>

        {/* Middle — transport, with the progress read-out under it. */}
        {/* Open, the track is wide enough that a seek has somewhere to land: at
            560px it is ~470 after the two time read-outs, so a second of a
            three-minute loop is still a few pixels of travel. Closed, the
            column is only as wide as the three buttons at their own scale. */}
        <div
          className="flex flex-col items-center transition-[width,gap] motion-reduce:transition-none"
          style={{
            ...MORPH,
            gap: expanded ? 12 : 0,
            width: expanded ? 'min(560px, 50vw)' : COMPACT_TRANSPORT_WIDTH,
          }}
        >
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
              className="featured-transport-play grid size-11 cursor-pointer place-items-center rounded-full bg-accent text-text-primary transition duration-200 hover:bg-[#525252] disabled:cursor-not-allowed disabled:opacity-40"
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

          {/* Opens from its middle outwards as the column makes room for it,
              which is the same movement that lifts the transport clear of it —
              rather than a track appearing under a bar that has already
              finished moving.

              Keyed on the piece so a switch starts its playhead at zero rather
              than inheriting the last one's position. */}
          <div
            inert={expanded ? undefined : true}
            className="w-full overflow-hidden transition-[height,opacity,transform] motion-reduce:transition-none"
            style={{
              ...MORPH,
              height: expanded ? 16 : 0,
              opacity: expanded ? 1 : 0,
              transform: `scaleX(${expanded ? 1 : 0})`,
            }}
          >
            <PlaybackProgress
              key={piece?.id ?? 'none'}
              piece={piece}
              isPlaying={isPlaying}
              isPaused={isPaused}
            />
          </div>
        </div>

        {/* Right — what you can do with the piece. Volume sits outside the
            piece check: it is the page's output level, not the piece's.

            Both actions carry the piece into the studio — one for you, one for
            whoever you send it to — so they are built from the same draft and
            land on the same session.

            Closed, only the studio is left: it is the one of the three that is
            about this record rather than about this sitting. The other two
            collapse into the edge they came from. */}
        <div className="flex items-center justify-end">
          <div
            className="flex items-center transition-[gap] motion-reduce:transition-none"
            style={{ ...MORPH, gap: expanded ? BAR_ACTION_GAP : 0 }}
          >
            <BarActionSlot shown={expanded} width={BAR_VOLUME_WIDTH}>
              <VolumeControl
                volume={volume}
                onVolumeChange={setMasterVolume}
                onToggleMute={toggleMute}
              />
            </BarActionSlot>
            {piece && (
              <>
                <OpenInStudio opening={opening} onOpenInStudio={onOpenInStudio} />
                <BarActionSlot shown={expanded} width={BAR_SHARE_WIDTH}>
                  <FeaturedShare piece={piece} />
                </BarActionSlot>
              </>
            )}
          </div>
        </div>
      </div>
    </div>

    <SourceNote shown={!expanded} />
    </>
  );
}

/**
 * Where the collection says where it comes from: a mark in the corner, and the
 * note itself only when it is asked for.

 * The sentence is true of every record on the shelf and interesting about none
 * of them, so it sits under a mark rather than under the title — there when you
 * wonder, out of the way when you don't. It reads leftwards out of the corner
 * it is anchored in, which is the only direction it has room to grow.
 *
 * It stands in the corner opposite the collection's title, in the same colour,
 * so the two ends of the page answer each other. While a piece is open it goes
 * quietly out: the note is about the shelf, not about the record in your hands.
 */
function SourceNote({ shown }: { shown: boolean }) {
  return (
    <div
      inert={shown ? undefined : true}
      // z-20 puts it in the same band as the bar. Below that it would still be
      // drawn — the page's own column is transparent — but every click would
      // land on that column instead of on this.
      className="absolute bottom-0 right-4 z-20 flex flex-row-reverse items-center transition-opacity motion-reduce:transition-none"
      style={{
        ...MORPH,
        height: COMPACT_HEIGHT,
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? undefined : 'none',
      }}
    >
      {/* Drawn before the note so that the note can be its CSS sibling and come
          up on hover without a line of state; `flex-row-reverse` puts it back
          on the right, where the corner is. */}
      <button
        type="button"
        aria-label={t('featuredIntroLabel')}
        aria-describedby="featured-source-note"
        data-testid="featured-source-note"
        className="peer relative grid cursor-help place-items-center text-text-primary transition-opacity hover:opacity-70 motion-reduce:transition-none after:absolute after:-inset-3"
      >
        <Info
          className="featured-source-mark"
          size={SOURCE_MARK_SIZE}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>

      {/* Never a hit target of its own: it is as wide as a sentence, and the
          shelf behind it has to stay reachable through it. */}
      <p
        id="featured-source-note"
        role="tooltip"
        data-testid="featured-source-note-text"
        className="pointer-events-none mr-1 max-w-[22rem] text-right text-[11px] leading-4 text-text-muted opacity-0 transition-opacity duration-200 ease-out peer-hover:opacity-100 peer-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        {t('featuredIntro')}
      </p>
    </div>
  );
}

/**
 * An action that is only in the bar when the bar is open. It collapses to no
 * width rather than unmounting, so it slides out from behind the action beside
 * it instead of appearing on top of it — and is inert on the way out, so a tab
 * key cannot reach a control that is no longer there.
 */
function BarActionSlot({
  shown,
  width,
  children,
}: {
  shown: boolean;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div
      inert={shown ? undefined : true}
      className="shrink-0 overflow-hidden transition-[width,opacity] motion-reduce:transition-none"
      style={{ ...MORPH, opacity: shown ? 1 : 0, width: shown ? width : 0 }}
    >
      {children}
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
          className={`featured-progress-track relative w-full rounded-full bg-white/10 transition-[height] duration-[160ms] ease-out motion-reduce:transition-none group-hover:h-[5px] group-focus-within:h-[5px] ${
            isDragging ? 'h-[5px]' : 'h-[3px]'
          }`}
        >
          <span
            data-testid="featured-progress-fill"
            className="absolute inset-y-0 left-0 rounded-full bg-playback-accent"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
          <span
            data-testid="featured-progress-thumb"
            className={`featured-progress-thumb pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-playback-accent text-text-primary transition-[width,height,opacity] duration-[160ms] ease-out motion-reduce:transition-none group-hover:size-3 group-hover:opacity-100 group-focus-within:size-3 group-focus-within:opacity-100 ${
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
 * backend. Each page keeps its own copy of the number and they meet at the
 * engine — there is one master volume, but no way to read it back out. Within
 * this page the copy is held once, above both controls that answer to it.
 */
function VolumeControl({
  volume,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
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
      // Centred on the mark: the slider's own half-width out from the mark's
      // centre. It used to be tucked under the right edge of a 40px button,
      // which was near enough to centred while the button was nearly as wide as
      // the slider; a 19px mark is not.
      right: window.innerWidth - rect.right + (rect.width - VOLUME_POPOVER_WIDTH) / 2,
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
          onToggleMute();
        }}
        onMouseEnter={(event) => openPopover(event.currentTarget)}
        onMouseLeave={scheduleClose}
        onFocus={(event) => openPopover(event.currentTarget)}
        onBlur={scheduleClose}
        data-testid="featured-bar-volume"
        aria-label={volume > 0 ? t('mute') : t('unmute')}
        aria-expanded={open}
        aria-pressed={volume === 0}
        className={BAR_BARE_ICON}
      >
        {volume > 0 ? <VolumeIcon size={19} /> : <MutedVolumeIcon size={19} />}
      </button>

      {open && anchor && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          data-testid="featured-volume-popover"
          className="featured-volume-popover fixed z-50 flex flex-col items-center gap-1 rounded-[6px] border border-white/10 bg-settings-surface/95 px-2 py-2 shadow-[0_3px_10px_rgba(0,0,0,0.4)] backdrop-blur-xl"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          onFocusCapture={clearCloseTimer}
          onBlurCapture={scheduleClose}
          style={{ ...anchor, fontFamily: "'ABeeZee', monospace", width: VOLUME_POPOVER_WIDTH }}
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
            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
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
      className="relative grid place-items-center"
      onMouseEnter={(event) => setHoverAnchor(labelAnchor(event.currentTarget))}
      onMouseLeave={() => setHoverAnchor(null)}
      onFocusCapture={(event) => setHoverAnchor(labelAnchor(event.currentTarget))}
      onBlurCapture={() => setHoverAnchor(null)}
    >
      <button
        type="button"
        onClick={onOpenInStudio}
        disabled={opening}
        aria-label={t('openInStudio')}
        data-testid="featured-bar-open-in-studio"
        className={`${BAR_BARE_ICON} ${BAR_ICON_DISABLED}`}
      >
        <SquareArrowOutUpRight size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>
      <ControlHoverLabel
        anchor={hoverAnchor}
        label={t('openInStudio')}
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
      buttonClassName={`${BAR_BARE_ICON} ${BAR_ICON_DISABLED}`}
      wrapperClassName="relative grid place-items-center"
    />
  );
}
