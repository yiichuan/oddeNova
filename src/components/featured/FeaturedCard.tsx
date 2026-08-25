import { PlayIcon, StopIcon } from '../icons';
import { t, zh } from '../../lib/i18n';
import type { FeaturedAlbum } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';
import { coverLight, coverLightCss } from './featured-cover-light';
import FeaturedTiltSurface from './FeaturedTiltSurface';

const TILE_COVER = 'relative aspect-square w-full overflow-hidden rounded-[2px]';

/** Two names on one line are a list, and a list is punctuated per language. */
const CREDIT_SEPARATOR = zh ? '、' : ', ';

interface FeaturedCardProps {
  album: FeaturedAlbum;
  /** Whether anything on this record is the one currently sounding. */
  isPlaying: boolean;
  /** Playback is refused until the engine is up. */
  engineReady: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onStop: () => void;
  showMetadata?: boolean;
  tiltable?: boolean;
  /**
   * How far the sleeve is turned away from the viewer, in degrees of `rotateY`.
   * It is the light that needs to know: a turned sleeve is lit down one edge
   * and shaded down the other. A tile lying flat to the viewer passes nothing.
   */
  turn?: number;
  /**
   * Whether the tile is a stop on the way through the page. A sleeve seen from
   * the side of the carousel is still pressable, but it is announced as part of
   * the wheel rather than as a tile of its own, so nothing in it takes focus.
   */
  focusable?: boolean;
  /**
   * The cover is in flight between this tile and the detail view: hold the
   * tile's place, but let the copy overhead be the only one on screen.
   */
  coverHidden?: boolean;
}

/**
 * One record in the collection: a square cover with a transport tucked into its
 * lower-right corner, and the two credits underneath.
 *
 * A record is an album, which may be a single — so the name under the cover is
 * the album's, and the credits are everyone who had a hand in it, each named
 * once. An album of one therefore looks exactly like the tile always did.
 *
 * Two things can be done to a tile — opened, or heard — so there are two real
 * buttons. The credits button stretches an overlay across the whole tile
 * (`after:inset-0`), which makes the cover open the record without nesting a
 * button inside a button; the transport sits above that overlay on its own
 * layer.
 *
 * Both stay live even when the credits themselves are hidden: a sleeve turned
 * away at the side of the carousel is still a record you can press and play,
 * and only its writing is too small to be worth showing.
 */
export default function FeaturedCard({
  album,
  isPlaying,
  engineReady,
  onOpen,
  onPlay,
  onStop,
  showMetadata = true,
  tiltable = false,
  focusable = true,
  turn = 0,
  coverHidden = false,
}: FeaturedCardProps) {
  const transportDisabled = !engineReady && !isPlaying;
  // The artwork on the sleeve is the first track's: an album's face is its
  // opening record, and a single has nothing else it could be.
  const [cover] = album.tracks;

  return (
    <div
      className="group relative flex w-full flex-col"
      data-testid={`featured-card-${album.id}`}
    >
      <FeaturedTiltSurface active={tiltable}>
        <div
          className={`${TILE_COVER} bg-[#05070a] ${coverHidden ? 'invisible' : ''}`}
          style={{ boxShadow: 'var(--tilt-shadow)' }}
        >
          <FeaturedCover
            piece={cover}
            className="absolute inset-0 size-full"
            flightRole="carousel"
          />

          {/* The light the sleeve stands in, laid over the artwork rather than
              filtered through it — a shadow falls across a cover without
              changing the colours it was printed in. Under the transport and
              under the pointer's own highlight, both of which are lights of
              their own on top of this one. */}
          <span
            aria-hidden="true"
            data-featured-cover-light
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: coverLightCss(coverLight(turn)) }}
          />

        {/* Fades in on hover, and on keyboard focus — otherwise the transport
            would be invisible to anyone not using a mouse. Fade only: the
            button sits in a fixed spot on the cover, and sliding it in would
            make it a moving target on the way to it. */}
        <button
          type="button"
          onClick={isPlaying ? onStop : onPlay}
          disabled={transportDisabled}
          tabIndex={focusable ? undefined : -1}
          title={transportDisabled ? t('engineStarting') : undefined}
          aria-label={`${isPlaying ? t('stop') : t('featuredPlayPiece')} — ${album.title}`}
          data-testid={`featured-card-play-${album.id}`}
          // `cursor-[inherit]`: see the note on the credits button below.
          className={`absolute bottom-3 right-3 z-10 grid size-10 place-items-center cursor-[inherit] rounded-full bg-[#D8D8D8] text-black shadow-lg transition-opacity duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
            isPlaying ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          {isPlaying ? <StopIcon size={14} /> : <PlayIcon size={16} />}
        </button>

          <span className="pointer-events-none absolute inset-0 rounded-[2px] ring-inset ring-white/0 transition-[box-shadow] duration-200 group-hover:ring-1 group-hover:ring-white/15 motion-reduce:transition-none" />
        </div>

        <button
          type="button"
          onClick={onOpen}
          tabIndex={focusable ? undefined : -1}
          aria-label={`${t('featuredOpenDetail')} — ${album.title}`}
          data-featured-card-meta
          data-testid={`featured-card-open-${album.id}`}
          /* `cursor-[inherit]`: the tile stands on a surface that can be taken
             hold of and turned, so it wears that surface's cursor rather than
             the arrow a button comes with. The tile also leans under the
             pointer, which moves its own edges a pixel or two at a time — a
             cursor of its own would flicker along every one of them. */
          className={`mt-3 block w-full min-w-0 cursor-[inherit] border-0 bg-transparent p-0 text-center outline-none transition-opacity duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] after:absolute after:inset-0 after:rounded-[2px] focus-visible:after:ring-2 focus-visible:after:ring-text-secondary motion-reduce:transition-none ${
            showMetadata ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="block truncate text-center font-dm-serif text-[24px] leading-tight text-text-primary">{album.title}</span>
          <span className="mt-1 block truncate text-center text-xs text-text-secondary">
            {album.originalArtists.join(CREDIT_SEPARATOR)}
          </span>
          <span className="mt-0.5 block truncate text-center text-[11px] text-text-muted">
            {t('featuredCodedBy')} {album.coders.join(CREDIT_SEPARATOR)}
          </span>
        </button>
      </FeaturedTiltSurface>
    </div>
  );
}
