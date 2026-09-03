/**
 * Appearance preferences — the colour scheme and the studio visual-pane
 * animation. Both live in localStorage and are readable before React mounts,
 * so `loadAppearancePreferences()` can paint the theme without a flash.
 *
 * Subscribers are notified in-process; unlike the editor preferences these are
 * read by live components (VizPlaceholder, the settings panel), so a write has
 * to reach them without a reload.
 */

import { applyAppEditorTheme } from './editor-preferences';

export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';
export type AnimationPreference = 'galaxy' | 'galaxy-ascii';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'dark', 'light'];
export const ANIMATION_PREFERENCES: readonly AnimationPreference[] = ['galaxy', 'galaxy-ascii'];

/**
 * Whether the light palette is built. It is; the flag stays as the one place
 * that clamps every preference back to dark, should the light half ever need
 * taking off the road again.
 */
export const LIGHT_THEME_READY = true;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const DEFAULT_ANIMATION: AnimationPreference = 'galaxy-ascii';
export const DEFAULT_STUDIO_ANIMATION_VISIBLE = true;

/** i18n keys for the user-facing name of each choice. */
export const THEME_LABEL_KEYS: Record<ThemePreference, string> = {
  system: 'themeSystem',
  dark: 'themeDark',
  light: 'themeLight',
};

export const ANIMATION_LABEL_KEYS: Record<AnimationPreference, string> = {
  galaxy: 'animationGalaxy',
  'galaxy-ascii': 'animationGalaxyAscii',
};

export const ANIMATION_SOURCES: Record<AnimationPreference, string> = {
  galaxy: '/animation/galaxy.html',
  'galaxy-ascii': '/animation/galaxy-ascii.html',
};

const STORAGE_KEYS = {
  theme: 'vibe_theme',
  animation: 'vibe_animation',
  studioAnimationVisible: 'vibe_studio_animation',
} as const;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to any appearance change. Returns the unsubscribe function. */
export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // A blocked or full store still leaves the in-memory session consistent.
  }
}

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

function isAnimationPreference(value: unknown): value is AnimationPreference {
  return ANIMATION_PREFERENCES.includes(value as AnimationPreference);
}

// ── Theme ────────────────────────────────────────────────────────────────────

export function getThemePreference(): ThemePreference {
  const stored = readStored(STORAGE_KEYS.theme);
  return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The palette a preference actually paints with right now. */
export function resolveTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  const requested = preference === 'system' ? getSystemTheme() : preference;
  return LIGHT_THEME_READY ? requested : 'dark';
}

/**
 * Paint a preference onto the root element.
 *
 * `keepEditorTheme` is what separates the boot pass from a change. Only an
 * actual dark/light flip re-establishes the editor's own palette — a piece of
 * the contract, not an optimisation: the user may point the editor at a
 * third-party theme afterwards, and that choice is meant to last until the app
 * next changes colour scheme. Boot is not a flip, so it leaves whatever
 * `loadEditorPreferences()` restored in place; re-running the default there
 * would make the editor choice unable to survive a reload.
 */
function applyTheme(preference: ThemePreference, keepEditorTheme = false): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const previous = root.dataset.theme;
  const resolved = resolveTheme(preference);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  if (!keepEditorTheme && previous !== resolved) applyAppEditorTheme(resolved);
}

export function setThemePreference(preference: ThemePreference): void {
  writeStored(STORAGE_KEYS.theme, preference);
  applyTheme(preference);
  emit();
}

// ── Animation ────────────────────────────────────────────────────────────────

export function getAnimationPreference(): AnimationPreference {
  const stored = readStored(STORAGE_KEYS.animation);
  return isAnimationPreference(stored) ? stored : DEFAULT_ANIMATION;
}

/**
 * The animations a palette can actually paint. The particle galaxy is emissive
 * — motes of light on a near-black backdrop, with no ink half to switch to —
 * so the light palette offers the ASCII field alone. The ASCII field carries
 * both palettes itself, which is why it is the one that survives the flip.
 */
const THEME_ANIMATIONS: Record<ResolvedTheme, readonly AnimationPreference[]> = {
  dark: ANIMATION_PREFERENCES,
  light: ['galaxy-ascii'],
};

/** The animations offered under a palette, in the order the settings list them. */
export function getAvailableAnimations(
  theme: ResolvedTheme = resolveTheme(),
): readonly AnimationPreference[] {
  return THEME_ANIMATIONS[theme];
}

/**
 * The animation a stored choice actually plays right now — the theme's
 * counterpart to `resolveTheme()`. A galaxy picked in the dark is clamped to
 * the ASCII field under the light palette, and the stored choice is left
 * alone so going back to dark hands the galaxy back.
 */
export function resolveAnimation(
  animation: AnimationPreference = getAnimationPreference(),
  theme: ResolvedTheme = resolveTheme(),
): AnimationPreference {
  const available = getAvailableAnimations(theme);
  return available.includes(animation) ? animation : available[0];
}

export function setAnimationPreference(animation: AnimationPreference): void {
  writeStored(STORAGE_KEYS.animation, animation);
  emit();
}

export function getAnimationSource(
  animation: AnimationPreference = getAnimationPreference(),
): string {
  return ANIMATION_SOURCES[animation];
}

/**
 * Whether the studio shows an animation at all — the visual pane under the
 * code panel, and the flakes that stand in for it while it is collapsed.
 *
 * Deliberately a separate axis from *which* animation plays: turning the pane
 * off and back on hands back the animation the user picked, instead of
 * resetting them to the default.
 */
export function getStudioAnimationVisible(): boolean {
  const stored = readStored(STORAGE_KEYS.studioAnimationVisible);
  return stored === null ? DEFAULT_STUDIO_ANIMATION_VISIBLE : stored === 'true';
}

export function setStudioAnimationVisible(visible: boolean): void {
  writeStored(STORAGE_KEYS.studioAnimationVisible, String(visible));
  emit();
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/** Paint the stored theme and keep "match system" following the OS. */
export function loadAppearancePreferences(): void {
  applyTheme(getThemePreference(), true);

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const query = window.matchMedia('(prefers-color-scheme: light)');
  query.addEventListener('change', () => {
    if (getThemePreference() !== 'system') return;
    applyTheme('system');
    emit();
  });
}
