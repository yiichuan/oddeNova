import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import type { FavoriteSummary } from '../../../shared/session-api';
import {
  favoriteMatches,
  favoritedDateLabel,
  type FavoriteConversation,
} from '../../lib/favorite-conversations';
import InfiniteScrollSentinel from '../common/InfiniteScrollSentinel';
import { SearchIcon, XIcon } from '../icons';

/** One entry, one row — set in the same metrics the Featured title column uses. */
const ROW_HEIGHT = 22;
/** Breathing room either side of a row, so the marker never crops it. */
const ROW_PADDING = 2;
/**
 * Air between the rows and the bar standing beside them.
 *
 * The bar arrives only once the list outgrows its corner, and without this it
 * arrives touching the dates — which is the column's one fixed edge, so it is
 * the one place a thing landing against it shows.
 */
const SCROLLBAR_GUTTER = 6;
/**
 * How far right of that vertical the column itself stands.
 *
 * The bar and the air beside it take 12px off the inside of the column, which
 * is 12px the rows are held back from the vertical the page's caption is set
 * against. Moving the whole column out gives half of it back and leaves the
 * bar the other half of the page's edge to stand in.
 */
const LIST_SCROLLBAR_OFFSET = 6;
/**
 * How tall the column stands, from 7px in at the top: six entries, and the
 * rest of them scrolled to.
 *
 * A row count rather than a share of the page, which is what the Featured
 * column beside it is measured in too. What this is for is picking one of a
 * short held list without leaving the page you are on, and a window that
 * grows with the viewport stops reading as that — run far enough down, a list
 * in a corner becomes a second column of the page, which this is not. Six is
 * what stays a glance on every screen the app opens on.
 */
const VISIBLE_ROWS = 6;
const LIST_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;
/** Where the column starts — the line the Featured title column stands on. */
const LIST_TOP = 7;
/**
 * Air between the field at the head of the column and the first row under it.
 *
 * Half a row. The rule under the field is already the break between the two, so
 * this only has to keep the first entry off it — a whole row of air would read
 * as a gap in the list rather than as the space a heading keeps.
 */
const SEARCH_GAP = ROW_HEIGHT / 2;

/**
 * The column's foot: at most three of the six rows dissolving, and out to
 * nothing.
 *
 * The bar beside it says how much more there is; this says the same thing in
 * the rows themselves, the way the Featured column does — its entries thin out
 * down the list rather than stopping at an edge. It goes all the way to
 * nothing to say it: a row that stops at a fixed dimness reads as one someone
 * greyed out, where one that dissolves reads as the column running on.
 *
 * This is the deepest it ever runs, not the depth it always has. The fade is
 * only ever as deep as there is list left below it (see `listFade`), so it
 * thins away as the last rows come up and the oldest favorite comes to rest
 * whole — a dissolve under the final entry would be the column claiming there
 * is more when there is not, and the one entry you can never read would be the
 * one at the end.
 */
const FADE_ROWS = 3;
const FADE_DEPTH = FADE_ROWS * ROW_HEIGHT;

/* Stepped along a smoothstep rather than run straight: a linear ramp turns its
   alpha abruptly at each of its two ends, and the eye reads a turn like that
   as an edge — which is the one thing a fade is there not to have. */
const listFade = (depth: number) => (depth <= 0 ? undefined : 'linear-gradient(to bottom,'
  + ` #000 calc(100% - ${depth}px),`
  + ` rgb(0 0 0 / 0.844) calc(100% - ${depth * 0.75}px),`
  + ` rgb(0 0 0 / 0.5) calc(100% - ${depth * 0.5}px),`
  + ` rgb(0 0 0 / 0.156) calc(100% - ${depth * 0.25}px),`
  + ' transparent)');

/**
 * The column the list stands in. Capped rather than free: the entries are set
 * against the page's right edge, so an untamed width is a long title reaching
 * further and further across whatever the page has put beside it.
 */
export const LIST_WIDTH = '13rem';
/** The vertical it is set against — the one the page's own panels end on. */
export const LIST_RIGHT_INSET = '1rem';
/** Air between the list's left edge and anything standing next to it. */
const LIST_GUTTER = '2rem';
/**
 * Where the page has to stop on the right to leave the list a column of its
 * own. Read by the page rather than guessed at, so the gap survives a change
 * of mind about how wide the list is.
 */
export const LIST_COLUMN = `calc(${LIST_RIGHT_INSET} + ${LIST_WIDTH} + ${LIST_GUTTER})`;

const ROW_STYLE = {
  fontSize: 12,
  fontWeight: 400,
  letterSpacing: '0.08em',
  lineHeight: `${ROW_HEIGHT}px`,
} as const;

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * The column's head: what narrows it.
 *
 * Set in the rows' own metrics and against their own right edge, because it
 * belongs to the list rather than standing over it — the same 12px line, so
 * what you type sits in the column the entries sit in and the answer falls
 * into place directly under the question. It is the one place on this page
 * where the reader writes rather than picks, and a rule under the line is all
 * that has to be added to say so.
 *
 * That rule is what carries the field's state: out of the way at rest, and in
 * the accent the moment there is a focus or a query in it — the same orange
 * the column marks the open entry with, so a narrowed list and the row it
 * settles on are answering in one colour.
 *
 * One slot on the left holds both a mark and a move. Empty, it is a magnifier
 * saying what the line is for; filled, it is the way back out — which is
 * exactly where the eye already is once there is something to undo, and costs
 * the column no second control.
 */
function SearchField({ value, onChange }: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const filled = value !== '';

  return (
    <div
      data-testid="favorites-search"
      className="flex w-full shrink-0 items-center gap-2 border-b pb-[3px] transition-[border-color] duration-200 motion-reduce:transition-none"
      /* The rule runs the whole width of the column, which is what makes it
         the list's own line rather than a control parked above it: it starts
         where a row's fill starts when a title is long enough to take the
         column, and ends where the bar beside the rows ends. Both edges are
         therefore the box itself, and what keeps the writing in the rows'
         two verticals is padding held inside it. */
      style={{
        borderColor: focused || filled
          ? 'var(--favorites-search-rule-active)'
          : 'var(--favorites-search-rule)',
        marginBottom: SEARCH_GAP,
        paddingLeft: ROW_PADDING,
        paddingRight: SCROLLBAR_GUTTER + ROW_PADDING,
      }}
    >
      {filled ? (
        <button
          type="button"
          aria-label={t('favoritesSearchClear')}
          data-testid="favorites-search-clear"
          onClick={() => onChange('')}
          className="shrink-0 opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none"
          style={{ color: 'var(--favorites-search-text)' }}
        >
          <XIcon size={13} />
        </button>
      ) : (
        /* Decorative — the placeholder beside it already says the word — and
           wrapped because the icon set takes a size and a class and nothing
           else.

           One size for both states of the slot, so nothing steps as the
           magnifier gives way to the cross and back. */
        <span
          aria-hidden="true"
          className="shrink-0 opacity-45"
          style={{ color: 'var(--favorites-row-idle)' }}
        >
          <SearchIcon size={13} />
        </span>
      )}
      {/* `text` rather than `search`: the platform draws its own clear button
          inside a search field, and this column has one of its own that is
          drawn in the column's materials. */}
      <input
        type="text"
        aria-label={t('favoritesSearch')}
        data-testid="favorites-search-input"
        value={value}
        placeholder={t('favoritesSearchHint')}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        /* Escape empties the field rather than reaching whatever else on the
           page listens for it — while there is something in it to clear. */
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !filled) return;
          event.stopPropagation();
          onChange('');
        }}
        /* Not set in the rows' uppercase, deliberately: the rows are drawn
           text and can be cased however the column wants, but this line is the
           reader's own writing being handed back to them, and a field that
           answers every keystroke in a case nobody typed reads as broken
           rather than as styled. */
        className="min-w-0 flex-1 bg-transparent text-right outline-none placeholder:text-[color:var(--favorites-row-idle)] placeholder:opacity-50"
        style={{
          ...ROW_STYLE,
          color: 'var(--favorites-search-text)',
          caretColor: 'var(--color-brand-accent)',
        }}
      />
    </div>
  );
}

interface FavoritesListProps {
  /** Newest first — the caller owns the order, the column only draws it. */
  summaries: readonly FavoriteSummary[];
  /** Full local records let search include conversation text as well as titles. */
  conversations?: readonly FavoriteConversation[];
  selectedId: string | null;
  onSelect: (summary: FavoriteSummary) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  onLoadMore?: () => void;
  onRetryLoadMore?: () => void;
}

/**
 * 收藏 — the list of favorites, in the top right corner of the page.
 *
 * It is the Featured page's title column read as a list rather than as a wheel.
 * Same place, same right-set uppercase rows, same orange marker on the current
 * entry and the same half-strength fill run in under the pointer before you
 * commit — because it is the same act, picking one of a short held list without
 * leaving the page you are on.
 *
 * What it is not is a ring. A collection is something you turn through and come
 * back round on; a list of things you kept has a newest and an oldest, and
 * hiding those two ends would be hiding the only order the list has. So the
 * entries run one way, top to bottom, and the column scrolls when there are
 * more of them than fit rather than starting over.
 *
 * One row per entry: what the conversation was called, and the day it was kept
 * sitting quietly at the end of the same line. The day is what makes one
 * favorite findable among several with similar names — the hour it happened in
 * is not, so the row carries the date alone and the page's own reading of the
 * conversation is where anything finer belongs.
 *
 * Over the rows, a line to narrow the loaded summaries by title. The corner
 * holds six entries at a time, so typing is the quick way back to a known
 * favorite while the sentinel continues to bring older pages into the list.
 */
export default function FavoritesList({
  summaries,
  conversations = [],
  selectedId,
  onSelect,
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = null,
  onLoadMore = () => {},
  onRetryLoadMore = () => {},
}: FavoritesListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return summaries;
    const conversationsById = new Map(conversations.map((conversation) => [
      conversation.id,
      conversation,
    ]));
    return summaries.filter((summary) => {
      const conversation = conversationsById.get(summary.id);
      return conversation
        ? favoriteMatches(conversation, query)
        : summary.title.toLowerCase().includes(needle);
    });
  }, [conversations, query, summaries]);

  /**
   * How much of the foot is dissolving: as deep as the fade goes while there
   * is a fade's worth of list below the window, and closing on nothing as the
   * end comes up.
   *
   * Measured rather than declared, because it is a fact about this list at
   * this moment — how many entries are kept, how tall the window came out, and
   * where the reader has scrolled to. Both ends of it are cheap: past the last
   * three rows the depth is pinned at its maximum and the state stops
   * changing, so the only renders this causes are inside the final 66px of
   * travel.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeDepth, setFadeDepth] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;

    const measure = () => {
      const below = element.scrollHeight - element.clientHeight - element.scrollTop;
      setFadeDepth(Math.round(Math.min(FADE_DEPTH, Math.max(0, below))));
    };

    measure();
    element.addEventListener('scroll', measure, { passive: true });
    /* The window's own height moves with the page, and the fade has to be told
       — the rows below it are the same rows, but how many of them are under
       the window is not. */
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [matches]);

  if (summaries.length === 0) return null;

  const fade = listFade(fadeDepth);

  return (
    /* The field, then the rows it narrows. Held to its content rather than run
       to a fixed depth — the list under it is capped at six entries and stops
       wherever the entries do — so a collection of three is a line with three
       entries under it rather than a line with an empty corner. */
    <div
      className="absolute z-40 flex flex-col items-end"
      style={{
        right: `calc(${LIST_RIGHT_INSET} - ${LIST_SCROLLBAR_OFFSET}px)`,
        top: LIST_TOP,
        width: LIST_WIDTH,
      }}
    >
      <SearchField value={query} onChange={setQuery} />

      <div
        ref={scrollRef}
        aria-label={t('favoritesList')}
        data-testid="favorites-list"
        role="listbox"
        className="favorites-list-scroll flex min-h-0 select-none flex-col items-end overflow-y-auto overscroll-contain"
        style={{
          maxHeight: LIST_HEIGHT,
          paddingRight: SCROLLBAR_GUTTER,
          width: LIST_WIDTH,
          WebkitMaskImage: fade,
          maskImage: fade,
        }}
      >
        {matches.map((summary) => {
          const selected = summary.id === selectedId;
          const hovered = !selected && hoveredId === summary.id;

          return (
            <button
              key={summary.id}
              type="button"
              role="option"
              aria-selected={selected}
              data-favorite-id={summary.id}
              data-favorite-selected={selected}
              onPointerEnter={() => setHoveredId(summary.id)}
              onPointerLeave={() => setHoveredId(
                (current) => (current === summary.id ? null : current),
              )}
              onFocus={() => setHoveredId(summary.id)}
              onBlur={() => setHoveredId(
                (current) => (current === summary.id ? null : current),
              )}
              onClick={() => onSelect(summary)}
              className="flex w-full max-w-full shrink-0 items-center justify-end outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--favorites-row-ring)]"
              style={{ height: ROW_HEIGHT }}
            >
              {/* Shrink-wrapped to the row's own text and set against the right
                  edge, so the marker behind it comes out exactly that width. */}
              <span
                /* The date is a second column, not the tail of the name. At a
                   word's worth of space they run together into one string and
                   the eye has to find the break; at this they read as two things
                   on one line, which is what they are. What it costs comes off
                   the title, which has the room to give — it is the only part of
                   the row that can truncate. */
                className="relative flex min-w-0 max-w-full items-baseline justify-end gap-3 uppercase"
                /* The row's two values are named rather than written: the page
                   has a dark palette and a light one, and a row set against a
                   filled marker has to answer whichever fill is behind it. Where
                   the three are painted is the `.favorites-immersive-surface`
                   block in index.css. */
                style={{
                  ...ROW_STYLE,
                  color: selected ? 'var(--favorites-row-selected)' : 'var(--favorites-row-idle)',
                  paddingLeft: ROW_PADDING,
                  paddingRight: ROW_PADDING,
                }}
              >
                {/* One block for both states: it grows from the right edge, the
                    end the rows are set against, and arrives at half strength
                    under the pointer or at full once the entry is the one open. */}
                <span
                  aria-hidden="true"
                  data-favorite-marker={summary.id}
                  className="absolute inset-0 origin-right bg-brand-accent transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{
                    boxShadow: selected ? 'var(--favorites-row-marker-glow)' : undefined,
                    opacity: selected ? 1 : 'var(--favorites-row-marker-hover)',
                    transform: `scaleX(${selected || hovered ? 1 : 0})`,
                  }}
                />
                {/* The title gives up its width first — the date is five
                    characters and holding them keeps the column of days
                    readable however long a name runs. */}
                <span
                  data-favorite-title={summary.id}
                  className="relative min-w-0 truncate"
                >
                  {summary.title}
                </span>
                <time
                  dateTime={new Date(summary.favoritedAt).toISOString()}
                  className="relative shrink-0 tabular-nums opacity-60"
                >
                  {favoritedDateLabel(summary.favoritedAt)}
                </time>
              </span>
            </button>
          );
        })}
        {/* Only ever the query's own doing — an empty collection has no column
            at all — so it says what happened here rather than standing in for
            the page's empty line. Set as a row, in the rows' place. */}
        {matches.length === 0 && (
          <p
            data-testid="favorites-search-empty"
            className="w-full shrink-0 text-right uppercase"
            style={{ ...ROW_STYLE, color: 'var(--favorites-row-idle)', paddingRight: ROW_PADDING }}
          >
            {t('favoritesSearchEmpty')}
          </p>
        )}
        <InfiniteScrollSentinel
          enabled
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={onLoadMore}
          onRetryLoadMore={onRetryLoadMore}
        />
      </div>
    </div>
  );
}
