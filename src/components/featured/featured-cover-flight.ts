/**
 * The cover's trip between the collection and one piece.
 *
 * Opening a piece does not replace one picture with another: it is the same
 * record, seen closer. So the cover is lifted out of the page as a copy, the
 * two views are swapped underneath it, and the copy is flown to wherever the
 * cover has landed in the new view. The page only has to say where it started
 * and, once it has re-rendered, where it ended up.
 *
 * A copy rather than the element itself: the source is inside a view that is
 * about to be hidden or unmounted, and the two ends of the trip live in
 * different corners of the tree with no shared ancestor to animate within.
 */

export interface FlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Long enough to read as one move, short enough not to be a wait. */
export const FLIGHT_DURATION_MS = 420;
/** The outgoing view's content is gone before the cover leaves after it. */
export const CONTENT_FADE_MS = 180;

const FLIGHT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Whether the trip is worth taking. Without the Web Animations API — or with a
 * reader who has asked for less motion — the page simply swaps views, which is
 * the same page arriving without the journey.
 */
export function coverFlightSupported() {
  return typeof Element !== 'undefined'
    && typeof Element.prototype.animate === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function flightRect(node: Element): FlightRect {
  const { top, left, width, height } = node.getBoundingClientRect();
  return { top, left, width, height };
}

export interface CoverFlight {
  /** Fly to where the cover has come to rest. Resolves when it gets there. */
  land: (to: FlightRect, toRadius: number) => Promise<void>;
  /** Take the copy back out of the page. */
  remove: () => void;
}

/**
 * Lifts a copy of `node` into the top layer at the rect it currently occupies,
 * ready to be flown somewhere else.
 *
 * The copy is parked in `document.body` rather than inside the page: the app
 * shell is a stacking context, and a cover crossing between two views has to
 * pass over the nav and the transport bar rather than under them.
 */
export function liftCover(node: Element, from: FlightRect, fromRadius: number): CoverFlight {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('data-testid', 'featured-cover-flight');
  clone.removeAttribute('id');
  Object.assign(clone.style, {
    borderRadius: `${fromRadius}px`,
    height: `${from.height}px`,
    left: `${from.left}px`,
    margin: '0',
    objectFit: 'cover',
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'fixed',
    top: `${from.top}px`,
    transformOrigin: 'center',
    width: `${from.width}px`,
    willChange: 'transform',
    zIndex: '60',
  });
  document.body.append(clone);

  let animation: Animation | null = null;

  return {
    land(to, toRadius) {
      // FLIP: the copy takes the destination box straight away and is put back
      // where it came from with a transform, which is the half that animates —
      // moving the box itself would lay the page out on every frame.
      const scale = to.width > 0 ? from.width / to.width : 1;
      const scaleY = to.height > 0 ? from.height / to.height : 1;
      const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
      const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
      const inverse = `translate(${dx}px, ${dy}px) scale(${scale}, ${scaleY})`;

      Object.assign(clone.style, {
        height: `${to.height}px`,
        left: `${to.left}px`,
        top: `${to.top}px`,
        transform: inverse,
        width: `${to.width}px`,
      });

      animation = clone.animate(
        [
          // Divided by the scale it is seen at, so the corner reads as the
          // source's own radius rather than that radius magnified.
          { borderRadius: `${fromRadius / scale}px`, transform: inverse },
          { borderRadius: `${toRadius}px`, transform: 'none' },
        ],
        { duration: FLIGHT_DURATION_MS, easing: FLIGHT_EASING, fill: 'forwards' },
      );

      return animation.finished.then(() => undefined, () => undefined);
    },
    remove() {
      animation?.cancel();
      clone.remove();
    },
  };
}
