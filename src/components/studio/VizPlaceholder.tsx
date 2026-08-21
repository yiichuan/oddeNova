import { t } from '../../lib/i18n';
import { getAnimationSource } from '../../lib/appearance-preferences';
import { useAnimationPreference } from '../../hooks/useAppearance';

interface VizPlaceholderProps {
  isPlaying: boolean;
}

export default function VizPlaceholder({ isPlaying: _isPlaying }: VizPlaceholderProps) {
  // Changing the choice in Settings → Appearance reloads the frame, which is
  // what the setting means: a different animation, generated fresh.
  const animation = useAnimationPreference();

  return (
    <div className="h-full overflow-hidden rounded-region border border-border">
      <iframe
        src={getAnimationSource(animation)}
        title={t('animationVisual')}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="autoplay"
      />
    </div>
  );
}
