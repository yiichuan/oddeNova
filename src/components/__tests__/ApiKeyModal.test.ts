import { describe, expect, it } from 'vitest';
import { getCommunityInviteText, isApiKeyRequiredForProvider } from '../apiKeyModalUtils';

describe('ApiKeyModal official provider behavior', () => {
  it('does not require an API key for official provider', () => {
    expect(isApiKeyRequiredForProvider('official')).toBe(false);
  });

  it('requires an API key for user-configured providers', () => {
    expect(isApiKeyRequiredForProvider('deepseek')).toBe(true);
    expect(isApiKeyRequiredForProvider('anthropic')).toBe(true);
    expect(isApiKeyRequiredForProvider('glm')).toBe(true);
  });

  it('uses community-oriented QR copy', () => {
    expect(getCommunityInviteText()).toEqual({
      alt: '欢迎加入 oddeNova 音乐制作社群',
      title: '欢迎加入我们的音乐制作社群',
    });
  });
});
