import { useEffect, type RefObject } from 'react';

/** How long a scrollbar stays up after the last scroll, in ms. Long enough that
 *  a flick, its glide, and the pause you take to read where you landed all sit
 *  inside one showing of the bar — it goes away when you are done with the code,
 *  not the moment your thumb leaves the glass. */
export const SCROLL_ACTIVITY_IDLE_MS = 2000;

/**
 * Mark whichever scroller inside `ref` is moving, so a scrollbar can be styled
 * by the fact that it is being used — which CSS has no way to ask.
 *
 * `data-scrolling` goes on the element that actually moved, not on the container
 * this is bound to, so a box holding two scrollers lights only the one under the
 * thumb. Bound in the capture phase for the same reason it can be bound to a
 * container at all: scroll events do not bubble, but they do capture, and the
 * at-target phase fires capture listeners too — so one listener on a box that is
 * always there covers both the box itself and a scroller mounted inside it
 * later, with nothing to re-bind when that child is rebuilt.
 *
 * The timer is per scroller: two bars moving in the same box each keep their own
 * idle clock rather than cancelling each other's.
 */
export function useScrollActivity<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true,
): void {
  useEffect(() => {
    const container = ref.current;
    if (!enabled || !container) return undefined;

    const timers = new Map<HTMLElement, number>();

    const handleScroll = (event: Event) => {
      const scroller = event.target;
      if (!(scroller instanceof HTMLElement)) return;
      scroller.dataset.scrolling = 'true';
      const pending = timers.get(scroller);
      if (pending !== undefined) window.clearTimeout(pending);
      timers.set(scroller, window.setTimeout(() => {
        timers.delete(scroller);
        delete scroller.dataset.scrolling;
      }, SCROLL_ACTIVITY_IDLE_MS));
    };

    container.addEventListener('scroll', handleScroll, true);
    return () => {
      container.removeEventListener('scroll', handleScroll, true);
      for (const [scroller, timer] of timers) {
        window.clearTimeout(timer);
        delete scroller.dataset.scrolling;
      }
      timers.clear();
    };
  }, [enabled, ref]);
}
