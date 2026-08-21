import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { GitHubLogoIcon, PlayIcon, StopIcon, XLogoIcon } from '../icons';
import { t, zh } from '../../lib/i18n';
import { FEATURED_COLLECTION_URL, type FeaturedPiece } from '../../lib/featured-pieces';
import { FeaturedCover } from './featured-cover';

interface FeaturedDetailProps {
  piece: FeaturedPiece;
  /** Whether this piece is the one currently sounding. */
  isPlaying: boolean;
  /** Playback is refused until the engine is up. */
  engineReady: boolean;
  onPlay: () => void;
  onStop: () => void;
  /** True while the piece is being copied into a new session. */
  opening: boolean;
  onOpenInStudio: () => void;
  onBack: () => void;
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
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
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
      <div className="-mr-3.5 min-h-0 flex-1 overflow-auto pr-3.5">{children}</div>
    </section>
  );
}

/**
 * One piece, opened up: the cover and its credits across the top, the script
 * and the notes about it side by side underneath.
 *
 * The two panels are deliberately the same size class — reading the code and
 * reading what the code is doing is one activity here, and burying either in a
 * secondary column would break that. Playback stays with the page's transport
 * bar, which keeps running across the trip in and out of this view.
 */
export default function FeaturedDetail({
  piece,
  isPlaying,
  engineReady,
  onPlay,
  onStop,
  opening,
  onOpenInStudio,
  onBack,
}: FeaturedDetailProps) {
  const transportDisabled = !engineReady && !isPlaying;

  return (
    // pt-[11px] puts the back button's centre 27px down — the same line the
    // primary nav's logo button sits on, since both columns start at the
    // shell's 10px inset. pb = the bar's 98px + the 24px above it, which is the
    // same measure as the gap between the two panels; the bar itself lands on
    // the foot of the column, level with the primary nav.
    <div
      data-testid="featured-detail"
      className="flex min-h-0 w-full flex-1 flex-col pb-[122px] pt-[11px]"
    >
      <button
        type="button"
        onClick={onBack}
        data-testid="featured-detail-back"
        className="inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-sm text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.6} aria-hidden="true" />
        {t('featuredBack')}
      </button>

      {/* Cover and credits: the cover is small here — it has already done its
          job of being recognised in the grid.

          The column stretches to the cover's 160px and the action row is pushed
          to its foot, so the two halves of the header start and finish on the
          same two lines. Everything above the row is sized to leave that room:
          if a blurb ever wraps past it the column simply grows, and pt-3 keeps
          the buttons off the text when it does. */}
      <header className="mt-6 flex shrink-0 gap-6">
        <FeaturedCover piece={piece} className="size-[160px] shrink-0 rounded-[10px]" />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* EB Garamond ships one weight, so this stays regular rather than
              asking the browser to fake a bold; a serif at this size does not
              want the tight tracking a sans display face does either. */}
          <h1 className="font-dm-serif text-[24px] leading-tight text-text-primary">
            {piece.title}
          </h1>
          <p className="mt-2 text-xs text-text-secondary">{piece.originalArtist}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t('featuredCodedBy')} {piece.coder}
          </p>
          <p className="mt-3 max-w-xl text-xs leading-5 text-text-muted">
            {zh ? piece.blurb[0] : piece.blurb[1]}
          </p>
          {/* Hearing it comes first, then the two places it came from: the post
              it was published in, and the collection it was found in. The
              Strudel permalink is one tap further in — the code it points at is
              already on this page, in the window below. */}
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
            <button
              type="button"
              onClick={isPlaying ? onStop : onPlay}
              disabled={transportDisabled}
              title={transportDisabled ? t('engineStarting') : undefined}
              aria-label={isPlaying ? t('stop') : t('featuredPlayPiece')}
              data-testid="featured-detail-play"
              className="grid size-8 place-items-center rounded-full bg-[#D8D8D8] text-black transition duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? <StopIcon size={12} /> : <PlayIcon size={14} />}
            </button>
            <SourceLink
              href={piece.sourceUrl}
              label={t('featuredSourcePost')}
              icon={<XLogoIcon size={11} />}
            />
            <SourceLink
              href={FEATURED_COLLECTION_URL}
              label={t('featuredSourceCollection')}
              icon={<GitHubLogoIcon size={13} />}
            />
          </div>
        </div>
      </header>

      {/* The two panels take whatever height is left, so their feet land just
          above the transport bar however tall the window is. */}
      <div className="mt-10 grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title={t('featuredCode')}
          action={
            <button
              type="button"
              onClick={onOpenInStudio}
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
            <code>{piece.code}</code>
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
              <dd className="mt-1 text-text-secondary">{piece.style}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{t('featuredTempo')}</dt>
              <dd className="mt-1 tabular-nums text-text-secondary">{piece.bpm} BPM</dd>
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
            {piece.layers.map((layer) => (
              <li key={layer.name}>
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
