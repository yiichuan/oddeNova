import type { ProviderType } from '../../services/llm-config';
import { zh } from '../../lib/i18n';

export function isApiKeyRequiredForProvider(p: ProviderType): boolean {
  return p !== 'official';
}

export function getCommunityInviteText(): { alt: string; title: string } {
  return zh
    ? { alt: '欢迎加入 oddeNova 音乐制作社群', title: '欢迎加入我们的音乐制作社群' }
    : { alt: 'Join the oddeNova music community', title: 'Join our music creation community' };
}
