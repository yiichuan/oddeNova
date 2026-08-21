// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIMATION_SOURCES,
  DEFAULT_ANIMATION,
  getAnimationPreference,
  getAnimationSource,
  getThemePreference,
  LIGHT_THEME_READY,
  resolveTheme,
  setAnimationPreference,
  setThemePreference,
  subscribeAppearance,
} from '../appearance-preferences';

describe('appearance preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the defaults when nothing is stored', () => {
    expect(getThemePreference()).toBe('system');
    expect(getAnimationPreference()).toBe(DEFAULT_ANIMATION);
  });

  it('ignores a stored value that is not a known option', () => {
    localStorage.setItem('vibe_theme', 'solarized');
    localStorage.setItem('vibe_animation', 'nebula');

    expect(getThemePreference()).toBe('system');
    expect(getAnimationPreference()).toBe(DEFAULT_ANIMATION);
  });

  it('persists the theme choice and paints the resolved palette', () => {
    setThemePreference('dark');

    expect(localStorage.getItem('vibe_theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getThemePreference()).toBe('dark');
  });

  it('keeps the light choice stored but still paints dark until it ships', () => {
    expect(LIGHT_THEME_READY).toBe(false);
    setThemePreference('light');

    expect(getThemePreference()).toBe('light');
    expect(resolveTheme('light')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolves "match system" against the OS preference', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn() })));

    // Light is clamped away for now; the flag is what gates it.
    expect(resolveTheme('system')).toBe(LIGHT_THEME_READY ? 'light' : 'dark');
  });

  it('persists the animation choice and maps it to its page', () => {
    setAnimationPreference('galaxy');

    expect(localStorage.getItem('vibe_animation')).toBe('galaxy');
    expect(getAnimationSource()).toBe(ANIMATION_SOURCES.galaxy);
    expect(getAnimationSource('galaxy-ascii')).toBe('/animation/galaxy-ascii.html');
  });

  it('notifies subscribers on every write and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);

    setThemePreference('dark');
    setAnimationPreference('galaxy');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setAnimationPreference('galaxy-ascii');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
