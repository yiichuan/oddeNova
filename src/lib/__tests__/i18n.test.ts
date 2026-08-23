import { afterEach, describe, expect, it, vi } from 'vitest';

describe('i18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('shows the network retry message in Chinese', async () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    vi.resetModules();

    const { t } = await import('../i18n');

    expect(t('agentResponseFailed')).toBe('网络发生错误，请重试');
  });
});
