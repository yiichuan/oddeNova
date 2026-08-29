import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t, zh } from '../../lib/i18n';
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
import ControlHoverLabel from '../studio/ControlHoverLabel';
import { anchorAbove, type ControlHoverLabelAnchor } from '../studio/control-hover-anchor';
import ArchivedConversationView from '../conversation/ArchivedConversationView';
import ConversationBlurBands from '../conversation/ConversationBlurBands';
import ConversationTurnRail from '../conversation/ConversationTurnRail';
import FeaturedWebglLightField from '../featured/FeaturedWebglLightField';
import FavoritesList, { LIST_COLUMN } from './FavoritesList';
import { NAV_COLLAPSED_WIDTH } from '../nav/PrimaryNav';

/**
 * The reading's own inset: the window's 60px of horizontal overhang handed
 * straight back as padding leaves 1rem, and the message row adds its own half
 * of that before the first character.
 */
const READING_INSET = '1.5rem';

/**
 * What the left has to step back by that the right does not, because the two
 * are not counted from the same place. This page begins where the primary
 * nav's column ends, and on a page whose nav is always in lobes that column is
 * still holding 60px of the page's left edge plus the app's region inset — 70px
 * the right edge has nothing to answer — and then the reading insets itself
 * again. Take both off the left and the conversation's first character stands
 * as far from the page's left edge as the code window's edge does from its
 * right.
 */
const NAV_COLUMN = `${NAV_COLLAPSED_WIDTH}px + var(--spacing-region)`;
const GALLERY_LEFT_STEP_BACK = `calc(${NAV_COLUMN} + ${READING_INSET})`;

/**
 * The same step back without the reading's own inset: purely what the primary
 * nav's column holds of the window's left edge, which is how far this page's
 * left edge stands inside the window's.
 *
 * Taken off the right, it makes a box whose middle is the window's middle. What
 * needs one is anything standing alone on this page — a reading with no script
 * beside it, the line an empty page shows — because a lone thing centred in the
 * strip the page was handed reads as a thing pushed to the right. The spread
 * below never needs it: it is built from two verticals instead, and lands on
 * the same centre by a longer road.
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
 * The air between the two windows.
 *
 * Half again the 2rem the page keeps between any two things standing side by
 * side: these two are one spread rather than two neighbours, and the extra is
 * what says so — but only just, because a spread is read across.
 *
 * A knob for how far apart the two windows stand, and for nothing else — what
 * it gives up goes to the margins below rather than into the windows.
 */
const GALLERY_GUTTER = '3rem';

/**
 * The gutter that leaves the two windows exactly the width the page's own two
 * verticals gave them, before any of this was tuned: 2rem of air plus the whole
 * of the left's step back. Not what the gutter is — what it is measured
 * against.
 */
const WIDTH_HOLDING_GUTTER = `calc(2rem + ${GALLERY_LEFT_STEP_BACK})`;

/**
 * Half of whatever the gutter gives up against that, handed to each margin.
 *
 * Which is what keeps the windows' width out of the gutter's hands. The pair is
 * held between two margins and one gutter; narrow the gutter with the margins
 * pinned and the two columns take the whole difference and grow. Give it to the
 * margins instead — half each, so the spread stays centred on the page — and
 * the two windows keep their width whatever the middle is set to.
 */
const GUTTER_GIVEN_BACK = `calc((${WIDTH_HOLDING_GUTTER} - ${GALLERY_GUTTER}) / 2)`;

/**
 * How far in from either side of the page the gallery stands: the column the
 * list needs, the left's step back, and each margin's share of what the gutter
 * gave up.
 */
const GALLERY_INSET_RIGHT = `calc(${LIST_COLUMN} + ${GUTTER_GIVEN_BACK})`;
const GALLERY_INSET_LEFT = `calc(${LIST_COLUMN} - ${GALLERY_LEFT_STEP_BACK}`
  + ` + ${GUTTER_GIVEN_BACK})`;

/**
 * How the row divides between the two columns.
 *
 * Equal grow, and the conversation carries the reading's own two insets as its
 * basis. So the free space halves, and the conversation takes its half plus the
 * 3rem it is about to give straight back to its own margins — which leaves the
 * block of text inside it exactly the width of the code window beside it.
 *
 * That is what makes the two mirror images about the page's centre rather than
 * merely equidistant from its edges. The outer pair already matched: the first
 * character of the reading stands as far from the left edge as the code
 * window's edge does from the right. Equal widths is what brings the inner pair
 * with them — and two blocks reflected in an axis have to be the same size, so
 * the 0.9-to-1.1 the row used to hold could not survive the ask.
 */
const CONVERSATION_SHARE = `1 1 calc(${READING_INSET} * 2)`;
const CODE_SHARE = '1 1 0%';

/**
 * How wide either block gets to be at its widest.
 *
 * A measure rather than a share: past about this, a line of prose or of code is
 * one the eye loses its place in on the way back to the next line, and a window
 * that keeps growing with the display only makes more of them. So beyond a
 * point the two blocks stop growing and the page grows around them instead.
 *
 * Which is why the row is centred. Both columns reach the cap at the same
 * width — their targets differ by the same 3rem their caps do — so neither can
 * take the other's leftover, and what is left over is air the row divides
 * evenly. That is what keeps the mirror: each block moves in from its own edge
 * of the page by exactly half of it.
 */
const READING_MEASURE = '390px';
const CONVERSATION_MAX = `calc(${READING_MEASURE} + ${READING_INSET} * 2)`;

/**
 * How much of the page's height the gallery leaves above and below itself, as
 * a divisor of that height: the two windows keep the middle two thirds, so
 * both of their edges stand one sixth of the page in from its own.
 *
 * One number, because the two columns say it in different ways and must not
 * drift. The code window has a panel and says it with a height. The
 * conversation has none — it runs the column's full height and lets its ends
 * blur out — so it says it with where the reading comes to rest instead: at
 * the top of the scroll the first message's top stands on the code window's
 * top edge, at the bottom the last reply's foot stands on its bottom edge.
 * Between those the stream carries on past both, which is what the blur is
 * for. Read as a spread rather than as two things floating independently.
 */
const GALLERY_BAND_DIVISOR = 6;

/** The code window's own height, as a share of the row it stands in. */
const GALLERY_BAND_HEIGHT = `calc(100% - 200% / ${GALLERY_BAND_DIVISOR})`;

/**
 * The same measure for the conversation, in cqh against `.conversation-archive`
 * — the one box that is the reading column's full height, which is also the
 * height the code window takes its share of. A percentage cannot say this:
 * padding resolves against width.
 */
const GALLERY_BAND_INSET = `calc(100cqh / ${GALLERY_BAND_DIVISOR})`;

/**
 * How far below the middle of the page the pair sits.
 *
 * The reading follows the code window down rather than staying put: the two
 * verticals below are one measure said twice, and the first message standing
 * on the code window's top edge is what the page's whole geometry has been
 * built around. Moving one of the pair and not the other would leave that off
 * by exactly this much.
 */
const GALLERY_DROP = '30px';

/**
 * How far below the code window's top edge the reading starts.
 *
 * Just off it rather than exactly on it. A first message on the same line as
 * the panel's border reads as having run into it — the border is a drawn edge
 * and the message is not, and the eye takes two things touching for one thing
 * clipped. This is the smallest offset that reads as clearance rather than as
 * an alignment someone missed.
 *
 * Only the head takes it. The foot still stands on the panel's own bottom
 * edge, where a script has no chrome of its own to answer to either.
 */
const READING_HEAD_CLEARANCE = '8px';

/**
 * The reading window and its content stops, handed to the archive stylesheet.
 *
 * The window keeps the page's own height, reaching back through the app's
 * region inset to the very edges of it — an end outside the column is an end
 * the blur never has to stop at.
 *
 * The two are independent on purpose: the stops are given in the column's own
 * coordinates, so where the stream stops being drawn and where the reading
 * comes to rest can be moved separately. index.css converts between the two
 * when it turns a stop into scrollport padding.
 */
const CONVERSATION_WINDOW = {
  '--spacing-conversation-window-top': 'calc(var(--spacing-region) * -1)',
  '--spacing-conversation-window-bottom': 'calc(var(--spacing-region) * -1)',
  '--spacing-conversation-content-top':
    `calc(${GALLERY_BAND_INSET} + ${GALLERY_DROP} + ${READING_HEAD_CLEARANCE})`,
  '--spacing-conversation-content-bottom': `calc(${GALLERY_BAND_INSET} - ${GALLERY_DROP})`,
} as CSSProperties;

interface FavoritesPageProps {
  conversations: readonly FavoriteConversation[];
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

  return (
    <section
      aria-label={title}
      // Glass rather than a surface, taken verbatim from the Featured
      // detail's panels: both stand on the same WebGL light field, and a
      // panel that keeps its own flat colour there reads as a card dropped on
      // the page instead of a window cut into it. The edge comes from the same
      // place — a solid grey rule around glass is a drawn border, where a
      // tenth of white is the light catching an edge.
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[9px] border border-white/10 bg-[#0D0D0D]/55 p-5 backdrop-blur-2xl ${className}`}
      {...rest}
    >
      {/* No offset of its own: the title stands off the panel's top edge by
          exactly what the last line of the script stands off its bottom one,
          which is the panel's own padding and nothing else. The 42px that used
          to be added here made the window's two ends say different things —
          held at the top, cut at the foot — and a script is read from both. */}
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
      {/* The bars stand whenever the script is longer or wider than the
          window, rather than waiting for the pointer. A conversation says how
          much more of it there is by fading out; a script has an edge and
          cannot, so the only thing here that can say "this is not all of it"
          is a bar. Where they stand and how far they hold off the code is
          `.favorites-script-scroll` — the panel's own padding at the foot, read
          as a band to sit in the middle of; at the right, 6px between the bar
          and the border and 12px between the code and the bar, with the code
          holding that same line when there is no bar there. */}
      <div ref={scrollRef} className="favorites-script-scroll min-h-0 flex-1 overflow-auto">
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
    ? t('favoritesFinalVersion')
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
          className="animate-fade-in absolute left-0 top-[calc(100%+6px)] z-50 flex max-h-64 w-[126px] flex-col gap-1.5 overflow-x-hidden overflow-y-auto rounded-[7px] border border-white/15 bg-[#242424]/95 py-1 shadow-2xl backdrop-blur-xl"
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
                className={`mx-1 flex w-[calc(100%_-_0.5rem)] items-center rounded-[5px] px-2.5 py-0.5 text-left text-[12px] transition-colors ${
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
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#A8A8A8] transition-colors hover:text-[#C8C8C8]"
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
    ? t('favoritesFinalVersion')
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
  conversations,
  active = true,
  focus = null,
  isPlaying = false,
  playingCode = '',
  onPlayCode = () => {},
  onStopCode = () => {},
  onUnfavorite,
  onDelete,
  onOpenInStudio,
}: FavoritesPageProps) {
  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.favoritedAt - left.favoritedAt),
    [conversations],
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
  /* Left alone when the conversation changes: a turn id from another favorite
     simply isn't among this one's scripts, and the fallback below is already
     the last take — which is where an entry opens. */
  const [selectedScriptTurnId, setSelectedScriptTurnId] = useState<string | null>(null);
  /* The archive's own scrollport, borrowed. The rail on the left moves the
     reading, and the element that scrolls is inside the archive. */
  const archiveScrollRef = useRef<HTMLDivElement>(null);

  const current = sortedConversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) ?? sortedConversations[0] ?? null;
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

  const selectConversation = (conversation: FavoriteConversation) => {
    const conversationScripts = favoriteScripts(conversation);
    setPicked({ id: conversation.id, focus });
    setSelectedScriptTurnId(conversationScripts.at(-1)?.turnId ?? null);
  };

  return (
    <main
      data-testid="favorites-page"
      className="relative isolate flex h-full min-w-0 flex-1 overflow-visible"
    >
      <FeaturedWebglLightField active />

      {/* Inset to the same two verticals every other full-width page uses. */}
      <div
        className="relative z-10 h-full w-full overflow-visible px-4"
        style={CONVERSATION_WINDOW}
      >
        {/* Laid over the page rather than stacked above the gallery: the
            gallery is centred on the page's own height, and a heading in flow
            would push it off that centre. It stops where the list's column
            starts, the same vertical the gallery below it ends on. */}
        <header className="absolute left-4 top-2 z-40" style={{ right: LIST_COLUMN }}>
          <h1 className="text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary">
            {t('navFavorites')}
          </h1>
        </header>

        <FavoritesList
          conversations={sortedConversations}
          selectedId={current?.id ?? null}
          onSelect={selectConversation}
        />

        {/* Both of these are the reading's own furniture — what says the stream
            runs past the window's ends, and what indexes it. A favorite with no
            conversation in it has neither to say anything about. */}
        {hasReading && <ConversationBlurBands />}

        {/* Keyed like the gallery, so an arriving favorite brings its own index
            in rather than morphing the last one's into it. */}
        {hasReading && current && (
          <ConversationTurnRail
            key={`${current.id}-rail`}
            center={RAIL_CENTER}
            messages={archiveMessages}
            scrollRef={archiveScrollRef}
          />
        )}

        {current === null ? (
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
              className={`animate-blur-fade-in text-center leading-relaxed text-[#969696] ${
                zh ? 'font-jinghua-laosongti text-lg tracking-wider' : 'font-eb-garamond text-xl'
              }`}
            >
              {t('favoritesEmptyTitle')}
            </p>
          </div>
        ) : (
          /* The full height of the page, inset to the two verticals the windows
              stand on — the list's column on the right and the same measure of
              air on the left. It stops short of the list rather than running
              under it, since the code window is the one that would otherwise meet
              the entries.

              Full height because the two columns no longer agree about it: the
              conversation is pinned to the nav's lobes and the code keeps the
              gallery's own two thirds. The row holds the widths; each column says
              where its own two ends are.

              Keyed on the conversation so an arriving favorite starts its
              reading where its own end is rather than where the last one was
              left, and so the fades below replay. Where that end is, is the
              archive's own business — see the layout effect in
              ArchivedConversationView.

              The fade itself is deliberately *not* here. `featured-content-in`
              animates opacity and fills, which keeps the element a compositing
              group for good — and an ancestor of that kind is where the blurred
              ends of the conversation stop being able to see the page behind
              them, which is what makes pale text glow instead of going soft. So
              each column carries its own fade, below the point where that
              matters. */
          <div
            key={current.id}
            data-testid="favorites-gallery"
            /* Air, not a divider. The app's 6px divider measure is a resize
               handle's width — two panes of one workspace butted together with
               just enough between them to grab. These two are not that: they are
               two reading surfaces held apart on the page's light field, and
               what separates them should read as the page showing through. */
            className="absolute inset-y-0 flex justify-center"
            /* The two verticals are named before they are used: each is four
               terms drawn from three modules, and `left`/`right` read better
               pointing at a name than carrying the arithmetic.

               A column standing on its own answers to neither: with nothing
               beside it there is no spread to hold apart and no list to stop
               short of — only the page, and the middle of it. */
            style={alone
              ? ({
                '--favorites-page-inset': PAGE_LEFT_INSET,
                left: 0,
                right: 'var(--favorites-page-inset)',
              } as CSSProperties)
              : ({
                '--gallery-inset-left': GALLERY_INSET_LEFT,
                '--gallery-inset-right': GALLERY_INSET_RIGHT,
                '--gallery-gutter': GALLERY_GUTTER,
                left: 'var(--gallery-inset-left)',
                right: 'var(--gallery-inset-right)',
                gap: 'var(--gallery-gutter)',
              } as CSSProperties)}
          >
            {!soloScript && (
              /* No surface of its own: the exchange is read straight off the
                 page's light field. The code beside it keeps its panel because
                 a script is a thing you look *at*, with edges; a conversation
                 is something you look *through*, and a second frame around it
                 only says that it is furniture.

                 The reading runs the whole way to both ends of it: no padding
                 at either edge, so the messages reach them and the blur is what
                 says the stream carries on past. The bands reach past the
                 reading window at both ends by design, and the outermost of
                 them stops a few pixels above this column. Horizontal overflow
                 stays visible so the reading window can extend 60px past either
                 side while its compensated content remains on the same
                 verticals. */
              <section
                data-testid="favorites-conversation-panel"
                aria-label={t('favoritesConversation')}
                className="flex min-w-0 flex-col overflow-visible"
                style={{
                  ...CONVERSATION_WINDOW,
                  flex: CONVERSATION_SHARE,
                  maxWidth: CONVERSATION_MAX,
                }}
              >
                <div className="min-h-0 flex-1">
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

            {/* Its two edges are the verticals the conversation beside it comes
                to rest on, so the height is taken from the same measure. */}
            {selectedScript && (
              <div
                className="featured-content-in relative z-40 flex min-w-0 self-center"
                style={{
                  height: GALLERY_BAND_HEIGHT,
                  flex: CODE_SHARE,
                  maxWidth: READING_MEASURE,
                  // Offset rather than a margin: `self-center` centres the margin
                  // box, so a margin here would move the panel half as far as it
                  // says. The column is already `relative`.
                  top: GALLERY_DROP,
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
                      className="grid size-6 place-items-center rounded-full text-[#f05a28]/70 transition-colors hover:bg-white/10 hover:text-[#f05a28]"
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
                      className="grid size-6 place-items-center rounded-full text-text-muted transition-colors hover:bg-white/10 hover:text-[#E01A1A]"
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
