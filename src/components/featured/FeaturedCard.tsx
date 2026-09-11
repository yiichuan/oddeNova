import { t, zh } from '../../lib/i18n';
import type { FeaturedAlbum } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';
import {
  coverGlazeCss,
  coverLight,
  coverLightCss,
  type CoverRoom,
} from './featured-cover-light';
import FeaturedTiltSurface from './FeaturedTiltSurface';
import { useResolvedTheme } from '../../hooks/useAppearance';

/* `isolate`: the glaze over the artwork is laid on in soft light, and what it
   is meant to light is the artwork under it — not the sleeve standing behind
   this one on the wheel, nor the room behind that. */
const TILE_COVER = 'relative isolate aspect-square w-full overflow-hidden rounded-[2px]';

/** Two names on one line are a list, and a list is punctuated per language. */
const CREDIT_SEPARATOR = zh ? '、' : ', ';

interface FeaturedCardProps {
  album: FeaturedAlbum;
  onOpen: () => void;
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
 * One record in the collection: a square cover with the two credits underneath.
 *
 * A record is an album, which may be a single — so the name under the cover is
 * the album's, and the credits are everyone who had a hand in it, each named
 * once. An album of one therefore looks exactly like the tile always did.
 *
 * One thing can be done to a tile, which is to open the record, so it carries
 * one real button: the credits, which name the record and carry its focus ring
 * across the whole tile (`after:inset-0`). Opening is answered on the tile
 * itself rather than on that button; see the press on the root below for why it
 * cannot belong to anything the sleeve draws.
 *
 * The tile used to carry a transport of its own, in the corner of the artwork.
 * It went when the shelf and the bar became one selection: the record in the
 * middle of the wheel is the record the bar is parked on, and the bar is
 * directly under it with a play button on it. Two transports for one record,
 * one of them only reachable by hovering the artwork, is a second way of saying
 * a thing the page already says plainly.
 */
export default function FeaturedCard({
  album,
  onOpen,
  showMetadata = true,
  tiltable = false,
  focusable = true,
  turn = 0,
  coverHidden = false,
}: FeaturedCardProps) {
  // Which room the shelf is standing in. Every light on this tile — the lamp
  // over the artwork, the veil down its turned edge, the shadow it drops on
  // the shelf — is read from it.
  const room: CoverRoom = useResolvedTheme() === 'light' ? 'paper' : 'space';
  // The artwork on the sleeve is the first track's: an album's face is its
  // opening record, and a single has nothing else it could be.
  const [cover] = album.tracks;
  // How the sleeve stands in that room — one reading for the two layers that
  // draw it.
  const sleeveLight = coverLight(turn, room);

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
          data-featured-sleeve
          className={`${TILE_COVER} bg-[#05070a] ${coverHidden ? 'invisible' : ''}`}
          style={{ boxShadow: 'var(--tilt-shadow)' }}
        >
          <FeaturedCover
            piece={cover}
            className="absolute inset-0 size-full rounded-[2px]"
            flightRole="carousel"
          />

          {/* What the sleeve loses: the shade down the edge that turned away,
              and the lamp's fall from the waist of the cover to its foot. Laid
              over the artwork rather than filtered through it — a shadow falls
              across a cover without changing the colours it was printed in.
              Under the pointer's own highlight, which is a light of its own on
              top of this one. */}
          <span
            aria-hidden="true"
            data-featured-cover-light
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: coverLightCss(sleeveLight) }}
          />

          {/* And what it catches. Its own layer because it is put on
              differently: white laid over artwork stands in front of it and
              lifts the black in the picture along with everything else, which
              is the haze a lit cover comes back as. In soft light the same
              gradient lights what is already there instead — see
              coverGlazeCss. */}
          <span
            aria-hidden="true"
            data-featured-cover-glaze
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{ backgroundImage: coverGlazeCss(sleeveLight) }}
          />

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
