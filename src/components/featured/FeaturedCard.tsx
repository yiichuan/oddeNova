import { PlayIcon, StopIcon } from '../icons';
import { t, zh } from '../../lib/i18n';
import type { FeaturedAlbum } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';
import { coverLight, coverLightCss, type CoverRoom } from './featured-cover-light';
import FeaturedTiltSurface from './FeaturedTiltSurface';
import { useResolvedTheme } from '../../hooks/useAppearance';

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
 * buttons: the credits, which name the record and carry its focus ring across
 * the whole tile (`after:inset-0`), and the transport above them. Opening is
 * answered on the tile itself rather than on either of them; see the press on
 * the root below for why it cannot belong to anything the sleeve draws.
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
  // Which room the shelf is standing in. Every light on this tile — the lamp
  // over the artwork, the veil down its turned edge, the shadow it drops on
  // the shelf — is read from it.
  const room: CoverRoom = useResolvedTheme() === 'light' ? 'paper' : 'space';
  // The artwork on the sleeve is the first track's: an album's face is its
  // opening record, and a single has nothing else it could be.
  const [cover] = album.tracks;

  return (
    <div
      className="group relative flex w-full flex-col"
      data-testid={`featured-card-${album.id}`}
      /**
       * The press that opens the record, answered on the box that holds every
       * part of the tile rather than on any one of those parts.
       *
       * The lean is why. The sleeve tips away from the pointer, so the plane
       * that draws it is not where the browser hit-tests it: the side the hand
       * is on projects some 13px *inside* the resting box, and the far side
       * hangs that far outside it. Both edges move with the pointer, and they
       * move while it is being pressed — so which element is under the hand
       * when the button goes down is not reliably the one under it when the
       * button comes up, and a click is only ever delivered to the nearest
       * ancestor the two have in common. Give the press to any single part of
       * the tile — the artwork, the credits' overlay, a target laid in the
       * band the lean vacates — and the presses that straddle that part's edge
       * are answered by nothing at all: a corner that is plainly over the
       * sleeve and plainly does nothing, moving with the hand that is doing
       * the leaning.
       *
       * This element is that common ancestor, for every part and every pair of
       * parts. It is also the box the lean is read against, so a press landing
       * where the sleeve has tipped out of reach is over it by construction.
       * Nothing here has to agree with the geometry, which is the point: the
       * geometry is the thing that moves.
       */
      onClick={onOpen}
    >
      <FeaturedTiltSurface active={tiltable} room={room}>
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
            style={{ backgroundImage: coverLightCss(coverLight(turn, room)) }}
          />

        {/* Fades in on hover, and on keyboard focus — otherwise the transport
            would be invisible to anyone not using a mouse. Fade only: the
            button sits in a fixed spot on the cover, and sliding it in would
            make it a moving target on the way to it. */}
        <button
          type="button"
          // Playing is not opening, so this press stops here rather than
          // reaching the tile underneath, which answers everything else.
          onClick={(event) => {
            event.stopPropagation();
            if (isPlaying) onStop(); else onPlay();
          }}
          disabled={transportDisabled}
          tabIndex={focusable ? undefined : -1}
          title={transportDisabled ? t('engineStarting') : undefined}
          aria-label={`${isPlaying ? t('stop') : t('featuredPlayPiece')} — ${album.title}`}
          data-testid={`featured-card-play-${album.id}`}
          // `cursor-[inherit]`: see the note on the credits button below.
          className={`absolute bottom-3 right-3 z-10 grid size-10 place-items-center cursor-[inherit] rounded-full bg-action-fill text-action-text shadow-lg transition-opacity duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-action-fill-hover disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
            isPlaying ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          {isPlaying ? <StopIcon size={14} /> : <PlayIcon size={16} />}
        </button>

          <span className="pointer-events-none absolute inset-0 rounded-[2px] ring-inset ring-white/0 transition-[box-shadow] duration-200 group-hover:ring-1 group-hover:ring-[color:var(--featured-cover-ring)] motion-reduce:transition-none" />
        </div>

        {/* The record's name, and the tile's one named control: it is what a
            screen reader announces and what the focus ring is drawn around.
            No press of its own — a keyboard's Enter and Space raise a click
            here like any other, and it reaches the tile the same way a
            pointer's does, so opening the record is written once. */}
        <button
          type="button"
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
