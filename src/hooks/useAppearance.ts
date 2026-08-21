import { useSyncExternalStore } from 'react';
import {
  DEFAULT_ANIMATION,
  DEFAULT_THEME_PREFERENCE,
  getAnimationPreference,
  getThemePreference,
  resolveTheme,
  subscribeAppearance,
  type AnimationPreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/appearance-preferences';

/** The stored colour-scheme choice, re-read whenever it changes. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribeAppearance,
    getThemePreference,
    () => DEFAULT_THEME_PREFERENCE,
  );
}

/** The palette that choice currently paints with. */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useThemePreference();
  return resolveTheme(preference);
}

/** The animation the studio's visual pane plays. */
export function useAnimationPreference(): AnimationPreference {
  return useSyncExternalStore(
    subscribeAppearance,
    getAnimationPreference,
    () => DEFAULT_ANIMATION,
  );
}
