import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { t } from '../lib/i18n';
import type { ProviderSettingsDraft } from '../lib/model-settings';
import { PROVIDER_PRESETS, type ProviderType } from '../services/llm-config';
import type { ModelSettingsSaveStatus } from '../hooks/useModelSettingsDraft';

interface ModelSettingsPanelProps {
  draft: ProviderSettingsDraft;
  isDirty: boolean;
  onSave: () => boolean;
  onUpdate: (patch: Partial<ProviderSettingsDraft>) => void;
  provider: ProviderType;
  saveStatus: ModelSettingsSaveStatus;
}

function providerLabel(provider: ProviderType): string {
  return provider === 'official' ? t('officialLabel') : PROVIDER_PRESETS[provider].label;
}

export default function ModelSettingsPanel({
  draft,
  isDirty,
  onSave,
  onUpdate,
  provider,
  saveStatus,
}: ModelSettingsPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const selectedModelRef = useRef<HTMLButtonElement>(null);
  const modelId = useId();
  const modelListId = `${modelId}-list`;
  const keyId = useId();
  const keyErrorId = useId();
  const isOfficial = provider === 'official';
  const keyMissing = !isOfficial && !draft.apiKey.trim();
  const canSave = isDirty && !keyMissing;
  const preset = PROVIDER_PRESETS[provider];

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
    <main className="relative flex h-full min-w-0 flex-1 overflow-hidden rounded-region border border-border bg-[#080808]">
      <div className="settings-panel-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative flex h-full w-full flex-col overflow-y-auto px-[clamp(28px,5vw,76px)] py-[clamp(28px,6vh,64px)]">
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col">
          <header className="pb-8">
            <h1 className="text-3xl font-semibold leading-[0.98] tracking-[-0.045em] text-text-primary">
              {providerLabel(provider)}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-text-muted">
              {isOfficial ? t('officialProviderDescription') : t('thirdPartyProviderDescription')}
            </p>
          </header>

          <section className="flex-1 py-8" aria-label={t('modelConfiguration')}>
            <div className="settings-form-row grid gap-5 border-b border-border py-6 md:grid-cols-[minmax(180px,0.72fr)_minmax(260px,1fr)] md:items-start">
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

            <div className="settings-form-row grid gap-5 py-6 md:grid-cols-[minmax(180px,0.72fr)_minmax(260px,1fr)] md:items-start">
              <div>
                <label htmlFor={keyId} className="text-sm font-medium text-text-primary">API Key</label>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {isOfficial ? t('officialKeyHint') : t('apiKeyLocalHint')}
                </p>
              </div>
              {isOfficial ? (
                <div id={keyId} className="flex min-h-11 items-center gap-2 rounded-[5px] border border-[#617557]/45 bg-[#617557]/[0.07] px-3.5 text-sm text-[#AFC6A3]">
                  <Check size={14} aria-hidden="true" />
                  {t('noApiKeyRequired')}
                </div>
              ) : (
                <div>
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
                    <p id={keyErrorId} role="alert" className="mt-2 text-xs text-[#C97960]">
                      {t('apiKeyRequired')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div aria-live="polite" className="min-h-5 text-xs">
              {saveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1.5 text-[#9DB591]"><Check size={13} aria-hidden="true" />{t('settingsSaved')}</span>
              )}
              {saveStatus === 'error' && <span className="text-[#C97960]">{t('settingsSaveFailed')}</span>}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="min-h-11 min-w-[132px] rounded-[5px] bg-[#D6D6D6] px-5 text-sm font-semibold text-[#111] outline-none transition-[background-color,color,transform,opacity] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-[#EEEEEA] focus-visible:ring-2 focus-visible:ring-[#EEEEEA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#242424] disabled:text-text-muted motion-reduce:transition-none"
            >
              {t('saveSettings')}
            </button>
          </footer>
        </div>
      </div>
    </main>
  );
}
