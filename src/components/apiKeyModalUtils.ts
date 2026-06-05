import type { ProviderType } from '../services/llm-config';

export function isApiKeyRequiredForProvider(p: ProviderType): boolean {
  return p !== 'official';
}

export function getCommunityInviteText(): { alt: string; title: string } {
  return {
    alt: '欢迎加入 oddeNova 音乐制作社群',
    title: '欢迎加入我们的音乐制作社群',
  };
}
