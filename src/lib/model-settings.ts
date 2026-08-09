import {
  PROVIDER_PRESETS,
  getSelectedModel,
  normalizeProvider,
  type ProviderType,
} from '../services/llm-config';

export const SETTINGS_PROVIDERS: ProviderType[] = [
  'official',
  'deepseek',
  'glm',
  'anthropic',
  'openai',
];

export interface ProviderSettingsDraft {
  apiKey: string;
  model: string;
}

export type ProviderSettingsDrafts = Record<ProviderType, ProviderSettingsDraft>;

export interface ModelSettingsSnapshot {
  activeProvider: ProviderType;
  drafts: ProviderSettingsDrafts;
}

function getStoredProviderKey(provider: ProviderType): string {
  return localStorage.getItem(`vibe_api_key_${provider}`) || '';
}

export function readModelSettingsSnapshot(): ModelSettingsSnapshot {
  const drafts = Object.fromEntries(
    (Object.keys(PROVIDER_PRESETS) as ProviderType[]).map((provider) => [
      provider,
      {
        apiKey: provider === 'official' ? '' : getStoredProviderKey(provider),
        model: getSelectedModel(provider),
      },
    ]),
  ) as ProviderSettingsDrafts;

  return {
    activeProvider: normalizeProvider(localStorage.getItem('vibe_provider')),
    drafts,
  };
}

export function isProviderSettingsDirty(
  provider: ProviderType,
  draft: ProviderSettingsDraft,
  snapshot: ModelSettingsSnapshot,
): boolean {
  const saved = snapshot.drafts[provider];
  return (
    snapshot.activeProvider !== provider
    || saved.apiKey !== draft.apiKey
    || saved.model !== draft.model
  );
}

export function hasProviderDraftChanges(
  provider: ProviderType,
  draft: ProviderSettingsDraft,
  snapshot: ModelSettingsSnapshot,
): boolean {
  const saved = snapshot.drafts[provider];
  return saved.apiKey !== draft.apiKey || saved.model !== draft.model;
}

export function saveProviderSettings(
  provider: ProviderType,
  draft: ProviderSettingsDraft,
): ProviderSettingsDraft {
  const preset = PROVIDER_PRESETS[provider];
  const model = preset.models?.includes(draft.model) ? draft.model : preset.model;
  const apiKey = draft.apiKey.trim();

  if (provider !== 'official' && !apiKey) {
    throw new Error('API_KEY_REQUIRED');
  }

  localStorage.setItem('vibe_provider', provider);
  if (preset.models) {
    localStorage.setItem(`vibe_model_${provider}`, model);
  }

  if (provider === 'official') {
    localStorage.removeItem('vibe_api_key');
  } else {
    localStorage.setItem(`vibe_api_key_${provider}`, apiKey);
    localStorage.setItem('vibe_api_key', apiKey);
  }

  localStorage.removeItem('vibe_base_url');
  localStorage.removeItem('vibe_model');

  return { apiKey, model };
}
