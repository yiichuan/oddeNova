import { describe, it, expect } from 'vitest';
import { normalizeProvider, PROVIDER_PRESETS } from '../llm-config';

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
