import { useEffect } from 'react';
import {
  applyBrowserChromeColor,
  type BrowserChromeOptions,
  type BrowserChromePage,
} from '../lib/browser-chrome-color';
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
 *
 * `tint` and `dimmed` (see BrowserChromeOptions) are read out to primitives up
 * front rather than compared as one options object, so a caller that passes a
 * fresh `{}` literal every render does not repaint the chrome every render
 * along with it.
 */
export function useBrowserChromeColor(page: BrowserChromePage, options: BrowserChromeOptions = {}): void {
  const theme = useResolvedTheme();
  const { tint = null, dimmed = false } = options;
  useEffect(() => {
    applyBrowserChromeColor(page, theme, { tint, dimmed });
  }, [page, theme, tint, dimmed]);
}
