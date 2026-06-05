import { beforeEach, describe, it, expect, vi } from 'vitest';
import { getActiveModelConfig, hasApiKeyConfigured, normalizeProvider, PROVIDER_PRESETS } from '../llm-config';

function installLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  installLocalStorage();
});

describe('normalizeProvider', () => {
  it('returns "official" when raw is null', () => {
    expect(normalizeProvider(null)).toBe('official');
  });

  it('returns "official" when raw is empty string', () => {
    expect(normalizeProvider('')).toBe('official');
  });

  it('returns known provider IDs unchanged', () => {
    expect(normalizeProvider('deepseek')).toBe('deepseek');
    expect(normalizeProvider('kimi')).toBe('kimi');
    expect(normalizeProvider('openai')).toBe('openai');
    expect(normalizeProvider('anthropic')).toBe('anthropic');
    expect(normalizeProvider('official')).toBe('official');
    expect(normalizeProvider('glm')).toBe('glm');
  });

  it('returns "official" for unknown / legacy provider strings', () => {
    expect(normalizeProvider('openai-compat')).toBe('official');
    expect(normalizeProvider('custom')).toBe('official');
    expect(normalizeProvider('qiniu')).toBe('official');
    expect(normalizeProvider('unknown-provider')).toBe('official');
  });
});

describe('PROVIDER_PRESETS', () => {
  const requiredKeys = ['label', 'baseURL', 'model', 'protocol'] as const;
  const expectedProviders = ['deepseek', 'kimi', 'openai', 'anthropic', 'official', 'glm'] as const;

  it('defines all expected providers', () => {
    for (const provider of expectedProviders) {
      expect(PROVIDER_PRESETS).toHaveProperty(provider);
    }
  });

  it.each(expectedProviders)('"%s" preset has all required fields', (provider) => {
    const preset = PROVIDER_PRESETS[provider];
    for (const key of requiredKeys) {
      expect(preset[key], `${provider}.${key} should be a non-empty string`).toBeTruthy();
    }
  });

  it.each(expectedProviders)('"%s" preset has valid protocol', (provider) => {
    const { protocol } = PROVIDER_PRESETS[provider];
    expect(['anthropic', 'openai']).toContain(protocol);
  });

  it.each(expectedProviders)('"%s" baseURL starts with https://', (provider) => {
    expect(PROVIDER_PRESETS[provider].baseURL).toMatch(/^https:\/\//);
  });
});

describe('official provider API key defaults', () => {
  it('treats missing provider as official and already configured', () => {
    expect(normalizeProvider(null)).toBe('official');
    expect(hasApiKeyConfigured()).toBe(true);
  });

  it('uses DeepSeek directly and keeps a placeholder API key when no key is saved', () => {
    localStorage.setItem('vibe_provider', 'official');

    const cfg = getActiveModelConfig();

    expect(cfg.provider).toBe('official');
    expect(cfg.baseURL).toBe('https://api.deepseek.com/v1');
    expect(cfg.apiKey).toBe('official-proxy');
  });

  it('uses a saved key for official debugging without changing the provider default', () => {
    localStorage.setItem('vibe_provider', 'official');
    localStorage.setItem('vibe_api_key', 'sk-debug');

    const cfg = getActiveModelConfig();

    expect(cfg.baseURL).toBe('https://api.deepseek.com/v1');
    expect(cfg.apiKey).toBe('sk-debug');
  });

  it('still requires a user key for non-official providers', () => {
    localStorage.setItem('vibe_provider', 'deepseek');
    localStorage.removeItem('vibe_api_key');

    expect(hasApiKeyConfigured()).toBe(false);
  });
});
