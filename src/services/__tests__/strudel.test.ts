// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('StrudelService initialization recovery', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@strudel/codemirror');
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  it('keeps the mount container so reinit can retry after an early attach failure', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExport: vi.fn() }));
    vi.doMock('@strudel/codemirror', () => {
      throw new Error('codemirror import failed');
    });

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const container = document.createElement('div');

    await expect(service.attach(container)).rejects.toThrow();

    expect((service as unknown as { containerElement: HTMLElement | null }).containerElement).toBe(container);
  });
});
