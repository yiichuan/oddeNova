import { useState } from 'react';
import { t } from '../../lib/i18n';
import {
  conversationTitle,
  favoritedDateLabel,
  type FavoriteConversation,
} from '../../lib/favorite-conversations';

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
 * How tall the column stands, from 7px in at the top.
 *
 * A share of the page rather than a row count or a run to the foot of the
 * corner. What this is for is picking one of a short held list without leaving
 * the page you are on, and it has to read as that — something the corner holds.
 * Run it the whole way down and it stops being a list in a corner and becomes
 * a second column of the page, which it is not.
 *
 * A third of the page was still six entries more of it than the corner wants,
 * so those come off. In rows because that is what the column is made of: what
 * this trims is six things you can read, not a distance.
 */
const TRIMMED_ROWS = 6;
const LIST_HEIGHT = `calc(100% / 3 - ${TRIMMED_ROWS * ROW_HEIGHT}px)`;

/**
 * The column's foot: three rows deep, and out to nothing.
 *
 * The bar beside it says how much more there is; this says what happens to a
 * row on its way out. It goes all the way to nothing to say it — an entry that
 * stops at a fixed dimness reads as an entry someone greyed out, where one
 * that dissolves reads as the column running on.
 *
 * Which is safe here only because the content is padded by exactly this depth
 * below, so a row's resting place is above the fade and never in it: scrolled
 * to the end, the last entry stands whole and only empty page dissolves under
 * it. The same bargain the conversation makes with its own two ends.
 */
const FADE_ROWS = 3;
const FADE_DEPTH = FADE_ROWS * ROW_HEIGHT;

/* Stepped along a smoothstep rather than run straight: a linear ramp turns its
   alpha abruptly at each of its two ends, and the eye reads a turn like that
   as an edge — which is the one thing a fade is there not to have. */
const LIST_FADE = 'linear-gradient(to bottom,'
  + ` #000 calc(100% - ${FADE_DEPTH}px),`
  + ` rgb(0 0 0 / 0.844) calc(100% - ${FADE_DEPTH * 0.75}px),`
  + ` rgb(0 0 0 / 0.5) calc(100% - ${FADE_DEPTH * 0.5}px),`
  + ` rgb(0 0 0 / 0.156) calc(100% - ${FADE_DEPTH * 0.25}px),`
  + ' transparent)';

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

interface FavoritesListProps {
  /** Newest first — the caller owns the order, the column only draws it. */
  conversations: readonly FavoriteConversation[];
  selectedId: string | null;
  onSelect: (conversation: FavoriteConversation) => void;
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
 */
export default function FavoritesList({
  conversations,
  selectedId,
  onSelect,
}: FavoritesListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (conversations.length === 0) return null;

  return (
    <div
      aria-label={t('favoritesList')}
      data-testid="favorites-list"
      role="listbox"
      // Right-set against the same vertical the page's caption is, and 7px
      // into the page — the line the Featured title column stands on.
      className="absolute top-[7px] z-40 flex select-none flex-col items-end overflow-y-auto overscroll-contain"
      style={{
        height: LIST_HEIGHT,
        paddingBottom: FADE_DEPTH,
        paddingRight: SCROLLBAR_GUTTER,
        right: `calc(${LIST_RIGHT_INSET} - ${LIST_SCROLLBAR_OFFSET}px)`,
        width: LIST_WIDTH,
        WebkitMaskImage: LIST_FADE,
        maskImage: LIST_FADE,
      }}
    >
      {conversations.map((conversation) => {
        const selected = conversation.id === selectedId;
        const hovered = !selected && hoveredId === conversation.id;

        return (
          <button
            key={conversation.id}
            type="button"
            role="option"
            aria-selected={selected}
            data-favorite-id={conversation.id}
            data-favorite-selected={selected}
            onPointerEnter={() => setHoveredId(conversation.id)}
            onPointerLeave={() => setHoveredId(
              (current) => (current === conversation.id ? null : current),
            )}
            onFocus={() => setHoveredId(conversation.id)}
            onBlur={() => setHoveredId(
              (current) => (current === conversation.id ? null : current),
            )}
            onClick={() => onSelect(conversation)}
            className="flex w-full max-w-full shrink-0 items-center justify-end outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/70"
            style={{ height: ROW_HEIGHT }}
          >
            {/* Shrink-wrapped to the row's own text and set against the right
                edge, so the marker behind it comes out exactly that width. */}
            <span
              className="relative flex min-w-0 max-w-full items-baseline justify-end gap-1.5 uppercase"
              style={{
                ...ROW_STYLE,
                color: selected ? '#fff8f1' : '#c7c3bc',
                paddingLeft: ROW_PADDING,
                paddingRight: ROW_PADDING,
              }}
            >
              {/* One block for both states: it grows from the right edge, the
                  end the rows are set against, and arrives at half strength
                  under the pointer or at full once the entry is the one open. */}
              <span
                aria-hidden="true"
                data-favorite-marker={conversation.id}
                className="absolute inset-0 origin-right bg-[#f05a28] transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{
                  boxShadow: selected ? '0 8px 32px rgba(240,90,40,0.18)' : undefined,
                  opacity: selected ? 1 : 0.5,
                  transform: `scaleX(${selected || hovered ? 1 : 0})`,
                }}
              />
              {/* The title gives up its width first — the date is five
                  characters and holding them keeps the column of days
                  readable however long a name runs. */}
              <span
                data-favorite-title={conversation.id}
                className="relative min-w-0 truncate"
              >
                {conversationTitle(conversation)}
              </span>
              <time
                dateTime={new Date(conversation.favoritedAt).toISOString()}
                className="relative shrink-0 tabular-nums opacity-60"
              >
                {favoritedDateLabel(conversation.favoritedAt)}
              </time>
            </span>
          </button>
        );
      })}
    </div>
  );
}
