import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t, zh } from '../../lib/i18n';
import type { FavoriteSummary } from '../../../shared/session-api';
import {
  conversationTitle,
  favoriteConversationMessages,
  favoriteScripts,
  favoritedTimeLabel,
  takeLabel,
  type FavoriteConversation,
  type FavoriteScript,
} from '../../lib/favorite-conversations';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  OpenInStudioIcon,
  PlayOutlineIcon,
  StarIcon,
  StopIcon,
  TrashIcon,
} from '../icons';
import { useResolvedTheme } from '../../hooks/useAppearance';
import { useClippedEnds } from '../../hooks/useClippedEnds';
import ControlHoverLabel from '../studio/ControlHoverLabel';
import { anchorAbove, type ControlHoverLabelAnchor } from '../studio/control-hover-anchor';
import ArchivedConversationView from '../conversation/ArchivedConversationView';
import ConversationTurnRail from '../conversation/ConversationTurnRail';
import FeaturedWebglLightField from '../featured/FeaturedWebglLightField';
import FavoritesList, { LIST_COLUMN } from './FavoritesList';
import { NAV_COLLAPSED_WIDTH } from '../nav/PrimaryNav';

/** The page's own edge: where the heading starts and where the list stops. */
const PAGE_SIDE_INSET = '1rem';

/**
 * How far the reading's left edge stands off the page's left edge — and so how
 * wide the reading is, since its other three edges are all spoken for: the
 * script's measure and the gutter fix its right, the band fixes both of its
 * horizontals. This line and the reading's width are one fact said from
 * opposite ends of the page. Move it in and the reading grows; move it out and
 * the reading hands the width back.
 *
 * Not the page's own edge, which the heading above keeps. A reading taken all
 * the way out to it is as wide as the display, and a line that long is one the
 * eye loses its place in on the way back to the next. This stands the reading
 * off far enough to keep a margin of its own — a page it does not have to
 * fill — while still leaving it the wider half of the spread by half again.
 *
 * Exported so the page's own test can say the row stands on this line without
 * pinning the number to whatever it happens to be tuned to.
 */
export const READING_LEFT_INSET = '7rem';

/**
 * The primary nav's column, counted from the viewport's left edge: this page
 * begins where it ends.
 */
const NAV_COLUMN = `${NAV_COLLAPSED_WIDTH}px + var(--spacing-region)`;

/**
 * The same column taken off the page's right edge, which makes a box whose
 * middle is the window's middle rather than this page's.
 *
 * What needs one is anything standing alone here — a reading with no script
 * beside it, the line an empty page shows — because a lone thing centred in
 * the strip the page was handed reads as a thing pushed to the right. The
 * spread below never needs it: it is set against its own two verticals and
 * makes no claim to the middle of anything.
 *
 * Written out flat rather than as a calc inside a calc. Nesting is valid CSS
 * and the browser resolves it, but it makes the value a different string for
 * anything reading the declaration back.
 */
const PAGE_LEFT_INSET = `calc(${NAV_COLUMN})`;

/**
 * The primary nav's own centre line, counted back from this page's left edge.
 *
 * The page begins where the nav's column ends, so the nav's middle is half that
 * column and the gap it keeps, the other way. The turn rail is centred on that
 * vertical rather than set against anything of this page's: what it indexes is
 * the reading, but where it *lives* is the app's left margin, standing in the
 * strip the nav's two lobes leave empty between them — so it belongs to the
 * nav's column, and a thing in a column stands down the middle of it. Which is
 * also what lets a line grow under the pointer without leaving that middle:
 * both ends move, and the axis they move about does not.
 */
const RAIL_CENTER = `calc(${NAV_COLLAPSED_WIDTH / -2}px - var(--spacing-region))`;

/**
 * The air between the two windows, taken from the Featured detail's own pair:
 * the same two kinds of window held apart by the same measure, so a reader
 * crossing between the pages meets one spread rather than two.
 */
const GALLERY_GUTTER = '1.5rem';

/**
 * The two verticals the spread stands on.
 *
 * The right is the list's column and nothing added to it, so the code window
 * comes as far right as anything on this page can — up to the gutter the list
 * keeps, and no further, since past that it would be running under the
 * entries. What used to stand between the two was a margin whose whole job was
 * to keep the pair centred on the window, and the pair is no longer centred on
 * anything.
 *
 * The left is the reading's own vertical rather than the page's: what it is
 * measuring is a width, not an edge, so it answers to the line above and not
 * to where the heading starts.
 */
const GALLERY_INSET_LEFT = READING_LEFT_INSET;
const GALLERY_INSET_RIGHT = LIST_COLUMN;

/**
 * How wide the script's window is.
 *
 * A measure rather than a share, and a fixed one: a script's lines are as long
 * as they were written, and a window that grows with the display past that is
 * only holding air. So the script keeps this while the page is wide enough to
 * hold two windows of it — see the pair's share below for what happens when it
 * is not.
 */
const SCRIPT_MEASURE = '390px';

/**
 * How the row divides: the script keeps its measure, and the reading takes
 * everything the page has left.
 *
 * Which means the reading has no width of its own to set. What sets it is the
 * one vertical it has not already been given — how far its left edge stands
 * off the page's left edge — and that is `GALLERY_INSET_LEFT` above. Widen the
 * reading by moving that line, not by naming a width here: a width named here
 * and an inset named there would be two answers to the same question, and the
 * page would end up honouring whichever is smaller.
 */
const CONVERSATION_SHARE = '1 1 0%';

/**
 * And what the script does once the page runs out.
 *
 * The measure is a ceiling, not a floor: it is what the script is worth while
 * the reading beside it is still the wider of the two. Narrow the page and the
 * reading gives width up first, as the one that reflows — but only down to the
 * script's own measure. Past that the script has stopped being the narrow half,
 * and holding it at a number the reading has already gone under would mean the
 * pair narrowing by squeezing the reading alone until it is a column beside a
 * window.
 *
 * So the measure is capped at half the spread, and below the crossing the two
 * come in together, each holding half of what is left once the gutter is taken
 * out. Half of the spread rather than half of the row is the whole of it: the
 * gutter comes off first, so the two halves are equal to each other and the air
 * between them is the same measure at every width the page has.
 */
const CODE_SHARE = `0 1 ${SCRIPT_MEASURE}`;
const PAIRED_CODE_CAP = 'calc((100% - var(--gallery-gutter)) / 2)';

/**
 * The width a reading keeps when it has no script beside it.
 *
 * The only case that needs a number. Everywhere else the reading is held
 * between two things and its width falls out of where they are; alone on the
 * page it is held between nothing, and a window let loose across a display
 * this wide is a wall of text with no line the eye can return to.
 */
const SOLO_READING_MEASURE = '500px';

/** How far below the middle of the page the pair sits: the difference between
 *  the two bands below, and nothing more. */
const GALLERY_DROP = '30px';

/**
 * The two bands of page the spread leaves above and below itself.
 *
 * Stated on the row rather than on the windows, so the pair's four edges are
 * settled in one place: the two verticals above, these two horizontals here,
 * and each window simply fills what it is given. It used to be a height and a
 * centring and an offset, three numbers saying one thing between them, and
 * moving either edge meant solving for the other two.
 *
 * The foot keeps the sixth of the page the pair was drawn with, less the drop.
 * The head is the shallower of the two: what stands in it is one line of
 * heading against the page's top corner, where the foot holds the caption's
 * two — and the windows are the reason the page exists, so they take the room
 * the page can spare rather than sitting politely in the middle of it. A tenth
 * still leaves the heading air enough not to be touched.
 */
const GALLERY_BAND_TOP = `calc(100% / 10 + ${GALLERY_DROP})`;
const GALLERY_BAND_BOTTOM = `calc(100% / 6 - ${GALLERY_DROP})`;

/**
 * Which entry is open, and which version of it — because the page now opens an
 * entry the moment the cached list draws it, before the request that refreshes
 * the list has landed. An id on its own would call the job done and leave the
 * reader on a copy the account has since moved past; naming the version means
 * a summary that comes back re-dated is asked for again, and one that comes
 * back unchanged is not.
 */
const openedKey = (summary: FavoriteSummary): string => `${summary.id}:${summary.updatedAt}`;

interface FavoritesPageProps {
  /** Legacy guest read model. Account pages pass summaries and one detail. */
  conversations?: readonly FavoriteConversation[];
  /** Ordered cloud rows; the page never sorts or reads their full content. */
  summaries?: readonly FavoriteSummary[];
  /** The one cloud favorite whose detail has been fetched for the selection. */
  detail?: FavoriteConversation | null;
  /** Controlled selected summary id for the account collection. */
  selectedId?: string | null;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  detailLoading?: boolean;
  detailError?: Error | null;
  onRetryDetail?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  onLoadMore?: () => void;
  onRetryLoadMore?: () => void;
  onSelect?: (summary: FavoriteSummary) => void;
  /**
   * Whether this is the page on screen. The gallery pages are hidden rather
   * than unmounted when you leave them, so nothing below can tell an arrival
   * from a re-render without being told.
   */
  active?: boolean;
  /**
   * Open this favorite on arrival. What it is for is landing on the entry you
   * were just sent here to look at, rather than on whichever one the page was
   * left showing — so it is read once, when it arrives, and never fights the
   * list for what is selected after that.
   *
   * A fresh object each time rather than a bare id: being sent here twice to
   * the same favorite is two arrivals, and an id compared against itself would
   * make the second one silent.
   */
  focus?: { id: string } | null;
  isPlaying?: boolean;
  playingCode?: string;
  onPlayCode?: (code: string) => void;
  onStopCode?: () => void;
  /** Let this conversation go: it leaves the page and returns to history. */
  onUnfavorite?: (conversation: FavoriteConversation) => void;
  /** Delete it outright. The page only asks; the undo lives in the dialog. */
  onDelete?: (conversation: FavoriteConversation) => void;
  /**
   * Go on working from this script where scripts are worked on. The script and
   * nothing else: what is kept is an archive, and the studio is handed the code
   * to carry on from rather than a copy of the conversation that wrote it.
   */
  onOpenInStudio?: (code: string) => void;
}

/**
 * What both windows on this page are cut from: a Featured record's panels, the
 * same class and the same measures rather than a copy of their values.
 *
 * The two pages stand in one room. Both are windows cut into the same WebGL
 * light field, both hold a script and something to read beside it, and a panel
 * that kept its own fill or its own radius here would read as a near-miss of
 * the one next door rather than as a decision. So `featured-panel` carries all
 * of it — the fill, the radius, and the edge, which is a masked ring inside
 * the padding box rather than a border, because a window that clips its own
 * body would clip a ring hung outside it. index.css re-materialises the whole
 * set for paper in one place, and both pages turn together.
 */
const WINDOW_GLASS = 'featured-panel flex min-h-0 min-w-0 flex-col overflow-hidden'
  + ' rounded-[10px] bg-[#0D0D0D]/55 p-5 backdrop-blur-2xl';

/**
 * The line across the top of a window.
 *
 * One component for both of them, because the whole point of the pair is that
 * the reading and the script are the same kind of thing seen twice: their two
 * titles stand on one baseline, and a measure changed here moves both.
 *
 * No offset of its own: the title stands off the panel's top edge by exactly
 * what the last line under it stands off the bottom one, which is the panel's
 * own padding and nothing else. The 42px that used to be added here made a
 * window's two ends say different things — held at the top, cut at the foot —
 * and both of these are read from both ends.
 */
function WindowTitle({ title, titleControl, action }: {
  title: string;
  titleControl?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="relative z-20 mb-5 flex h-9 shrink-0 items-center justify-between gap-3">
      {titleControl ?? (
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-lg font-medium uppercase tracking-[0.08em] text-text-primary">
            {title}
          </h2>
        </div>
      )}
      {action}
    </div>
  );
}

interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  titleControl?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

function Panel({ title, titleControl, action, className = '', children, ...rest }: PanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /* Whether the script has a bar of its own, which is what decides where the
     window's right edge stands (see `.favorites-script-scroll`). It has to be
     measured rather than asked of the layout: a platform that overlays its
     scrollbars reserves nothing for one that is not there, so the window would
     be cut flush against the panel's border for every script short enough not
     to scroll. Watched on both the window and the script, since either growing
     is what brings a bar in or takes it away. */
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    const measure = () => {
      scroller.dataset.hasVerticalBar = String(scroller.scrollHeight > scroller.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    const script = scroller.firstElementChild;
    if (script instanceof HTMLElement) observer.observe(script);
    return () => observer.disconnect();
  }, []);
  /* Which of the window's two ends is cutting the script off, for the fade
     that says so — see `.favorites-window-fade` in index.css. The bar says how
     much more there is; this says the line you are looking at is not the last
     one, which a bar cannot say about the line itself. */
  useClippedEnds(scrollRef);

  return (
    <section
      aria-label={title}
      className={`${WINDOW_GLASS} ${className}`}
      {...rest}
    >
      <WindowTitle title={title} titleControl={titleControl} action={action} />
      {/* The bars stand whenever the script is longer or wider than the
          window, rather than waiting for the pointer: the only thing that can
          say "this is not all of it" through a clipped edge is a bar.

          Where they stand and how far they hold off the code is
          `.favorites-script-scroll` — the panel's own padding at the foot, read
          as a band to sit in the middle of; at the right, 6px between the bar
          and the border and 12px between the code and the bar, with the code
          holding that same line when there is no bar there. */}
      <div
        ref={scrollRef}
        className="favorites-script-scroll favorites-window-fade min-h-0 flex-1 overflow-auto"
      >
        {children}
      </div>
    </section>
  );
}

function VersionSelect({
  scripts,
  selected,
  onSelect,
}: {
  scripts: readonly FavoriteScript[];
  selected: FavoriteScript;
  onSelect: (script: FavoriteScript) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelFor = (script: FavoriteScript) => script.kind === 'final'
    ? t('favoritesLatestScript')
    : script.take === null ? t('favoritesCodeTitle') : takeLabel(script.take);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        data-testid="favorites-version-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex h-9 max-w-full items-center gap-2 text-left text-text-primary"
      >
        <span className="truncate text-lg font-medium uppercase tracking-[0.08em]">
          {labelFor(selected)}
        </span>
        <ChevronDownIcon
          size={15}
          className={`shrink-0 text-text-muted transition-transform duration-200 motion-reduce:transition-none group-hover:text-text-secondary ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t('favoritesCodeTitle')}
          className="favorites-version-menu animate-fade-in absolute left-0 top-[calc(100%+6px)] z-50 flex max-h-64 w-[126px] flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-[7px] border border-white/15 bg-[#242424]/95 py-1 shadow-menu-overlay backdrop-blur-xl"
        >
          {scripts.map((script) => {
            const active = script.turnId === selected.turnId;
            return (
              <button
                key={script.turnId}
                type="button"
                role="option"
                aria-selected={active}
                data-favorites-version-option={script.turnId}
                onClick={() => {
                  onSelect(script);
                  setOpen(false);
                }}
                className={`favorites-version-option mx-1 flex w-[calc(100%_-_0.5rem)] items-center rounded-[5px] px-2.5 py-0.5 text-left text-[12px] transition-colors ${
                  active
                    ? 'bg-white/[0.16] text-text-primary'
                    : 'text-text-secondary hover:bg-white/[0.09] hover:text-text-primary'
                }`}
              >
                <span>{labelFor(script)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One of the marks in the script window's corner, cut to the studio
 * transport's own pattern: a 32px round hit area holding an 18px glyph, grey
 * at rest and a step brighter under the pointer, with its name arriving above
 * it rather than sitting beside it as a label.
 *
 * Borrowed rather than reinvented because these are the same kind of thing the
 * transport's right-hand marks are — small standing actions on the piece in
 * front of you, none of them the reason the panel exists. A reader who has
 * used one bar of them has used this one.
 */
function ScriptAction({
  label,
  onClick,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}) {
  const [hoverAnchor, setHoverAnchor] = useState<ControlHoverLabelAnchor | null>(null);

  return (
    <div
      className="flex h-8 w-8 items-center justify-center"
      onMouseEnter={(event) => setHoverAnchor(anchorAbove(event.currentTarget))}
      onMouseLeave={() => setHoverAnchor(null)}
      onFocusCapture={(event) => setHoverAnchor(anchorAbove(event.currentTarget))}
      onBlurCapture={() => setHoverAnchor(null)}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        data-testid={testId}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-icon-idle transition-colors hover:text-text-primary"
      >
        {children}
      </button>
      <ControlHoverLabel anchor={hoverAnchor} label={label} />
    </div>
  );
}

/* Only ever given a script. A conversation that committed none has no window
   here at all — an empty panel saying so would be a frame around an absence,
   where the page can simply not draw one. */
function CodePanel({
  script,
  playing,
  onPlay,
  onStop,
  scripts,
  onSelectScript,
  onOpenInStudio,
}: {
  script: FavoriteScript;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  scripts: readonly FavoriteScript[];
  onSelectScript: (script: FavoriteScript) => void;
  /** Continue from this immutable script in a fresh Studio session. */
  onOpenInStudio?: (() => void) | undefined;
}) {
  const [copied, setCopied] = useState(false);
  /* One script is the whole of what the conversation wrote, and the name of the
     only thing there is is the thing itself. */
  const numbered = scripts.length > 1;
  const title = script.kind === 'final'
    ? t('favoritesLatestScript')
    : script.take === null || !numbered ? t('favoritesCodeTitle') : takeLabel(script.take);

  return (
    <Panel
      data-favorites-script={script.turnId}
      className="h-full w-full"
      /* The name the widget in the conversation gave it, so following one to
         the other is reading the same words twice. Unless nothing asked for
         it: a lone script has no first, and numbering it would promise a
         second version that is not there. */
      title={title}
      /* A picker only where there is something to pick — a chevron over a menu
         of one would offer a way to change to what is already on screen. */
      titleControl={numbered
        ? <VersionSelect scripts={scripts} selected={script} onSelect={onSelectScript} />
        : undefined}
      action={
        /* Hear it, take it, or go and work on it — in that order, because that
           is the order of commitment. The three sit tight together as one
           group rather than spread across the header: they are all things to
           do with this script, and what they are set against is the name of
           it. */
        /* Pulled out by the glyphs' own inset inside their 32px hit areas, so
           that what the eye measures — the last mark, not the box around it —
           stands as far from this edge as the title's first letter does from
           the other one. */
        <span className="-mr-2 flex shrink-0 items-center">
          <ScriptAction
            label={playing ? t('stop') : t('play')}
            onClick={playing ? onStop : onPlay}
            testId="favorites-script-play"
          >
            {playing ? <StopIcon size={15} /> : <PlayOutlineIcon size={18} />}
          </ScriptAction>
          <ScriptAction
            label={t('copyCode')}
            testId="favorites-script-copy"
            onClick={() => {
              navigator.clipboard?.writeText(script.code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }).catch(() => { /* A refused clipboard is not worth a dialog. */ });
            }}
          >
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          </ScriptAction>
          {onOpenInStudio && (
            <ScriptAction
              label={t('openInStudio')}
              onClick={onOpenInStudio}
              testId="favorites-script-open-in-studio"
            >
              <OpenInStudioIcon size={16} />
            </ScriptAction>
          )}
        </span>
      }
    >
      <pre
        className="whitespace-pre text-[12px] text-text-secondary"
        style={{ fontFamily: "'ABeeZee', monospace", lineHeight: 1.7, letterSpacing: '0.04em' }}
      >
        <code>{script.code}</code>
      </pre>
    </Panel>
  );
}

/**
 * 收藏 — a gallery page, standing on the same light field the Featured shelf
 * does, because the two are the same kind of place: a small hand-held
 * collection you look across rather than a workspace you work in. The primary
 * nav breaks into its two lobes for both of them, which is what gives this page
 * its own top corners — the name in one, the list of favorites in the other.
 *
 * What is kept in the middle is one conversation, opened up: the exchange on
 * the left and the code take it is currently pointed at on the right. The two
 * are parallel reading surfaces, so neither replaces the other and comparing
 * what was asked with what was committed stays direct.
 *
 * The pair is held at two thirds of the page's height and centred on it rather
 * than filled to the edges. A gallery is something a page holds up, and the air
 * above and below is what does the holding — it is also what leaves the two
 * corners free for the name and the list without either of them crowding the
 * reading.
 */
export default function FavoritesPage({
  conversations = [],
  summaries,
  detail = null,
  selectedId,
  active = true,
  focus = null,
  isLoading = false,
  error = null,
  onRetry,
  detailLoading = false,
  detailError = null,
  onRetryDetail,
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = null,
  onLoadMore,
  onRetryLoadMore,
  onSelect,
  isPlaying = false,
  playingCode = '',
  onPlayCode = () => {},
  onStopCode = () => {},
  onUnfavorite,
  onDelete,
  onOpenInStudio,
}: FavoritesPageProps) {
  const isSummaryMode = summaries !== undefined;
  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.favoritedAt - left.favoritedAt),
    [conversations],
  );
  const favoriteSummaries = useMemo<FavoriteSummary[]>(
    () => summaries
      ? [...summaries]
      : sortedConversations.map((conversation) => ({
        id: conversation.id,
        title: conversationTitle(conversation),
        updatedAt: conversation.favoritedAt,
        favoritedAt: conversation.favoritedAt,
      })),
    [sortedConversations, summaries],
  );
  /**
   * What the reader last opened, and the arrival that pick was made under.
   *
   * Two things decide which favorite is up — the list on the right, and being
   * sent here to look at one — and the second has to be able to override the
   * first without asking the page to notice it happening. Holding the focus
   * request the pick was made under is what does that: a request this pick has
   * not seen is a new arrival and wins, and the one it was made under is the
   * arrival it already answered.
   */
  const [picked, setPicked] = useState<{ id: string | null; focus: { id: string } | null }>(
    () => ({ id: sortedConversations[0]?.id ?? null, focus: null }),
  );
  const selectedConversationId = picked.focus === focus ? picked.id : focus?.id ?? picked.id;
  const [pickedSummaryId, setPickedSummaryId] = useState<string | null>(null);
  const autoSelectedSummaryRef = useRef<string | null>(null);
  /* Which entry the page is open on, asked as four questions in order of who
     has the better claim: the page it was navigated to with, the entry it was
     told to focus, the one picked here, and failing all three the newest thing
     kept.

     Every one of them is resolved against the list rather than taken on trust,
     which is the whole of it. An id is only a claim about an entry, and the
     two ways an entry leaves — let go of, or deleted — both break that claim
     while the id is still being held somewhere: an unfavorited entry is out of
     this list the moment the notice appears but stays in the account's own
     rows until the notice is committed, so the id above is live and points at
     nothing here; a deleted one is gone from both, but only after the render
     that noticed. Either way a chain that stops at the first non-null id stops
     at an id with no entry behind it, and the page draws its empty state — the
     line meant for an account that has never kept anything — over a shelf with
     things still on it.

     Resolving each claim to an entry instead makes a dead id simply not
     answer, and the question passes to the next one. Which is what the focus
     line already did on its own; the other two now do the same, and the last
     of them is the newest kept, so an entry going out from under the reader
     hands the page to the top of the list rather than to a blank.

     No cleanup anywhere to go with it. Nothing has to notice that an id died
     and clear it, which is the version of this that races the list: the id can
     stay as stale as it likes in a state hook or a parent's prop, because it
     is only ever read through the list it has to be in. */
  const summaryFor = (id: string | null | undefined) => (id
    ? favoriteSummaries.find((summary) => summary.id === id) ?? null
    : null);
  const selectedSummary = summaryFor(selectedId)
    ?? summaryFor(focus?.id)
    ?? summaryFor(pickedSummaryId)
    ?? favoriteSummaries[0]
    ?? null;
  /* Left alone when the conversation changes: a turn id from another favorite
     simply isn't among this one's scripts, and the fallback below is already
     the last take — which is where an entry opens. */
  const [selectedScriptTurnId, setSelectedScriptTurnId] = useState<string | null>(null);
  /* The archive's own scrollport, borrowed. The rail on the left moves the
     reading, and the element that scrolls is inside the archive. */
  const archiveScrollRef = useRef<HTMLDivElement>(null);
  /* The one thing on this page that cannot be a custom property: the field is
     painted by a fragment shader, so which of its two palettes is lit has to
     be resolved in JS rather than left to the stylesheet. */
  const paper = useResolvedTheme() === 'light';

  const legacyCurrent = sortedConversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) ?? sortedConversations[0] ?? null;
  const current = isSummaryMode
    ? detail && selectedSummary?.id === detail.id ? detail : null
    : legacyCurrent;
  const scripts = useMemo(() => (current ? favoriteScripts(current) : []), [current]);
  const archiveMessages = useMemo(
    () => (current ? favoriteConversationMessages(current) : []),
    [current],
  );
  const selectedScript = scripts.find((script) => script.turnId === selectedScriptTurnId)
    ?? scripts.at(-1)
    ?? null;
  const playingCodeMessageId = isPlaying
    ? scripts.find((script) => script.code === playingCode)?.turnId ?? null
    : null;
  /* Some favorites are only talk, and some are only a script — a session whose
     code was typed straight in and never asked for. Whichever of the two is
     missing, the other takes the page on its own rather than standing beside
     an empty frame: there is no spread to hold together with one column of it
     blank. */
  const hasReading = (current?.turns.length ?? 0) > 0;
  const soloReading = selectedScript === null;
  const soloScript = !hasReading && selectedScript !== null;
  const alone = soloReading || soloScript;

  const selectSummary = (summary: FavoriteSummary) => {
    setPickedSummaryId(summary.id);
    // Only counted as opened where there is something upstream to open it.
    if (!onSelect) return;
    autoSelectedSummaryRef.current = openedKey(summary);
    onSelect(summary);
  };

  useEffect(() => {
    if (!isSummaryMode) return;
    if (!active) {
      autoSelectedSummaryRef.current = null;
      return;
    }
    const first = selectedSummary;
    /* Not held back by the list still loading. The list a visit opens on is
       the one this device kept from last time — the rows are already on
       screen — so waiting for the request that refreshes them before asking
       for the first entry is the whole of the wait the reader sees. Asking
       now opens it out of local storage; the request lands behind that and
       corrects both. */
    if (error || !first || !onSelect || autoSelectedSummaryRef.current === openedKey(first)) return;
    autoSelectedSummaryRef.current = openedKey(first);
    onSelect(first);
  }, [active, error, isSummaryMode, onSelect, selectedSummary]);

  const selectConversation = (conversation: FavoriteConversation) => {
    const conversationScripts = favoriteScripts(conversation);
    setPicked({ id: conversation.id, focus });
    setSelectedScriptTurnId(conversationScripts.at(-1)?.turnId ?? null);
  };

  const cloudDetailPending = isSummaryMode && selectedSummary !== null && current === null
    && !detailError;
  const cloudDetailFailed = isSummaryMode && selectedSummary !== null && current === null
    && Boolean(detailError);
  const cloudListEmpty = isSummaryMode && favoriteSummaries.length === 0 && !isLoading && !error;
  const cloudListFailed = isSummaryMode && favoriteSummaries.length === 0 && Boolean(error);

  return (
    <main
      data-testid="favorites-page"
      /* Its own class rather than the Featured shelf's
         `featured-immersive-surface`. Both pages now stand in the same room and
         follow the app's theme into paper, but what each holds up is different
         — a shelf of artwork there, two blocks of text here — so each names its
         own materials off its own hook. */
      className="favorites-immersive-surface relative isolate flex h-full min-w-0 flex-1 overflow-visible"
    >
      <FeaturedWebglLightField active variant={paper ? 'paper' : 'space'} />

      {/* Inset to the same two verticals every other full-width page uses. */}
      <div className="relative z-10 h-full w-full overflow-visible px-4">
        {/* Laid over the page rather than stacked above the gallery: the
            gallery is centred on the page's own height, and a heading in flow
            would push it off that centre. It stops where the list's column
            starts, the same vertical the gallery below it ends on. */}
        <header
          className="absolute top-2 z-40"
          style={{ left: PAGE_SIDE_INSET, right: LIST_COLUMN }}
        >
          <h1 className="text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary">
            {t('navFavorites')}
          </h1>
        </header>

        <FavoritesList
          summaries={favoriteSummaries}
          conversations={sortedConversations}
          selectedId={isSummaryMode ? selectedSummary?.id ?? null : current?.id ?? null}
          onSelect={isSummaryMode ? selectSummary : (summary) => {
            const conversation = sortedConversations.find((item) => item.id === summary.id);
            if (conversation) selectConversation(conversation);
          }}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={onLoadMore}
          onRetryLoadMore={onRetryLoadMore}
        />

        {/* The reading's index. It lives out here rather than in the window it
            points into: the strip between the nav's two lobes is where it
            stands, and a favorite with no conversation in it has no turns for
            it to index.

            Keyed like the gallery, so an arriving favorite brings its own index
            in rather than morphing the last one's into it. */}
        {hasReading && current && (
          <ConversationTurnRail
            key={`${current.id}-rail`}
            center={RAIL_CENTER}
            messages={archiveMessages}
            scrollRef={archiveScrollRef}
          />
        )}

        {isSummaryMode && isLoading && favoriteSummaries.length === 0 ? (
          <div
            data-testid="favorites-loading"
            className="absolute inset-0 flex items-center justify-center text-sm text-text-muted"
          >
            {t('loading')}
          </div>
        ) : cloudListFailed ? (
          <div
            data-testid="favorites-error"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-text-muted"
          >
            <span>{t('sessionListNetworkError')}</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="underline underline-offset-2">
                {t('retry')}
              </button>
            )}
          </div>
        ) : cloudDetailPending || cloudDetailFailed ? (
          <div
            data-testid={detailError ? 'favorites-detail-error' : 'favorites-detail-loading'}
            data-detail-loading={detailLoading || undefined}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-text-muted"
          >
            {detailError ? (
              <>
                <span>{t('sessionDetailNetworkError')}</span>
                {onRetryDetail && (
                  <button
                    type="button"
                    data-testid="favorites-detail-retry"
                    onClick={onRetryDetail}
                    className="underline underline-offset-2"
                  >
                    {t('retry')}
                  </button>
                )}
              </>
            ) : (
              t('loading')
            )}
          </div>
        ) : cloudListEmpty || current === null ? (
          /* Nothing kept yet. No reading, no script, no frame around either —
             the two windows are what a favorite looks like when opened, and
             drawing them empty would be furniture standing in for content.
             What is left is one line, set the way the studio sets its own
             opening line: the same face, the same grey, the same arrival out
             of a blur. The studio's says that page is ready for a first
             conversation; this says the same about a first thing kept.

             Centred on the window rather than on this page's strip of it, and
             keyed to nothing — it neither arrives nor leaves, it is simply
             what the page is until there is something to show. */
          <div
            data-testid="favorites-empty"
            className="absolute inset-y-0 left-0 flex items-center justify-center px-8"
            style={{
              '--favorites-page-inset': PAGE_LEFT_INSET,
              right: 'var(--favorites-page-inset)',
            } as CSSProperties}
          >
            {/* A step up from the studio's own opening line, which is the
                same words at 14/16px. Not a disagreement with it — the two
                lines are set in the same place at the same size and the studio
                has a sidebar's width to say it in, where this has the whole
                page. A measure that reads as a held sentence in a column reads
                as a caption dropped in a field out here, and the only thing on
                an empty page should not look like a footnote to it.

                中文 stays a step under the Latin, as in the studio: at equal
                px the CJK face fills its em where the serif leaves sidebearings
                either side, so matching the numbers would not match the size
                they read at. */}
            <p
              className={`animate-blur-fade-in text-center leading-relaxed text-text-greeting ${
                zh ? 'font-jinghua-laosongti text-lg tracking-wider' : 'font-eb-garamond text-xl'
              }`}
            >
              {t('favoritesEmptyTitle')}
            </p>
          </div>
        ) : (
          /* The full height of the page, inset to the two verticals the windows
              stand on — the list's column on the right and the page's own edge
              measure on the left. It stops short of the list rather than
              running under it, since the code window is the one that would
              otherwise meet the entries.

              Full height, though neither window uses all of it: the row holds
              the two widths and the vertical each of them is anchored on, and
              each window states its own height off the one measure they share.

              Keyed on the conversation so an arriving favorite starts its
              reading where its own end is rather than where the last one was
              left, and so the fades below replay. Where that end is, is the
              archive's own business — see the layout effect in
              ArchivedConversationView.

              The fade is not here but on each window, and for a reason that
              outlived the reason it was written for. `featured-content-in`
              animates opacity and fills, which keeps the element a compositing
              group for good, and a group of that kind above the reading is
              where its blurred ends stop being able to see what is behind
              them. That is now the window's own glass rather than the page,
              and the window is a backdrop root either way — but a fade on the
              row would still be one group covering two windows that arrive as
              two things. */
          <div
            key={current.id}
            data-testid="favorites-gallery"
            /* Air between the windows, not a divider. The app's 6px divider
               measure is a resize handle's width — two panes of one workspace
               butted together with just enough between them to grab. These two
               are not that: they are two windows held apart on the page's light
               field, and what separates them should read as the page showing
               through.

               Set against the right rather than centred, which is what the
               script answers to; the reading then fills what is left, so the
               row has no spare width to place and both of its outer edges are
               on the verticals they were given.

               A window standing on its own is centred instead: with nothing
               beside it there is no spread to anchor, and a lone window pushed
               against one edge reads as one missing its other half. */
            className={`absolute flex ${alone ? 'justify-center' : 'justify-end'}`}
            /* The two verticals are named before they are used, so `left` and
               `right` read as the places they are rather than as arithmetic.

               A lone window answers to neither: only the page, and the middle
               of it. */
            style={alone
              ? ({
                '--favorites-page-inset': PAGE_LEFT_INSET,
                top: GALLERY_BAND_TOP,
                bottom: GALLERY_BAND_BOTTOM,
                left: 0,
                right: 'var(--favorites-page-inset)',
              } as CSSProperties)
              : ({
                '--gallery-inset-left': GALLERY_INSET_LEFT,
                '--gallery-inset-right': GALLERY_INSET_RIGHT,
                '--gallery-gutter': GALLERY_GUTTER,
                top: GALLERY_BAND_TOP,
                bottom: GALLERY_BAND_BOTTOM,
                left: 'var(--gallery-inset-left)',
                right: 'var(--gallery-inset-right)',
                gap: 'var(--gallery-gutter)',
              } as CSSProperties)}
          >
            {!soloScript && (
              /* The same window as the script beside it, and as the pair a
                 Featured record opens into: one glass, one title row, one set
                 of edges. A conversation and the code it arrived at are two
                 halves of one kept thing, and the page should not have to say
                 which of the two it takes more seriously.

                 Wider than the script: it is the longer read and the one
                 that reflows, where a script's lines are as long as they were
                 written. How much wider is not set here but by where its left
                 edge stands — see READING_LEFT_INSET.

                 Inside, the reading runs to both ends of the window and is
                 clipped there. It used to blur out instead, which is what a
                 stream standing on open page has to do to say it carries on
                 past; a window with an edge says that by having one. */
              <section
                data-testid="favorites-conversation-panel"
                aria-label={t('favoritesConversation')}
                className={`${WINDOW_GLASS} featured-content-in relative`}
                style={{
                  flex: CONVERSATION_SHARE,
                  // Only when it stands alone: beside a script the reading's
                  // width is where its two edges are, and a cap could only
                  // disagree with them.
                  maxWidth: alone ? SOLO_READING_MEASURE : undefined,
                }}
              >
                {/* Named rather than left to be inferred. The script's own
                    title is the take it is showing and changes with it, so the
                    line opposite has to be there for the pair to read as two
                    windows onto one favorite rather than as a panel beside a
                    column of text. */}
                <WindowTitle title={t('favoritesConversation')} />
                {/* `favorites-reading` reaches this box into the window's
                    right-hand padding so the bar inside it can stand where the
                    script's does — see index.css. */}
                <div className="favorites-reading min-h-0 flex-1">
                  <ArchivedConversationView
                    active={active}
                    messages={archiveMessages}
                    numberTakes={scripts.length > 1}
                    scrollRef={archiveScrollRef}
                    selectedCodeMessageId={selectedScript?.turnId ?? null}
                    onSelectCode={setSelectedScriptTurnId}
                    playingCodeMessageId={playingCodeMessageId}
                    onPlayCode={(messageId, code) => {
                      setSelectedScriptTurnId(messageId);
                      onPlayCode(code);
                    }}
                    onStopCode={onStopCode}
                  />
                </div>
              </section>
            )}

            {/* The narrow half of the row: it keeps its place against the
                page's right-hand vertical, and its measure for as long as that
                measure is still the narrower of the two — past which it is half
                the spread and the reading is the other half. Both of its
                horizontals are the row's, which is the whole point of the
                row. */}
            {selectedScript && (
              <div
                className="featured-content-in relative z-40 flex min-w-0"
                /* The cap is where the crossing happens: a flex item held
                   under its basis is frozen there and the width it did not
                   take goes to the item beside it, which is the reading — so
                   naming half the spread here is enough to make both halves
                   it. Alone there is nothing to be half of. */
                style={{
                  flex: CODE_SHARE,
                  maxWidth: alone ? undefined : PAIRED_CODE_CAP,
                }}
              >
                <CodePanel
                  key={selectedScript.turnId}
                  script={selectedScript}
                  playing={isPlaying && playingCode === selectedScript.code}
                  onPlay={() => onPlayCode(selectedScript.code)}
                  onStop={onStopCode}
                  scripts={scripts}
                  onSelectScript={(script) => {
                    setSelectedScriptTurnId(script.turnId);
                    if (script.kind === 'final' && archiveScrollRef.current) {
                      archiveScrollRef.current.scrollTop = archiveScrollRef.current.scrollHeight;
                    }
                  }}
                  onOpenInStudio={onOpenInStudio
                    ? () => onOpenInStudio(selectedScript.code)
                    : undefined}
                />
              </div>
            )}
          </div>
        )}

        {/* The caption, in the corner opposite the page's own name. The list
            above it has to cut a long title to hold its column and shows only
            the day; this says the whole name and the moment it was kept, set
            large enough to be read rather than checked. Keyed like the gallery
            so it arrives with the favorite it names. */}
        {current && (
          <footer
            key={`${current.id}-caption`}
            data-testid="favorites-caption"
            className="featured-content-in absolute bottom-2 right-4 z-40 max-w-[min(34rem,55%)] text-right"
          >
            {/* The name, and what can be done to this favorite, on one line.
                Two marks rather than a menu: keeping and letting go are the
                same act read in two directions, so the filled star that says
                the conversation is kept is also the thing you press to stop
                keeping it, and the bin beside it is the only other thing this
                page can do to an entry. They stand past the name at the
                caption's own right edge, where they are the end of the line
                rather than furniture in front of it. */}
            <div className="flex items-center justify-end gap-2">
              {/* Two ways of saying the same thing, because the two scripts do
                  not have the same means. DM Serif Display carries Latin only —
                  a Chinese name set in it is really Georgia or whatever the
                  system falls back to, a different face from one favorite to
                  the next — so English takes the serif at its single weight of
                  400, and 中文 stays in the page's own font and takes weight
                  instead. Either way the name reads as the name, not as one
                  more label. */}
              <h2
                data-favorites-caption-serif={!zh}
                className={`min-w-0 text-[12px] leading-tight text-text-primary ${zh ? 'font-bold' : 'font-dm-serif'}`}
              >
                {conversationTitle(current)}
              </h2>
              {((onUnfavorite && current.sessionId) || onDelete) && (
                <span className="flex shrink-0 items-center gap-0.5">
                  {onUnfavorite && current.sessionId && (
                    <button
                      type="button"
                      data-favorites-unfavorite
                      onClick={() => onUnfavorite(current)}
                      title={t('unfavorite')}
                      aria-label={t('unfavorite')}
                      /* Held a shade under full strength: the corner is a
                         caption, and two marks at the same weight as the name
                         beside them would turn it into a toolbar. */
                      className="grid size-6 place-items-center rounded-full border-0 bg-transparent text-brand-accent transition-[background-color,transform] hover:bg-surface-hover active:scale-95"
                    >
                      <StarIcon size={14} filled />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      data-favorites-delete
                      onClick={() => onDelete(current)}
                      title={t('deleteFavorite')}
                      aria-label={t('deleteFavorite')}
                      /* The same red the history panel's bin turns and the
                         notice reports a deletion in — `--color-error` is
                         #CC3803, an orange, which beside the star's own orange
                         reads as a shade of it rather than as a warning. */
                      className="grid size-6 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-diff-remove"
                    >
                      <TrashIcon size={13} />
                    </button>
                  )}
                </span>
              )}
            </div>
            <time
              dateTime={new Date(current.favoritedAt).toISOString()}
              className="mt-1.5 block text-[12px] tabular-nums text-text-secondary"
            >
              {t('favoritesSavedAt').replace('{time}', favoritedTimeLabel(current.favoritedAt))}
            </time>
          </footer>
        )}
      </div>
    </main>
  );
}
