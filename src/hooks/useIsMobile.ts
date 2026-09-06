import { useEffect, useState } from 'react';

// The widest iPhone is 440 CSS px in portrait (17 Pro Max / 16 Pro Max, 1320
// physical / DPR 3), so 460 clears the whole phone range with room to spare
// while handing everything above it — tablets, split-screen panes, narrow
// desktop windows — the studio layout, which is what those widths can hold.
const MOBILE_BREAKPOINT = 460;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
