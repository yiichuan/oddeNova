import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { t } from '../../lib/i18n';
import {
  ANIMATION_LABEL_KEYS,
  ANIMATION_PREFERENCES,
  LIGHT_THEME_READY,
  setAnimationPreference,
  setThemePreference,
  THEME_LABEL_KEYS,
  THEME_PREFERENCES,
  type ThemePreference,
} from '../../lib/appearance-preferences';
import { useAnimationPreference, useThemePreference } from '../../hooks/useAppearance';
import { AnimationPreview, ThemePreview } from './settings-previews';

const THEME_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  dark: Moon,
  light: Sun,
};

interface OptionCardProps {
  badge?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  onSelect: () => void;
  preview: React.ReactNode;
  selected: boolean;
}

function OptionCard({
  badge,
  disabled = false,
  icon: Icon,
  label,
  onSelect,
  preview,
  selected,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`group flex flex-col overflow-hidden rounded-[7px] border outline-none transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-conversation-surface motion-reduce:transition-none ${
        disabled
          ? 'cursor-not-allowed border-border bg-settings-surface opacity-55'
          : selected
            ? 'border-[#8A8A8A] bg-white/[0.08] active:scale-[0.99]'
            : 'border-border bg-settings-surface hover:border-[#3C3C3C] hover:bg-white/[0.03] active:scale-[0.99]'
      }`}
    >
      <span className="block aspect-[168/104] w-full overflow-hidden border-b border-[inherit] bg-black">
        {preview}
      </span>
      <span className="flex flex-col items-center px-3 py-2.5 text-center">
        <span className="flex min-w-0 items-center gap-1.5">
          {Icon && <Icon size={13} strokeWidth={1.7} className="shrink-0 text-text-muted" aria-hidden="true" />}
          <span className={`truncate text-sm font-medium ${selected ? 'text-text-primary' : 'text-text-secondary'}`}>
            {label}
          </span>
          {badge && (
            <span className="shrink-0 rounded-[3px] border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
              {badge}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function AppearanceSettingsPanel() {
  const themePreference = useThemePreference();
  const animation = useAnimationPreference();

  return (
    <main className="relative flex h-full min-w-0 flex-1 overflow-hidden rounded-region border border-border bg-conversation-surface">
      <div className="relative flex h-full w-full flex-col overflow-y-auto px-[clamp(28px,5vw,76px)] py-[clamp(28px,6vh,64px)]">
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col">
          <header className="pb-8">
            <h1 className="text-3xl font-semibold leading-[0.98] tracking-[-0.045em] text-text-primary">
              {t('settingsAppearance')}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-text-muted">{t('appearanceDescription')}</p>
          </header>

          <section className="pb-10" aria-label={t('theme')}>
            <h2 className="text-sm font-medium text-text-primary">{t('theme')}</h2>
            <p className="mt-1 text-xs leading-5 text-text-muted">{t('themeHint')}</p>

            <div role="radiogroup" aria-label={t('theme')} className="mt-5 grid gap-3 sm:grid-cols-3">
              {THEME_PREFERENCES.map((preference) => {
                // The light palette does not exist yet, so its option is shown
                // but not selectable — see LIGHT_THEME_READY.
                const unavailable = preference === 'light' && !LIGHT_THEME_READY;

                return (
                  <OptionCard
                    key={preference}
                    badge={unavailable ? t('comingSoon') : undefined}
                    disabled={unavailable}
                    icon={THEME_ICONS[preference]}
                    label={t(THEME_LABEL_KEYS[preference])}
                    onSelect={() => setThemePreference(preference)}
                    preview={<ThemePreview preference={preference} />}
                    selected={themePreference === preference}
                  />
                );
              })}
            </div>
          </section>

          <section aria-label={t('animation')}>
            <h2 className="text-sm font-medium text-text-primary">{t('animation')}</h2>
            <p className="mt-1 text-xs leading-5 text-text-muted">{t('animationHint')}</p>

            <div role="radiogroup" aria-label={t('animation')} className="mt-5 grid gap-3 sm:grid-cols-2">
              {ANIMATION_PREFERENCES.map((option) => (
                <OptionCard
                  key={option}
                  label={t(ANIMATION_LABEL_KEYS[option])}
                  onSelect={() => setAnimationPreference(option)}
                  preview={<AnimationPreview animation={option} />}
                  selected={animation === option}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
