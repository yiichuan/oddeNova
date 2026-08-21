import { useState } from 'react';
import { t } from '../../lib/i18n';
import { FEATURED_ROW_SIZE, type FeaturedPiece } from '../../lib/featured-pieces';
import FeaturedCard, { FeaturedCardPlaceholder } from './FeaturedCard';
import FeaturedDetail from './FeaturedDetail';
import FeaturedGlow from './FeaturedGlow';
import FeaturedPlayerBar from './FeaturedPlayerBar';

interface FeaturedPageProps {
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
  onStop: () => void;
  onPause: () => void;
  onOpenInStudio: (piece: FeaturedPiece) => void;
}

/**
 * The Featured page: the collection as a grid of covers, one piece opened up
 * when a tile is picked, and a floating transport across the foot of both.
 *
 * Which of the two views is showing is this component's own business — it is
 * where you are on the page, not something the app has to know about, and the
 * page stays mounted while you are elsewhere so it is still where you left it
 * when you come back. Playback deliberately outlives the trip in and out of a
 * piece: the bar is the same bar, and the music does not stop to let you read.
 */
export default function FeaturedPage({
  pieces,
  currentPiece,
  playingId,
  pausedId,
  engineReady,
  opening,
  onPlay,
  onStop,
  onPause,
  onOpenInStudio,
}: FeaturedPageProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openPiece = pieces.find((piece) => piece.id === openId) ?? null;

  // Hold the first row open. One real tile stranded beside empty space reads as
  // a broken grid; reserved slots read as a collection that is still filling up.
  const reserved = Math.max(0, FEATURED_ROW_SIZE - pieces.length);

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
      data-testid="featured-page"
      className="relative flex h-full min-w-0 flex-1 overflow-hidden"
    >
      {/* Behind everything, and only while a piece is open: the wash belongs to
          the record you are looking at, not to the shelf. Keyed on the piece so
          each cover reads its own colour from scratch. */}
      {openPiece && <FeaturedGlow key={openPiece.id} piece={openPiece} />}

      {/* Inset to exactly the bar's width, so every edge on the page — tiles,
          panels, the bar itself — lines up on the same two verticals. */}
      <div className="relative flex h-full w-full flex-col overflow-hidden px-4">
        {openPiece ? (
          <FeaturedDetail
            piece={openPiece}
            isPlaying={playingId === openPiece.id}
            engineReady={engineReady}
            onPlay={() => onPlay(openPiece)}
            onStop={onStop}
            opening={opening}
            onOpenInStudio={() => onOpenInStudio(openPiece)}
            onBack={() => setOpenId(null)}
          />
        ) : (
          // The grid is the one view that scrolls as a whole: it grows with the
          // collection, and there is nothing in it to hold still for.
          <div className="min-h-0 flex-1 overflow-y-auto pb-[135px] pt-[clamp(28px,6vh,64px)]">
            <header className="pb-14 text-center">
              <h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-text-primary">
                {t('navFeatured')}
              </h1>
            </header>

            <section
              aria-label={t('featuredList')}
              className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4"
            >
              {pieces.map((piece) => (
                <FeaturedCard
                  key={piece.id}
                  piece={piece}
                  isPlaying={playingId === piece.id}
                  engineReady={engineReady}
                  onOpen={() => setOpenId(piece.id)}
                  onPlay={() => onPlay(piece)}
                  onStop={onStop}
                />
              ))}
              {Array.from({ length: reserved }, (_, index) => (
                <FeaturedCardPlaceholder key={`reserved-${index}`} />
              ))}
            </section>
          </div>
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
        onPrev={prevPiece ? () => onPlay(prevPiece) : undefined}
        onNext={nextPiece ? () => onPlay(nextPiece) : undefined}
        onOpenInStudio={() => { if (currentPiece) onOpenInStudio(currentPiece); }}
      />
    </main>
  );
}
