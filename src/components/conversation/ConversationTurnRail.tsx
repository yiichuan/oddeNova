import { useMemo, useState, type CSSProperties, type RefObject } from 'react';
import type { ChatMessage } from '../../hooks/useChat';
import { t } from '../../lib/i18n';

/**
 * How far apart two ticks stand, and how tall one tick's hit area is — the row
 * is the pitch, and the line is drawn on the row's centre line rather than
 * being the row. Which is what lets a line thicken under the pointer without
 * moving the ones above and below it: what grows is the ink, not the row.
 */
const TICK_PITCH = 18;
/** The floor the pitch compresses to before the rail would outgrow its space. */
const TICK_PITCH_MIN = 8;

/**
 * How wide the hit area is, against how wide the line drawn in it is.
 *
 * Wider than anything it draws: a 1px line is not a thing anyone can point at,
 * so the row takes the whole rail and the line is only what the row shows for
 * itself. The rest of the rail's width is target.
 */
const RAIL_WIDTH = 40;
const TICK_WIDTH = 20;
const TICK_WIDTH_HOVER = 32;

/** Thin enough to read as a rule at rest, twice that under the pointer. */
const TICK_HEIGHT = 2;
const TICK_HEIGHT_HOVER = 4;

/** Grey enough to be furniture, and the list's own warm white when it is not. */
const TICK_COLOR = 'rgba(255,255,255,0.28)';
const TICK_COLOR_HOVER = '#fff8f1';

/**
 * How much of the page's height the rail leaves at each end.
 *
 * The two nav lobes hold the ends of this column, and the conversation's own
 * blur bands reach about 100px in from each end of the page. Half of this
 * clears both with room to spare — and the rail is a thing the middle of the
 * page holds, so it should be nowhere near either end in the first place.
 */
const RAIL_CLEARANCE = 260;

/**
 * The preview window: how wide it is and how far it stands off the rail.
 *
 * Capped rather than free. It opens into the strip between the nav's column and
 * the reading, and the reading's first character is the vertical it must not
 * reach — 200px from where the rail leaves off stops well short of it whatever
 * the page is sized to, since every vertical in that strip is a fixed measure.
 */
const PREVIEW_WIDTH = 200;
const PREVIEW_GAP = 14;

/** How much of a message the label carries before a screen reader is better off
 *  hearing the rest from the reading itself. */
const LABEL_LIMIT = 60;

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
);

interface ConversationTurnRailProps {
  /** The archive's messages in reading order. Only the user's are marked. */
  messages: readonly ChatMessage[];
  /** The archive's scrollport — the element a tick scrolls. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The vertical the rail is centred on, in the page's coordinates. */
  center: string;
}

/**
 * The index down the left of an opened favorite: one short line per thing the
 * reader said, in the order they said it.
 *
 * A conversation is read for the exchange, but it is *searched* by what was
 * asked — the replies are long and the questions are what tell one part of it
 * from another. So the rail marks the user's turns alone: it is a table of
 * contents whose entries happen to be instructions.
 *
 * Nothing is written on it. A column of legible labels beside a reading is a
 * second reading, and there is no room here for one — so at rest the rail is
 * only its own rhythm, and asking about one line is what produces the words.
 * Point at a line and it grows, thickens and lights, and the thing it stands
 * for opens beside it at its own height. Take the line and the reading goes to
 * it, as near the middle of the window as the ends of the stream allow.
 */
export default function ConversationTurnRail({
  messages,
  scrollRef,
  center,
}: ConversationTurnRailProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const turns = useMemo(
    () => messages.filter((message) => message.role === 'user'),
    [messages],
  );

  if (turns.length === 0) return null;

  /* Centred on the window rather than brought merely into view: what the rail
     is for is comparing one instruction against what came back, and both of
     those live around the message. `scrollIntoView` would park it against
     whichever end it entered from, which is where the blur is.

     Measured off the two boxes rather than from `offsetTop`, so the scrollport's
     own padding — which is most of a page's height at each end here — never has
     to be taken into account. The browser clamps the result at the ends of the
     stream, which is the "as near the middle as it can" the rail promises. */
  const jumpTo = (messageId: string) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const bubble = [...scroller.querySelectorAll<HTMLElement>('[data-favorites-turn]')]
      .find((row) => row.dataset.favoritesTurn === messageId);
    if (!bubble) return;

    const window_ = scroller.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const delta = (box.top + box.height / 2) - (window_.top + window_.height / 2);
    scroller.scrollTo({
      top: scroller.scrollTop + delta,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  return (
    <div
      aria-label={t('favoritesTurnRail')}
      data-testid="conversation-turn-rail"
      role="group"
      /* Placed by its middle rather than by an edge: what it is lined up with
         is a column, and both the rail's own width and the width of a line in
         it change — the first with the hit area, the second under the pointer.
         An edge would have to be recomputed each time one of those was tuned;
         a centre line does not move. */
      className="featured-content-in absolute top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center"
      /* The vertical is named before it is used, the way the gallery's two
         are on the page that hands it down: `left` reads better pointing at a
         name than carrying a calc drawn from another module. */
      style={{
        '--turn-rail-center': center,
        left: 'var(--turn-rail-center)',
        width: RAIL_WIDTH,
        /* The rail is as tall as its own rhythm — one pitch per turn — until
           there are more turns than the middle of the page will hold, and no
           taller than that from then on. So the pitch is a fixed measure in
           the ordinary case and the rows compress only when they must, rather
           than the rail growing until it runs into the nav's lobes. */
        height: turns.length * TICK_PITCH,
        maxHeight: `calc(100% - ${RAIL_CLEARANCE}px)`,
      } as CSSProperties}
    >
      {turns.map((message) => {
        const hovered = hoveredId === message.id;
        const label = message.content.trim().slice(0, LABEL_LIMIT);

        return (
          <button
            key={message.id}
            type="button"
            aria-label={t('favoritesJumpToTurn').replace('{text}', label)}
            data-turn-tick={message.id}
            onPointerEnter={() => setHoveredId(message.id)}
            onPointerLeave={() => setHoveredId(
              (current) => (current === message.id ? null : current),
            )}
            onFocus={() => setHoveredId(message.id)}
            onBlur={() => setHoveredId(
              (current) => (current === message.id ? null : current),
            )}
            onClick={() => jumpTo(message.id)}
            className="relative flex w-full flex-1 items-center justify-center outline-none"
            style={{ minHeight: TICK_PITCH_MIN }}
          >
            <span
              aria-hidden="true"
              data-turn-tick-line={message.id}
              className="block rounded-full transition-[width,height,background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none"
              style={{
                width: hovered ? TICK_WIDTH_HOVER : TICK_WIDTH,
                height: hovered ? TICK_HEIGHT_HOVER : TICK_HEIGHT,
                backgroundColor: hovered ? TICK_COLOR_HOVER : TICK_COLOR,
                /* The one thing here that is not width, thickness or value:
                   a hairline lit to white is still a hairline, and the glow is
                   what carries the change past the two pixels it happens in. */
                boxShadow: hovered ? '0 0 12px rgba(255,248,241,0.35)' : undefined,
              }}
            />

            {/* The code window's own glass, verbatim: same fill, same tenth
                of white at the edge, same blur behind it. What this opens is a
                window onto the reading, the way the panel across the page is a
                window onto the script — so the two should be cut out of the
                page by the same means rather than each inventing an edge.

                Out of the pointer's way as well as the reader's: the window
                opens to the right of a line the pointer is on the left of, and
                takes no events of its own, so it can never be the thing that
                ends the hover that produced it. */}
            {hovered && (
              <span
                data-turn-tick-preview={message.id}
                className="animate-fade-in pointer-events-none absolute top-1/2 z-50 block -translate-y-1/2 rounded-[6px] border border-white/10 bg-[#0D0D0D]/55 px-3 py-2 backdrop-blur-2xl text-left text-[12px] leading-5 text-text-secondary"
                style={{ left: `calc(100% + ${PREVIEW_GAP}px)`, width: PREVIEW_WIDTH }}
              >
                <span className="line-clamp-6 whitespace-pre-wrap break-words">
                  {message.content}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
