import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type RefObject,
} from 'react';

/**
 * How fast a name that will not fit is carried past, in pixels a second.
 *
 * A drift rather than a scroll. What it has to beat is the eye reading along
 * with it — anything quicker and the tail arrives before the head has been
 * read, which is a ticker, not a title — and every line this is used on is one
 * short row of small type, not a headline anyone is waiting on. Slow enough,
 * too, to be ignorable: it runs for as long as the entry is open, in the
 * corner of a page someone is reading something else on, and a name moving at
 * a pace that keeps catching the eye is a name that has to be looked at again
 * and again.
 */
const MARQUEE_SPEED = 24;
/**
 * The space between the end of the name and the start of it coming round
 * again.
 *
 * The whole of what makes a loop readable. With the two too close the tail of
 * the name and its own head read as one string and the eye cannot find where
 * it starts over; this is wide enough to be a break at the sizes these lines
 * are set in and narrow enough that the line never goes empty. Written onto
 * the node as a custom property, so this constant and the gap the CSS draws
 * are the same number rather than two copies of it.
 */
const MARQUEE_GAP = 48;
/**
 * How much has to be cut off before it is worth moving anything.
 *
 * A line at rest can report a fractional overflow it is not actually hiding —
 * a fractional content width against an integer box, a page at a non-integer
 * zoom — and a title that drifts two pixels to reveal nothing is a line that
 * will not keep still.
 */
const MARQUEE_MIN_OVERFLOW = 3;

/**
 * Runs a name round when it does not fit the room it has.
 *
 * Only where it is the answer to "what am I looking at" — the open row of a
 * collection, the caption naming what is on screen. A list whose every row ran
 * at once would be a column of tickers, and none of them would be telling the
 * reader which one is open.
 *
 * Both measurements are written onto the node rather than held as state — the
 * same bargain `useClippedEnds` makes: what reads the answer is CSS, which
 * needs no render to notice, and a list that re-rendered to move a name a few
 * pixels would be paying for the wrong thing. It also has to be written this
 * way: a list re-renders whenever the pointer crosses a row, and a name whose
 * animation was rebuilt each time would be a name that jumped back to its
 * start every time the hand moved.
 *
 * The lap is the name plus the gap after it, which is exactly where the second
 * copy of the name stands — so at the end of a lap the copy is where the
 * original began, and the loop closes on itself with nothing to see.
 */
function useTitleMarquee(
  clipRef: RefObject<HTMLElement | null>,
  nameRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  const measure = useCallback(() => {
    const clip = clipRef.current;
    const name = nameRef.current;
    if (!clip || !name) return;
    /* The name's own width, taken off its box rather than off the line's
       scroll extent: the line holds a second copy of the name once this is
       running, and its extent would then be measuring the loop rather than
       the thing being looped. */
    const width = active ? Math.round(name.getBoundingClientRect().width) : 0;
    if (width - clip.clientWidth <= MARQUEE_MIN_OVERFLOW) {
      delete clip.dataset.marquee;
      clip.style.removeProperty('--scrolling-title-lap');
      clip.style.removeProperty('--scrolling-title-gap');
      clip.style.removeProperty('--scrolling-title-duration');
      return;
    }
    const lap = width + MARQUEE_GAP;
    clip.dataset.marquee = 'true';
    clip.style.setProperty('--scrolling-title-gap', `${MARQUEE_GAP}px`);
    clip.style.setProperty('--scrolling-title-lap', `${-lap}px`);
    clip.style.setProperty('--scrolling-title-duration', `${(lap / MARQUEE_SPEED).toFixed(2)}s`);
  }, [active, clipRef, nameRef]);

  useLayoutEffect(measure);

  useEffect(() => {
    const clip = clipRef.current;
    if (!clip || typeof ResizeObserver === 'undefined') return undefined;
    /* The box keeps its width, but the name in it does not keep its own: a
       longer title swapped in, a font arriving late, the page zoomed — and on
       a phone, a panel that was closed when this was last measured. */
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    return () => observer.disconnect();
  }, [clipRef, measure]);
}

interface ScrollingTitleProps extends Omit<ComponentPropsWithoutRef<'span'>, 'title' | 'children'> {
  /** The name to show, and to carry round if it does not fit. */
  title: string;
  /**
   * Whether this is the line being read. A line that is only one of several to
   * choose between says what it gives up with an ellipsis instead — see
   * `.scrolling-title-clip` in index.css, which also puts the ellipsis back
   * where the reader has asked for less motion.
   */
  active?: boolean;
}

/**
 * One line of text that clips like any other, and runs round when it is the
 * one being read.
 *
 * The caller keeps its own box and its own type: everything about where this
 * line sits comes through `className`, and what is added here is the clipping,
 * the measuring, and the second copy of the name the loop closes on.
 */
export default function ScrollingTitle({
  title,
  active = true,
  className = '',
  ...rest
}: ScrollingTitleProps) {
  const clipRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  useTitleMarquee(clipRef, nameRef, active);

  return (
    <span ref={clipRef} className={`scrolling-title-clip truncate ${className}`} {...rest}>
      {/* The line that travels. Plain inline until it has to move, so a name
          that fits is laid out and clipped exactly as it was.

          The name it carries a second time — what follows it out of the box,
          so that what arrives is itself rather than a blank — is drawn from
          this attribute by CSS rather than written out here as a second span.
          It is one name: put in the line twice it would be in the line's text
          twice, to anything that reads the page rather than looks at it. */}
      <span className="scrolling-title-line" data-title={title}>
        <span ref={nameRef}>{title}</span>
      </span>
    </span>
  );
}
