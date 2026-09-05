import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react';

/**
 * Tells a scrollport whether either of its ends is currently cutting something
 * off, as `data-clipped-top` / `data-clipped-bottom` on the element itself.
 *
 * Written straight onto the node rather than held as state: the answer changes
 * while the pointer is on the wheel, and a component that re-rendered for it
 * would re-render its whole stream twice per gesture to move a gradient two
 * pixels. It is the same bargain the script window already makes for its
 * `data-has-vertical-bar`, and what reads the attributes is CSS
 * (`.favorites-window-fade` in index.css), which needs no render to notice.
 *
 * A pixel of slack at each end. A scrollport at rest can report a fractional
 * offset — a fractional scrollHeight against an integer clientHeight, a page
 * at a non-integer zoom — and a window that says it is clipping something when
 * it is showing all of it fades ink that has nothing beyond it.
 */
export function useClippedEnds(ref: RefObject<HTMLElement | null>) {
  const measure = useCallback(() => {
    const scroller = ref.current;
    if (!scroller) return;
    const room = scroller.scrollHeight - scroller.clientHeight;
    scroller.dataset.clippedTop = String(scroller.scrollTop > 1);
    scroller.dataset.clippedBottom = String(room - scroller.scrollTop > 1);
  }, [ref]);

  /* Every render, and before the frame it is for. Content that grows or
     shrinks in place — a thought opened, a longer take swapped in — moves an
     end without touching the scroll offset, and there is no event for that.
     Two reads and two writes is cheap enough to spend on every render rather
     than asking each caller to remember what changes its own extent. */
  useLayoutEffect(measure);

  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return undefined;
    scroller.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measure);
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref, measure]);
}
