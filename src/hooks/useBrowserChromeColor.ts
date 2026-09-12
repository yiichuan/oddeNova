import { useEffect } from 'react';
import { applyBrowserChromeColor, type BrowserChromePage } from '../lib/browser-chrome-color';
import { useResolvedTheme } from './useAppearance';

/**
 * Paint the system's own chrome — the notch strip and toolbar strip a phone
 * paints outside the page — to match whichever page is currently in front of
 * the reader.
 *
 * One call, at the shell's own level, taking the page as a plain value rather
 * than each page registering itself: exactly one page is ever in front of the
 * reader at a time on this layout (the others stay mounted behind it for their
 * own reasons — the studio keeps its audio alive behind a gallery), so there
 * is one current answer and nothing for two call sites to arbitrate. Re-runs
 * on a theme flip too, since the same page reads a different colour in each
 * palette — that half comes for free from `useResolvedTheme`, which already
 * re-renders on both a stored preference change and the OS's own flip.
 */
export function useBrowserChromeColor(page: BrowserChromePage): void {
  const theme = useResolvedTheme();
  useEffect(() => {
    applyBrowserChromeColor(page, theme);
  }, [page, theme]);
}
