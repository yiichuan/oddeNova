import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { t } from '../../lib/i18n';
import type { FeaturedAlbum, FeaturedPiece } from '../../lib/featured-pieces';
import { EllipsisIcon, ListIcon } from '../icons';
import { useResolvedTheme } from '../../hooks/useAppearance';
import {
  easeOutQuint,
  nearestEquivalent,
  positiveModulo,
  SIDE_SCALE,
  snapDuration,
} from './featured-carousel-motion';
import { FeaturedCover } from './featured-cover';
import {
  coverGlazeCss,
  coverLightAt,
  coverLightCss,
  type CoverRoom,
} from './featured-cover-light';
import {
  CONTENT_FADE_MS,
  coverFlightSupported,
  flightRect,
  liftCover,
  raiseCoverLight,
  type CoverFlight,
} from './featured-cover-flight';
import FeaturedGlow from './FeaturedGlow';
import FeaturedTiltSurface from './FeaturedTiltSurface';
import FeaturedWebglLightField from './FeaturedWebglLightField';
import {
  deviceTiltNeedsPermission,
  deviceTiltState,
  requestDeviceTilt,
  subscribeDeviceTiltState,
} from './featured-device-tilt';
import ScrollingTitle from '../common/ScrollingTitle';
import MobileFeaturedBar from './MobileFeaturedBar';
import MobileFeaturedDetail from './MobileFeaturedDetail';

/* Laid over the whole window rather than over the page, so a phone's top bar
   and home indicator have to be kept off their contents by hand. */
const SAFE_TOP = 'max(12px, env(safe-area-inset-top))';
const SAFE_BOTTOM = 'max(12px, env(safe-area-inset-bottom))';

/** How long the list takes to travel in or out — MobileNavDrawer's own. */
const SLIDE_MS = 280;

/**
 * The page under the transport: the room the pill floats over, on top of
 * whatever the device keeps for its own home indicator. Enough that the pill is
 * not sitting on the bottom edge — a shape with round ends reads as landed the
 * moment it touches one — and no more than that, so the pill stays down at the
 * foot of the window where a thumb rests rather than riding up into the page.
 *
 * It is also where the page gives out at the bottom, in both views: the shelf's
 * mask on the collection, and the reading's own on a record. Both are measured
 * off the transport, so lowering the pill takes the fade down with it.
 */
const FOOT = `calc(${SAFE_BOTTOM} + 10px)`;

/**
 * The page above the shelf: nothing of a record is drawn this high, so the name
 * of the page and its two keys have the top of the screen to themselves.
 *
 * Kept close under the writing rather than under the box the writing sits in.
 * The keys are 36px hit areas around 20px glyphs, so the marks themselves give
 * out some eight pixels above the row's own foot — and a line dropped to the
 * foot of the row leaves a band of empty page between the title and the shelf
 * that reads as a bar with a height, which is the one thing this page has no
 * bar for.
 */
const HEAD_CLEAR = `calc(${SAFE_TOP} + 34px)`;

/**
 * And where a record is whole again: a short reach below that line, enough to
 * take the hardness out of it and no more. The fade is not doing the hiding —
 * the line above it is — so what is left for it is the edge itself.
 */
const HEAD = `calc(${SAFE_TOP} + 54px)`;

/**
 * Where the shelf gives out at either end of the page: nothing at all as high
 * as the title, coming back over the short reach below it, whole from there to
 * the underside of the transport, and gone again by the bottom edge.
 *
 * A mask on the shelf rather than a pane laid over it. Both would hide the
 * record passing behind the bar; only this one hides it in the room the record
 * is standing in. A pane has to be given a colour, and the colour it has to
 * match is a field drawn by a shader in six levels of paper — so it is either
 * a shade off, which reads as a strip of material laid across the page, or it
 * is blurred, which reads as a strip of glass. The mask is neither: the sleeve
 * simply stops being there, and what is left is the room, exactly as the room
 * was.
 */
const SHELF_MASK = `linear-gradient(to bottom, transparent 0%, transparent ${HEAD_CLEAR}, `
  + `#000 ${HEAD}, #000 calc(100% - ${FOOT}), transparent 100%)`;

/* The two keys in the top bar, cut to the studio's and the collection's: a 36px
   hit area holding a 20px glyph. A phone reads the pages as one place, so the
   marks either side of a title are not drawn twice. */
/**
 * How a row in the list divides itself between the record and who made it.
 *
 * Two columns of fixed share rather than one line the name eats as much of as
 * it likes. What a list is for is comparing its rows, and a row whose second
 * field starts wherever the first one happened to end gives the eye a ragged
 * edge to find the artist along — where the same two columns down every row
 * can be read as two columns. The name gets the larger half: it is what the
 * row is called, and the artists on this shelf are mostly one short name.
 *
 * A share rather than a width in pixels, because the panel this stands in is
 * two thirds of whatever screen it opened on.
 */
const LIST_TITLE_SHARE = 62;
const LIST_ARTIST_SHARE = 38;

const BAR_KEY = 'flex h-9 w-9 items-center justify-center text-text-secondary'
  + ' transition-colors hover:text-text-primary';

/**
 * The widest angle a sleeve is dealt, in degrees of `rotate` — the turn in the
 * plane of the screen, the one a record makes lying on a table rather than
 * standing up off it. Each record is dealt its own angle within ±this; see
 * PAPER_ANGLES.
 */
const MAX_PAPER_DEG = 15;

/**
 * What a dealt sleeve reaches, as a multiple of its own side.
 *
 * A square turned in the plane of the screen grows: its corners come round to
 * where its edges were, which at the widest angle dealt here is about a fifth
 * again. The wheel is spaced by this rather than by the side of a cover, so the
 * corner of one sleeve never lands on the face of the next whatever the two
 * were dealt — and so the air between them does not change as the angles come
 * up and down.
 */
const CORNER_REACH = Math.cos((MAX_PAPER_DEG * Math.PI) / 180)
  + Math.sin((MAX_PAPER_DEG * Math.PI) / 180);

/**
 * And how far it is turned out of the page, about its own two midlines.
 *
 * Fifteen degrees, which is about what a record stands at when it has been
 * leant somewhere rather than filed. Two things carry it, in this order: the
 * light, which falls plainly down the edge that came forward and leaves the one
 * that went back (see the lamp on the cover below), and then the narrowing,
 * which is a few parts in a hundred of the cover's width. Past this the second
 * overtakes the first and a cover starts reading as one printed narrow rather
 * than as one standing at an angle.
 *
 * The wheel reserves each sleeve the room its paper's own turn needs
 * (CORNER_REACH), and a cover turned out of the page covers less rather than
 * more — so whatever is dealt here, the shelf's spacing holds.
 */
const PAPER_X_ANGLES = [11, -14, 6, -9, 15, -8, 12] as const;
const PAPER_Y_ANGLES = [-12, 8, 15, -6, 11, -15, 9] as const;

/**
 * How deep the room behind the shelf is.
 *
 * Deep, so that the perspective is a hint rather than a wide-angle lens: at
 * this distance the near edge of a dealt sleeve comes out about two parts in a
 * hundred on its far one. Enough for the eye to read the sleeves as standing in
 * a room rather than as being drawn at angles on the page, and little enough
 * that no cover is visibly wider at one end than the other — a shallow room
 * turns a column of records into a column being looked into, which is the one
 * thing an upright shelf must not become.
 */
const STAGE_PERSPECTIVE_PX = 1400;

/**
 * The angle each sleeve's paper has come to rest at, dealt out around the
 * collection.
 *
 * Read against the record rather than against the slot it happens to be
 * standing in: the slot numbering runs on for as long as the wheel is turned,
 * so an angle pinned to it would deal the same record a different angle on
 * every lap — and a record you had just straightened would be crooked again
 * next time round.
 *
 * Spent by the distance from the middle, so the record you are at is the one
 * record standing square: coming to the centre is a sleeve being picked up and
 * straightened, and leaving it is the sleeve being put back down.
 */
const PAPER_ANGLES = [-11, 15, -6, 9, -15, 4, -13] as const;

/**
 * How far out a sleeve is still within reach, and how many slots are kept
 * mounted around the centre.
 *
 * The ring is mounted deeper than the screen shows, so a sleeve thrown in by a
 * flick is already in place before it arrives rather than appearing at the edge
 * of the window. Nothing off the end of the wheel is faded out on the way: a
 * record on this shelf keeps every part of its ink, and what takes it off the
 * page is the edge of the page.
 */
const VISIBLE_RADIUS = 2;
const SLOT_RADIUS = 3;

/**
 * Past this the wheel is following the hand; past the second, the gesture has
 * stopped being a press on a sleeve. Both a little wider than a display's — a
 * finger rolls as it presses, and a thumb reaching the middle of the screen
 * rolls further than the rest.
 */
const DRAG_SLOP_PX = 8;
const PRESS_SLOP_PX = 16;

/**
 * How long a flick's last speed is carried on for after the finger has left.
 *
 * The whole of the phone's own scrolling physics, in one number: a lift with no
 * speed on it settles on the nearest sleeve, and a throw carries as far as it
 * was thrown. Capped so that the hardest flick anyone can make is still a trip
 * you can watch rather than a spin of the collection.
 */
const FLICK_CARRY_MS = 180;
const FLICK_MAX_SLOTS = 4;
/** How much of the gesture the speed is read off — the tail, not the whole. */
const FLICK_SAMPLE_MS = 110;

/** Each cover's own corner, so the copy arrives shaped like the one it becomes. */
const SLEEVE_RADIUS = 2;
const RECORD_RADIUS = 10;

/**
 * Where the page is between its two views.
 *
 * `opening` and `returning` are the two halves of a cover's flight — the record
 * and the shelf have already swapped, and the copy overhead is on its way to
 * the cover's new place. `closing` is the beat before the return leg, while the
 * record's content clears out from around a cover that is still standing.
 */
type Stage = 'idle' | 'opening' | 'closing' | 'returning';

/** The cover at one end of the trip, if that end is on screen. */
function coverNode(root: HTMLElement | null, role: 'shelf' | 'record') {
  if (!root) return null;
  return role === 'shelf'
    ? root.querySelector('[data-featured-centred="true"] [data-featured-cover="carousel"]')
    : root.querySelector('[data-featured-cover="detail"]');
}

/** A trip in progress, read by the frame loop rather than by a render. */
interface Sweep {
  from: number;
  to: number;
  start: number;
  duration: number;
}

interface Metrics {
  /** The centred sleeve's side, in px. */
  cover: number;
  /** From the middle out to the first record either side of it. */
  first: number;
  /** And from there on: one dealt sleeve and the air under it. */
  step: number;
}

const EMPTY: Metrics = { cover: 0, first: 0, step: 0 };

/**
 * How big a sleeve can be in the room the wheel has, and how far apart they
 * stand.
 *
 * Rather more than half the width, and not much more: a record held out at the
 * width of the screen is a picture the page is showing you, while one held out
 * at half of it is an object standing in a room, with the room visible around
 * it — and the room is where the rest of the collection is. The height is what
 * says how many of those are in view at once, and it is the second constraint
 * so that a short window gives up the size before it gives up the records above
 * and below.
 *
 * The air is measured off the sleeves rather than dealt out from the height, so
 * every pair on the wheel has the same clear space between them however far
 * down it the pair stands, and whatever angles the two were dealt: what is
 * spaced is what each sleeve reaches to, not the cover it was cut from. The
 * record in the middle stands square and full size, so it is the one that
 * reaches only its own edges.
 */
function measure(width: number, height: number): Metrics {
  if (width <= 0 || height <= 0) return EMPTY;
  const cover = Math.max(96, Math.min(width * 0.58, height * 0.44, 280));
  const gap = Math.min(60, Math.max(32, height * 0.054));
  const side = (cover * SIDE_SCALE * CORNER_REACH) / 2;
  return { cover, first: cover / 2 + side + gap, step: side * 2 + gap };
}

interface MobileFeaturedPageProps {
  /** The shelf: one sleeve per album, singles included. */
  albums: readonly FeaturedAlbum[];
  /** The whole collection track by track — what the transport's skips walk. */
  pieces: readonly FeaturedPiece[];
  /** The piece the bar is parked on — the last one reached for. */
  currentPiece: FeaturedPiece | null;
  playingId: string | null;
  /** Held rather than stopped — what the bar's progress arc keeps its place on. */
  pausedId: string | null;
  engineReady: boolean;
  /** True while a track is being copied into a new session. */
  opening: boolean;
  /** Whether this is the page on screen. The shelf leans only while it is. */
  active: boolean;
  onPlay: (piece: FeaturedPiece) => void;
  onSelect: (piece: FeaturedPiece) => void;
  onStop: () => void;
  onPause: () => void;
  onOpenInStudio: (piece: FeaturedPiece) => void;
  /** Opens the shell's navigation drawer — the page has no column of its own. */
  onOpenNav?: () => void;
  /**
   * Which record is open, if any — see FeaturedPage's own prop of the same
   * name, which this mirrors so the shell reads one answer regardless of which
   * layout is up.
   */
  onOpenChange?: (piece: FeaturedPiece | null) => void;
}

/**
 * 精选 on a phone.
 *
 * The desktop shelf is a ring: six sleeves across the window, the middle one
 * held out to the reader and the rest turning away from it, and no first or
 * last record — the collection comes round. None of that survives a screen this
 * narrow lying down; a horizontal ring on 390px is one sleeve and two slivers.
 *
 * So the ring is stood upright. It is the same wheel, turned a quarter: the
 * same slot arithmetic, the same record held out in the middle at full size
 * with the rest standing smaller either side of it, the same snap at the end of
 * a throw, and the same lack of an end to reach — the collection runs on for as
 * long as anyone cares to push it, in either direction.
 *
 * What it does not take from the display is the turn out of the page. There the
 * sleeves are angled about an axis they are not stacked along, which reads as a
 * ring coming round; stood upright the two are the same axis, and the same
 * angle reads as the column falling away from the reader — records below the
 * middle seen from one place and the ones above it from another. So the room
 * behind this shelf is a deep one: there is a perspective, but only a hint of
 * it, and every record is still read square on — the way you see one held up in
 * front of you rather than one filed in a rack.
 *
 * The records off the centre are dealt rather than turned. Each is given a few
 * degrees about each of its own three axes — the two midlines of the cover and
 * the pin through the middle of it — held to what a record actually stands at
 * when it has been put down by hand. In a room that deep those degrees cost the
 * covers little of their width, and are paid back in the light, which falls
 * unevenly down a sleeve standing at an angle. What says which record you are
 * at is its size, and that it is the one standing square: coming to the middle
 * is a record being picked up and straightened.
 *
 * The record's name and credits are not on the shelf. They stood either side of
 * the sleeve when the shelf was a list that scrolled, and there is no room for
 * them beside a ring: what is beside the centred sleeve now is the wheel
 * itself, coming round. The bar under it names what is loaded, the drawer names
 * the whole collection, and the artwork is left to be artwork.
 *
 * One thing does lean. On a display the sleeve leans away from the cursor,
 * which is the hand the record is being held in; a phone has no cursor, but the
 * whole page is in a hand — so the device's own attitude drives it instead, and
 * tipping the phone turns the record in the light. The surface reads whichever
 * of the two is there (see FeaturedTiltSurface), so this page opened in a
 * window on a machine with a mouse leans away from that. Only the record in the
 * middle, either way: it is the one being held, and the shelf it is standing on
 * is not.
 *
 * Pressing the sleeve in the middle opens it, as pressing a tile on the display
 * does, and the cover travels there rather than being replaced — see
 * MobileFeaturedDetail for what a record looks like opened up on a phone.
 * Pressing any other sleeve brings it to the middle first, which is the same
 * wheel-turning gesture answered by a tap.
 *
 * The sleeve carries no transport of its own, which is what leaves the press
 * free to mean that. It does not need one: the record in the middle is the
 * record the bar is parked on, and the bar is the next thing down the page with
 * a play button on it the size of a thumb.
 */
export default function MobileFeaturedPage({
  albums,
  pieces,
  currentPiece,
  playingId,
  pausedId,
  engineReady,
  opening,
  active,
  onPlay,
  onSelect,
  onStop,
  onPause,
  onOpenInStudio,
  onOpenNav,
  onOpenChange,
}: MobileFeaturedPageProps) {
  const pageRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [listOpen, setListOpen] = useState(false);
  const swipeDismiss = useSwipeDismiss('right', () => setListOpen(false));
  const [reducedMotion, setReducedMotion] = useState(false);
  const room: CoverRoom = useResolvedTheme() === 'light' ? 'paper' : 'space';

  /* Which record is open, and where the page is on the way in or out of it.
     Kept here rather than upstream for the same reason the display keeps it on
     its own page: it is where you are on the page, not something the app has to
     know about, and the page stays mounted while you are elsewhere so it is
     still where you left it when you come back. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const flightRef = useRef<CoverFlight | null>(null);
  /* A copy that has arrived and is waiting to be taken away — see the handover
     at the head of the layout effect below. Which end it arrived at comes with
     it: a cover that has just been put back on the shelf is a sleeve with its
     light to raise. */
  const landedRef = useRef<{ flight: CoverFlight; arriving: 'record' | 'shelf' } | null>(null);

  /* Where the wheel stands, and where it is headed — the second so that
     repeated input compounds rather than fighting the trip it started: two
     presses on the sleeve below are two records on, not two attempts to leave
     the one the wheel has not finished moving away from yet. */
  const positionRef = useRef(0);
  const targetRef = useRef(0);
  const [position, setPosition] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const sweepRef = useRef<Sweep | null>(null);
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  /* Ends the gesture in progress, if there is one. */
  const releaseDragRef = useRef<(() => void) | null>(null);
  /* The wheel is following the hand, and goes on following it for the rest of
     the gesture even if the hand comes back to where it started. */
  const pullingRef = useRef(false);
  /* The gesture travelled too far to still be a press on a sleeve, so the tap
     it ends with is the tail of a throw. */
  const draggedRef = useRef(false);
  /* One record's worth of travel under the finger — the step out of the middle,
     which is the move the reader is making. Read inside a gesture that started
     before the render it was measured in. */
  const stepRef = useRef(0);

  /* Which record the parked piece belongs to. The bar's skips walk the whole
     collection a track at a time and can step off one record onto the next, so
     this is what the wheel follows. */
  const parkedIndex = Math.max(
    albums.findIndex((album) => album.tracks.some((track) => track.id === currentPiece?.id)),
    0,
  );
  const parkedRef = useRef(parkedIndex);

  /* Read from refs inside the settle below, so that a fresh handler each render
     does not rebuild `snapTo` — and with it every trip that is in the air at
     the time. Written in an effect rather than during the render, and in the
     first effect on the page, so that everything below reads this render's
     values. */
  const albumsRef = useRef(albums);
  const onSelectRef = useRef(onSelect);
  /* The track the bar is parked on, as the wheel understands it. Claimed by a
     skip before the wheel is asked to move: the trip a skip starts can settle
     inside that very call — a shelf already standing where it was sent, or a
     reader who has asked for no animation — and the settle asks whether the
     transport is inside the record it landed on. The answer has to be the track
     the skip just chose, which is not yet the one in props: it arrives on the
     next render. Without this, a skip backwards into an album would be answered
     by re-parking the bar on that album's first track, which is the one track
     the reader did not ask for. */
  const parkedPieceRef = useRef(currentPiece?.id ?? null);
  useEffect(() => {
    albumsRef.current = albums;
    onSelectRef.current = onSelect;
    parkedPieceRef.current = currentPiece?.id ?? null;
    parkedRef.current = parkedIndex;
    stepRef.current = metrics.first;
  });

  const setLogicalPosition = useCallback((value: number) => {
    positionRef.current = value;
    setPosition(value);
  }, []);

  const clearTimers = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const stopSweep = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    sweepRef.current = null;
  }, []);

  /* Free movement: the finger is driving, so the wheel stands exactly where it
     is put and is no longer on its way anywhere. */
  const scrubTo = useCallback((value: number) => {
    clearTimers();
    stopSweep();
    setSnapping(false);
    targetRef.current = value;
    setLogicalPosition(value);
  }, [clearTimers, setLogicalPosition, stopSweep]);

  /* What the wheel has come to rest on is what the bar is parked on: turning
     the shelf is choosing, exactly as pressing a sleeve is. Reported on arrival
     rather than frame by frame — a throw passes over half the collection on the
     way down, and the records it goes by are not choices. */
  const reportCentre = useCallback((index: number) => {
    const shelf = albumsRef.current;
    if (shelf.length === 0) return;
    const album = shelf[positiveModulo(Math.round(index), shelf.length)];
    if (!album) return;
    if (album.tracks.some((track) => track.id === parkedPieceRef.current)) return;
    onSelectRef.current(album.tracks[0]);
  }, []);

  /**
   * Travel to a slot rather than cut to it.
   *
   * The position is animated across the gap a frame at a time, so every sleeve
   * in between is actually drawn — which is what makes a record arriving at the
   * middle a move you can follow rather than a swap. A CSS transition cannot do
   * this: past a couple of slots the jump replaces the whole rendered window,
   * and the arriving sleeves mount already in place with nothing to move from.
   *
   * The ring is unrolled first, so a record most of the way round the
   * collection is reached by going back a little rather than forward a long
   * way, and where the trip lands is left where it lands rather than folded
   * back into the collection: a slot's number is its React key, and renumbering
   * the rendered window tears out and rebuilds every sleeve on screen —
   * including, if the settle lands inside a press, the one being pressed.
   */
  const snapTo = useCallback((targetIndex: number) => {
    clearTimers();
    stopSweep();

    const from = positionRef.current;
    const target = nearestEquivalent(targetIndex, targetRef.current, albumsRef.current.length);
    targetRef.current = target;

    const settle = () => {
      stopSweep();
      setSnapping(false);
      targetRef.current = target;
      setLogicalPosition(target);
      settleTimerRef.current = null;
      reportCentre(target);
    };

    if (reducedMotion || Math.abs(target - from) < 0.001) {
      settle();
      return;
    }

    const duration = snapDuration(target - from);
    setSnapping(true);
    sweepRef.current = { from, to: target, start: performance.now(), duration };

    const stepFrame = () => {
      const sweep = sweepRef.current;
      if (!sweep) {
        frameRef.current = null;
        return;
      }
      const progress = Math.min((performance.now() - sweep.start) / sweep.duration, 1);
      setLogicalPosition(sweep.from + (sweep.to - sweep.from) * easeOutQuint(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(stepFrame);
        return;
      }
      sweepRef.current = null;
      frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(stepFrame);

    /* The clock, not the frames, is what says the trip is over: a page that is
       not being painted still has to arrive. */
    settleTimerRef.current = window.setTimeout(settle, duration);
  }, [clearTimers, reducedMotion, reportCentre, setLogicalPosition, stopSweep]);

  /* The room the wheel has, watched rather than read once: the page is mounted
     behind `display: none` while you are elsewhere in the app, where everything
     measures zero, and a phone's viewport moves under its own address bar. */
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const read = () => setMetrics(measure(stage.clientWidth, stage.clientHeight));
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  /* Arriving on the page puts the wheel where the transport is, without a
     journey: the record the bar is parked on is where you left off, and a shelf
     that travelled to it in front of you would be announcing a move nobody
     made.

     The one place the wheel is moved from an effect rather than from an act.
     Every other turn answers something done on this page — a finger on the
     shelf, a skip on the bar, a pick from the list — but this one answers a
     gesture made elsewhere in the app, and the page has nothing of its own to
     hang it on. */
  useEffect(() => {
    if (!active) return;
    clearTimers();
    stopSweep();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapping(false);
    targetRef.current = parkedRef.current;
    setLogicalPosition(parkedRef.current);
  }, [active, clearTimers, setLogicalPosition, stopSweep]);

  /**
   * Bring a record to the middle, from wherever the wheel is standing. Silent
   * if it is already there or already on its way — a trip in progress is left
   * to finish rather than restarted from wherever it has got to.
   */
  const centreOn = useCallback((index: number) => {
    if (albumsRef.current.length === 0 || index < 0) return;
    const heading = targetRef.current;
    if (Math.abs(nearestEquivalent(index, heading, albumsRef.current.length) - heading) < 0.001) {
      return;
    }
    snapTo(index);
  }, [snapTo]);

  /**
   * Opening a record.
   *
   * The cover is the same picture either side of the trip — the sleeve you
   * pressed and the cover at the head of the record — so it is not replaced but
   * moved: a copy is lifted out of the shelf where it stands, the two views are
   * swapped underneath it, and the copy is flown to wherever the cover has
   * landed. Everything else fades around it. The page owns this because it is
   * the only thing that can see both ends at once.
   *
   * The transport is not re-pointed unless it has to be. On the display,
   * opening a record parks the bar on that record's first track, because there
   * the sleeve is one of six and the bar may be parked anywhere; here the
   * record you can open is the record in the middle, which is already the
   * record the bar is parked on — and it may be parked on the third track of
   * it, because the skips walk within a record. Re-pointing it at the first
   * would undo a move the reader just made.
   */
  const openDetail = useCallback((album: FeaturedAlbum) => {
    if (!album.tracks.some((track) => track.id === parkedPieceRef.current)) {
      parkedPieceRef.current = album.tracks[0].id;
      onSelectRef.current(album.tracks[0]);
    }

    // Lifted before the swap, while the sleeve is still where it can be
    // measured.
    const source = coverFlightSupported() ? coverNode(pageRef.current, 'shelf') : null;
    if (!source) {
      setOpenId(album.id);
      setStage('idle');
      return;
    }

    flightRef.current?.remove();
    flightRef.current = liftCover(source, flightRect(source), SLEEVE_RADIUS);
    setOpenId(album.id);
    setStage('opening');
  }, []);

  const closeDetail = useCallback(() => {
    if (!coverFlightSupported() || !coverNode(pageRef.current, 'record')) {
      setOpenId(null);
      setStage('idle');
      return;
    }
    setStage('closing');
  }, []);

  /* Going back reads in two beats: the record clears out, then its cover
     leaves. Both at once would be one thing dissolving while another thing
     moves, and the cover is the part that should be followed. */
  useEffect(() => {
    if (stage !== 'closing') return undefined;

    const timer = window.setTimeout(() => {
      const source = coverNode(pageRef.current, 'record');
      if (source) {
        flightRef.current?.remove();
        flightRef.current = liftCover(source, flightRect(source), RECORD_RADIUS);
      }
      setOpenId(null);
      setStage(source ? 'returning' : 'idle');
    }, CONTENT_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [stage]);

  /* The destination only has a place for the cover once it has been laid out,
     which is exactly now: the view swapped in the render this effect follows,
     and nothing has been painted yet. */
  useLayoutEffect(() => {
    /* The handover. This runs inside the commit that put the real cover back on
       screen and before the browser paints it, so the copy leaves and the cover
       appears on the same frame. Taking the copy away on a timer or an
       animation frame instead loses the race with React's own commit, and the
       one frame with neither of them on screen is the blink you see on
       arrival. */
    const landed = landedRef.current;
    landed?.flight.remove();
    landedRef.current = null;
    // The sleeve has its artwork back as of this commit and has not been painted
    // yet, so the light can be started on the same frame it appears on.
    if (landed?.arriving === 'shelf') {
      raiseCoverLight(pageRef.current?.querySelector('[data-featured-centred="true"]'));
    }

    const flight = flightRef.current;
    if (!flight || (stage !== 'opening' && stage !== 'returning')) return undefined;

    const arriving = stage === 'opening' ? 'record' : 'shelf';
    const target = coverNode(pageRef.current, arriving);
    // Nothing to fly to means the view that was to receive it is not there; the
    // copy stands down where it is rather than the page waiting on it.
    const arrival = target
      ? flight.land(flightRect(target), arriving === 'record' ? RECORD_RADIUS : SLEEVE_RADIUS)
      : Promise.resolve();

    let abandoned = false;
    void arrival.then(() => {
      if (abandoned) return;
      // Handed over rather than removed here: the copy has to outlive this
      // moment by exactly one commit, which is what `landedRef` is for.
      landedRef.current = { flight, arriving };
      flightRef.current = null;
      setStage('idle');
    });

    return () => { abandoned = true; };
  }, [stage]);

  /* A skip on the bar turns the wheel under it. Reading and listening are one
     selection on this page as on the desktop one, so the shelf goes to whatever
     the transport was pointed at — travelling, because this is a move the
     reader asked for and should be able to follow. A skip within one record
     moves the track and not the shelf, which is `centreOn` being silent about a
     record already in the middle.

     Inside a record it turns the page as well. The skips walk the collection a
     track at a time and can step off the record being read and onto the next
     one, and what you are looking at and what the transport is pointed at are
     one choice — so the record that arrives is the record that opens. No cover
     flight either way: the sleeve it would leave from is behind the record you
     are reading. */
  const skipTo = (piece: FeaturedPiece) => {
    onPlay(piece);
    parkedPieceRef.current = piece.id;
    const ownerIndex = albums.findIndex((album) => album.tracks.some((track) => track.id === piece.id));
    centreOn(ownerIndex);
    const owner = albums[ownerIndex];
    if (owner && openId !== null && owner.id !== openId) setOpenId(owner.id);
  };

  useEffect(() => () => {
    releaseDragRef.current?.();
    clearTimers();
    stopSweep();
    flightRef.current?.remove();
    landedRef.current?.flight.remove();
    flightRef.current = null;
    landedRef.current = null;
  }, [clearTimers, stopSweep]);

  /* The readings have to be asked for, from inside a gesture, and a page nobody
     has touched yet has had no gesture to ask from. So the first press anywhere
     on the page is the one that asks — the reader is reaching for a record, not
     answering a question about sensors. A refusal costs nothing: the sleeve
     stands square, which is where it starts.

     No "asked already" latch here any more. There used to be one, and it was set
     *before* the request was made, so a call that landed at the wrong moment or
     threw took the whole page's remaining life with it: one bad ask and the
     sensor was unreachable until a reload. The module keeps the answer instead,
     and it can tell a refusal (kept, never nagged) from a call that never got an
     answer (worth trying on the next deliberate press). */
  const askForTilt = () => { void requestDeviceTilt(); };

  /* Whether there is still an ask to make, so the shelf can offer somewhere to
     make it from. Subscribed rather than read once: the drawer row that opens
     this page asks on the way in, and by the time the shelf is up the question
     may already be answered. */
  const [tiltAskable, setTiltAskable] = useState(deviceTiltNeedsPermission);
  useEffect(() => subscribeDeviceTiltState(() => {
    setTiltAskable(deviceTiltNeedsPermission());
  }), []);

  /**
   * The whole shelf is one thing you can take hold of, sleeves included: the
   * wheel turns from wherever the finger lands on it, and a press that stayed
   * near where it landed is a press on whatever it landed on.
   *
   * Listened for on the window rather than captured on the stage — capture
   * would swallow the click that a tap on a sleeve still has to produce.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    releaseDragRef.current?.();
    pullingRef.current = false;
    draggedRef.current = false;

    const { pointerId } = event;
    const startY = event.clientY;
    // Catches a trip in progress where it stands rather than letting it finish
    // under the finger that grabbed it.
    scrubTo(positionRef.current);
    const startPosition = positionRef.current;
    /* The tail of the gesture, for the throw: where the finger was and when.
       Trimmed to the last stretch on every move, so a finger that came to rest
       before it lifted has no speed left on it. */
    const trail: { at: number; y: number }[] = [{ at: performance.now(), y: startY }];

    const onPointerMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const travelled = move.clientY - startY;
      if (Math.abs(travelled) >= PRESS_SLOP_PX) draggedRef.current = true;
      if (!pullingRef.current && Math.abs(travelled) < DRAG_SLOP_PX) return;
      pullingRef.current = true;
      const now = performance.now();
      trail.push({ at: now, y: move.clientY });
      while (trail.length > 2 && now - trail[0].at > FLICK_SAMPLE_MS) trail.shift();
      // Dragging down brings the record above into the middle, which is the
      // way a page of anything moves under a finger.
      scrubTo(startPosition - travelled / Math.max(stepRef.current, 1));
    };

    const onPointerUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      releaseDragRef.current?.();

      const last = trail[trail.length - 1];
      const first = trail[0];
      const elapsed = last.at - first.at;
      const speed = pullingRef.current && elapsed > 0 ? (last.y - first.y) / elapsed : 0;
      const carried = Math.max(
        -FLICK_MAX_SLOTS,
        Math.min(FLICK_MAX_SLOTS, -(speed * FLICK_CARRY_MS) / Math.max(stepRef.current, 1)),
      );
      // Settled on release whether or not the wheel moved: the press caught a
      // trip in progress, and something has to finish it.
      snapTo(Math.round(positionRef.current + carried));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    releaseDragRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      releaseDragRef.current = null;
    };
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    snapTo(Math.round(targetRef.current) + (event.key === 'ArrowDown' ? 1 : -1));
  };

  const pressSlot = (logicalIndex: number, album: FeaturedAlbum) => {
    /* The tail of a throw rather than a press: whichever sleeve happened to be
       under the finger when the wheel stopped is not a choice. */
    if (draggedRef.current) return;
    if (logicalIndex !== Math.round(targetRef.current)) {
      snapTo(logicalIndex);
      return;
    }
    /* The record already in the middle, so this is the way in. Hearing it is
       the bar directly underneath, which has a play key the size of a thumb on
       it and is parked on this very record — so the sleeve is free to mean the
       one thing a record's picture ought to mean, which is opening it. */
    openDetail(album);
  };

  /* The bar's skips walk the collection in the order the wheel shows it, and
     walk it round: past the last track is the first again, so next can be
     pressed for as long as anyone cares to press it, and prev off the front of
     the collection arrives at the back of it. The wheel comes round with it,
     the short way about, because the shelf itself has no ends either.

     A collection of one is the exception. There is nowhere to go — a skip would
     land on the track already parked and restart it — so both keys stand
     disabled. */
  const parkedTrack = currentPiece ? pieces.findIndex((piece) => piece.id === currentPiece.id) : -1;
  const ringed = parkedTrack >= 0 && pieces.length > 1;
  const prevPiece = ringed ? pieces[positiveModulo(parkedTrack - 1, pieces.length)] : null;
  const nextPiece = ringed ? pieces[positiveModulo(parkedTrack + 1, pieces.length)] : null;

  const baseIndex = Math.round(position);
  const centredAlbum = albums.length > 0
    ? albums[positiveModulo(baseIndex, albums.length)]
    : null;

  const openAlbum = albums.find((album) => album.id === openId) ?? null;

  useEffect(() => {
    // The same track FeaturedGlow itself reads a colour from — tracks[0]
    // rather than whichever one is centred, since every track in an album
    // shares the album's own cover. Mirrors FeaturedPage's own desktop effect.
    onOpenChange?.(openAlbum ? openAlbum.tracks[0] : null);
  }, [openAlbum, onOpenChange]);

  /* The record is still on the page while its cover is flying off it, so that
     the sleeve it left has something to fade out from — the same beat the
     display gives its own carousel. */
  const shelfLeaving = stage === 'opening';
  const shelfReturning = stage === 'returning';
  const shelfShown = openAlbum === null || shelfLeaving;
  /** A copy of the cover is in the air: whichever end it is over stands aside. */
  const coverFlying = shelfLeaving || shelfReturning;
  const shelfFade = shelfLeaving
    ? 'featured-content-out'
    : shelfReturning
      ? 'featured-content-in'
      : '';
  /* Which track of the open record is being read: whatever the transport is
     parked on, as long as it belongs to this record. A skip that steps off it
     opens the record it landed in, so by the next render it does again. */
  const openTrack = openAlbum
    ? openAlbum.tracks.find((track) => track.id === currentPiece?.id) ?? openAlbum.tracks[0]
    : null;

  /* Offered only where it is the only way in: a reader who arrived without a
     press — a shared link, a page restored from the background — and who turns
     the phone rather than touching it would otherwise never produce the gesture
     the ask needs. It goes away for good the moment the question is answered
     either way, and it is never shown where there is nothing to ask.

     Not shown while a record is open: the shelf is what leans. */
  const showTiltInvite = active && tiltAskable && deviceTiltState() === 'prompt' && openAlbum === null;

  return (
    <main
      ref={pageRef}
      data-testid="featured-page-mobile"
      onPointerDown={askForTilt}
      /* `featured-immersive-surface` for the shelf's own materials — the glass
         the bar is cut from, the ring a sleeve catches, both palettes' answers
         to them. The room they are lit by comes with them: see the field
         below. */
      className="featured-immersive-surface relative flex h-full w-full min-w-0 flex-col overflow-hidden"
    >
      {/* The room the shelf stands in — the desktop page's own, and no more
          expensive here than there: the field is one frame drawn once and left
          standing, not a loop, so what a phone spends on it is a single draw
          when the page arrives and nothing at all while it is being read.
          Behind everything, and shown only while this is the page you are on.

          It is also what the artwork needs. A sleeve is a lit object, and the
          light on it — the lamp down its face, the sheen it catches as the
          phone turns, the shadow it drops — is drawn against a room. On a flat
          surface those read as marks on a picture; on the field they read as
          the record being in the room with you.

          It stands down inside a record. There the light in the room is the
          record's own — see the wash below — and two fields at once is two
          rooms at once. */}
      <FeaturedWebglLightField
        active={active && openAlbum === null}
        variant={room === 'paper' ? 'paper' : 'space'}
      />

      {/* And what lights a record: a soft wash of the cover's own colour across
          the whole window, the display's own. Keyed on the record so each cover
          reads its colour from scratch. The blobs it is made of are laid out
          again for a page this shape — a phone is a tall narrow window, and a
          field cut for a wide one arrives as a column of vertical slivers. See
          `.featured-glow-blob` in index.css.

          Held back until the cover has landed: the field is a dozen blurred,
          looping layers, and mounting it in the same commit as the flight
          hands the paint work it costs to the exact frames the flight needs
          to itself. It has nothing to light before the cover arrives anyway. */}
      {openAlbum && stage !== 'opening' && <FeaturedGlow key={openAlbum.id} piece={openAlbum.tracks[0]} />}

      {/* ── The shelf ── */}
      {/* The wheel, stood on end. Every slot is drawn from one number — how far
          it is from the middle — and that number is what moves: the sleeves are
          not transitioned into place, they are redrawn from a position that is
          itself travelling. `touch-none` because this surface answers the drag
          itself; left to the browser, a pull down it would be a page scroll on
          a page that has nowhere to scroll.

          It is the whole page, top to bottom, with the bar and the transport
          floating over it: the wheel is the page here, not a panel let into it,
          so a record leaving the middle goes on standing where it stands rather
          than stopping at a hairline the reader is meant not to notice. What
          takes it off the page is a fade at either end — see SHELF_MASK. */}
      <div
        ref={stageRef}
        aria-label={t('featuredList')}
        aria-roledescription="carousel"
        data-testid="featured-mobile-shelf"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        // `select-none`: the shelf is a drag surface first, and a pull that
        // starts on artwork should not leave a selection behind it.
        className={`absolute inset-0 z-0 touch-none select-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--featured-focus-ring)] ${shelfFade}`}
        /* Hidden rather than unmounted behind a record, and hidden by
           `visibility` rather than by `display`: the wheel is measured off this
           box, and a box taken out of layout measures zero — which would throw
           away the size every sleeve is drawn at and rebuild it, from nothing,
           in the frame the shelf comes back. `inert` because a hidden shelf is
           still a shelf: nothing in it should be reachable by a thumb that
           misses the record, or by a tab. */
        inert={!shelfShown}
        style={{
          perspective: `${STAGE_PERSPECTIVE_PX}px`,
          perspectiveOrigin: '50% 50%',
          maskImage: SHELF_MASK,
          WebkitMaskImage: SHELF_MASK,
          visibility: shelfShown ? undefined : 'hidden',
        }}
      >
        {albums.length > 0 && Array.from({ length: SLOT_RADIUS * 2 + 1 }, (_, offset) => {
          const logicalIndex = baseIndex + offset - SLOT_RADIUS;
          const distance = logicalIndex - position;
          const magnitude = Math.abs(distance);
          const albumIndex = positiveModulo(logicalIndex, albums.length);
          const album = albums[albumIndex];
          const centred = magnitude < 0.001;
          const visible = magnitude <= VISIBLE_RADIUS + 0.05;
          const hidden = magnitude > VISIBLE_RADIUS + 0.55;

          const scale = SIDE_SCALE + Math.max(0, 1 - magnitude) * (1 - SIDE_SCALE);
          /* The angles this record was dealt — the turn of its paper against
             the shelf, and the two it is standing at — all spent as it leaves
             the middle: square in the centre, fully crooked a slot out and no
             further. */
          const dealt = Math.min(magnitude, 1);
          const rotateZ = PAPER_ANGLES[albumIndex % PAPER_ANGLES.length] * dealt;
          const rotateX = PAPER_X_ANGLES[albumIndex % PAPER_X_ANGLES.length] * dealt;
          const rotateY = PAPER_Y_ANGLES[albumIndex % PAPER_Y_ANGLES.length] * dealt;
          /* How the sleeve stands in the room, which is what its light is read
             off — one reading for the two layers that draw it. */
          const sleeveLight = coverLightAt({ x: rotateX, y: rotateY, z: rotateZ }, room);
          /* Whether this sleeve's cover is somewhere else — in the air, or open
             as a record. Only ever the one in the middle: it is the only sleeve
             a cover leaves. */
          const coverAway = centred && (coverFlying || openAlbum !== null);
          /* The step out of the middle is longer than the ones after it: the
             centred sleeve is full size where the rest have given up a third. */
          const travel = Math.min(magnitude, 1) * metrics.first
            + Math.max(magnitude - 1, 0) * metrics.step;
          const translateY = Math.sign(distance) * travel;

          return (
            <div
              key={logicalIndex}
              aria-current={centred ? 'true' : undefined}
              aria-hidden={centred ? undefined : true}
              data-featured-centred={centred}
              data-featured-album={album.id}
              data-testid={`featured-mobile-slot-${logicalIndex}`}
              // No transition on the slot: a sleeve moves because the position
              // it is drawn from is moving, frame by frame. A transition here
              // would only lag one frame behind that.
              className="absolute left-1/2 top-1/2"
              style={{
                pointerEvents: hidden ? 'none' : undefined,
                marginLeft: -metrics.cover / 2,
                marginTop: -metrics.cover / 2,
                // A step down the column, the two angles the record is
                // standing at, the angle its paper was dealt against the shelf,
                // and a size.
                //
                // The stage above holds a deep perspective, so the two turns
                // out of the page are drawn with a hint of one — the near edge
                // of a sleeve a couple of parts in a hundred larger than its far
                // edge, and no more. Nothing inside the slot carries a z of its
                // own, so `preserve-3d` would buy no depth here and would only
                // hand the slot's contents planes to be depth-sorted on — a sort
                // that flips along a diagonal the moment two axes are in play.
                transform: `translateY(${translateY}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`,
                transformOrigin: `${metrics.cover / 2}px ${metrics.cover / 2}px`,
                width: metrics.cover || undefined,
                zIndex: 20 - Math.round(Math.min(magnitude, 4) * 4),
              }}
            >
              <button
                type="button"
                onClick={() => pressSlot(logicalIndex, album)}
                // The sleeves either side are read out as part of the wheel
                // rather than one at a time, so none of them takes focus.
                tabIndex={centred ? undefined : -1}
                inert={visible ? undefined : true}
                aria-label={centred
                  ? `${t('featuredOpenDetail')} — ${album.title}`
                  : album.title}
                data-testid={`featured-mobile-cover-${logicalIndex}`}
                className="block w-full cursor-[inherit] outline-none"
              >
                {/* `active` is what subscribes to the device, so the sleeves
                    either side cost nothing while they wait, and a wheel in
                    flight is not asked to answer the phone's attitude on top of
                    its own travel. */}
                {/* The lean, and only on the record in the middle: it is the
                    one being held. It also stands down for as long as the cover
                    is away from this sleeve, and that is what stops the sleeve
                    coming back lit: the phone goes on being turned while a
                    record is open, so a surface left reading it hands the sleeve
                    its full lean, its sheen and its cast shadow in the frame it
                    reappears in — every light on it at once, which is the one
                    thing a record settling back on to a shelf should not do.
                    Switched off, the surface resets to square and dark, and
                    switching it back on at the landing lets its own smoothing
                    walk all three back up to where the phone is actually being
                    held. */}
                <FeaturedTiltSurface
                  active={active && centred && !snapping && !coverAway}
                  room={room}
                >
                  {/* `isolate`: the glaze below is laid on in soft light, and
                      what it is meant to light is the artwork under it — not
                      the sleeve behind it on the shelf, nor the room behind
                      that. */}
                  <div
                    data-featured-sleeve
                    /* The whole sleeve steps aside while the flight is
                       carrying it — the artwork and every light on it — so
                       that what crosses the page is one picture rather than a
                       copy with the original's shading left standing where it
                       took off. Its place is kept, because the shelf behind is
                       still being read.
                       No `overflow-hidden` of its own: FeaturedCover clips its
                       own artwork to the same radius, and the light/glaze
                       layers below now carry the radius on themselves rather
                       than counting on this box to cut their square corners
                       off for them — a second clip stacked on the first one
                       antialiased the exact same edge twice, which on a light
                       cover read as a hairline drawn round the sleeve. */
                    className={`relative isolate aspect-square w-full rounded-[2px] bg-[#05070a] ${
                      centred && coverFlying ? 'invisible' : ''
                    }`}
                    style={{ boxShadow: 'var(--tilt-shadow)' }}
                  >
                    <FeaturedCover
                      piece={album.tracks[0]}
                      /* The end of the trip the flight is measured from, and
                         only on the record in the middle: it is the one record
                         that can be opened, so it is the only sleeve a cover
                         ever leaves from. */
                      flightRole={centred ? 'carousel' : undefined}
                      className="absolute inset-0 size-full rounded-[2px]"
                    />

                    {/* What the sleeve loses: the shade down the edge that
                        turned away, and the lamp's fall from the waist of the
                        cover to its foot. Laid over the artwork rather than
                        filtered through it — a shadow falls across a cover
                        without changing the colours it was printed in.

                        Read off every angle the sleeve is standing at, not just
                        the one across the shelf: the corner that came forward
                        catches the light and the one that went back loses it,
                        wherever the three turns have put them. The lamp is
                        handed the paper's own turn back, so it goes on falling
                        straight down the shelf while the record lies at an
                        angle under it. The one in the middle stands square, and
                        keeps the plain fall from head to foot that every cover
                        carries. */}
                    <span
                      aria-hidden="true"
                      data-featured-cover-light
                      className="pointer-events-none absolute inset-0 rounded-[2px]"
                      style={{
                        backgroundImage: coverLightCss(sleeveLight),
                      }}
                    />

                    {/* And what it catches. Its own layer because it is put on
                        differently: white laid over artwork stands in front of
                        it and lifts the black in the picture along with
                        everything else, which is the haze a lit cover on a
                        bright page comes back as. In soft light the same
                        gradient lights what is already there instead — see
                        coverGlazeCss. */}
                    <span
                      aria-hidden="true"
                      data-featured-cover-glaze
                      className="pointer-events-none absolute inset-0 rounded-[2px] mix-blend-soft-light"
                      style={{ backgroundImage: coverGlazeCss(sleeveLight) }}
                    />

                    {/* The desktop tile catches its hairline under the
                        pointer; a phone has none, so this one catches it under
                        the tilt instead — the same edge a lean already puts
                        light and shadow on, both driven by the surface's own
                        `--tilt-edge` (see FeaturedTiltSurface). Turned all the
                        way to square, the record has no edge at all; turning it
                        is what draws one, on the same curve the sheen and the
                        shadow already move on — no separate transition needed,
                        the surface's own smoothing already eases it.

                        Only the centred sleeve answers, as only the centred
                        sleeve leans: the ones either side are the wheel rather
                        than the record, and their surface is never active, so
                        their `--tilt-edge` never leaves the 0 it starts at. */}
                    <span
                      aria-hidden="true"
                      data-featured-cover-ring={centred}
                      className="pointer-events-none absolute inset-0 rounded-[2px]"
                      style={centred ? {
                        boxShadow: 'inset 0 0 0 1px var(--featured-cover-ring)',
                        opacity: 'var(--tilt-edge)',
                      } : undefined}
                    />
                  </div>
                </FeaturedTiltSurface>
              </button>
            </div>
          );
        })}

        <span className="sr-only" aria-live="polite">{centredAlbum?.title}</span>
      </div>

      {/* ── Top bar ── */}
      {/* The studio's bar, with this page's name where the wordmark stands and
          this page's two doors either side of it: the shell's navigation on the
          left, where it is on every mobile page, and the collection's own list
          on the right, where the desktop page keeps it too.

          It floats over the shelf rather than sitting above it, so the row
          itself takes no presses — only the two keys do. A drag that starts up
          here turns the wheel like a drag anywhere else on the page, which is
          what a bar with nothing in it but its own name ought to allow. And
          nothing is drawn behind it: the shelf has already faded out by the
          time it reaches the bar, so the name and the two keys stand on the
          room itself. */}
      <div
        className={`pointer-events-none relative z-20 flex shrink-0 items-center justify-between px-2 ${shelfFade}`}
        style={{
          paddingTop: SAFE_TOP,
          paddingBottom: '4px',
          /* Out of the flow from the moment a record is on the page — not from
             the moment this row stops being shown, which is a beat later. The
             two overlap for the length of the flight, one fading out while the
             other fades in, and they have to cross over on the same line: left
             in the flow this row would be standing above the record's own bar
             and pushing the whole column down by its own height, which is a
             page that jumps as it arrives.

             Pinned to the top rather than merely lifted, since an absolute box
             with nothing said about its edges is cut to its contents — and this
             one's contents are two keys at opposite ends of the window. */
          ...(openAlbum === null ? null : { position: 'absolute', top: 0, left: 0, right: 0 }),
          visibility: shelfShown ? undefined : 'hidden',
        }}
        inert={!shelfShown}
      >
        <button
          type="button"
          onClick={onOpenNav}
          className={`pointer-events-auto ${BAR_KEY}`}
          aria-label={t('navMore')}
          aria-haspopup="dialog"
          title={t('navMore')}
        >
          <EllipsisIcon size={20} />
        </button>
        <h1
          data-testid="featured-mobile-title"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {t('navFeatured')}
        </h1>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className={`pointer-events-auto ${BAR_KEY}`}
          aria-label={t('featuredList')}
          aria-expanded={listOpen}
          aria-haspopup="dialog"
          title={t('featuredList')}
        >
          <ListIcon size={20} />
        </button>
      </div>

      {/* ── The one way to ask, where a press was never made ── */}
      {/* Under the bar, in the register of a caption rather than a control: it is
          an offer, not something the page needs answered, and the shelf works
          perfectly without it. Shown only while there is genuinely an ask left to
          make (see showTiltInvite), and gone for good once it has been. */}
      {showTiltInvite && (
        <div className={`pointer-events-none relative z-20 flex shrink-0 justify-center ${shelfFade}`}>
          <button
            type="button"
            data-testid="featured-enable-tilt"
            onClick={askForTilt}
            className="pointer-events-auto rounded-full border border-border/70 px-3 py-1 text-[12px] text-text-secondary transition-colors active:bg-surface-hover"
          >
            {t('featuredEnableTilt')}
          </button>
        </div>
      )}


      {/* ── The record, opened ── */}
      {/* The page between the two bars. On the shelf nothing is drawn here and
          nothing is caught here, so a drag lands on the wheel behind it; a
          record fills it, and the column it is read in is the one part of
          either view that scrolls.

          It is drawn while the shelf is still on its way out, so that the cover
          has somewhere to land at the end of its flight and the writing around
          it has the whole trip to come up in. */}
      {openAlbum && openTrack ? (
        <MobileFeaturedDetail
          /* Keyed on the record, so a skip that steps onto another one arrives
             at the top of it rather than at whatever line the last was left
             scrolled to. Prefixed because the wash beside it is keyed on the
             record too, and the two are siblings. */
          key={`record-${openAlbum.id}`}
          track={openTrack}
          playingId={playingId}
          engineReady={engineReady}
          onPlay={onPlay}
          onStop={onStop}
          opening={opening}
          onOpenInStudio={onOpenInStudio}
          onBack={closeDetail}
          transition={stage === 'opening' ? 'entering' : stage === 'closing' ? 'leaving' : null}
          coverHidden={stage === 'opening'}
        />
      ) : (
        <div className="pointer-events-none relative z-10 min-h-0 flex-1" />
      )}

      {/* ── Transport ── */}
      {/* Held clear of the bottom edge rather than sitting on it, but only
          just: the pill is a control floating over the room, not a bar fixed to
          the foot of the screen, and a shape with round ends reads as landed
          the moment it touches an edge. How much page is left under it is
          FOOT — which is also where the page fades out behind it. */}
      {/* The same measure the reading is set on — px-4, the record column's own
          — so the transport at its full width has the ends the panels above it
          have. On the shelf it is two thirds of that room and centred, where
          four pixels either side change nothing. */}
      <div
        className="pointer-events-none relative z-20 shrink-0 px-4 pt-2"
        style={{ paddingBottom: FOOT }}
      >
        <MobileFeaturedBar
          piece={currentPiece}
          isPlaying={currentPiece !== null && playingId === currentPiece.id}
          isPaused={currentPiece !== null && pausedId === currentPiece.id}
          engineReady={engineReady}
          onPlay={() => { if (currentPiece) onPlay(currentPiece); }}
          onPause={onPause}
          onPrev={prevPiece ? () => skipTo(prevPiece) : undefined}
          onNext={nextPiece ? () => skipTo(nextPiece) : undefined}
          /* The one part of either view that is not swapped but reshaped: the
             pill widens into the record and narrows back out of it, landing
             with the cover. It takes the second half of that flight rather than
             the whole of it — the lap round its edge has to come unwrapped
             before the edge itself moves — and eases in as well as out, since
             it is starting from a beat that has just come to rest; see
             morphTiming in MobileFeaturedBar. Two things arriving as one, which
             is what says the two views are one page rather than two. */
          expanded={openAlbum !== null}
        />
      </div>

      {/* ── The collection, listed ── */}
      {/* The desktop page's corner title column, given the room a phone has for
          it: the navigation drawer's own construction, mirrored, so the two
          panels a mobile page can pull out read as one pair — the app on the
          left, what is on the shelf on the right. */}
      <div
        className="fixed inset-0 z-50"
        style={{
          visibility: listOpen ? 'visible' : 'hidden',
          transition: listOpen ? undefined : `visibility 0s linear ${SLIDE_MS}ms`,
        }}
        inert={!listOpen}
      >
        <div
          className="absolute inset-0 bg-[var(--color-overlay-backdrop)] backdrop-blur-[6px] transition-opacity duration-[280ms] ease-out motion-reduce:transition-none"
          style={{ opacity: listOpen ? 1 : 0 }}
          onClick={() => setListOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('featuredList')}
          data-testid="featured-list-drawer"
          {...swipeDismiss}
          className="absolute inset-y-0 right-0 flex w-2/3 flex-col border-l border-border bg-conversation-surface shadow-menu-overlay transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{
            transform: listOpen ? 'translateX(0)' : 'translateX(100%)',
            paddingTop: SAFE_TOP,
            paddingBottom: SAFE_BOTTOM,
          }}
        >
          {/* Set as the navigation drawer's rows are, the way the collection's
              own list panel is: the three panels on this layout are one family
              seen from either edge of the screen, so the heading follows that
              drawer's size rather than keeping a 15px of its own. */}
          <h2 className="shrink-0 px-4 pb-5 pt-1 text-base text-text-primary">
            {t('featuredList')}
          </h2>
          {/* One row per record, in the order the shelf runs — the same rows the
              collection's list has on a display, and the same rows the session
              history has in the drawer opposite. Picking one turns the wheel to
              it, the short way about, and takes the panel down behind it. */}
          <div
            role="listbox"
            aria-label={t('featuredList')}
            data-testid="featured-list-mobile"
            className="no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2"
          >
            {albums.map((album, index) => {
              const selected = album.id === centredAlbum?.id;
              return (
                <button
                  key={album.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-featured-album-id={album.id}
                  onClick={() => {
                    setListOpen(false);
                    centreOn(index);
                  }}
                  className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-[8px] text-left transition-colors ${
                    selected
                      ? 'bg-[var(--color-selected-item-bg)] text-on-accent'
                      : 'text-text-secondary hover:text-text-primary active:bg-surface-hover'
                  }`}
                >
                  {/* Both fields run on the row that is open — it is the one
                      whose whole name is the point — and both say what they
                      give up with an ellipsis on the rest. The same line the
                      collection's own rows use: see ScrollingTitle. */}
                  <ScrollingTitle
                    title={album.title}
                    active={selected}
                    className="min-w-0 text-base leading-5"
                    style={{ flex: `${LIST_TITLE_SHARE} 1 0` }}
                  />
                  <ScrollingTitle
                    title={album.originalArtists[0]}
                    active={selected}
                    className="min-w-0 text-base leading-5 opacity-60"
                    style={{ flex: `${LIST_ARTIST_SHARE} 1 0` }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';
