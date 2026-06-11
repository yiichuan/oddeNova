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
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_API_KEY', '');
  vi.stubEnv('VITE_BASE_URL', '');
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

  it.each(expectedProviders)('"%s" baseURL uses the expected transport', (provider) => {
    if (provider === 'official') {
      expect(PROVIDER_PRESETS[provider].baseURL).toMatch(/^\/api\//);
      return;
    }
    expect(PROVIDER_PRESETS[provider].baseURL).toMatch(/^https:\/\//);
  });
});

describe('PROVIDER_PRESETS models lists', () => {
  const providersWithModels = ['deepseek', 'kimi', 'openai', 'anthropic', 'glm'] as const;

  it.each(providersWithModels)('"%s" has a non-empty models list', (provider) => {
    expect(PROVIDER_PRESETS[provider].models?.length).toBeGreaterThan(0);
  });

  it('"official" does not define a models list', () => {
    expect(PROVIDER_PRESETS.official.models).toBeUndefined();
  });

  it.each(['deepseek', 'kimi', 'openai', 'glm'] as const)('"%s" models list includes its preset.model', (provider) => {
    const preset = PROVIDER_PRESETS[provider];
    expect(preset.models).toContain(preset.model);
  });

  it('anthropic models[0] matches the LEGACY_MODELS sonnet default', () => {
    expect(PROVIDER_PRESETS.anthropic.models?.[0]).toBe('claude-sonnet-4-6');
  });
});

describe('official provider API key defaults', () => {
  it('treats missing provider as official and already configured', () => {
    expect(normalizeProvider(null)).toBe('official');
    expect(hasApiKeyConfigured()).toBe(true);
  });

  it('uses the same-origin official proxy and a placeholder API key', () => {
    localStorage.setItem('vibe_provider', 'official');

    const cfg = getActiveModelConfig();

    expect(cfg.provider).toBe('official');
    expect(cfg.baseURL).toBe('/api/official/v1');
    expect(cfg.apiKey).toBe('official-proxy');
  });

  it('expands official proxy baseURL to the current origin in browsers', () => {
    localStorage.setItem('vibe_provider', 'official');
    vi.stubGlobal('window', {
      location: { origin: 'https://www.oddenova.com' },
    });

    expect(getActiveModelConfig().baseURL).toBe('https://www.oddenova.com/api/official/v1');
  });

  it('still requires a user key for non-official providers', () => {
    localStorage.setItem('vibe_provider', 'deepseek');
    localStorage.removeItem('vibe_api_key');

    expect(hasApiKeyConfigured()).toBe(false);
  });
});
