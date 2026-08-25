import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { t } from '../../lib/i18n';
import type { FeaturedAlbum } from '../../lib/featured-pieces';
import FeaturedCard from './FeaturedCard';
import FeaturedTitleWheel from './FeaturedTitleWheel';
import { wheelLabel } from './featured-wheel';
import {
  easeOutQuint,
  MAX_TURN_DEG,
  nearestEquivalent,
  positiveModulo,
  SIDE_SCALE,
  slotGap,
  snapDuration,
  WHEEL_PIXELS_PER_SLOT,
} from './featured-carousel-motion';

/**
 * The one thing about the shelf that cannot be said as a prop: where it is
 * standing. The wheel's position is animated frame by frame and belongs to the
 * carousel, so moving it is an act rather than a value to be handed down.
 */
export interface FeaturedCarouselHandle {
  /**
   * Bring the wheel round to a record, from wherever the shelf is standing.
   * Silent if it is already there or already on its way.
   */
  centreOn: (albumId: string) => void;
}

interface FeaturedCarouselProps {
  /** The shelf: one sleeve per album, singles included. */
  albums: readonly FeaturedAlbum[];
  /** The track currently sounding, if any — a sleeve lights up for its own. */
  playingId: string | null;
  engineReady: boolean;
  /**
   * Opens a record. The sleeve's own cover is handed over with it: a record
   * picked from the side of the wheel leaves from where it was standing rather
   * than from the middle.
   */
  onOpen: (album: FeaturedAlbum, cover: Element | null) => void;
  onPlay: (album: FeaturedAlbum) => void;
  onStop: () => void;
  /**
   * The record whose detail view is up, if any — which is to say whether the
   * collection is on screen at all.
   */
  openId?: string | null;
  /** The cover the flight is carrying is hidden while the copy is overhead. */
  centerCoverHidden?: boolean;
  /**
   * Whether the collection is being left for a piece, or coming back. The stage
   * and the title column are each `position: fixed`, so they carry the fade
   * themselves rather than inheriting it from the page.
   */
  transition?: 'entering' | 'leaving' | null;
  ref?: Ref<FeaturedCarouselHandle>;
}

/** Past this the wheel starts following the hand. */
const DRAG_SLOP_PX = 6;
/**
 * And past this the gesture has stopped being a press on a sleeve.
 *
 * Deliberately not the same number. A hand that has just thrown the wheel
 * rarely comes to a dead stop before it presses, and a trackpad click drags the
 * pointer a few pixels of its own — travel that turns the wheel by a fortieth
 * of a slot, which is nothing to see and no reason to swallow the press that
 * follows it.
 */
const PRESS_SLOP_PX = 14;

/** A trip in progress, read by the frame loop rather than by a render. */
interface Sweep {
  from: number;
  to: number;
  start: number;
  duration: number;
}

/**
 * How far either side of centre a sleeve is still drawn. Slots past this are
 * mounted but transparent — the ring is rendered a little wider than it reads
 * (SLOT_RADIUS) so a sleeve is already in place by the time it fades in.
 *
 * The collection is shorter than the window is wide, so the outermost slot on
 * each side comes back round to a piece already on screen. That is the ring
 * being a ring: at this distance a sleeve is a quarter opaque and turned 28°,
 * and reads as the wheel continuing rather than as the same record twice.
 */
const VISIBLE_RADIUS = 3;
const SLOT_RADIUS = 4;
const SNAP_IDLE_MS = 120;
/**
 * The angle each sleeve's paper has come to rest at, dealt out around the
 * collection. Read against the record rather than against the slot it happens
 * to be standing in: the slot numbering runs on for as long as the wheel is
 * turned, so an angle pinned to it would deal the same record a different
 * angle on every lap.
 */
const PAPER_X_ROTATIONS = [10, -12.5, 7.5, -9.5, 12, -9, 14] as const;
const PAPER_Z_ROTATIONS = [0, 0, 0, 0, 0, 0, 0] as const;

const interpolateStops = (distance: number, stops: readonly number[]) => {
  const bounded = Math.min(Math.abs(distance), stops.length - 1);
  const lower = Math.floor(bounded);
  const upper = Math.min(lower + 1, stops.length - 1);
  const mix = bounded - lower;
  return stops[lower] + (stops[upper] - stops[lower]) * mix;
};

/**
 * The record a slot shows. Logical index 0 is the first record in the
 * collection, and the index runs off both ends into the ring rather than
 * stopping: -1 is the last one, and the wheel has no first or last sleeve.
 */
function itemAt(albums: readonly FeaturedAlbum[], logicalIndex: number) {
  return albums[positiveModulo(logicalIndex, albums.length)];
}

export default function FeaturedCarousel({
  albums,
  playingId,
  engineReady,
  onOpen,
  onPlay,
  onStop,
  openId = null,
  centerCoverHidden = false,
  transition = null,
  ref,
}: FeaturedCarouselProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  /* Where the carousel is headed, as opposed to where it currently stands.
     Repeated input compounds against this — seven taps of a key are seven
     sleeves on, not seven attempts to leave the one place the carousel has not
     finished moving away from yet. */
  const targetRef = useRef(0);
  const sweepRef = useRef<Sweep | null>(null);
  const frameRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  /* Ends the gesture in progress, if there is one. */
  const releaseDragRef = useRef<(() => void) | null>(null);
  /* The wheel is following the hand, and goes on following it for the rest of
     the gesture even if the hand comes back to where it started. */
  const pullingRef = useRef(false);
  /* The gesture travelled too far to still be a press on a sleeve, so the click
     it ends with is the tail of a pull. */
  const draggedRef = useRef(false);
  const [position, setPosition] = useState(0);
  /* The slot whose cover has been lifted out for the flight into a record,
     while the wheel is still on its way round to it. Held by slot rather than
     by record: the ring can show one sleeve twice, and the one standing empty
     should be the one that was actually pressed. */
  const [flightSlot, setFlightSlot] = useState<number | null>(null);
  const [announcedIndex, setAnnouncedIndex] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [stageWidth, setStageWidth] = useState(960);
  const [cardSize, setCardSize] = useState(266);
  const [stageFrame, setStageFrame] = useState({ top: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  const setLogicalPosition = useCallback((value: number) => {
    positionRef.current = value;
    setPosition(value);
  }, []);

  const clearTimers = useCallback(() => {
    if (wheelTimerRef.current !== null) {
      window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }
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

  /* Free movement: a pointer or a wheel is driving, so the carousel stands
     exactly where it is put and is no longer on its way anywhere. */
  const scrubTo = useCallback((value: number) => {
    clearTimers();
    stopSweep();
    setSnapping(false);
    targetRef.current = value;
    setLogicalPosition(value);
  }, [clearTimers, setLogicalPosition, stopSweep]);

  /**
   * Travel to a slot rather than cut to it.
   *
   * The position is animated across the gap a frame at a time, so every sleeve
   * in between is actually drawn. A CSS transition cannot do this: past a few
   * slots the jump replaces the whole rendered window, and the arriving sleeves
   * mount already in place with nothing to move from — which is the cut this
   * replaces. The ring is unrolled first, so a slot most of the way round is
   * reached by going back a little rather than forward a long way.
   *
   * Where it arrives is left where it lands rather than folded back into the
   * collection. Folding it would be invisible in itself — every slot is read
   * through `positiveModulo` — but it renumbers the whole rendered window in
   * one step, and a slot's number is its React key: every sleeve on screen
   * would be torn out and rebuilt at that moment. This settle can land inside
   * a pointerup, so the sleeve being pressed is one of them, and a press whose
   * sleeve is rebuilt before it comes up never becomes a click at all — a
   * record that refuses to open for no reason the eye can see.
   */
  const snapTo = useCallback((targetIndex: number) => {
    clearTimers();
    stopSweep();

    const from = positionRef.current;
    const target = nearestEquivalent(targetIndex, targetRef.current, albums.length);
    targetRef.current = target;

    const settle = () => {
      stopSweep();
      setSnapping(false);
      targetRef.current = target;
      setLogicalPosition(target);
      setAnnouncedIndex(target);
      // Arrived: the wheel's own centre is the sleeve in flight from here on,
      // which is what `flightSlot` falls back to.
      setFlightSlot(null);
      settleTimerRef.current = null;
    };

    if (reducedMotion || Math.abs(target - from) < 0.001) {
      settle();
      return;
    }

    const duration = snapDuration(target - from);
    setSnapping(true);
    sweepRef.current = { from, to: target, start: performance.now(), duration };

    const step = () => {
      const sweep = sweepRef.current;
      if (!sweep) {
        frameRef.current = null;
        return;
      }
      const progress = Math.min((performance.now() - sweep.start) / sweep.duration, 1);
      setLogicalPosition(sweep.from + (sweep.to - sweep.from) * easeOutQuint(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      sweepRef.current = null;
      frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(step);

    /* The clock, not the frames, is what says the trip is over: a page that is
       not being painted still has to arrive. */
    settleTimerRef.current = window.setTimeout(settle, duration);
  }, [albums.length, clearTimers, reducedMotion, setLogicalPosition, stopSweep]);

  const settleScrub = useCallback(() => {
    snapTo(Math.round(positionRef.current));
  }, [snapTo]);

  /**
   * The shelf stands in front of whichever record is being read, so coming back
   * out of a piece leaves you looking at it rather than at whatever you happened
   * to go in from.
   *
   * Pressing a sleeve brings the wheel round on its own, behind the flight; this
   * is for the other way a record becomes the one being read — a skip on the
   * transport bar stepping off it and onto the next, with the collection hidden
   * behind the piece the whole time.
   */
  useImperativeHandle(ref, () => ({
    centreOn: (albumId: string) => {
      const target = albums.findIndex((album) => album.id === albumId);
      if (target < 0) return;
      // Already there, or already on the way: a trip in progress is left to
      // finish rather than restarted from wherever it has got to.
      const heading = targetRef.current;
      if (Math.abs(nearestEquivalent(target, heading, albums.length) - heading) < 0.001) return;
      snapTo(target);
    },
  }), [albums, snapTo]);

  /**
   * The three things a sleeve can be asked to do. Each of them first asks
   * whether it was actually asked: a press that lands at the end of a pull on
   * the wheel is the tail of that pull, and whichever sleeve happened to be
   * under the hand when it stopped should not be acted on.
   */
  const playSlot = useCallback((album: FeaturedAlbum) => {
    if (draggedRef.current) return;
    onPlay(album);
  }, [onPlay]);

  const stopSlot = useCallback(() => {
    if (draggedRef.current) return;
    onStop();
  }, [onStop]);

  /**
   * Open the record in one slot — including a sleeve picked off the side.
   *
   * Two things happen at once, and they are the same move seen from either end.
   * The cover leaves from the sleeve that was actually pressed, so it is handed
   * to the page rather than left to be looked up in the middle of the wheel;
   * and the wheel comes round to that sleeve behind it, so the record you were
   * reading about is the one in the centre when you come back to the shelf.
   */
  const openSlot = useCallback((logicalIndex: number, album: FeaturedAlbum) => {
    if (draggedRef.current) return;
    const cover = stageRef.current?.querySelector(
      `[data-carousel-logical-index="${logicalIndex}"] [data-featured-cover="carousel"]`,
    );
    setFlightSlot(logicalIndex);
    snapTo(logicalIndex);
    onOpen(album, cover ?? null);
  }, [onOpen, snapTo]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    const measure = () => {
      const rect = layout.getBoundingClientRect();
      setStageWidth(window.innerWidth || 960);
      // A page behind `display: none` measures zero. Keeping the last real
      // frame means the stage is already in the right place the instant the
      // collection is shown again, rather than a beat later.
      if (rect.height > 0) setStageFrame({ top: rect.top, height: rect.height });
      setCardSize(Math.min(
        320,
        Math.max(160, Math.min(window.innerWidth * 0.26, window.innerHeight * 0.38)),
      ));
    };
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const deltaModeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? Math.max(stage.clientWidth, 1)
          : 1;
      // Clears the idle timer along with everything else, so the settle is
      // always measured from the last notch of the gesture.
      scrubTo(positionRef.current
        + ((event.deltaX + event.deltaY) * deltaModeScale) / WHEEL_PIXELS_PER_SLOT);

      wheelTimerRef.current = window.setTimeout(() => {
        snapTo(Math.round(positionRef.current));
        wheelTimerRef.current = null;
      }, SNAP_IDLE_MS);
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [scrubTo, snapTo]);

  useEffect(() => () => {
    releaseDragRef.current?.();
    clearTimers();
    stopSweep();
  }, [clearTimers, stopSweep]);

  /**
   * The whole stage is one thing you can take hold of, sleeves included: the
   * wheel turns from wherever the hand lands on it, and a press that stayed
   * near where it landed is a press on whatever it landed on.
   *
   * Listened for on the window rather than captured on the stage — capture
   * would swallow the click that a tap on a sleeve still has to produce, which
   * is the same reason the title column does it this way.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    releaseDragRef.current?.();
    pullingRef.current = false;
    draggedRef.current = false;

    const { pointerId } = event;
    const startX = event.clientX;
    // Catches a trip in progress where it stands rather than letting it finish
    // under the hand that grabbed it.
    scrubTo(positionRef.current);
    const startPosition = positionRef.current;

    const onPointerMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const travelled = move.clientX - startX;
      if (Math.abs(travelled) >= PRESS_SLOP_PX) draggedRef.current = true;
      if (!pullingRef.current && Math.abs(travelled) < DRAG_SLOP_PX) return;
      pullingRef.current = true;
      // A slot's worth of travel: the step out of the centre and the step
      // between two side sleeves differ by half the size the sides give up, so
      // the hand is given the average of the two.
      const interval = cardSize * ((1 + SIDE_SCALE) / 2) + slotGap(stageWidth);
      scrubTo(startPosition - travelled / interval);
    };

    const onPointerUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      releaseDragRef.current?.();
      // Settled on release whether or not the wheel moved: the press caught a
      // trip in progress, and something has to finish it.
      snapTo(Math.round(positionRef.current));
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
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    snapTo(Math.round(targetRef.current) + direction);
  };

  const baseIndex = Math.round(position);
  const gap = slotGap(stageWidth);
  /* The wheel sits a little below the middle of its stage rather than on it:
     the page title and the title column both live up at the top of the page,
     and the collection reads as hung under them instead of pressed against
     them. Taken as a share of the stage so a short window gives up the drop
     before it gives up the credits under the centred sleeve. */
  const stageDrop = Math.min(36, stageFrame.height * 0.05);
  const viewFade = transition === 'entering'
    ? 'featured-content-in'
    : transition === 'leaving'
      ? 'featured-content-out'
      : '';
  if (albums.length === 0) return null;

  const announcedLabel = itemAt(albums, announcedIndex).title;
  const titleWheelLabels = albums.map((_, logicalIndex) => (
    wheelLabel(itemAt(albums, logicalIndex).title)
  ));
  return (
    <div ref={layoutRef} className="relative min-h-0 flex-1">
      <FeaturedTitleWheel
        labels={titleWheelLabels}
        position={position}
        onSelect={snapTo}
        onScrub={scrubTo}
        onScrubEnd={settleScrub}
        className={viewFade}
      />

      <section
        ref={stageRef}
        aria-label={t('featuredList')}
        aria-roledescription="carousel"
        data-testid="featured-carousel"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        // `select-none`: the stage is a drag surface first. Without it a pull
        // across the centred sleeve runs a text selection through its title and
        // credits, and the blue that leaves behind outlives the gesture.
        className={`fixed left-0 z-[1] cursor-grab touch-pan-y select-none overflow-hidden outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/20 ${viewFade}`}
        style={{
          height: stageFrame.height,
          perspective: '800px',
          perspectiveOrigin: '50% 50%',
          top: stageFrame.top,
          visibility: stageFrame.height > 0 ? 'visible' : 'hidden',
          width: '100vw',
        }}
      >
        {Array.from({ length: SLOT_RADIUS * 2 + 1 }, (_, offset) => {
          const logicalIndex = baseIndex + offset - SLOT_RADIUS;
          const distance = logicalIndex - position;
          const magnitude = Math.abs(distance);
          const albumIndex = positiveModulo(logicalIndex, albums.length);
          const album = albums[albumIndex];
          const centred = magnitude < 0.001;
          const visible = magnitude <= VISIBLE_RADIUS + 0.05;
          const hidden = magnitude > VISIBLE_RADIUS + 0.55;
          const scale = SIDE_SCALE + Math.max(0, 1 - magnitude) * (1 - SIDE_SCALE);
          const opacity = interpolateStops(magnitude, [1, 0.72, 0.46, 0.25, 0]);
          const turnProgress = Math.min(magnitude / VISIBLE_RADIUS, 1);
          const rotateY = -Math.sign(distance)
            * MAX_TURN_DEG
            * (1 - (1 - turnProgress) ** 1.5);
          const restingRotateX = PAPER_X_ROTATIONS[albumIndex % PAPER_X_ROTATIONS.length];
          const restingRotateZ = PAPER_Z_ROTATIONS[albumIndex % PAPER_Z_ROTATIONS.length];
          const rotateX = restingRotateX * Math.min(magnitude, 1);
          const rotateZ = restingRotateZ * Math.min(magnitude, 1);
          /* One slot on is one side sleeve plus the gap; the first step out of
             the centre also has to clear the half-width the centred sleeve has
             that the others gave up. Same air between every pair either way. */
          const translateMagnitude = magnitude * (cardSize * SIDE_SCALE + gap)
            + Math.min(magnitude, 1) * cardSize * ((1 - SIDE_SCALE) / 2);
          const translateX = Math.sign(distance) * translateMagnitude;

          return (
            <div
              key={logicalIndex}
              aria-current={centred ? 'true' : undefined}
              aria-hidden={centred ? undefined : true}
              data-carousel-centered={centred}
              data-carousel-visible={visible}
              data-carousel-logical-index={logicalIndex}
              // No transition on the slot: a sleeve moves because the position
              // it is drawn from is moving, frame by frame. A transition here
              // would only lag one frame behind that.
              className="absolute left-1/2 top-1/2"

              style={{
                opacity,
                pointerEvents: hidden ? 'none' : undefined,
                marginLeft: -cardSize / 2,
                // The slot is centred as a cover-plus-metadata group: the
                // 36px metadata block sits below the square cover.
                marginTop: -(cardSize / 2 + 36) + stageDrop,
                transform: `translateX(${translateX}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`,
                transformOrigin: `${cardSize / 2}px ${cardSize / 2}px`,
                transformStyle: 'preserve-3d',
                width: cardSize,
                zIndex: 20 - Math.round(Math.min(magnitude, 4) * 4),
              }}
            >
              {/* Every sleeve you can see is a sleeve you can press: it leans
                  under the pointer, offers its transport, and opens the record.
                  Only the ones past the fade are out of reach — `inert` also
                  takes them out of the way of the drag surface underneath. */}
              <div
                inert={visible ? undefined : true}
                className={visible ? '' : 'pointer-events-none'}
              >
                <FeaturedCard
                  album={album}
                  isPlaying={album.tracks.some((track) => track.id === playingId)}
                  engineReady={engineReady}
                  onOpen={() => openSlot(logicalIndex, album)}
                  onPlay={() => playSlot(album)}
                  onStop={stopSlot}
                  showMetadata={centred}
                  // The sleeves either side are read out as part of the wheel
                  // rather than one at a time, so none of them takes focus.
                  focusable={centred}
                  turn={rotateY}
                  // Not while the wheel is travelling, and not while a piece is
                  // up: a hidden shelf has no pointer over it to answer.
                  tiltable={visible && !snapping && openId === null}
                  coverHidden={centerCoverHidden && logicalIndex === (flightSlot ?? baseIndex)}
                />
              </div>
            </div>
          );
        })}

        <span className="sr-only" aria-live="polite">{announcedLabel}</span>
      </section>
    </div>
  );
}
