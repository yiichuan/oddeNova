// @vitest-environment happy-dom

import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasProviderDraftChanges,
  isProviderSettingsDirty,
  readModelSettingsSnapshot,
  saveProviderSettings,
} from '../model-settings';

describe('model settings persistence', () => {
  const storage = new Window().localStorage;

  beforeEach(() => {
    vi.stubGlobal('localStorage', storage);
    storage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads the active provider and provider-specific drafts', () => {
    localStorage.setItem('vibe_provider', 'deepseek');
    localStorage.setItem('vibe_model_deepseek', 'deepseek-v4-pro');
    localStorage.setItem('vibe_api_key_deepseek', 'deepseek-key');
    localStorage.setItem('vibe_api_key_openai', 'openai-key');

    const snapshot = readModelSettingsSnapshot();

    expect(snapshot.activeProvider).toBe('deepseek');
    expect(snapshot.drafts.deepseek).toEqual({ apiKey: 'deepseek-key', model: 'deepseek-v4-pro' });
    expect(snapshot.drafts.openai.apiKey).toBe('openai-key');
  });

  it('distinguishes draft edits from provider activation changes', () => {
    const snapshot = readModelSettingsSnapshot();

    expect(hasProviderDraftChanges('deepseek', snapshot.drafts.deepseek, snapshot)).toBe(false);
    expect(isProviderSettingsDirty('deepseek', snapshot.drafts.deepseek, snapshot)).toBe(true);
  });

  it('saves a third-party provider and compatibility fields', () => {
    localStorage.setItem('vibe_base_url', 'https://legacy.example');
    localStorage.setItem('vibe_model', 'legacy-model');

    const saved = saveProviderSettings('openai', { apiKey: '  test-key  ', model: 'gpt-5.5-mini' });

    expect(saved).toEqual({ apiKey: 'test-key', model: 'gpt-5.5-mini' });
    expect(localStorage.getItem('vibe_provider')).toBe('openai');
    expect(localStorage.getItem('vibe_api_key_openai')).toBe('test-key');
    expect(localStorage.getItem('vibe_api_key')).toBe('test-key');
    expect(localStorage.getItem('vibe_model_openai')).toBe('gpt-5.5-mini');
    expect(localStorage.getItem('vibe_base_url')).toBeNull();
    expect(localStorage.getItem('vibe_model')).toBeNull();
  });

  it('rejects an empty third-party key', () => {
    expect(() => saveProviderSettings('anthropic', {
      apiKey: '   ',
      model: 'claude-sonnet-4-6',
    })).toThrow('API_KEY_REQUIRED');
  });

  it('activates the official provider without deleting provider-specific keys', () => {
    localStorage.setItem('vibe_api_key', 'active-key');
    localStorage.setItem('vibe_api_key_openai', 'saved-openai-key');

    saveProviderSettings('official', { apiKey: '', model: 'deepseek-v4-flash' });

    expect(localStorage.getItem('vibe_provider')).toBe('official');
    expect(localStorage.getItem('vibe_api_key')).toBeNull();
    expect(localStorage.getItem('vibe_api_key_openai')).toBe('saved-openai-key');
  });
});
