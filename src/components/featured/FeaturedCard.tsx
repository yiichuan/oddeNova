import { Disc3 } from 'lucide-react';
import { PlayIcon, StopIcon } from '../icons';
import { t } from '../../lib/i18n';
import type { FeaturedPiece } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';

const TILE_COVER = 'relative aspect-square w-full overflow-hidden rounded-[8px]';

interface FeaturedCardProps {
  piece: FeaturedPiece;
  /** Whether this piece is the one currently sounding. */
  isPlaying: boolean;
  /** Playback is refused until the engine is up. */
  engineReady: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onStop: () => void;
}

/**
 * One piece in the grid: a square cover with a transport tucked into its
 * lower-right corner, and the two credits underneath.
 *
 * Two things can be done to a tile — opened, or heard — so there are two real
 * buttons. The credits button stretches an overlay across the whole tile
 * (`after:inset-0`), which makes the cover open the piece without nesting a
 * button inside a button; the transport sits above that overlay on its own
 * layer.
 */
export default function FeaturedCard({
  piece,
  isPlaying,
  engineReady,
  onOpen,
  onPlay,
  onStop,
}: FeaturedCardProps) {
  const transportDisabled = !engineReady && !isPlaying;

  return (
    <div
      className="group relative flex w-full flex-col"
      data-testid={`featured-card-${piece.id}`}
    >
      <div className={TILE_COVER}>
        <FeaturedCover piece={piece} className="absolute inset-0 size-full" />

        {/* Fades in on hover, and on keyboard focus — otherwise the transport
            would be invisible to anyone not using a mouse. Fade only: the
            button sits in a fixed spot on the cover, and sliding it in would
            make it a moving target on the way to it. */}
        <button
          type="button"
          onClick={isPlaying ? onStop : onPlay}
          disabled={transportDisabled}
          title={transportDisabled ? t('engineStarting') : undefined}
          aria-label={`${isPlaying ? t('stop') : t('featuredPlayPiece')} — ${piece.title}`}
          data-testid={`featured-card-play-${piece.id}`}
          className={`absolute bottom-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-[#D8D8D8] text-black shadow-lg transition-opacity duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
            isPlaying ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          {isPlaying ? <StopIcon size={14} /> : <PlayIcon size={16} />}
        </button>

        <span className="pointer-events-none absolute inset-0 rounded-[8px] ring-inset ring-white/0 transition-[box-shadow] duration-200 group-hover:ring-1 group-hover:ring-white/15 motion-reduce:transition-none" />
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('featuredOpenDetail')} — ${piece.title}`}
        data-testid={`featured-card-open-${piece.id}`}
        className="mt-3 block min-w-0 text-left outline-none after:absolute after:inset-0 after:rounded-[10px] focus-visible:after:ring-2 focus-visible:after:ring-text-secondary"
      >
        <span className="block truncate font-dm-serif text-[24px] leading-tight text-text-primary">{piece.title}</span>
        <span className="mt-1 block truncate text-xs text-text-secondary">{piece.originalArtist}</span>
        <span className="mt-0.5 block truncate text-[11px] text-text-muted">
          {t('featuredCodedBy')} {piece.coder}
        </span>
      </button>
    </div>
  );
}

/**
 * A slot held open for a piece that is not in the collection yet, so a short
 * collection still reads as a grid rather than as one stranded tile.
 */
export function FeaturedCardPlaceholder() {
  return (
    <div className="flex w-full flex-col" data-testid="featured-card-placeholder">
      {/* The one tile that still needs an outline: without it an empty slot is
          just a hole in the grid. */}
      <div className={`${TILE_COVER} grid place-items-center border border-dashed border-border bg-white/[0.02]`}>
        <Disc3 size={28} strokeWidth={1.2} className="text-text-muted/40" aria-hidden="true" />
      </div>
      <span className="mt-3 block truncate text-sm text-text-muted">{t('featuredReserved')}</span>
    </div>
  );
}
