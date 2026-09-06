import { useCallback, useMemo, useState } from 'react';
import type { ProviderType } from '../services/llm-config';
import {
  hasProviderDraftChanges,
  isProviderSettingsDirty,
  readModelSettingsSnapshot,
  saveProviderSettings,
  SETTINGS_PROVIDERS,
  type ModelSettingsSnapshot,
  type ProviderSettingsDraft,
} from '../lib/model-settings';

export type ModelSettingsSaveStatus = 'idle' | 'saved' | 'error';

export function useModelSettingsDraft(onSaved: () => void) {
  const [snapshot, setSnapshot] = useState<ModelSettingsSnapshot>(readModelSettingsSnapshot);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(() => (
    SETTINGS_PROVIDERS.includes(snapshot.activeProvider) ? snapshot.activeProvider : 'official'
  ));
  const [drafts, setDrafts] = useState(snapshot.drafts);
  const [saveStatus, setSaveStatus] = useState<ModelSettingsSaveStatus>('idle');

  const selectProvider = useCallback((provider: ProviderType) => {
    setSelectedProvider(provider);
    setSaveStatus('idle');
  }, []);

  const updateDraft = useCallback((provider: ProviderType, patch: Partial<ProviderSettingsDraft>) => {
    setDrafts((current) => ({
      ...current,
      [provider]: { ...current[provider], ...patch },
    }));
    setSaveStatus('idle');
  }, []);

  const dirtyProviders = useMemo(() => new Set(
    Object.entries(drafts)
      .filter(([provider, draft]) => hasProviderDraftChanges(
        provider as ProviderType,
        draft,
        snapshot,
      ))
      .map(([provider]) => provider as ProviderType),
  ), [drafts, snapshot]);

  const saveSelectedProvider = useCallback(() => {
    try {
      const savedDraft = saveProviderSettings(selectedProvider, drafts[selectedProvider]);
      const nextSnapshot: ModelSettingsSnapshot = {
        activeProvider: selectedProvider,
        drafts: { ...snapshot.drafts, [selectedProvider]: savedDraft },
      };
      setDrafts((current) => ({ ...current, [selectedProvider]: savedDraft }));
      setSnapshot(nextSnapshot);
      onSaved();
      setSaveStatus('saved');
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, [drafts, onSaved, selectedProvider, snapshot.drafts]);

  return {
    activeProvider: snapshot.activeProvider,
    dirtyProviders,
    draft: drafts[selectedProvider],
    drafts,
    saveSelectedProvider,
    saveStatus,
    selectedIsDirty: isProviderSettingsDirty(selectedProvider, drafts[selectedProvider], snapshot),
    selectProvider,
    selectedProvider,
    updateDraft,
  };
}
