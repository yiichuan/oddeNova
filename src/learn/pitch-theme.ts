import { useResolvedTheme } from '../hooks/useAppearance';
import type { ResolvedTheme } from '../lib/appearance-preferences';

/**
 * The pitch chapter's two voices per palette — blue for frequency, yellow for
 * pitch (dark) and their darker paper counterparts (light). The chapter prose
 * colour-codes the same words the same way, so both the component and the
 * prose read this one table.
 *
 * Canvas paint calls cannot take a `var(…)` string, which is why this is
 * resolved per theme here instead of living purely in CSS; learn.css mirrors
 * the same values as `--learn-frequency`/`--learn-pitch` for CSS uses.
 */
const PITCH_INTERACTION_COLORS: Record<ResolvedTheme, { frequency: string; pitch: string }> = {
  dark: { frequency: '#3b82f6', pitch: '#eab308' },
  light: { frequency: '#1d4ed8', pitch: '#854d0e' },
};

/** The palette the current app theme paints the pitch explorer with. */
export function usePitchColors(): { frequency: string; pitch: string } {
  const theme = useResolvedTheme();
  return PITCH_INTERACTION_COLORS[theme];
}
