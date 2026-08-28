import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface FeaturedTitleWheelProps {
  labels: readonly string[];
  position: number;
  onSelect: (logicalIndex: number) => void;
  /** A drag in progress: the column is being pulled to this position. */
  onScrub: (position: number) => void;
  /** The drag ended — settle on whichever title is nearest the head. */
  onScrubEnd: () => void;
  /**
   * Applied to the column's own root. It is `position: fixed`, so it cannot be
   * faded by an ancestor without that ancestor becoming its containing block
   * and moving it — the page hands the class down here instead.
   */
  className?: string;
  /** What the column is a list of — a shelf of records, or one record's tracks. */
  ariaLabel?: string;
  testId?: string;
  /** Lets a title column forward wheel movement to its owning carousel. */
  onWheelStep?: (delta: number) => void;
}

/** Exported so a drag test can state its travel in rows. */
export const ROW_HEIGHT = 22;
const FONT_SIZE = 12;
/** Breathing room either side of a title, in both the rows and the marker. */
const ROW_PADDING = 2;
/**
 * How much wider than the widest row its hit area runs. The rows are set
 * against the right edge, so all of it falls on the left — a lead-in you can
 * come at a title from, without the column claiming every pixel out to the
 * stage. One width for every row, taken from the longest title, so the target
 * does not change size as the list turns.
 */
const ROW_HIT_LEAD_IN = 28;
/** The current title plus the six queued behind it. */
const VISIBLE_ROWS = 7;
/** Travel that separates picking a title from dragging the column. */
const DRAG_THRESHOLD = 3;

/**
 * Every row, and the hidden rule the marker is measured against, are set in
 * exactly these metrics: any difference would show up as orange running past
 * the text, or stopping short of it.
 */
const TEXT_STYLE = {
  fontSize: FONT_SIZE,
  fontWeight: 400,
  letterSpacing: '0.08em',
  lineHeight: `${ROW_HEIGHT}px`,
} as const;

const positiveModulo = (value: number, divisor: number) => (
  ((value % divisor) + divisor) % divisor
);

/**
 * Full strength on the head row, thinning evenly down the list — the only cue
 * the rows carry, now that they all share one size. Rows drifting off the top
 * fade across their last row of travel; rows arriving at the foot come in from
 * nothing, so the list has no hard edge at either end.
 *
 * `span` is where that thinning reaches nothing. It is the foot of the drawn
 * window on a long list, and the end of the list itself on a short one: a row
 * leaving the head is the same row that comes back at the foot, and it has to
 * arrive at nothing for the trip round to go unseen.
 */
const rowOpacity = (distance: number, span: number) => {
  if (distance <= -1) return 0;
  if (distance < 0) return 1 + distance;
  return Math.max(0, 1 - distance / span);
};

/**
 * A compact second control surface for the collection carousel. It reads the
 * carousel's continuous position rather than keeping an index of its own, so
 * dragging a sleeve also physically moves the titles beside it.
 *
 * The list is a queue read from the top: whatever is centred on the stage holds
 * the head row, under the marker, and everything after it hangs below. Nothing
 * is foreshortened — one size throughout, so the eye reads the column as a list
 * rather than as a wheel turning away, and depth is left entirely to the fade.
 *
 * Every entry has exactly one row, and the turn is in where that row is put
 * rather than in how many of them there are: a row that scrolls off the head
 * comes back round at the foot as itself. A list shorter than the drawn window
 * therefore runs out instead of starting over — the same title never stands in
 * the column twice.
 *
 * Two ways in, both of them aimed: click a title to go to it, or drag the
 * column. There is deliberately no wheel handler here — a list this small under
 * a trackpad picks up stray scroll and moves when nobody asked it to.
 *
 * Hovering a title that is not current runs the marker's colour in from the
 * right at half strength: the same shape the row would take if you clicked it,
 * shown before you commit.
 */
export default function FeaturedTitleWheel({
  labels,
  position,
  onSelect,
  onScrub,
  onScrubEnd,
  className = '',
  ariaLabel = 'Select an album or single',
  testId = 'featured-title-wheel',
  onWheelStep,
}: FeaturedTitleWheelProps) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const widestRef = useRef<HTMLDivElement>(null);
  const releaseDragRef = useRef<(() => void) | null>(null);
  // Held across the click that follows a drag's pointerup, so releasing the
  // column over a title does not also pick that title.
  const draggedRef = useRef(false);
  const [markerWidth, setMarkerWidth] = useState<number | null>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const baseIndex = Math.round(position);
  const headLabel = labels.length > 0
    ? labels[positiveModulo(baseIndex, labels.length)]
    : '';

  // Width has nothing to transition from when it is `auto`, so the head title
  // is laid out against a hidden rule and the marker is given the number.
  // Measured before paint, so the marker is never briefly the wrong size.
  //
  // Watched rather than read once: the Featured page stays mounted behind
  // `display: none` while you are elsewhere in the app, and a title measured
  // there is 0 wide. Only a real measurement is kept, so the marker holds its
  // last good width while the page is away and is right the moment it returns.
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return undefined;

    const read = () => {
      const width = node.offsetWidth;
      if (width > 0) setMarkerWidth(width + ROW_PADDING * 2);
    };
    read();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [headLabel]);

  // The rows are all one width, taken from the longest title in the list, so
  // the target a title stands in does not resize under the pointer as the
  // column turns. Measured the same way and for the same reason as the marker:
  // the page sits behind `display: none` while you are elsewhere, and a title
  // measured there is 0 wide.
  useLayoutEffect(() => {
    const node = widestRef.current;
    if (!node) return undefined;

    const read = () => {
      const width = node.offsetWidth;
      if (width > 0) setRowWidth(width + ROW_PADDING * 2 + ROW_HIT_LEAD_IN);
    };
    read();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [labels]);

  useEffect(() => () => releaseDragRef.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    releaseDragRef.current?.();
    draggedRef.current = false;

    const { pointerId } = event;
    const startY = event.clientY;
    const startPosition = position;

    const onPointerMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const travelled = move.clientY - startY;
      if (!draggedRef.current && Math.abs(travelled) < DRAG_THRESHOLD) return;
      draggedRef.current = true;
      // A row of travel is a row of list: the titles follow the pointer.
      onScrub(startPosition - travelled / ROW_HEIGHT);
    };

    const onPointerUp = (up: PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      releaseDragRef.current?.();
      if (draggedRef.current) onScrubEnd();
    };

    // Listened for on the window rather than captured on the column: capture
    // would swallow the click that a tap on a title still has to produce.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    releaseDragRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      releaseDragRef.current = null;
    };
  };

  if (labels.length === 0) return null;

  // How far the fade runs before it reaches nothing: the depth of the drawn
  // window, or of the list itself when the list is the shorter of the two. A
  // short list therefore thins across its own length rather than stopping half
  // faded, and a long one keeps the seven-row rate it always had.
  const fadeSpan = Math.min(labels.length, VISIBLE_ROWS);
  // How far above the head a row is still drawn — and so where the trip round
  // to the foot happens, since a row is only ever in one place and the trip is
  // therefore a jump.
  //
  // The jump is put exactly where the fade has thinned the row to the same
  // value at both ends of it: `1 - lead` a `lead` above the head, and
  // `1 - (rows - lead) / fadeSpan` where it comes back in below the last row.
  // Those two are equal at this one value of `lead`, so nothing changes
  // brightness as a title goes round — it leaves the head, thins the whole way
  // up, and what is left of it at the top is a sliver at a seventh or so of
  // full strength, most of it already clipped by the column's own edge.
  //
  // On a list longer than the window this comes out at one row or more, which
  // is the old behaviour exactly: the row is gone by the time it wraps, and the
  // one arriving at the foot arrives from nothing.
  const lead = labels.length / (fadeSpan + 1);

  return (
    <div
      aria-label={ariaLabel}
      data-testid={testId}
      role="listbox"
      onPointerDown={onPointerDown}
      onWheel={(event) => {
        if (!onWheelStep) return;
        event.preventDefault();
        onWheelStep(event.deltaX + event.deltaY);
      }}
      className={`fixed right-4 top-[calc(var(--spacing-region)+7px)] z-40 w-[min(15rem,28vw)] cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing sm:right-7 ${className}`}
      style={{ height: Math.min(labels.length, VISIBLE_ROWS) * ROW_HEIGHT }}
    >
      {/* The rule the marker is measured against: same metrics, no box of its
          own, never seen. */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap uppercase"
        style={TEXT_STYLE}
      >
        {headLabel}
      </span>

      {/* Every title stacked in one shrink-to-fit block, which therefore comes
          out exactly as wide as the longest of them. Never seen; it is here to
          be measured. */}
      <div
        ref={widestRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0"
        style={TEXT_STYLE}
      >
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="block whitespace-nowrap uppercase">
            {label}
          </span>
        ))}
      </div>

      {/* The marker holds the head slot rather than travelling with a row, and
          is exactly as wide as the title standing in it — the width eases from
          one title to the next rather than jumping. */}
      {markerWidth !== null && (
        <div
          aria-hidden="true"
          data-testid="featured-title-wheel-marker"
          className="pointer-events-none absolute right-0 top-0 max-w-full bg-[#f05a28] shadow-[0_8px_32px_rgba(240,90,40,0.18)] transition-[width] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ height: ROW_HEIGHT, width: markerWidth }}
        />
      )}

      {labels.map((label, row) => {
        // Where a row stands is its own place in the list unrolled onto the lap
        // the column happens to be on. A row reaching the top of that window is
        // the row that comes back at the foot, which is why the column can turn
        // forever without the same title ever standing in it twice.
        const distance = positiveModulo(row - position + lead, labels.length) - lead;
        // Exactly `position + distance`: the two differ by whole laps of the
        // list. It is what the carousel is told to travel to, so picking the
        // third title down goes three slots on rather than most of a lap back.
        const logicalIndex = Math.round(position + distance);
        const selected = Math.abs(distance) < 0.001;
        const visible = distance > -1 && distance < VISIBLE_ROWS;
        const hovered = !selected && visible && hoveredIndex === row;

        return (
          <button
            key={row}
            type="button"
            role="option"
            aria-selected={selected}
            aria-hidden={visible ? undefined : true}
            tabIndex={visible ? 0 : -1}
            data-title-wheel-visible={visible}
            data-title-wheel-centered={selected}
            data-title-wheel-hovered={hovered}
            data-title-wheel-logical-index={logicalIndex}
            onPointerEnter={() => setHoveredIndex(row)}
            onPointerLeave={() => setHoveredIndex(
              (current) => (current === row ? null : current),
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (draggedRef.current) return;
              onSelect(logicalIndex);
            }}
            // Only the fade transitions. A row's place in the column comes
            // from the carousel's position, which now moves frame by frame —
            // transitioning that as well would leave the titles trailing the
            // sleeves they name.
            // The row reaches past its title so that a click does not have to
            // land on the words. What gets *drawn* is still only as wide as
            // the title — that is the inner box's job.
            className="absolute right-0 top-0 z-20 flex max-w-full items-center justify-end uppercase outline-none transition-opacity duration-150 ease-out focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/70 motion-reduce:transition-none"
            style={{
              ...TEXT_STYLE,
              color: selected ? '#fff8f1' : '#c7c3bc',
              height: ROW_HEIGHT,
              opacity: visible
                // Lifted under the pointer, or the preview would be showing
                // through whatever fade the row happens to sit at.
                ? Math.max(rowOpacity(distance, fadeSpan), hovered ? 0.9 : 0)
                : 0,
              pointerEvents: visible ? undefined : 'none',
              transform: `translateY(${distance * ROW_HEIGHT}px)`,
              // Until the list has been measured, the row is only as wide as
              // its own title — the same box it draws, so nothing shifts when
              // the real width lands.
              width: rowWidth ?? undefined,
            }}
          >
            {/* Shrink-wrapped to the title and set against the right edge, so
                it comes out the same width the marker above is measured to. */}
            <span
              className="relative max-w-full truncate text-right"
              style={{ paddingLeft: ROW_PADDING, paddingRight: ROW_PADDING }}
            >
              {!selected && (
                // Grows from the right edge, the end the titles are set against,
                // so it arrives the way the marker would.
                <span
                  aria-hidden="true"
                  className="absolute inset-0 origin-right bg-[#f05a28]/50 transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ transform: `scaleX(${hovered ? 1 : 0})` }}
                />
              )}
              <span className="relative">{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
