import { useSyncExternalStore } from 'react';
import {
  DEFAULT_ANIMATION,
  DEFAULT_STUDIO_ANIMATION_VISIBLE,
  DEFAULT_THEME_PREFERENCE,
  getAnimationPreference,
  getStudioAnimationVisible,
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

/** Whether the studio shows its animation at all. */
export function useStudioAnimationVisible(): boolean {
  return useSyncExternalStore(
    subscribeAppearance,
    getStudioAnimationVisible,
    () => DEFAULT_STUDIO_ANIMATION_VISIBLE,
  );
}
