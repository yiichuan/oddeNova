import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { ArrowUpRight, ChevronLeft, Link2 } from 'lucide-react';
import { t, zh } from '../../lib/i18n';
import { FEATURED_COLLECTION_URL, type FeaturedPiece } from '../../lib/featured-pieces';
import { GitHubLogoIcon, InstagramLogoIcon, PlayIcon, StopIcon, XLogoIcon } from '../icons';
import { featuredSessionDraft } from '../../lib/featured-session';
import { ShareButton } from '../studio/TopActionBar';
import ScrollingTitle from '../common/ScrollingTitle';
import { FeaturedCover } from './featured-cover';

/* Laid out under a phone's own top bar, the same as every other mobile page
   here: the view is the whole window, so the device's furniture has to be kept
   off its contents by hand. */
const SAFE_TOP = 'max(12px, env(safe-area-inset-top))';

/**
 * Where the reading gives out at either end of the page — the shelf's own two
 * lines, kept to the pixel (see HEAD_CLEAR / HEAD in MobileFeaturedPage), since
 * what makes the collection and the record one place is that a thing leaving
 * the page leaves it at the same height in both.
 *
 * Nothing at all as high as the two keys, coming back over the short reach
 * below them, whole from there to the underside of the transport, and gone
 * again by the bottom edge.
 */
const HEAD_CLEAR = `calc(${SAFE_TOP} + 34px)`;
const HEAD = `calc(${SAFE_TOP} + 54px)`;
const FOOT_FADE = '28px';

/**
 * A mask on the reading rather than a pane laid over it — the shelf's answer,
 * for the shelf's reason: the cover's colour wash runs behind this page too,
 * and a strip of anything laid across it is either a shade off the wash or a
 * blur of it. Masked, the writing simply stops being there, and what is left is
 * the room, exactly as the room was.
 *
 * On the box that scrolls rather than on what scrolls inside it, so the two
 * ends stay put on the window while the column runs past them.
 */
const COLUMN_MASK = `linear-gradient(to bottom, transparent 0%, transparent ${HEAD_CLEAR}, `
  + `#000 ${HEAD}, #000 calc(100% - ${FOOT_FADE}), transparent 100%)`;

/**
 * How long a bar stays up after the reading stops moving — the mobile code
 * editor's own wait (see SCROLLBAR_IDLE_MS in CodePanel), so every scrollbar on
 * this layout is one behaviour: a flick, its glide, and the pause taken to read
 * where it landed all sit inside a single showing.
 */
const SCROLLBAR_IDLE_MS = 2000;

/**
 * How tall the script's window stands.
 *
 * A share of the page rather than a length, because what it has to be is a
 * proportion of the column it is read in: enough of the script to be worth
 * scrolling — twenty-odd lines, most of a short piece at once — and not so much
 * that the notes under it fall off the bottom of every phone. The floor is for a
 * short window in landscape, where half the height is a handful of lines and a
 * scrollbar.
 *
 * Given as a style rather than a class: the panel's own box already carries
 * `min-h-0`, which is what lets it be a window at all, and two min-heights in
 * one class list are decided by the order the stylesheet happens to be built
 * in rather than by which one was meant.
 */
const CODE_WINDOW = { height: '52vh', minHeight: 280 } as const;

/**
 * The two keys in the top bar, cut to the shelf's own: a 36px hit area holding
 * a 20px glyph, grey at rest and full strength under the thumb.
 */
const BAR_KEY = 'flex h-9 w-9 items-center justify-center text-text-secondary'
  + ' transition-colors hover:text-text-primary';

/**
 * Every small action on this page wears the same pill — the credits under the
 * cover and the one action in the script's header read as one set of controls.
 * Outlined for the credits, which sit on open page; filled for the one inside a
 * panel, where a stroke would be a third line beside the panel's own edge.
 */
const PILL_SHAPE = 'inline-flex shrink-0 items-center gap-1.5 rounded-full'
  + ' text-text-secondary transition-colors hover:text-text-primary';
const PILL_OUTLINE = `${PILL_SHAPE} h-8 px-3 text-xs border`
  + ' border-[color:var(--featured-hairline)] hover:border-[color:var(--featured-hairline-hover)]';
const PILL_FILLED = `${PILL_SHAPE} h-8 px-3 text-xs`
  + ' bg-[var(--featured-fill)] hover:bg-[var(--featured-fill-hover)]';

/**
 * The bar, while the reading is moving and for a moment after.
 *
 * The collection's own windows are read with a thumb, so nothing stands
 * permanently down their side: the bar comes up while the reading is being
 * moved and goes away once it has been left alone — which is how a phone's own
 * scrollbars behave, and what the mobile Favorites reading wears. The flag is
 * set here rather than in CSS because a scrollbar cannot be styled by the fact
 * that it is scrolling; `.scrollbar-on-scroll` in index.css is what reads it.
 */
function useScrollbarOnScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return undefined;

    let idle = 0;
    const onScroll = () => {
      scroller.dataset.scrolling = 'true';
      window.clearTimeout(idle);
      idle = window.setTimeout(() => { delete scroller.dataset.scrolling; }, SCROLLBAR_IDLE_MS);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.clearTimeout(idle);
      delete scroller.dataset.scrolling;
    };
  }, [ref]);
}

/**
 * A credit that goes somewhere: the mark of the place it goes to, then its
 * name. The logo is the part that gets read — "X" and the Octocat say where the
 * link lands faster than the words beside them do.
 */
function SourceLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={PILL_OUTLINE}>
      {icon}
      {label}
    </a>
  );
}

/**
 * A piece's own link is wherever its author published it — a post on X, a file
 * in their repo, a reel on Instagram — so the mark and the word beside it are
 * read off the host rather than carried per piece.
 *
 * The sizes differ because the marks do: the Octocat and the camera fill their
 * box, the X does not, so an 11px X sits at the same optical weight as a 13px
 * logo next to it.
 *
 * Whether the link is a repo decides one more thing than its own label: a piece
 * that already points at the code it is made of has no use for a second repo
 * beside it, so the collection is credited only where the piece's own link is a
 * post.
 */
function sourceCredit(url: string): { icon: ReactNode; label: string; isRepo: boolean } {
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
 * A panel holds its heading still and shows its body under it — the display's
 * own, at the measure a phone has for it.
 *
 * Glass rather than a solid fill: the cover's colour wash runs behind the whole
 * page, and an opaque panel would punch a dark hole in it. `featured-panel`
 * carries the rim, which is a masked ring drawn inside the padding box rather
 * than a border, because `overflow-hidden` would clip anything outside it.
 */
function Panel({
  title,
  action,
  children,
  bodyClassName = '',
  bodyRef,
  style,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  /** The body is the scroller where the panel is a window; this is its handle. */
  bodyRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
}) {
  return (
    <section
      aria-label={title}
      style={style}
      className="featured-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-[#0D0D0D]/55 p-4 backdrop-blur-2xl"
    >
      {/* A fixed row whether or not the panel carries an action, so the two
          panels' bodies start the same distance under their own titles. */}
      <div className="mb-3 flex h-8 shrink-0 items-center justify-between gap-3">
        <h2 className="truncate text-lg font-medium uppercase tracking-[0.08em] text-text-primary">
          {title}
        </h2>
        {action}
      </div>
      <div ref={bodyRef} className={`min-w-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

interface MobileFeaturedDetailProps {
  /**
   * The track being read — the piece the transport is parked on, when that
   * piece belongs to this record. The page and the bar are two views of one
   * selection, so a skip that walks within the record redraws this view around
   * the track it landed on.
   */
  track: FeaturedPiece;
  /** The track currently sounding, if any — which may be one from another record. */
  playingId: string | null;
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
 * One record, opened up, on a phone.
 *
 * The display lays a piece out in two halves: the cover and its credits across
 * the top, then the script and the notes about it standing side by side under
 * them, each a window onto something longer while the page itself holds still.
 * A phone has one column and no width to split, so the same four things are
 * stacked and the column is what moves.
 *
 * What does not move is the furniture at either end. The way back and the way
 * out are pinned to the top of the window and the transport to the foot of it,
 * so the two things you can always do to a record are always under a thumb,
 * whatever part of the record you have scrolled to.
 *
 * The script keeps a window of its own inside that column — a fixed height with
 * the code scrolling in it — rather than being poured out to its full length.
 * Some of these run to three hundred lines, and a script laid out whole would
 * put the notes about it half a minute's scrolling below the cover. It scrolls
 * in one direction only: a phone is narrower than the measure a Strudel line is
 * written to, so the lines wrap the way the studio's own editor wraps them at
 * this width, and what would have been a sideways drag is a longer window
 * instead. Neither window keeps a bar standing down its side — both come up
 * while they are being moved and go away again once they are left alone.
 *
 * A record with more than one track has no list here. The display gives it the
 * title column it uses for the collection itself; a phone's answer is the
 * transport, whose skips already walk the collection a track at a time — so
 * stepping through an album is the same act down here as stepping between
 * records, and this view redraws around whatever the bar has come to rest on.
 */
export default function MobileFeaturedDetail({
  track,
  playingId,
  engineReady,
  onPlay,
  onStop,
  opening,
  onOpenInStudio,
  onBack,
  transition = null,
  coverHidden = false,
}: MobileFeaturedDetailProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  useScrollbarOnScroll(columnRef);
  useScrollbarOnScroll(codeRef);

  const source = sourceCredit(track.sourceUrl);
  const isPlaying = playingId === track.id;
  const transportDisabled = !engineReady && !isPlaying;

  /* Carried by each block of content rather than by the view's root: the root
     holds the cover, and fading that would leave the flying copy handing over
     to a half-drawn picture. */
  const contentFade = transition === 'entering'
    ? 'featured-content-in'
    : transition === 'leaving'
      ? 'featured-content-out'
      : '';
  /* A track arriving on a page that is already open comes in the way the page
     itself did. The blocks below are keyed on the track, so each one is a new
     element and the animation runs from its start rather than being a class
     that has already played. */
  const trackFade = contentFade || 'featured-content-in';

  return (
    <div
      data-testid="featured-detail-mobile"
      className="relative z-20 flex min-h-0 w-full flex-1 flex-col"
    >
      {/* ── Top bar ── */}
      {/* The way back on the left, where the shelf's own drawer key stands, and
          the way out on the right, where its list key does: a phone reads the
          two pages as one place, so the marks keep their sides.

          It floats over the reading rather than sitting above it, the way the
          shelf's own bar floats over the wheel: the column runs the whole
          height of the window and fades out behind this row, so the two keys
          stand on the room itself and a drag that starts up here still moves
          the reading. Only the keys take presses; the row does not. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2 ${contentFade}`}
        style={{ paddingTop: SAFE_TOP, paddingBottom: '4px' }}
      >
        <button
          type="button"
          onClick={onBack}
          data-testid="featured-detail-mobile-back"
          aria-label={t('featuredBack')}
          title={t('featuredBack')}
          className={`pointer-events-auto ${BAR_KEY}`}
        >
          {/* At the weight lucide draws its own glyphs at, not the lighter
              stroke the display's back link wears: the key opposite is the
              studio's share mark, and every other key on the collection's bars
              is drawn at full weight. A 1.6 stroke beside a 2 reads as a size
              smaller even though the box is the same. Well over the others'
              20, because a chevron is one corner of the box the rest of them
              fill: it takes the room to read as the same size, and it still has
              5px of the 36px hit area either side of it. */}
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <ShareKey track={track} />
      </div>

      {/* ── The record ── */}
      {/* Everything about the piece, in the order you meet it: what it is, what
          it is made of, and what the parts of it are doing.

          The padding is what the reading is held clear by, not the edge of a
          box: the column reaches the top of the window and the foot of it, and
          the first line starts ten pixels below where the mask has finished
          bringing the page back — so nothing is ever half-faded at rest, and
          everything is faded on its way past. */}
      <div
        ref={columnRef}
        data-testid="featured-detail-mobile-column"
        className="scrollbar-on-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4"
        style={{
          paddingTop: `calc(${SAFE_TOP} + 64px)`,
          paddingBottom: FOOT_FADE,
          maskImage: COLUMN_MASK,
          WebkitMaskImage: COLUMN_MASK,
        }}
      >
        {/* The cover and its credits. The cover is small here — it has already
            done its job of being recognised on the shelf — and it is cut to the
            names beside it: 96px is the height of the four lines in the column
            alongside, so the two halves of the header start and finish
            together. A square measured off that column rather than stretched to
            it, because the artwork inside the cover carries an intrinsic width
            of its own — left to size itself, it takes that width instead of the
            row's height. */}
        <header className="flex gap-4">
          <FeaturedCover
            piece={track}
            flightRole="detail"
            className={`size-24 shrink-0 rounded-[10px] ${coverHidden ? 'invisible' : ''}`}
          />

          <div key={track.id} className={`flex min-w-0 flex-1 flex-col ${trackFade}`}>
            {/* EB Garamond ships one weight, so this stays regular rather than
                asking the browser to fake a bold; a serif at this size does not
                want the tight tracking a sans display face does either.

                Held to one line, and carried round when a name is longer than
                the column — the shelf list's own line, see ScrollingTitle. The
                cover beside it is cut to four lines of this column, so a title
                allowed to wrap would push the credits below the artwork and
                leave the header's two halves finishing at different heights;
                and this is the one name on the page that has to be read whole,
                which is exactly what an ellipsis would not give it. */}
            <h1 className="font-dm-serif text-[20px] leading-tight text-text-primary">
              {/* The clip is the line box, and a serif at twenty pixels draws
                  outside its own: the padding gives the parentheses and
                  descenders somewhere to be, and the margin takes the same
                  four pixels back out of the layout so the column still
                  measures the four lines the cover is cut to. */}
              <ScrollingTitle title={track.title} className="block py-0.5 -my-0.5" />
            </h1>
            <p className="mt-1.5 truncate text-xs text-text-secondary">{track.originalArtist}</p>
            <p className="mt-1 truncate text-xs text-text-muted">
              {t('featuredCodedBy')} {track.coder}
            </p>
            {/* Where the music comes from, under the two people who made this
                version of it. Every piece says it, whether the record it names
                holds one track or several — on an album it is also how the page
                tells you which sleeve you opened, since the name above is the
                track's rather than the record's. */}
            <p className="mt-2 text-xs leading-5 text-text-muted">
              {t('featuredAlbumOf').replace('{album}', track.album)}
            </p>
          </div>
        </header>

        {/* Hearing it comes first, then where it came from. A piece published in
            a repo names that repo and stops there — it is already the code —
            while one published in a post names the post and the collection the
            code was found in.

            Under the cover rather than beside it, which is the one place this
            row parts from the display's: the column next to the sleeve is too
            narrow to hold a transport key and two credit pills without breaking
            them across three lines. */}
        <div
          key={`${track.id}-actions`}
          className={`mt-4 flex flex-wrap items-center gap-2 ${trackFade}`}
        >
          <button
            type="button"
            onClick={isPlaying ? onStop : () => onPlay(track)}
            disabled={transportDisabled}
            title={transportDisabled ? t('engineStarting') : undefined}
            aria-label={isPlaying ? t('stop') : t('featuredPlayPiece')}
            data-testid="featured-detail-mobile-play"
            className="grid size-8 place-items-center rounded-full bg-action-fill text-action-text transition duration-200 hover:bg-action-fill-hover disabled:cursor-not-allowed disabled:opacity-40"
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

        <div key={`${track.id}-panels`} className={`mt-5 flex flex-col gap-4 ${trackFade}`}>
          <Panel
            title={t('featuredCode')}
            style={CODE_WINDOW}
            bodyRef={codeRef}
            /* The body runs out past the panel's right padding so its bar sits
               6px off the edge rather than 16px in; the matching pr keeps the
               code the same distance clear of the bar it scrolls with. */
            bodyClassName="scrollbar-on-scroll -mr-2.5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2.5"
            action={
              <button
                type="button"
                onClick={() => onOpenInStudio(track)}
                disabled={opening}
                data-testid="featured-detail-mobile-open-in-studio"
                className={`${PILL_FILLED} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {t('openInStudio')}
                <ArrowUpRight size={14} strokeWidth={1.6} aria-hidden="true" />
              </button>
            }
          >
            {/* Read-only: the editable copy is what "open in studio" is for.
                Typeset like the mobile studio's editor and the archive's own
                script window — one axis, wrapped, at the size those wrap at.
                `break-words` is for the case wrapping alone cannot answer: a
                single unbroken token — a long sample name, a URL — wider than
                the window, which would otherwise push the box out and put the
                sideways drag back. */}
            <pre
              data-testid="featured-code-mobile"
              className="whitespace-pre-wrap break-words text-[12px] text-text-secondary"
              style={{ fontFamily: "'ABeeZee', monospace", lineHeight: 1.7, letterSpacing: '0.04em' }}
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
                a label sits over its value, and the spacing is what groups them
                — a border would be saying it twice. The list runs tighter than
                the entries above it — a voice's description sits straight under
                its name, with 6px between voices — because there are nine of
                them and they are read as one block. */}
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
    </div>
  );
}

/**
 * The way out: the record, handed on as the session it would open as.
 *
 * The studio's own share button, which is the display bar's answer too — so a
 * link made here is made the one way the app makes links, and whoever opens it
 * lands where "open in studio" would have put them rather than on a page about
 * the piece. Sharing a record is passing on something to play with, not a
 * citation.
 *
 * Rebuilt whenever the track changes and not before: the draft carries a fresh
 * message id and timestamp, which are the only parts of it that are not a
 * function of the piece.
 */
function ShareKey({ track }: { track: FeaturedPiece }) {
  const draft = useMemo(() => featuredSessionDraft(track), [track]);

  return (
    <ShareButton
      session={null}
      title={draft.title}
      code={draft.code}
      messages={draft.messages}
      variant="icon"
      wrapperClassName="pointer-events-auto relative flex h-9 w-9 items-center justify-center"
      buttonClassName={`${BAR_KEY} cursor-pointer`}
    />
  );
}
