import { useEffect, useState } from 'react';

/**
 * The visual viewport — the part of the page actually on screen — in the
 * layout viewport's coordinates, which are the ones `position: fixed` and
 * `getBoundingClientRect()` use. It parts from the layout viewport when a
 * phone's keyboard or address bar covers some of it, or the page is zoomed.
 * Undefined while disabled, or where the browser has no visual viewport API
 * (callers fall back to the window).
 */
export interface VisualViewportBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function useVisualViewport(enabled: boolean) {
  const [viewport, setViewport] = useState<VisualViewportBox>();
  useEffect(() => {
    if (!enabled || !window.visualViewport) return;
    const visual = window.visualViewport;
    const update = () => setViewport((prev) => {
      const next = { top: visual.offsetTop, left: visual.offsetLeft, width: visual.width, height: visual.height };
      return prev
        && prev.top === next.top && prev.left === next.left
        && prev.width === next.width && prev.height === next.height
        ? prev
        : next;
    });
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return enabled ? viewport : undefined;
}
