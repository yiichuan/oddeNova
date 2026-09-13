import { t } from '../../lib/i18n';
import { getAnimationSource } from '../../lib/appearance-preferences';
import { useResolvedAnimation } from '../../hooks/useAppearance';

interface VizPlaceholderProps {
  isPlaying: boolean;
  /**
   * Whether the pane draws its own outline. On desktop it does: the pane is
   * inlaid in the page and the line is what says where it starts. Inside the
   * mobile code window nothing is outlined — the window floats on a dimmed page
   * and is told from it by standing off it — so the pane goes bare there too.
   */
  bordered?: boolean;
  /**
   * Whether the pane is a phone's width rather than a studio's. Passed through
   * to the animation, which sizes its glyphs to a column count it cannot reach
   * in ~360px without being told the floor may come down. Off by default, so
   * every desktop host loads the same URL it always did.
   */
  compact?: boolean;
}

export default function VizPlaceholder({
  isPlaying: _isPlaying,
  bordered = true,
  compact = false,
}: VizPlaceholderProps) {
  // Changing the choice in Settings → Appearance reloads the frame, which is
  // what the setting means: a different animation, generated fresh. Resolved,
  // not stored: the light palette has no particle galaxy to load.
  const animation = useResolvedAnimation();

  return (
    // .viz-frame is the ground the frame stands on before its document has
    // painted a single pixel — without it that gap shows as a white card. It is
    // carried on both boxes: the wrapper covers the pane's rounded corners, and
    // the frame itself covers the box the browser would otherwise paint white.
    <div className={`viz-frame h-full overflow-hidden rounded-region${bordered ? ' border border-border' : ''}`}>
      <iframe
        src={`${getAnimationSource(animation)}${compact ? '?compact=1' : ''}`}
        title={t('animationVisual')}
        className="viz-frame"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="autoplay"
      />
    </div>
  );
}
