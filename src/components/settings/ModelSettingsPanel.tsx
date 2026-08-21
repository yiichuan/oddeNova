import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { t } from '../../lib/i18n';
import { providerTabId, type ProviderSettingsDraft } from '../../lib/model-settings';
import { PROVIDER_PRESETS, type ProviderType } from '../../services/llm-config';
import type { ModelSettingsSaveStatus } from '../../hooks/useModelSettingsDraft';
import ProviderTabs from './ProviderTabs';

interface ModelSettingsPanelProps {
  /** The provider oddeNova is actually running on right now. */
  activeProvider: ProviderType;
  draft: ProviderSettingsDraft;
  isDirty: boolean;
  onSave: () => boolean;
  onSelectProvider: (provider: ProviderType) => void;
  onUpdate: (patch: Partial<ProviderSettingsDraft>) => void;
  provider: ProviderType;
  saveStatus: ModelSettingsSaveStatus;
}

export default function ModelSettingsPanel({
  activeProvider,
  draft,
  isDirty,
  onSave,
  onSelectProvider,
  onUpdate,
  provider,
  saveStatus,
}: ModelSettingsPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [shownProvider, setShownProvider] = useState(provider);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const selectedModelRef = useRef<HTMLButtonElement>(null);
  const idBase = useId();
  const modelId = `${idBase}-model`;
  const modelListId = `${idBase}-model-list`;
  const keyId = `${idBase}-key`;
  const keyErrorId = `${idBase}-key-error`;
  const isOfficial = provider === 'official';
  const keyMissing = !isOfficial && !draft.apiKey.trim();
  const canSave = isDirty && !keyMissing;
  const preset = PROVIDER_PRESETS[provider];

  // Switching tabs shows another provider's form, so this one's transient bits
  // reset. Done during render rather than by remounting the panel: the tab bar
  // is keyboard-navigable, and a remount would drop focus on every arrow key.
  if (shownProvider !== provider) {
    setShownProvider(provider);
    setShowKey(false);
    setKeyTouched(false);
    setModelMenuOpen(false);
  }

  useEffect(() => {
    if (!modelMenuOpen) return;

    selectedModelRef.current?.focus();
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [modelMenuOpen]);

  const handleSave = () => {
    setKeyTouched(true);
    if (keyMissing) return;
    onSave();
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 overflow-hidden rounded-region border border-border bg-conversation-surface">
      <div className="relative flex h-full w-full flex-col overflow-y-auto px-[clamp(28px,5vw,76px)] py-[clamp(28px,6vh,64px)]">
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col">
          <header className="pb-8">
            <h1 className="text-3xl font-semibold leading-[0.98] tracking-[-0.045em] text-text-primary">
              {t('settingsModel')}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-text-muted">
              {t('modelSettingsDescription')}
            </p>
          </header>

          {/* One window: the providers run along the top, the selected one's
              model and API Key sit below, and saving lives on its bottom edge. */}
          <section
            className="overflow-hidden rounded-[9px] border border-border bg-settings-surface"
            aria-label={t('modelConfiguration')}
          >
            <ProviderTabs
              activeProvider={activeProvider}
              idBase={idBase}
              onSelect={onSelectProvider}
              selectedProvider={provider}
            />

            <div
              role="tabpanel"
              id={`${idBase}-panel`}
              aria-labelledby={providerTabId(idBase, provider)}
              className="px-5 pb-4 pt-12"
            >
              {/* pb-8 so the gap down to the first field matches the one
                  between the fields themselves. */}
              <p className="max-w-xl pb-8 text-xs leading-5 text-text-primary">
                {isOfficial ? t('officialProviderDescription') : t('thirdPartyProviderDescription')}
              </p>

              <div className="settings-form-row grid gap-5 py-8 md:grid-cols-[minmax(160px,0.66fr)_minmax(240px,1fr)] md:items-start">
                <div>
                  <label htmlFor={modelId} className="text-sm font-medium text-text-primary">{t('modelVersion')}</label>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{t('modelVersionHint')}</p>
                </div>
                {isOfficial ? (
                  <div id={modelId} className="flex min-h-11 items-center justify-between rounded-[5px] border border-border bg-black/25 px-3.5 text-sm text-text-secondary">
                    <span>{preset.model}</span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{t('managed')}</span>
                  </div>
                ) : (
                  <div ref={modelMenuRef} className="relative">
                    <button
                      id={modelId}
                      ref={modelTriggerRef}
                      type="button"
                      aria-expanded={modelMenuOpen}
                      aria-controls={modelListId}
                      aria-haspopup="listbox"
                      onClick={() => setModelMenuOpen((open) => !open)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          setModelMenuOpen(true);
                        }
                      }}
                      className="flex min-h-11 w-full items-center rounded-[5px] border border-border bg-[#0D0D0D] px-3.5 pr-12 text-left text-sm text-text-primary outline-none transition-colors hover:border-[#3C3C3C] focus-visible:border-[#525252]"
                    >
                      {draft.model}
                    </button>
                    <span className="pointer-events-none absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-text-muted" aria-hidden="true">
                      <ChevronDown size={15} />
                    </span>
                    {modelMenuOpen && (
                      <div
                        id={modelListId}
                        role="listbox"
                        aria-label={t('modelVersion')}
                        onKeyDown={(event) => {
                          const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
                          const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);

                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setModelMenuOpen(false);
                            modelTriggerRef.current?.focus();
                          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            const direction = event.key === 'ArrowDown' ? 1 : -1;
                            const nextIndex = (currentIndex + direction + options.length) % options.length;
                            options[nextIndex]?.focus();
                          } else if (event.key === 'Home' || event.key === 'End') {
                            event.preventDefault();
                            options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
                          }
                        }}
                        className="absolute left-0 right-0 top-full z-20 mt-1 rounded-[7px] border border-[#343434] bg-[#171717] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
                      >
                        {preset.models?.map((model) => {
                          const selected = draft.model === model;
                          return (
                            <button
                              key={model}
                              ref={selected ? selectedModelRef : undefined}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                onUpdate({ model });
                                setModelMenuOpen(false);
                                modelTriggerRef.current?.focus();
                              }}
                              className={`flex min-h-9 w-full items-center rounded-[5px] px-3 text-left text-sm outline-none transition-colors ${
                                selected
                                  ? 'bg-white/[0.10] text-text-primary'
                                  : 'text-text-secondary hover:bg-white/[0.055] hover:text-text-primary focus-visible:bg-white/[0.055] focus-visible:text-text-primary'
                              }`}
                            >
                              {model}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="settings-form-row grid gap-5 py-8 md:grid-cols-[minmax(160px,0.66fr)_minmax(240px,1fr)] md:items-start">
                <div>
                  <label htmlFor={keyId} className="text-sm font-medium text-text-primary">API Key</label>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {isOfficial ? t('officialKeyHint') : t('apiKeyLocalHint')}
                  </p>
                </div>
                {isOfficial ? (
                  <div id={keyId} className="flex min-h-11 items-center gap-2 rounded-[5px] border border-[#617557]/45 bg-[#617557]/[0.07] px-3.5 text-[13px] text-[#AFC6A3]">
                    <Check size={13} aria-hidden="true" />
                    {t('noApiKeyRequired')}
                  </div>
                ) : (
                  // relative + an absolutely placed error: the message drops into
                  // the row's bottom padding instead of growing the row, so the
                  // window's bottom edge stays put when validation fires.
                  <div className="relative">
                    <div className="relative">
                      <input
                        id={keyId}
                        type={showKey ? 'text' : 'password'}
                        value={draft.apiKey}
                        onChange={(event) => onUpdate({ apiKey: event.target.value })}
                        onBlur={() => setKeyTouched(true)}
                        aria-invalid={keyTouched && keyMissing}
                        aria-describedby={keyTouched && keyMissing ? keyErrorId : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        className={`min-h-11 w-full rounded-[5px] border bg-[#0D0D0D] px-3.5 pr-12 text-sm text-text-primary outline-none transition-colors ${
                          keyTouched && keyMissing
                            ? 'border-[#A34C35] focus-visible:border-[#C97960]'
                            : 'border-border hover:border-[#3C3C3C] focus-visible:border-[#525252]'
                        }`}
                        placeholder={preset.apiKeyPlaceholder ?? 'API Key'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((value) => !value)}
                        aria-label={showKey ? t('hideApiKey') : t('showApiKey')}
                        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[4px] text-text-muted outline-none transition-colors hover:bg-white/[0.06] hover:text-text-primary focus-visible:ring-2 focus-visible:ring-text-secondary"
                      >
                        {showKey ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                      </button>
                    </div>
                    {keyTouched && keyMissing && (
                      <p id={keyErrorId} role="alert" className="absolute inset-x-0 top-full mt-2 text-xs text-[#C97960]">
                        {t('apiKeyRequired')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4">
              {/* Hint and save status share one line, so the hint's centre line
                  meets the save button's rather than riding above it. */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-xs leading-5 text-text-muted">{t('providerPickerHint')}</p>
                <div aria-live="polite" className="text-xs">
                  {saveStatus === 'saved' && (
                    <span className="inline-flex items-center gap-1.5 text-[#9DB591]"><Check size={13} aria-hidden="true" />{t('settingsSaved')}</span>
                  )}
                  {saveStatus === 'error' && <span className="text-[#C97960]">{t('settingsSaveFailed')}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="min-h-11 min-w-[132px] rounded-[5px] bg-[#D6D6D6] px-5 text-sm font-semibold text-[#111] outline-none transition-[background-color,color,transform,opacity] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-[#EEEEEA] focus-visible:ring-2 focus-visible:ring-[#EEEEEA] focus-visible:ring-offset-2 focus-visible:ring-offset-settings-surface active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#242424] disabled:text-text-muted motion-reduce:transition-none"
              >
                {t('saveSettings')}
              </button>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
