import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowUpRight, Link2 } from 'lucide-react';
import { GitHubLogoIcon, InstagramLogoIcon, PlayIcon, StopIcon, XLogoIcon } from '../icons';
import { t, zh } from '../../lib/i18n';
import {
  FEATURED_COLLECTION_URL,
  type FeaturedAlbum,
  type FeaturedPiece,
} from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';
import FeaturedTitleWheel from './FeaturedTitleWheel';
import { useWheelPosition, wheelLabel } from './featured-wheel';

interface FeaturedDetailProps {
  /** The record being read: one track under its own name, or several under an album's. */
  album: FeaturedAlbum;
  /** The track currently sounding, if any — which may be one from another record. */
  playingId: string | null;
  /**
   * The track being read. It is the piece the transport bar is parked on: the
   * page and the bar are two views of one selection rather than two selections
   * that happen to start in the same place, so a skip on the bar turns this
   * record's column and a pick in the column re-parks the bar.
   *
   * Null, or a piece belonging to some other record, leaves the column where
   * it stands — nothing on this page has been asked for.
   */
  trackId: string | null;
  /** The column came to rest on another track of this record. */
  onSelectTrack: (track: FeaturedPiece) => void;
  /** Playback is refused until the engine is up. */
  engineReady: boolean;
  onPlay: (track: FeaturedPiece) => void;
  onStop: () => void;
  /** True while a track is being copied into a new session. */
  opening: boolean;
  onOpenInStudio: (track: FeaturedPiece) => void;
  onBack: () => void;
  /**
   * Whether this view is arriving or leaving. Everything but the cover fades
   * with it; the cover is being flown in or out by the page.
   */
  transition?: 'entering' | 'leaving' | null;
  /** The flying copy is standing in for the cover — keep its place, not it. */
  coverHidden?: boolean;
}

/**
 * Every small action on this page wears the same pill, so the row under the
 * cover and the one in the code panel's header read as one set of controls.
 * Outlined for the credits, which sit on open page; filled for the one action
 * inside a panel, where a stroke would be a third line next to the panel's own
 * edge and the title beside it.
 */
const PILL_SHAPE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full text-text-secondary transition-colors hover:text-text-primary';
const PILL_OUTLINE = `${PILL_SHAPE} h-8 px-3 text-xs border border-white/10 hover:border-white/25`;
// A size up from the credits below the cover: this one answers to a 20px panel
// title, not to a 14px line of text.
const PILL_FILLED = `${PILL_SHAPE} h-9 px-3.5 text-[13px] bg-white/10 hover:bg-white/[0.16]`;

/**
 * A credit that goes somewhere: the mark of the place it goes to, then its
 * name. The logo is the part that gets read — "X" and the Octocat say where the
 * link lands faster than the words beside them do.
 */
function SourceLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={PILL_OUTLINE}
    >
      {icon}
      {label}
    </a>
  );
}

/**
 * A piece's own link is wherever its author published it — a post on X, a file
 * in their repo, a reel on Instagram — so the mark and the word beside it are
 * read off the host rather than carried per piece. Adding a piece is adding a
 * URL, and nothing else has to be told about it.
 *
 * The sizes differ because the marks do: the Octocat and the camera fill their
 * box, the X does not, so an 11px X sits at the same optical weight as a 13px
 * logo next to it.
 *
 * Whether that link is a repo decides one more thing than its own label: a
 * piece that already points at the code it is made of has no use for a second
 * repo beside it, so the collection is credited only where the piece's own link
 * is a post — see the row it is read in.
 */
function sourceCredit(url: string): { icon: React.ReactNode; label: string; isRepo: boolean } {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }

  if (host === 'x.com' || host === 'twitter.com') {
    return { icon: <XLogoIcon size={11} />, label: t('featuredSourcePost'), isRepo: false };
  }
  if (host === 'github.com') {
    return { icon: <GitHubLogoIcon size={13} />, label: t('featuredSourceRepo'), isRepo: true };
  }
  if (host === 'instagram.com') {
    return { icon: <InstagramLogoIcon size={13} />, label: t('featuredSourcePost'), isRepo: false };
  }
  // Somewhere we have not met yet: say "a link", rather than say the wrong site.
  return {
    icon: <Link2 size={13} strokeWidth={1.6} aria-hidden="true" />,
    label: t('featuredSourcePost'),
    isRepo: false,
  };
}

/**
 * A panel holds its heading still and scrolls its body. The page itself does
 * not scroll here, so these two are where all the length lives.
 *
 * Glass rather than a solid fill: the cover's colour wash runs behind the whole
 * page, and an opaque panel would punch two dark holes in it. Dark enough at
 * 55% for code to stay legible over whatever colour is back there, with a
 * hairline edge so the panel still has a shape where the wash behind it happens
 * to match the fill.
 *
 * The header bar is a fixed 36px whether or not the panel carries an action, so
 * the two panels' bodies start on the same line.
 */
function Panel({
  title,
  action,
  children,
  bodyClassName = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-white/10 bg-[#0D0D0D]/55 p-5 backdrop-blur-2xl"
    >
      <div className="mb-5 flex h-9 shrink-0 items-center justify-between gap-3">
        <h2 className="truncate text-xl font-medium uppercase tracking-[0.08em] text-text-primary">
          {title}
        </h2>
        {action}
      </div>

      {/* The body runs out past the panel's right padding so its scrollbar sits
          6px off the edge rather than 20px in; the matching pr keeps the text
          the same distance clear of the bar it scrolls with. */}
      <div className={`-mr-3.5 min-h-0 flex-1 overflow-auto pr-3.5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * One record, opened up: the cover and its credits across the top, the script
 * and the notes about it side by side underneath.
 *
 * A record with more than one track puts its track list where the collection's
 * own list stands, in the top right — the same column, the same marker, the
 * same drag, because it is the same act of picking one of a short list without
 * leaving the page. Which track is being read is not state of this page's own:
 * it is wherever that column has come to rest, which is also where the page
 * above keeps the transport bar parked, and everything here but the cover and
 * the list answers to it.
 *
 * The two panels are deliberately the same size class — reading the code and
 * reading what the code is doing is one activity here, and burying either in a
 * secondary column would break that. Playback stays with the page's transport
 * bar, which is parked on whatever track this page is showing: picking a title
 * points the bar at it and silences whatever else was sounding, so the bar
 * never names one piece while another one plays.
 */
export default function FeaturedDetail({
  album,
  playingId,
  trackId,
  onSelectTrack,
  engineReady,
  onPlay,
  onStop,
  opening,
  onOpenInStudio,
  onBack,
  transition = null,
  coverHidden = false,
}: FeaturedDetailProps) {
  const { position, index, snapTo, scrubTo, settleScrub } = useWheelPosition(
    album.tracks.length,
    {
      // Opened at whichever track the bar was pointed at — a skip that steps
      // off one record and onto this one arrives on the track it asked for
      // rather than at the top of the new record and then travelling.
      initialIndex: Math.max(album.tracks.findIndex((entry) => entry.id === trackId), 0),
      // Announced on arrival rather than on the pick, so what the bar is parked
      // on changes at the same moment the page around it does.
      onSettle: (settled) => {
        const arrived = album.tracks[settled];
        if (arrived) onSelectTrack(arrived);
      },
    },
  );
  const track = album.tracks[index] ?? album.tracks[0];

  /* The bar moving and the column moving are one act seen from either end, so
     a skip that lands on this record walks the column round to it.
     
     Guarded by what was last followed rather than by comparing against the
     column: the column's own arrival comes back through this prop a moment
     later, and comparing would read that echo as an instruction to go back. */
  const followedRef = useRef(trackId);
  useEffect(() => {
    if (followedRef.current === trackId) return;
    followedRef.current = trackId;
    const target = album.tracks.findIndex((entry) => entry.id === trackId);
    if (target >= 0) snapTo(target);
  }, [album, snapTo, trackId]);
  const source = sourceCredit(track.sourceUrl);
  const isPlaying = playingId === track.id;
  const transportDisabled = !engineReady && !isPlaying;
  // Carried by each block of content rather than by the view's root: the root
  // holds the cover, and fading that would leave the flying copy handing over
  // to a half-drawn picture.
  const contentFade = transition === 'entering'
    ? 'featured-content-in'
    : transition === 'leaving'
      ? 'featured-content-out'
      : '';
  // A track arriving on a page that is already open comes in the way the page
  // itself did. The blocks below are keyed on the track, so each one is a new
  // element and the animation runs from its start rather than being a class
  // that has already played.
  const trackFade = contentFade || 'featured-content-in';

  return (
    // pt-[11px] puts the back button's centre 27px down — the same line the
    // primary nav's logo button sits on, since both columns start at the
    // shell's 10px inset. pb = the bar's 98px + the 24px above it, which is the
    // same measure as the gap between the two panels; the bar itself lands on
    // the foot of the column, level with the primary nav.
    <div
      data-testid="featured-detail"
      className="relative flex min-h-0 w-full flex-1 flex-col pb-[122px] pt-[11px]"
    >
      {album.tracks.length > 1 && (
        <FeaturedTitleWheel
          labels={album.tracks.map((entry) => wheelLabel(entry.title))}
          position={position}
          onSelect={snapTo}
          onScrub={scrubTo}
          onScrubEnd={settleScrub}
          ariaLabel={t('featuredAlbumTracks').replace('{album}', album.title)}
          testId="featured-album-tracks"
          className={contentFade}
        />
      )}
      <button
        type="button"
        onClick={onBack}
        data-testid="featured-detail-back"
        className={`inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-sm text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary ${contentFade}`}
      >
        <ArrowLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        {t('featuredBack')}
      </button>

      {/* Cover and credits: the cover is small here — it has already done its
          job of being recognised in the grid.

          The column stretches to the cover's 160px and the action row is pushed
          to its foot, so the two halves of the header start and finish on the
          same two lines. Everything above the row is sized to leave that room:
          if a long name ever wraps past it the column simply grows, and pt-3
          keeps the buttons off the text when it does. */}
      <header className="mt-6 flex shrink-0 gap-6">
        <FeaturedCover
          piece={track}
          flightRole="detail"
          className={`size-[160px] shrink-0 rounded-[10px] ${coverHidden ? 'invisible' : ''}`}
        />

        <div key={track.id} className={`flex min-w-0 flex-1 flex-col ${trackFade}`}>
          {/* EB Garamond ships one weight, so this stays regular rather than
              asking the browser to fake a bold; a serif at this size does not
              want the tight tracking a sans display face does either. */}
          <h1 className="font-dm-serif text-[24px] leading-tight text-text-primary">
            {track.title}
          </h1>
          <p className="mt-2 text-xs text-text-secondary">{track.originalArtist}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t('featuredCodedBy')} {track.coder}
          </p>
          {/* Where the music comes from, under the two people who made this
              version of it. Every piece says it, whether the record it names
              holds one track or several — on an album it is also how the page
              tells you which sleeve you opened, since the name above is the
              track's rather than the record's. */}
          <p className="mt-3 text-xs leading-5 text-text-muted">
            {t('featuredAlbumOf').replace('{album}', track.album)}
          </p>
          {/* Hearing it comes first, then where it came from. A piece published
              in a repo names that repo and stops there — it is already the code
              — while one published in a post names the post and the collection
              the code was found in. The Strudel permalink is one tap further in
              either way: what it points at is on this page, in the window
              below. */}
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
            <button
              type="button"
              onClick={isPlaying ? onStop : () => onPlay(track)}
              disabled={transportDisabled}
              title={transportDisabled ? t('engineStarting') : undefined}
              aria-label={isPlaying ? t('stop') : t('featuredPlayPiece')}
              data-testid="featured-detail-play"
              className="grid size-8 place-items-center rounded-full bg-[#D8D8D8] text-black transition duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? <StopIcon size={12} /> : <PlayIcon size={14} />}
            </button>
            <SourceLink href={track.sourceUrl} icon={source.icon} label={source.label} />
            {!source.isRepo && (
              <SourceLink
                href={FEATURED_COLLECTION_URL}
                label={t('featuredSourceCollection')}
                icon={<GitHubLogoIcon size={13} />}
              />
            )}
          </div>
        </div>
      </header>

      {/* The two panels take whatever height is left, so their feet land just
          above the transport bar however tall the window is. */}
      <div
        key={track.id}
        className={`mt-10 grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] ${trackFade}`}
      >
        <Panel
          title={t('featuredCode')}
          bodyClassName="featured-code-scroll"
          action={
            <button
              type="button"
              onClick={() => onOpenInStudio(track)}
              disabled={opening}
              data-testid="featured-detail-open-in-studio"
              className={`${PILL_FILLED} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {t('featuredOpenInStudio')}
              <ArrowUpRight size={15} strokeWidth={1.6} aria-hidden="true" />
            </button>
          }
        >
          {/* Read-only: the editable copy is what "open in studio" is for.
              Typeset like the studio's editor, with a tighter leading so a long
              script stays skimmable. */}
          <pre
            data-testid="featured-code"
            className="text-sm text-text-secondary"
            style={{ fontFamily: "'ABeeZee', monospace", lineHeight: 1.8, letterSpacing: '0.06em' }}
          >
            <code>{track.code}</code>
          </pre>
        </Panel>

        <Panel title={t('featuredNotes')}>
          {/* One measure for the whole panel: everything reads down the left
              edge as label-over-value, 4px apart inside an entry and 16px
              between entries, so the spacing itself says which lines belong
              together. */}
          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-text-muted">{t('featuredStyle')}</dt>
              <dd className="mt-1 text-text-secondary">{track.style}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{t('featuredTempo')}</dt>
              <dd className="mt-1 tabular-nums text-text-secondary">{track.bpm} BPM</dd>
            </div>
          </dl>

          {/* No box around the voices: the heading sits over its list the way
              a label sits over its value, and the spacing is what groups them —
              a border would be saying it twice. The list runs tighter than the
              entries above it — a voice's description sits straight under its
              name, with 6px between voices — because there are nine of them and
              they are read as one block. */}
          <h3 className="pb-1 pt-4 text-sm text-text-muted">{t('featuredLayers')}</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {/* Two voices in one script can carry the same name — `$:` twice
                over is two anonymous layers — so the row is keyed by where it
                stands in the list as well. */}
            {track.layers.map((layer, order) => (
              <li key={`${layer.name}-${order}`}>
                <span
                  className="block text-text-secondary"
                  style={{ fontFamily: "'ABeeZee', monospace" }}
                >
                  {layer.name}
                </span>
                {/* Two sizes down from the binding it belongs to, so a voice
                    reads as its name first and its description second. */}
                <span className="block text-xs leading-5 text-text-muted">
                  {zh ? layer.detail[0] : layer.detail[1]}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
