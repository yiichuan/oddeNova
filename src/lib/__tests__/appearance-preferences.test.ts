// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIMATION_SOURCES,
  DEFAULT_ANIMATION,
  DEFAULT_STUDIO_ANIMATION_VISIBLE,
  DEFAULT_THEME_PREFERENCE,
  getAnimationPreference,
  getAnimationSource,
  getAvailableAnimations,
  getStudioAnimationVisible,
  getThemePreference,
  LIGHT_THEME_READY,
  loadAppearancePreferences,
  resolveAnimation,
  resolveTheme,
  setAnimationPreference,
  setStudioAnimationVisible,
  setThemePreference,
  subscribeAppearance,
} from '../appearance-preferences';

describe('appearance preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.editorTheme;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the defaults when nothing is stored', () => {
    expect(getThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
    expect(getAnimationPreference()).toBe(DEFAULT_ANIMATION);
  });

  it('ignores a stored value that is not a known option', () => {
    localStorage.setItem('vibe_theme', 'solarized');
    localStorage.setItem('vibe_animation', 'nebula');

    expect(getThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
    expect(getAnimationPreference()).toBe(DEFAULT_ANIMATION);
  });

  it('persists the theme choice and paints the resolved palette', () => {
    setThemePreference('dark');

    expect(localStorage.getItem('vibe_theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('stores the light choice and paints what the flag allows', () => {
    // Written against the flag rather than against light: turning the light
    // half off again is what it is there for, and that must not read as a
    // broken test.
    const painted = LIGHT_THEME_READY ? 'light' : 'dark';
    setThemePreference('light');

    expect(localStorage.getItem('vibe_theme')).toBe('light');
    expect(getThemePreference()).toBe('light');
    expect(resolveTheme('light')).toBe(painted);
    expect(document.documentElement.dataset.theme).toBe(painted);
  });

  it('resolves "match system" against the OS preference', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn() })));

    // The flag is what gates it; with light shipped the OS choice comes through.
    expect(resolveTheme('system')).toBe(LIGHT_THEME_READY ? 'light' : 'dark');
  });

  it('persists the animation choice and maps it to its page', () => {
    setAnimationPreference('galaxy');

    expect(localStorage.getItem('vibe_animation')).toBe('galaxy');
    expect(getAnimationSource()).toBe(ANIMATION_SOURCES.galaxy);
    expect(getAnimationSource('galaxy-ascii')).toBe('/animation/galaxy-ascii.html');
  });

  it('offers the particle galaxy only under the dark palette', () => {
    expect(getAvailableAnimations('dark')).toEqual(['galaxy', 'galaxy-ascii']);
    expect(getAvailableAnimations('light')).toEqual(['galaxy-ascii']);
  });

  it('plays the ASCII field under light without losing a galaxy picked in dark', () => {
    setAnimationPreference('galaxy');

    expect(resolveAnimation('galaxy', 'dark')).toBe('galaxy');
    expect(resolveAnimation('galaxy', 'light')).toBe('galaxy-ascii');
    // The choice itself survives the flip, so going back to dark restores it.
    expect(getAnimationPreference()).toBe('galaxy');
  });

  it('defaults the studio animation to showing and persists a change', () => {
    expect(getStudioAnimationVisible()).toBe(DEFAULT_STUDIO_ANIMATION_VISIBLE);

    setStudioAnimationVisible(false);
    expect(localStorage.getItem('vibe_studio_animation')).toBe('false');
    expect(getStudioAnimationVisible()).toBe(false);

    setStudioAnimationVisible(true);
    expect(getStudioAnimationVisible()).toBe(true);
  });

  it('hands back the chosen animation after the pane has been off', () => {
    // Which animation plays and whether the pane shows one are separate axes
    // on purpose: turning it off and on again must not reset the choice to the
    // default.
    setAnimationPreference('galaxy');
    setStudioAnimationVisible(false);
    setStudioAnimationVisible(true);

    expect(getAnimationPreference()).toBe('galaxy');
  });

  it('does not disturb the editor theme while painting the stored theme at boot', () => {
    document.documentElement.dataset.editorTheme = 'dracula';
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn() })));

    loadAppearancePreferences();

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.editorTheme).toBe('dracula');
  });

  it('re-establishes the editor palette on a flip, and only on a flip', () => {
    document.documentElement.dataset.editorTheme = 'dracula';
    const painted = LIGHT_THEME_READY ? 'light' : 'dark';

    setThemePreference('light');
    expect(document.documentElement.dataset.editorTheme).toBe(`oddenova-${painted}`);

    // Choosing the palette already showing is not a flip, so a third-party
    // editor theme picked since then survives it.
    document.documentElement.dataset.editorTheme = 'dracula';
    setThemePreference('light');
    expect(document.documentElement.dataset.editorTheme).toBe('dracula');
  });

  it('notifies subscribers on every write and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    setThemePreference('dark');
    setAnimationPreference('galaxy');
    setStudioAnimationVisible(false);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    setAnimationPreference('galaxy-ascii');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
