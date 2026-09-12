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
 * How strongly an open record's own colour reaches the very top and bottom of
 * Featured — where a phone's own notch strip and toolbar strip stand, painted
 * from this same flat value rather than from anything the page itself draws.
 *
 * Not sampled off the rendered page: the wash a record stands in (FeaturedGlow)
 * is a blurred field of thirteen radial blobs — `.featured-glow-blob` in
 * index.css — and the two strips this paints can only ever hold one flat
 * colour, never a gradient. What is fixed here instead is a single blend
 * strength, worked out from the same numbers that field is already built from:
 * the two blobs planted at each edge (alpha 0.14 and 0.12 at the head, 0.13 and
 * 0.11 at the foot — the phone layout keeps these same alphas and only reshapes
 * the blobs' geometry) composited together and then carried through the wash's
 * own mask, which is already down to 0.45 at the outermost edge:
 *
 *   1 - (1 - 0.14)(1 - 0.12) ≈ 0.24   combined blob strength
 *   0.24 × 0.45 (edge mask)  ≈ 0.11
 *
 * Rounded to one figure, and the same figure top and bottom — head and foot
 * come out close enough (0.11 vs 0.10) that the two strips sharing one value is
 * a smaller mismatch than the notch and the home indicator disagreeing with
 * each other over which frame of a phone tilting they were painted on.
 *
 * Paper takes the same wash at its own 0.6× dimming (`.featured-glow-field`'s
 * light-mode opacity), which comes out to 0.07 rather than a second derivation.
 */
const FEATURED_EDGE_TINT_ALPHA: Record<ResolvedTheme, number> = {
  dark: 0.11,
  light: 0.07,
};

/**
 * The code window's own scrim (`.code-window-scrim` in index.css), mixed into
 * the chrome colour by hand rather than left to paint itself.
 *
 * A `fixed inset-0` backdrop only ever reaches the document; the phone's own
 * notch and toolbar strips are painted outside the document entirely, from
 * this module's flat colour (see the module comment) — so a scrim that dims
 * the page while leaving those two strips at full brightness reads as two
 * materials going dark at different times rather than one dialog arriving.
 */
const CODE_WINDOW_SCRIM: Record<ResolvedTheme, { rgb: readonly [number, number, number]; alpha: number }> = {
  dark: { rgb: [26, 26, 26], alpha: 0.44 },
  light: { rgb: [72, 73, 86], alpha: 0.2 },
};

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** Parses the `"r, g, b"` triple `--glow-color` (and this module's own tint
 *  option) carry. Null for anything that is not exactly that shape, rather
 *  than a half-applied blend from a malformed value. */
function parseRgbTriple(value: string): [number, number, number] | null {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  return parts as [number, number, number];
}

function mixOver(
  base: readonly [number, number, number],
  overlay: readonly [number, number, number],
  alpha: number,
): [number, number, number] {
  return [
    Math.round(base[0] * (1 - alpha) + overlay[0] * alpha),
    Math.round(base[1] * (1 - alpha) + overlay[1] * alpha),
    Math.round(base[2] * (1 - alpha) + overlay[2] * alpha),
  ];
}

function rgbString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export interface BrowserChromeOptions {
  /**
   * Featured only: the open record's own colour, the same `"r, g, b"` string
   * `--glow-color` already carries (see featured-accent.ts's `useCoverAccent`).
   * Absent — no record open, or its colour has not been read back yet — the
   * page falls back to its plain unlit ground exactly as before.
   */
  tint?: string | null;
  /** Whether the code window's scrim is standing over the page right now. */
  dimmed?: boolean;
  /** Additional page overlay, such as the sign-in modal. */
  overlay?: 'auth' | null;
}

let lastContext: { page: BrowserChromePage; theme: ResolvedTheme; options: BrowserChromeOptions } = {
  page: 'studio', theme: 'dark', options: {},
};

export function refreshBrowserChromeTheme(theme: ResolvedTheme): void {
  lastContext = { ...lastContext, theme };
  applyBrowserChromeColor(lastContext.page, theme, lastContext.options);
}

function resolveBrowserChromeColor(
  page: BrowserChromePage,
  theme: ResolvedTheme,
  { tint, dimmed, overlay }: BrowserChromeOptions,
): string {
  const base = BROWSER_CHROME_COLORS[page][theme];
  const tintTriple = page === 'featured' && tint ? parseRgbTriple(tint) : null;
  if (!tintTriple && !dimmed && !overlay) return base;

  let rgb: readonly [number, number, number] = hexToRgb(base);
  if (tintTriple) rgb = mixOver(rgb, tintTriple, FEATURED_EDGE_TINT_ALPHA[theme]);
  if (dimmed) {
    const scrim = CODE_WINDOW_SCRIM[theme];
    rgb = mixOver(rgb, scrim.rgb, scrim.alpha);
  }
  if (overlay === 'auth') {
    const scrim = CODE_WINDOW_SCRIM[theme];
    rgb = mixOver(rgb, scrim.rgb, theme === 'dark' ? 0.6 : 0.35);
  }
  return rgbString(rgb);
}

/**
 * Paint it — both of the surfaces that read it, in one call, so Android and
 * iOS cannot drift into showing two different colours for the same page.
 */
export function applyBrowserChromeColor(
  page: BrowserChromePage,
  theme: ResolvedTheme,
  options: BrowserChromeOptions = {},
): void {
  if (typeof document === 'undefined') return;
  const color = resolveBrowserChromeColor(page, theme, options);
  lastContext = { page, theme, options };
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', color);
  document.documentElement.style.setProperty(BROWSER_CHROME_CSS_VAR, color);
}
