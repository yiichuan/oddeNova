import { Check } from 'lucide-react';
import { t } from '../lib/i18n';
import { SETTINGS_PROVIDERS } from '../lib/model-settings';
import { PROVIDER_PRESETS, type ProviderType } from '../services/llm-config';

interface ProviderSidebarProps {
  activeProvider: ProviderType;
  onSelect: (provider: ProviderType) => void;
  selectedProvider: ProviderType;
}

function providerLabel(provider: ProviderType): string {
  return provider === 'official' ? t('officialLabel') : PROVIDER_PRESETS[provider].label;
}

const PROVIDER_LOGOS: Partial<Record<ProviderType, string>> = {
  official: '/logo/logo-o.svg',
  deepseek: '/logo/logo-deepseek.svg',
  glm: '/logo/logo-glm.svg',
  anthropic: '/logo/logo-anthropic.svg',
  openai: '/logo/logo-openai.svg',
};

export default function ProviderSidebar({
  activeProvider,
  onSelect,
  selectedProvider,
}: ProviderSidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-region border border-border bg-conversation-surface">
      <header className="px-4 pb-4 pt-[14px]">
        <h2 className="text-lg font-bold text-text-primary">
          {t('chooseProvider')}
        </h2>
      </header>

      <nav aria-label={t('modelProviders')} className="min-h-0 flex-1 px-2">
        <ul className="space-y-1">
          {SETTINGS_PROVIDERS.map((provider) => {
            const selected = selectedProvider === provider;
            const active = activeProvider === provider;
            const logo = PROVIDER_LOGOS[provider] ?? '/logo/logo-o.svg';

            return (
              <li key={provider}>
                <button
                  type="button"
                  onClick={() => onSelect(provider)}
                  aria-current={selected ? 'page' : undefined}
                  className={`group flex min-h-12 w-full items-center gap-3 rounded-[5px] px-3 py-2.5 text-left outline-none transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D] active:scale-[0.99] motion-reduce:transition-none ${
                    selected
                      ? 'bg-white/[0.09] text-text-primary'
                      : 'text-text-secondary hover:bg-white/[0.045] hover:text-text-primary'
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center transition-colors ${
                      selected ? 'text-text-primary' : 'text-text-muted group-hover:text-text-secondary'
                    }`}
                    aria-hidden="true"
                    data-provider-logo={provider}
                  >
                    <span
                      className={`block bg-current ${provider === 'official' ? 'size-[15px]' : 'size-[19px]'}`}
                      style={{
                        WebkitMaskImage: `url(${logo})`,
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                        maskImage: `url(${logo})`,
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                        maskSize: 'contain',
                      }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{providerLabel(provider)}</span>
                    {active && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-muted">
                        <span className="inline-flex items-center gap-1 text-[#8BA77D]">
                          <Check size={10} strokeWidth={2} aria-hidden="true" />
                          {t('currentlyActive')}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="px-5 pb-5 pt-4 text-[11px] leading-relaxed text-text-muted">
        {t('providerSidebarHint')}
      </p>
    </aside>
  );
}
