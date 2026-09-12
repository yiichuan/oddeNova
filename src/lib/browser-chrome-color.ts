/**
 * What the system itself paints outside the document — a phone's notch strip
 * above the page and its toolbar strip below — kept in step with whichever
 * page is actually in front of the reader.
 *
 * Two things read this, and used to read two different, page-blind answers:
 * `theme-color` (Android's status and navigation bars) was fixed per theme
 * with no notion of page at all, and the document canvas iOS Safari paints its
 * safe-area strips from (`html`/`body`'s own background, see index.css) was
 * hardcoded to the studio's colour. Neither ever agreed with a page that
 * wasn't the studio, which is why leaving the studio for Featured left both
 * strips wearing the studio's colour regardless of where the reader actually
 * was.
 */

import type { ResolvedTheme } from './appearance-preferences';

/**
 * Which of the app's backgrounds the system's chrome should currently read as.
 * Two buckets, because two is how many exist on this layout: the studio and
 * the two pages that share its ground (Favorites, Settings) all stand on the
 * conversation surface, and Featured — shelf and detail alike, they are one
 * page as far as this is concerned — stands on its own darker one. A future
 * page with a ground belonging to neither takes a third value here, not a
 * special case at whichever call site notices the mismatch.
 */
export type BrowserChromePage = 'studio' | 'featured';

/**
 * Fixed constants, not a sample of anything — deliberately. Featured's ground
 * is a WebGL gradient with no single colour that is "the" colour of it, so
 * chasing a match would be chasing a target that does not exist; what is
 * fixed instead is the *unlit* colour that field already declares for itself
 * in index.css (`.featured-space-background`) — its own answer to "what does
 * this page look like before the shader has painted anything." That is the
 * closest a flat colour gets, and it costs nothing to hold: no canvas read, no
 * waiting on WebGL, no repaint chasing a cover's palette.
 *
 * The studio bucket is the pair the whole app already painted its `theme-color`
 * with before this module existed — carried over rather than restated, so
 * there is one definition of them rather than two that could drift apart.
 */
export const BROWSER_CHROME_COLORS: Record<BrowserChromePage, Record<ResolvedTheme, string>> = {
  studio: { dark: '#0D0D0D', light: '#F7F7FA' },
  featured: { dark: '#05070a', light: '#DEDEE0' },
};

/** The CSS custom property `html`/`body` read their background from below 460px. */
export const BROWSER_CHROME_CSS_VAR = '--browser-chrome-color';

/** The colour a page/theme pair paints the system's chrome with. */
export function browserChromeColor(page: BrowserChromePage, theme: ResolvedTheme): string {
  return BROWSER_CHROME_COLORS[page][theme];
}

/**
 * Paint it — both of the surfaces that read it, in one call, so Android and
 * iOS cannot drift into showing two different colours for the same page.
 */
export function applyBrowserChromeColor(page: BrowserChromePage, theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const color = browserChromeColor(page, theme);
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', color);
  document.documentElement.style.setProperty(BROWSER_CHROME_CSS_VAR, color);
}
