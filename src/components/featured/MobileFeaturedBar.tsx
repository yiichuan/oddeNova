import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SkipBack, SkipForward } from 'lucide-react';
import { PauseIcon, PlayIcon } from '../icons';
import { t } from '../../lib/i18n';
import {
  formatPlaybackTime,
  getStrudelLoopCycles,
  getStrudelLoopDurationSeconds,
} from '../../lib/strudel-timing';
import { featuredPlayer } from '../../services/featured-player';
import { readPlayheadProgress, seekPlayhead, syncPlayhead } from './featured-playhead';
import type { FeaturedPiece } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';
import { coverFlightSupported, FLIGHT_DURATION_MS } from './featured-cover-flight';
import {
  lapCapsule,
  lapDash,
  lapShape,
  MORPH_EASING,
  UNWRAP_SHARE,
} from './featured-lap-morph';

/** The two side keys: a mark, and enough room around it to be aimed at. */
const SKIP_KEY = 'grid size-7 shrink-0 place-items-center text-text-primary'
  + ' transition-opacity active:opacity-60 disabled:opacity-30';

/** How thick the pill's edge is drawn, in px — the band and the played arc over
    it both. A hair more than the 1px it is laid on: an edge that is also a
    read-out has to hold a colour, where a rim only had to separate two
    surfaces. */
const RING_WIDTH = 1.5;

/** The transparent border the lap is hung on, in px. The pill carries a 1px
    border of nothing and the overlay is pulled back out over it, so the lap is
    drawn on that band — the pixel just inside the edge the eye reads as the
    pill's, which is where a rim would have been. */
const RING_BORDER = 1;

/**
 * How wide the transport stands on each of the two pages, as a share of the room
 * it is given.
 *
 * Two thirds on the shelf: a shape that reads as one control floating over a
 * room rather than as a bar fixed to the foot of the screen, with the page
 * showing either side of it. The whole width inside a record, where there is no
 * room behind it to show and the space is better spent on the credits — see the
 * morph below. The room it is given is the reading's own measure, so the whole
 * width is the width of the panels above it.
 */
const SHELF_WIDTH = '66.6667%';
const RECORD_WIDTH = '100%';

/**
 * The air inside the capsule, in px — and what it comes to inside a record.
 *
 * The left inset is the same as the one above and below, which is not a spacing
 * choice but the whole geometry of the shape: the capsule's left cap is a
 * semicircle of half its height, so a disc of the artwork's diameter sits
 * concentric with that cap exactly when the air around it is equal on all three
 * sides. Any other left inset puts two circles a few pixels apart, which is the
 * one misalignment the eye always finds. The right side is free to be wider —
 * the keys there are square.
 *
 * Inside a record there is no capsule to sit inside: the transport stands on the
 * page under the reading, so its ends are the reading's ends, and the artwork
 * begins on the same line the panels above it begin on.
 */
const PAD_LEFT = 6;
const PAD_RIGHT = 12;

/**
 * The played part of the loop, drawn straight, in px — the height of the band
 * and the room between it and the keys under it.
 *
 * Three pixels: thick enough to be seen at arm's length against the wash and
 * thin enough that what it says is "how far in", not "here is a control". No
 * clock either side of it. A Strudel pattern loops rather than ends, so a
 * running total counts up to a number that means nothing, and the one thing
 * worth reading — where in the bar the lap is — the band already says.
 */
const TRACK_HEIGHT = 3;
const TRACK_GAP = 12;

/**
 * How far above the pill the lap has to be able to draw, in px: the band's own
 * height and the air under it. The overlay the lap is drawn in reaches this far
 * past the top of the pill and carries a viewBox to match, so the trip from the
 * pill's edge to the band's place is inside the picture rather than relying on
 * an SVG being allowed to spill out of its own box.
 */
const LAP_ROOM = TRACK_GAP + TRACK_HEIGHT;

/**
 * The two halves of the flight, in ms: the lap coming unwrapped, and everything
 * else settling. See `lapShape` for where the share comes from.
 */
const UNWRAP_MS = Math.round(FLIGHT_DURATION_MS * UNWRAP_SHARE);
const SETTLE_MS = FLIGHT_DURATION_MS - UNWRAP_MS;

/**
 * When the pill's own change happens, and how long it takes.
 *
 * One thing at a time, in the order the eye can follow it: the racetrack comes
 * unwrapped into a straight line first, over a pill that is holding perfectly
 * still, and only then does the pill change — its width, the air inside it and
 * the glass it is made of — with the line it has just become moving up and
 * widening alongside. A pill that widened while the loop was still coming apart
 * would be a shape changing under a shape changing, and neither would be read.
 *
 * Going back it is the other way round, which is the same rule rather than a
 * second one: the pill closes up first and the line wraps back on to it after.
 * The delay is asked of the state being moved to, so a trip out waits and a trip
 * home does not.
 *
 * The whole move still takes the cover's own flight, end to end. The curve is
 * the lap's rather than the cover's: eased at both ends, so the pill starts
 * moving from the rest the unwrap has just come to instead of snatching the beat
 * off it. See MORPH_EASING.
 */
const morphTiming = (expanded: boolean) => ({
  transitionDuration: `${SETTLE_MS}ms`,
  transitionDelay: expanded ? `${UNWRAP_MS}ms` : '0ms',
  transitionTimingFunction: MORPH_EASING,
});

interface MobileFeaturedBarProps {
  /** The piece the bar is parked on — the record the column is stopped at. */
  piece: FeaturedPiece | null;
  isPlaying: boolean;
  /** Held rather than stopped: the arc stays where it is instead of rewinding. */
  isPaused: boolean;
  engineReady: boolean;
  onPlay: () => void;
  onPause: () => void;
  /** Left undefined when there is nowhere to skip to — a collection of one. */
  onPrev?: () => void;
  onNext?: () => void;
  /**
   * Whether a record is open. The pill takes the whole width there and spends
   * it on the credits, which is the one thing it has no room for on the shelf.
   */
  expanded?: boolean;
}

/**
 * The Featured transport on a phone: one capsule at the foot of the page,
 * holding what is loaded and the three keys that move it.
 *
 * A phone's shelf has no room for the desktop bar's three columns, and folding
 * them into three stacked rows only turned the foot of the page into a panel.
 * What is actually needed down here is small: which record is loaded, and the
 * transport. So they stand side by side in a single pill about two thirds of
 * the page across — a shape that reads as one control rather than as a bar, and
 * that leaves the page either side of it showing the room it is standing in.
 *
 * The artwork is cropped round. A square sleeve is what the shelf above is made
 * of and repeating it here at thumbnail size would read as a seventh record;
 * a disc is the same artwork saying "this is the one playing" instead.
 *
 * None of the three keys carries a plate, and all three are in the page's own
 * ink. Inside a pill this narrow the play key has nothing to be told apart
 * from — there are three marks in a row and no other furniture — so it is set a
 * size up from the two beside it, and that is enough to say which one it is.
 * Greying the skips to say the same thing only made them read as unavailable.
 *
 * How far in the loop is shows in whichever way the page it is on has room for.
 * On the shelf the pill has none — the page behind it is the collection — so the
 * played part is drawn round the pill's own outline in the accent, from the top
 * clockwise: it costs no height, it is the shape the control already has, and a
 * line that closes on itself is the right picture of a pattern that loops rather
 * than ends. Inside a record there is height to spare and a measure to keep to,
 * so the same lap is drawn straight, across the width of the panels above it.
 *
 * And inside a record the capsule itself goes. Its job on the shelf is to lift
 * the transport off a page of moving artwork; under a reading there is nothing
 * to be lifted off, and a filled shape at the foot of a column of glass panels
 * reads as a fourth panel that happens to hold keys. What is left is the artwork,
 * the credits, the three marks and the lap — standing on the page, on the
 * reading's own measure.
 */
export default function MobileFeaturedBar({
  piece,
  isPlaying,
  isPaused,
  engineReady,
  onPlay,
  onPause,
  onPrev,
  onNext,
  expanded = false,
}: MobileFeaturedBarProps) {
  const transportDisabled = !piece || (!engineReady && !isPlaying);
  const barRef = useRef<HTMLDivElement>(null);
  const box = useBarBox(barRef);
  /* The clock is wound here and read in the two leaves below, so the bar itself
     renders when the record or the room changes and the frame-by-frame state
     stays where it is drawn. Only the lap that is showing asks for frames: the
     ring stops being given them the moment a record opens, and the band is not
     given any until one has. */
  const { pieceId, totalSeconds, loopCycles } = useLoopClock(piece, isPlaying, isPaused);
  const playing = isPlaying && totalSeconds > 0;
  /* Where the lap is between the pill's outline and the band above it. The two
     are one lap and never both on the page: everything up to the moment it
     lands is drawn in the overlay, and the band takes over on arrival, which is
     also where it becomes something that can be dragged. */
  const morph = useLapMorph(expanded);
  const landed = morph >= 1;

  return (
    /* Two things stacked, both on the transport's own width: the lap, and the
       control. The wrapper takes no presses — what floats over the shelf is the
       pill, and everything around it lets a drag through to the wheel. */
    <div className="pointer-events-none flex flex-col">
      <BarProgressTrack
        pieceId={pieceId}
        totalSeconds={totalSeconds}
        loopCycles={loopCycles}
        playing={playing}
        expanded={expanded}
        landed={landed}
      />

      <div
        ref={barRef}
        data-testid="featured-bar-mobile"
        data-expanded={expanded}
        /* `pointer-events-auto`: the pill floats over the shelf, and the page it
           floats over is a drag surface. Everything around the pill lets that
           drag through (see the transport's wrapper on the featured page); the
           pill itself is the one thing up here that answers a press. */
        /* Its two widths are both shares of the room it is given, so the one
           interpolates into the other: a bar that changes size has to have a
           size to change between, and there is nothing to move from between a
           percentage and a length. The floor is for the narrowest phones, where
           two thirds is not enough page to hold a disc, two lines and three
           keys; it clamps the shelf's width without standing in the way of the
           trip out to the record's. The air inside it goes the same way over the
           same time, so the artwork arrives on the reading's left-hand line
           rather than stepping onto it at the end. Both wait for the lap — see
           morphTiming. */
        className="pointer-events-auto relative mx-auto flex min-w-[240px] max-w-full items-center gap-2 rounded-full border border-transparent py-1.5 transition-[width,padding] motion-reduce:transition-none"
        style={{
          ...morphTiming(expanded),
          width: expanded ? RECORD_WIDTH : SHELF_WIDTH,
          paddingLeft: expanded ? 0 : PAD_LEFT,
          paddingRight: expanded ? 0 : PAD_RIGHT,
        }}
      >
        {piece ? (
          <>
            <FeaturedCover piece={piece} className="relative size-9 shrink-0 rounded-full" />
            <span className="relative min-w-0 flex-1 pl-0.5">
              <span className="block truncate text-[12px] leading-tight text-text-primary">
                {piece.title}
              </span>
              {/* The second credit is written whichever width the pill is at and
                  clipped by the line it is on, so what the extra room buys is
                  simply more of the sentence rather than a different one: the
                  coder's name is already there, waiting behind the truncation,
                  and the pill widening is what uncovers it. Faded in with that
                  widening rather than appearing at the end of it — an ellipsis
                  turning into a name mid-travel reads as a glitch. */}
              <span className="block truncate text-[10px] leading-tight text-text-muted">
                {piece.originalArtist}
                <span
                  className="transition-opacity motion-reduce:transition-none"
                  style={{ ...morphTiming(expanded), opacity: expanded ? 1 : 0 }}
                >
                  {` · ${t('featuredCodedBy')} ${piece.coder}`}
                </span>
              </span>
            </span>
          </>
        ) : (
          <span className="relative min-w-0 flex-1 truncate pl-3 text-[11px] text-text-muted">
            {t('featuredNothingPlaying')}
          </span>
        )}

        {/* The transport, as one group: the three marks stand close enough
            together to be read as a single control and far enough apart to be
            hit one at a time. */}
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            aria-label={t('featuredPrevPiece')}
            data-testid="featured-bar-mobile-prev"
            className={SKIP_KEY}
          >
            <SkipBack size={16} strokeWidth={1.8} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={isPlaying ? onPause : onPlay}
            disabled={transportDisabled}
            title={!engineReady && !isPlaying ? t('engineStarting') : undefined}
            aria-label={isPlaying ? t('pause') : t('play')}
            data-testid="featured-bar-mobile-play"
            className="grid size-9 shrink-0 place-items-center text-text-primary transition-opacity active:opacity-60 disabled:opacity-30"
          >
            {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={22} />}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label={t('featuredNextPiece')}
            data-testid="featured-bar-mobile-next"
            className={SKIP_KEY}
          >
            <SkipForward size={16} strokeWidth={1.8} fill="currentColor" aria-hidden="true" />
          </button>
        </div>

        <BarProgressLap
          box={box}
          pieceId={pieceId}
          totalSeconds={totalSeconds}
          playing={playing}
          morph={morph}
        />

        {/* ── The capsule ── */}
        {/* The desktop bar's own glass — the same fill in both palettes, the same
            blur, the same paper shadow — drawn as a pill, and drawn as a layer of
            its own rather than on the box itself so that a record can take it
            away over the length of the flight instead of switching it off at one
            end of it.

            `data-edge="lap"` is what keeps its rim off: the pill's edge is the
            played loop, drawn by the overlay above, and a glass ring under that
            would be a second hairline a pixel off the first. The pill's border
            is transparent and only keeps the width the lap is drawn on, and this
            layer sits inside it. See index.css.

            Behind the marks rather than over them: laid out last so the lap over
            the edge is drawn over it, and dropped a layer so the artwork and the
            credits are not. */}
        <span
          aria-hidden="true"
          data-edge="lap"
          className="featured-bar-glass absolute inset-0 -z-10 rounded-full bg-settings-surface/55 backdrop-blur-2xl backdrop-saturate-150 transition-opacity motion-reduce:transition-none"
          style={{ ...morphTiming(expanded), opacity: expanded ? 0 : 1 }}
        />
      </div>
    </div>
  );
}

/**
 * The clock the two laps are read off.
 *
 * The playhead is run against a known loop length rather than polled off the
 * scheduler, the same way the desktop bar's track runs it: one rAF is cheaper
 * and steadier than asking the engine where it is sixty times a second. Where it
 * stands is `featured-playhead`'s to keep and not this component's, so the lap
 * survives the pill being unmounted and drawn again.
 *
 * Winding it and reading it are two jobs, kept apart: this one belongs to the
 * bar, which is the only thing that knows what the transport is doing, and it
 * holds no frame-by-frame state of its own — so a running record does not
 * re-render the whole pill sixty times a second on the way past.
 */
function useLoopClock(piece: FeaturedPiece | null, isPlaying: boolean, isPaused: boolean) {
  const totalSeconds = useMemo(
    () => (piece ? getStrudelLoopDurationSeconds(piece.code) : 0),
    [piece],
  );
  /* The loop in the engine's own unit. Seconds are what a lap is drawn in and
     cycles are what a scheduler is moved in, so a seek needs both — see
     `featuredPlayer.seek`. */
  const loopCycles = useMemo(() => (piece ? getStrudelLoopCycles(piece.code) : 0), [piece]);
  const pieceId = piece?.id ?? null;

  useEffect(() => {
    syncPlayhead(pieceId, isPlaying, isPaused, totalSeconds);
  }, [isPaused, isPlaying, pieceId, totalSeconds]);

  return { pieceId, totalSeconds, loopCycles };
}

/**
 * How far through the loop the record is, frame by frame, wherever it is being
 * drawn. Nothing seeks from a phone, so this end of it only reads.
 *
 * Two things it needs to know, and they are not the same thing. `playing` is
 * whether there will be anything new to show next frame; `watching` is whether
 * this drawing of the lap is the one on the page — the shelf's ring and the
 * record's band are both mounted the whole time, and only the one being looked
 * at is worth animating.
 *
 * Both are read again from the start whenever either changes, and that is the
 * point rather than a detail: a lap coming on to the page has to take the clock
 * as it finds it. A record held halfway through and then opened is exactly that
 * — nothing is playing, so no frame would otherwise be asked for, and the band
 * would come up at whatever it last read, which is the top of the loop.
 */
function useLoopProgress(
  pieceId: string | null,
  totalSeconds: number,
  playing: boolean,
  watching: boolean,
  /** Bumped by a seek: a lap that is not being given frames still has to redraw
      where the drag put it. */
  epoch = 0,
) {
  // Read straight off the shared clock, so a lap mounting into a record that is
  // already playing — the one drawn after a drag across the breakpoint — starts
  // where it actually stands rather than at zero.
  const [progress, setProgress] = useState(() => readPlayheadProgress(pieceId, totalSeconds));

  useEffect(() => {
    let frame = 0;
    // One frame is enough for a lap that is not moving: the tick asks for
    // another only while there is something for the next one to show.
    const tick = () => {
      setProgress(readPlayheadProgress(pieceId, totalSeconds));
      if (playing && watching) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [epoch, pieceId, playing, totalSeconds, watching]);

  return progress;
}

/**
 * How far the lap has got between the two shapes it is drawn in, 0 on the shelf
 * and 1 at the band.
 *
 * Run here rather than in CSS because what moves is neither a length nor a
 * colour: it is a window on to a path, and no two frames of it are the same
 * shape. The time and the distance are the cover's — one flight, one lap, the
 * same length of trip — and the curve is not applied here at all: this counts
 * plain time, and each half of the move eases its own share of it, see
 * `lapShape`.
 *
 * A trip cut short by the other one starting keeps its speed rather than its
 * time, so turning straight back at the halfway point takes half as long as the
 * whole move rather than the same again. And where the page stands the flight
 * down — a reader who has asked for less motion — the lap is simply already
 * there, which is the same page arriving without the journey.
 */
function useLapMorph(expanded: boolean): number {
  // The page's own answer to whether this trip is worth taking, asked the same
  // way it asks: a reader who has turned motion down gets the lap already where
  // it is going, and the tween below never runs.
  const flies = coverFlightSupported();
  const [morph, setMorph] = useState(expanded ? 1 : 0);
  // The frame loop needs the value it is carrying on from, and reading it out
  // of state would make every frame of the trip a reason to start it again.
  const morphRef = useRef(morph);

  useEffect(() => {
    const target = expanded ? 1 : 0;
    const from = morphRef.current;
    if (!flies) {
      morphRef.current = target;
      return undefined;
    }
    if (from === target) return undefined;

    const distance = Math.abs(target - from);
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const travelled = Math.min(1, (now - startedAt) / (FLIGHT_DURATION_MS * distance));
      morphRef.current = from + (target - from) * travelled;
      setMorph(morphRef.current);
      if (travelled < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [expanded, flies]);

  return flies ? morph : (expanded ? 1 : 0);
}

/**
 * The lap, drawn straight: the reading's own measure, under the credits and over
 * the keys, filled from the left as far as the loop has played — and draggable,
 * the way the display's own band is.
 *
 * It is the record's answer to the ring, not an addition to it — the two are
 * never up at once — so it is on the page only inside a record, and it arrives
 * and leaves by growing out of and back into the line between the reading and
 * the transport, over the flight's own time. A band that appeared at full height
 * the moment the record opened would be a fourth thing moving in a view where
 * three already are.
 *
 * The thing being dragged is a range input laid over the band at nothing per
 * cent opacity — the display bar's own construction, for the display bar's own
 * reasons: it is a press, a drag and a tap-to-jump already written, it takes a
 * keyboard, and it tells a screen reader what it is without a word of ARIA
 * plumbing. What is different down here is the reach: a phone aims with a thumb,
 * so the input stands well above and below the three pixels it drives, and the
 * head is up the whole time a record is open rather than waiting for a hover
 * that a phone has no way of doing.
 *
 * A seek is two moves, both needed: the scheduler is put at the cycle the drag
 * lands on, and the clock this lap is read off is put at the matching second.
 * No clock is written either side of the band — a Strudel pattern loops rather
 * than ends, so a running total counts towards a number that means nothing — but
 * the two times are given to the input as its value in words, where a reader
 * that asks for them gets them and the page stays as quiet as it looks.
 */
function BarProgressTrack({
  pieceId,
  totalSeconds,
  loopCycles,
  playing,
  expanded,
  landed,
}: {
  pieceId: string | null;
  totalSeconds: number;
  loopCycles: number;
  playing: boolean;
  expanded: boolean;
  /** The band is the lap on the page only once it has landed — until then the
      overlay above the transport is still flying it in. */
  landed: boolean;
}) {
  /* What a drag has just done, counted rather than stored: the position itself
     stays in the shared clock, and this only says "read it again" to a lap that
     is between frames because nothing is playing. */
  const [seeks, setSeeks] = useState(0);
  const [dragging, setDragging] = useState(false);
  const seekRef = useRef<HTMLInputElement>(null);
  /* Whether the focus on the input was put there by a press rather than by a
     tab. Pressing an input focuses it and leaving the band does not unfocus it,
     so without this the head would stay up after the pointer had gone — and
     blurring on the way out regardless would take a keyboard's own focus with
     it. */
  const pressFocusedRef = useRef(false);
  const progress = useLoopProgress(pieceId, totalSeconds, playing, landed, seeks);
  const seekDisabled = pieceId === null || totalSeconds <= 0 || loopCycles <= 0;

  const seek = (next: number) => {
    if (seekDisabled) return;
    const normalized = Math.min(1, Math.max(0, next));
    seekPlayhead(pieceId, normalized, totalSeconds);
    featuredPlayer.seek(normalized, loopCycles);
    setSeeks((count) => count + 1);
  };

  const percent = Math.min(100, progress * 100);

  return (
    <div
      data-testid="featured-bar-mobile-track"
      className="group relative mx-auto transition-[width,height,margin,opacity] motion-reduce:transition-none"
      /* The end of a press, however it ended: a pointer leaving the band, and —
         since a touch point is taken off the page the moment it lifts — a
         finger letting go of it. Not while the drag is still on: a pointer that
         wanders off the three pixels mid-drag is still dragging them. */
      onPointerLeave={() => {
        if (dragging || !pressFocusedRef.current) return;
        seekRef.current?.blur();
        pressFocusedRef.current = false;
      }}
      style={{
        ...morphTiming(expanded),
        width: expanded ? RECORD_WIDTH : SHELF_WIDTH,
        height: expanded ? TRACK_HEIGHT : 0,
        marginBottom: expanded ? TRACK_GAP : 0,
        /* Shown on arrival and not a moment before — and switched rather than
           faded, because what it is taking over from is the same three pixels
           of the same two colours in the same place. The room it stands in is
           kept by the box, which grows with the flight either way: the lap has
           to have somewhere to land before it lands. */
        opacity: landed ? 1 : 0,
        transitionProperty: 'width, height, margin',
      }}
    >
      {/* The band and the head are the display bar's: the head down to the class
          name, which is where its ring's two palettes are already answered, and
          the band in the colour the lap flying in to become it is drawn in. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{ background: 'var(--featured-track)' }}
      >
        <span
          data-testid="featured-bar-mobile-played"
          className="absolute inset-y-0 left-0 rounded-full bg-playback-accent"
          style={{ width: `${percent}%` }}
        />
        {/* Only while the band is being worked: under a pointer, under a
            thumb, or under a keyboard. What the head is for is saying where a
            drag would land, and there is no drag to land until something is on
            it — the rest of the time the lap reads as a lap rather than as a
            control with a handle. It grows as it arrives, so the same press
            that puts it there also says it has been taken hold of. */}
        <span
          className={`featured-progress-thumb pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-playback-accent text-text-primary transition-[width,height,opacity] duration-[160ms] ease-out group-hover:size-3.5 group-hover:opacity-100 group-focus-within:size-3.5 group-focus-within:opacity-100 motion-reduce:transition-none ${
            dragging ? 'size-3.5 opacity-100' : 'size-2.5 opacity-0'
          }`}
          style={{ left: `${percent}%` }}
        />
      </div>

      {/* Only once the band is the thing on the page: an input at nothing per
          cent opacity is still an input, and one left over a band that is still
          arriving — or over a collapsed one on the shelf — would be a strip of
          the page that answers a drag with a seek. */}
      {landed && (
        <input
          ref={seekRef}
          data-testid="featured-bar-mobile-seek"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 1000)}
          disabled={seekDisabled}
          onChange={(event) => seek(Number(event.target.value) / 1000)}
          onPointerDown={() => {
            pressFocusedRef.current = true;
            setDragging(true);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => {
            pressFocusedRef.current = false;
            setDragging(false);
          }}
          onBlur={() => {
            pressFocusedRef.current = false;
            setDragging(false);
          }}
          /* A thumb's worth of reach either side of a three-pixel band. It takes
             presses where the rest of the transport's row does not, so it is
             turned back on by hand. */
          className="pointer-events-auto absolute -inset-y-2.5 left-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label={t('playbackProgress')}
          aria-valuetext={`${formatPlaybackTime(progress * totalSeconds)}/${formatPlaybackTime(totalSeconds)}`}
        />
      )}
    </div>
  );
}

/**
 * The lap, wherever it is between the two shapes it is drawn in.
 *
 * At rest on the shelf it is the pill's outline — the whole of it in the band's
 * own grey, and as far round as the loop has played in the accent. The pill
 * carries no other edge: what would have been a rim is this. It has to be the
 * outline and not a ring on top of it, which rules out
 * a conic gradient: a cone sweeps by angle, and on a shape seven times wider
 * than it is tall equal angles are wildly unequal lengths of edge — the head
 * would race along the top and then crawl round the cap. So the capsule is drawn
 * as a path and clipped by dash length instead, which advances at a steady speed
 * all the way round.
 *
 * That is also what lets it come apart on the way into a record without a second
 * drawing of anything: `pathLength={1}` makes the dash numbers a window on to
 * the path, whatever shape the path is and whatever size it is measured at, so
 * unwrapping the loop is a matter of moving both edges of that window (see
 * `lapShape`). The played part is the same window scaled by how much has been
 * heard, so it shrinks with the lap and stays the share of it that it was.
 *
 * Two paths, not one: the band the lap runs on, and the played part over it.
 *
 * The overlay reaches above the pill by the height of the band and the air under
 * it, and carries a viewBox that says so, so the last stretch of the trip is
 * inside the picture. Nothing of the pill's own box moves: the two ends of the
 * line simply come to rest where the band stands, and the band appears there.
 */
function BarProgressLap({
  box,
  pieceId,
  totalSeconds,
  playing,
  morph,
}: {
  box: BarBox;
  pieceId: string | null;
  totalSeconds: number;
  playing: boolean;
  morph: number;
}) {
  // Everywhere short of the band is this drawing's: the outline on the shelf,
  // and every frame of the trip in between.
  const progress = useLoopProgress(pieceId, totalSeconds, playing, morph < 1);
  const capsule = useMemo(
    () => lapCapsule(box.width, box.height, RING_BORDER),
    [box],
  );

  // Nothing to draw once the band below has it. Everywhere else there is always
  // something: the band the lap runs on is the pill's edge, played or not.
  if (!capsule || morph >= 1) return null;

  const lap = lapShape(capsule, morph, {
    gap: TRACK_GAP,
    thickness: TRACK_HEIGHT,
    ring: RING_WIDTH,
  });

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute"
      /* Pulled out over the pill's transparent border, the way the glass ring
         itself is: an absolute child is laid out against the padding box, so
         `-1px` is what reaches the box the pill is measured at. */
      style={{
        left: -RING_BORDER,
        right: -RING_BORDER,
        bottom: -RING_BORDER,
        top: -(RING_BORDER + LAP_ROOM),
      }}
    >
      <svg
        data-testid="featured-bar-mobile-progress"
        width={box.width}
        height={box.height + LAP_ROOM}
        viewBox={`0 ${-LAP_ROOM} ${box.width} ${box.height + LAP_ROOM}`}
        fill="none"
        className="block overflow-visible"
      >
        {/* The unplayed run, in the colour of whichever of the two shapes it is
            currently more of. On paper the outline on a sleeve and the band in
            a record are not the same grey — the first is read off artwork, the
            second off the record's own pale panel — so a lap that kept one
            colour the whole way would hand over to the band with a jump at the
            end of the flight.

            It is mixed on the trip's second beat and not its first: the loop
            comes apart in the colour it was wearing on the shelf, and only the
            line that is already a line changes colour, on exactly the number
            that carries it to the band's place and thickness. Arriving is one
            event. (In the dark room the two tokens are one colour, so this
            mixes nothing and the whole flight is the white it always was.) */}
        <path
          d={lap.d}
          pathLength={1}
          style={{
            stroke: `color-mix(in srgb, var(--featured-track) ${(lap.travel * 100).toFixed(2)}%,`
              + ' var(--featured-track-lap))',
          }}
          strokeWidth={lap.thickness}
          strokeLinecap="round"
          strokeDasharray={lapDash(lap.length, lap.closed)}
          strokeDashoffset={-lap.start}
        />
        {progress > 0 && (
          <path
            d={lap.d}
            pathLength={1}
            stroke="var(--color-playback-accent)"
            strokeWidth={lap.thickness}
            strokeLinecap="round"
            strokeDasharray={lapDash(progress * lap.length, lap.closed)}
            strokeDashoffset={-lap.start}
          />
        )}
      </svg>
    </span>
  );
}

interface BarBox {
  width: number;
  height: number;
}

/**
 * The pill's own size, watched rather than read once: it is two thirds of a
 * viewport that moves under a phone's address bar, and the page is mounted at
 * zero size while you are elsewhere in the app.
 *
 * It is measured up here rather than inside the ring so that the frame-by-frame
 * state stays down there — the bar itself renders only when the room changes.
 */
function useBarBox(ref: React.RefObject<HTMLElement | null>): BarBox {
  const [box, setBox] = useState<BarBox>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return undefined;
    /* Measured to the fraction rather than to the pixel: the pill is two
       thirds of a viewport that is rarely divisible by three, and `offsetWidth`
       rounds — half a pixel of rounding puts the drawn capsule's ends off the
       glass ring's, which is exactly where a second hairline appears. */
    const read = () => setBox((current) => {
      const { width, height } = bar.getBoundingClientRect();
      return current.width === width && current.height === height
        ? current
        : { width, height };
    });
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}
