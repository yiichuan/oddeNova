import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { featuredAlbums, type FeaturedAlbum, type FeaturedPiece } from '../../lib/featured-pieces';
import FeaturedCarousel, { type FeaturedCarouselHandle } from './FeaturedCarousel';
import FeaturedDetail from './FeaturedDetail';
import FeaturedGlow from './FeaturedGlow';
import FeaturedPlayerBar from './FeaturedPlayerBar';
import FeaturedWebglLightField from './FeaturedWebglLightField';
import { useResolvedTheme } from '../../hooks/useAppearance';
import {
  CONTENT_FADE_MS,
  coverFlightSupported,
  flightRect,
  liftCover,
  type CoverFlight,
} from './featured-cover-flight';

/** Each cover's own corner, so the copy arrives shaped like the one it becomes. */
const CARD_RADIUS = 2;
const DETAIL_RADIUS = 10;

/**
 * Where the page is between its two views.
 *
 * `opening` and `returning` are the two halves of a cover's flight — the piece
 * and the collection have already swapped, and the copy overhead is on its way
 * to the cover's new place. `closing` is the beat before the return leg, while
 * the piece's content clears out from around a cover that is still standing.
 */
type Stage = 'idle' | 'opening' | 'closing' | 'returning';

/** The cover at one end of the trip, if that end is on screen. */
function coverNode(root: HTMLElement | null, role: 'carousel' | 'detail') {
  if (!root) return null;
  return role === 'carousel'
    ? root.querySelector('[data-carousel-centered="true"] [data-featured-cover="carousel"]')
    : root.querySelector('[data-featured-cover="detail"]');
}

interface FeaturedPageProps {
  /**
   * The collection, track by track. The shelf is grouped into albums here
   * rather than by the caller: which pieces belong to one record is a property
   * of the collection, and the transport still walks it a track at a time.
   */
  pieces: readonly FeaturedPiece[];
  /** The piece the player bar is parked on — the last one picked. */
  currentPiece: FeaturedPiece | null;
  /** The piece currently sounding, if any. */
  playingId: string | null;
  /** The piece paused mid-play and still holding its position, if any. */
  pausedId: string | null;
  engineReady: boolean;
  opening: boolean;
  onPlay: (piece: FeaturedPiece) => void;
  /**
   * Park the bar on a piece without playing it, and silence whatever else was
   * sounding. Opening a record and moving through its tracks is choosing what
   * the transport points at, so the bar follows the page — and a bar that named
   * one piece while another played would be telling you the wrong thing.
   */
  onSelect: (piece: FeaturedPiece) => void;
  onStop: () => void;
  onPause: () => void;
  onOpenInStudio: (piece: FeaturedPiece) => void;
  /**
   * Which of the two views is up. The page keeps that to itself, but the shell
   * around it does not look the same for a piece as for the collection — the
   * primary nav stands apart into pods for the shelf and re-forms into a column
   * for a record — so the change is reported outwards.
   */
  onOpenChange?: (open: boolean) => void;
}

/**
 * The Featured page: the collection as a looping carousel, one piece opened up
 * when a tile is picked, and a floating transport across the foot of both.
 *
 * Which of the two views is showing is this component's own business — it is
 * where you are on the page, not something the app has to know about, and the
 * page stays mounted while you are elsewhere so it is still where you left it
 * when you come back. Playback outlives the trip in and out of a piece: the bar
 * is the same bar, and going in to read the record that is sounding does not
 * stop it.
 *
 * Reading and listening are one selection here rather than two: the bar is
 * parked on whichever track the page is showing, so opening a record or turning
 * its track column points the transport at that track and silences whatever
 * else was sounding, and the bar's own skips — which walk the whole collection,
 * across records — turn the page under them.
 *
 * The trip between the two views is one continuous move rather than a cut: the
 * cover is the same record either side, so it is flown from the sleeve that was
 * pressed — wherever on the wheel that was — to its place at the head of the
 * piece, and everything else fades around it. The page owns that because it is
 * the only thing that can see both ends, the tile and the piece's header, at
 * once.
 */
export default function FeaturedPage({
  pieces,
  currentPiece,
  playingId,
  pausedId,
  engineReady,
  opening,
  onPlay,
  onSelect,
  onStop,
  onPause,
  onOpenInStudio,
  onOpenChange,
}: FeaturedPageProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const pageRef = useRef<HTMLElement>(null);
  const carouselRef = useRef<FeaturedCarouselHandle>(null);
  const flightRef = useRef<CoverFlight | null>(null);
  // A copy that has arrived and is waiting to be taken away — see the handover
  // at the head of the layout effect below.
  const landedRef = useRef<CoverFlight | null>(null);
  const albums = useMemo(() => featuredAlbums(pieces), [pieces]);
  const openAlbum = albums.find((album) => album.id === openId) ?? null;
  // The room the shelf stands in follows the app's theme, the same way the
  // Favorites page's does — one building, lit the way the reader asked for.
  const paper = useResolvedTheme() === 'light';

  const openDetail = useCallback((album: FeaturedAlbum, from?: Element | null) => {
    // Opening a record is also pointing the transport at it. The first track,
    // because that is where a record begins and there is nowhere else it could
    // reasonably open.
    onSelect(album.tracks[0]);
    // Lifted before the swap, while the tile is still where it can be measured.
    // The collection hands over the sleeve that was actually pressed; the
    // centred one is only the fallback for a piece opened from anywhere else.
    const source = coverFlightSupported()
      ? from ?? coverNode(pageRef.current, 'carousel')
      : null;
    if (!source) {
      setOpenId(album.id);
      setStage('idle');
      return;
    }

    flightRef.current?.remove();
    flightRef.current = liftCover(source, flightRect(source), CARD_RADIUS);
    setOpenId(album.id);
    setStage('opening');
  }, [onSelect]);

  const closeDetail = useCallback(() => {
    if (!coverFlightSupported() || !coverNode(pageRef.current, 'detail')) {
      setOpenId(null);
      setStage('idle');
      return;
    }
    setStage('closing');
  }, []);

  // Going back reads in two beats: the piece clears out, then its cover leaves.
  // Both at once would be one thing dissolving while another thing moves, and
  // the cover is the part that should be followed.
  useEffect(() => {
    if (stage !== 'closing') return undefined;

    const timer = window.setTimeout(() => {
      const source = coverNode(pageRef.current, 'detail');
      if (source) {
        flightRef.current?.remove();
        flightRef.current = liftCover(source, flightRect(source), DETAIL_RADIUS);
      }
      setOpenId(null);
      setStage(source ? 'returning' : 'idle');
    }, CONTENT_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [stage]);

  // The destination only has a place for the cover once it has been laid out,
  // which is exactly now: the view swapped in the render this effect follows,
  // and nothing has been painted yet.
  useLayoutEffect(() => {
    // The handover. This runs inside the commit that put the real cover back on
    // screen and before the browser paints it, so the copy leaves and the cover
    // appears on the same frame. Taking the copy away on a timer or an animation
    // frame instead loses the race with React's own commit, and the one frame
    // with neither of them on screen is the blink you see on arrival.
    landedRef.current?.remove();
    landedRef.current = null;

    const flight = flightRef.current;
    if (!flight || (stage !== 'opening' && stage !== 'returning')) return undefined;

    const arriving = stage === 'opening' ? 'detail' : 'carousel';
    const target = coverNode(pageRef.current, arriving);
    // Nothing to fly to means the view that was to receive it is not there;
    // the copy stands down where it is rather than the page waiting on it.
    const arrival = target
      ? flight.land(flightRect(target), arriving === 'detail' ? DETAIL_RADIUS : CARD_RADIUS)
      : Promise.resolve();

    let abandoned = false;
    void arrival.then(() => {
      if (abandoned) return;
      // Handed over rather than removed here: the copy has to outlive this
      // moment by exactly one commit, which is what `landedRef` is for.
      landedRef.current = flight;
      flightRef.current = null;
      setStage('idle');
    });

    return () => { abandoned = true; };
  }, [stage]);

  useEffect(() => {
    onOpenChange?.(openId !== null);
  }, [openId, onOpenChange]);

  /**
   * A skip on the bar, which walks the whole collection a track at a time and
   * so can step off the record being read and onto the next one.
   *
   * The page turns with it rather than being told afterwards by the piece that
   * came back parked: what you are reading and what the transport is pointed at
   * are one choice, and a skip is the moment that choice is made.
   *
   * No cover flight either way — the cover has nowhere to leave from, it is
   * already standing at the head of a piece — and the arriving record fades its
   * own content in, since the view is keyed on which record it is.
   *
   * The shelf comes round behind it too, out of sight, so the way back out lands
   * on the record you were last reading rather than on the one you went in from.
   */
  const skipTo = useCallback((piece: FeaturedPiece) => {
    onPlay(piece);
    if (openId === null) return;
    const owner = albums.find((album) => album.tracks.some((track) => track.id === piece.id));
    if (!owner || owner.id === openId) return;
    setOpenId(owner.id);
    carouselRef.current?.centreOn(owner.id);
  }, [albums, onPlay, openId]);

  useEffect(() => () => {
    flightRef.current?.remove();
    landedRef.current?.remove();
    flightRef.current = null;
    landedRef.current = null;
  }, []);

  const galleryLeaving = stage === 'opening';
  const galleryReturning = stage === 'returning';
  const galleryShown = openAlbum === null || galleryLeaving;
  const galleryFade = galleryLeaving
    ? 'featured-content-out'
    : galleryReturning
      ? 'featured-content-in'
      : '';

  // The bar's skip buttons walk the collection in the order the grid shows it.
  // No wrap-around: the ends of a hand-picked list are worth feeling. With a
  // single piece there is nothing either side and both buttons sit disabled.
  const parkedIndex = currentPiece ? pieces.findIndex((piece) => piece.id === currentPiece.id) : -1;
  const prevPiece = parkedIndex > 0 ? pieces[parkedIndex - 1] : null;
  const nextPiece = parkedIndex >= 0 && parkedIndex < pieces.length - 1
    ? pieces[parkedIndex + 1]
    : null;

  return (
    <main
      ref={pageRef}
      data-testid="featured-page"
      // Clipping is set in index.css rather than here: the surface has to clip
      // like it always did, but leave the transport's shadow the room to fall
      // past its bottom edge.
      className="featured-immersive-surface relative isolate flex h-full min-w-0 flex-1"
    >
      {/* Behind everything, and only while a piece is open: the wash belongs to
          the record you are looking at, not to the shelf. Keyed on the piece so
          each cover reads its own colour from scratch. */}
      {openAlbum && <FeaturedGlow key={openAlbum.id} piece={openAlbum.tracks[0]} />}
      <FeaturedWebglLightField active={!openAlbum} variant={paper ? 'paper' : 'space'} />

      {/* Inset to exactly the bar's width, so every edge on the page — tiles,
          panels, the bar itself — lines up on the same two verticals. */}
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden px-4">
        {/* Hidden rather than unmounted while reading a piece, so the carousel
            returns to the exact logical position it held before opening. */}
        <div
          data-testid="featured-carousel-view"
          className={galleryShown
            ? `flex min-h-0 flex-col pb-[135px] pt-2 ${
              galleryLeaving
                // Taken out of flow while the piece behind it lays itself out,
                // and pinned to the column's own edges so that nothing in it
                // shifts on the way out.
                ? 'pointer-events-none absolute inset-y-0 left-4 right-4'
                : 'flex-1'
            }`
            : 'hidden'}
        >
          <header className={`relative z-10 pb-8 text-left ${galleryFade}`}>
            <h1 className="text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary">
              {t('navFeatured')}
            </h1>
          </header>

          <FeaturedCarousel
            ref={carouselRef}
            albums={albums}
            playingId={playingId}
            engineReady={engineReady}
            onOpen={openDetail}
            // A record pressed on the shelf starts at its first track; there is
            // nowhere else it could reasonably begin.
            onPlay={(album) => onPlay(album.tracks[0])}
            onStop={onStop}
            openId={openId}
            centerCoverHidden={galleryLeaving || galleryReturning}
            transition={galleryLeaving ? 'leaving' : galleryReturning ? 'entering' : null}
          />
        </div>

        {openAlbum && (
          <FeaturedDetail
            // Keyed on the record, so the track column starts at the top of
            // whichever one was opened rather than where the last one was left.
            key={openAlbum.id}
            album={openAlbum}
            playingId={playingId}
            trackId={currentPiece?.id ?? null}
            onSelectTrack={onSelect}
            engineReady={engineReady}
            onPlay={onPlay}
            onStop={onStop}
            opening={opening}
            onOpenInStudio={onOpenInStudio}
            onBack={closeDetail}
            transition={stage === 'opening' ? 'entering' : stage === 'closing' ? 'leaving' : null}
            coverHidden={stage === 'opening'}
          />
        )}
      </div>

      <FeaturedPlayerBar
        piece={currentPiece}
        isPlaying={currentPiece !== null && playingId === currentPiece.id}
        isPaused={currentPiece !== null && pausedId === currentPiece.id}
        engineReady={engineReady}
        opening={opening}
        onPlay={() => { if (currentPiece) onPlay(currentPiece); }}
        onPause={onPause}
        onPrev={prevPiece ? () => skipTo(prevPiece) : undefined}
        onNext={nextPiece ? () => skipTo(nextPiece) : undefined}
        onOpenInStudio={() => { if (currentPiece) onOpenInStudio(currentPiece); }}
        expanded={openAlbum !== null}
      />
    </main>
  );
}
