import { Fragment, useRef } from 'react';
import { t } from '../../lib/i18n';
import { providerLabel, providerTabId, SETTINGS_PROVIDERS } from '../../lib/model-settings';
import type { ProviderType } from '../../services/llm-config';

interface ProviderTabsProps {
  /** The provider oddeNova is actually running on right now. */
  activeProvider: ProviderType;
  /** Prefix the panel shares, so each tab can label its panel. */
  idBase: string;
  onSelect: (provider: ProviderType) => void;
  /** The provider whose configuration the panel below is showing. */
  selectedProvider: ProviderType;
}

const PROVIDER_LOGOS: Partial<Record<ProviderType, string>> = {
  official: '/logo/logo-o.svg',
  deepseek: '/logo/logo-deepseek.svg',
  glm: '/logo/logo-glm.svg',
  anthropic: '/logo/logo-anthropic.svg',
  openai: '/logo/logo-openai.svg',
};

export default function ProviderTabs({
  activeProvider,
  idBase,
  onSelect,
  selectedProvider,
}: ProviderTabsProps) {
  const tabRefs = useRef(new Map<ProviderType, HTMLButtonElement>());

  /* Selection follows focus, the usual behaviour for tabs whose panels are
     cheap to swap — arrowing across the bar previews each provider's config. */
  const moveSelection = (offset: number) => {
    const index = SETTINGS_PROVIDERS.indexOf(selectedProvider);
    const next = SETTINGS_PROVIDERS[
      (index + offset + SETTINGS_PROVIDERS.length) % SETTINGS_PROVIDERS.length
    ];
    onSelect(next);
    tabRefs.current.get(next)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target = event.key === 'Home'
        ? SETTINGS_PROVIDERS[0]
        : SETTINGS_PROVIDERS[SETTINGS_PROVIDERS.length - 1];
      onSelect(target);
      tabRefs.current.get(target)?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t('modelProviders')}
      onKeyDown={handleKeyDown}
      className="flex items-stretch overflow-x-auto border-b border-border px-2 pb-2 pt-2"
    >
      {SETTINGS_PROVIDERS.map((provider, index) => {
        const selected = selectedProvider === provider;
        const active = activeProvider === provider;
        const logo = PROVIDER_LOGOS[provider] ?? '/logo/logo-o.svg';

        return (
          <Fragment key={provider}>
            {index > 0 && (
              <span className="my-auto h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
            )}
            <button
              ref={(node) => {
                if (node) tabRefs.current.set(provider, node);
                else tabRefs.current.delete(provider);
              }}
              type="button"
              role="tab"
              id={providerTabId(idBase, provider)}
              aria-selected={selected}
              aria-controls={`${idBase}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(provider)}
              className={`group relative flex shrink-0 items-center gap-2 px-3.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-text-secondary ${
                selected ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <span
                className="grid size-5 shrink-0 place-items-center"
                aria-hidden="true"
                data-provider-logo={provider}
              >
                <span
                  className={`block bg-current ${provider === 'official' ? 'size-[13px]' : 'size-[16px]'}`}
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
              <span className="whitespace-nowrap text-sm font-medium">{providerLabel(provider)}</span>
              {active && (
                /* A dot rather than the full "Active" label: it has to survive
                   five tabs sharing one row. */
                <span className="ml-0.5 flex items-center" title={t('currentlyActive')}>
                  <span className="size-1.5 rounded-full bg-form-ok" aria-hidden="true" />
                  <span className="sr-only">{t('currentlyActive')}</span>
                </span>
              )}
              {selected && (
                /* Spans the tab, sitting on the bar's bottom border. */
                <span
                  className="pointer-events-none absolute inset-x-2 -bottom-2 h-[2px] rounded-full bg-text-primary"
                  aria-hidden="true"
                />
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
