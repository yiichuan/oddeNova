import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareUrl } from '../share-target';

describe('shareUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies with Clipboard API without opening native share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nativeShare = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share: nativeShare,
    });

    await expect(shareUrl('https://www.oddenova.com/s/abc123')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://www.oddenova.com/s/abc123');
    expect(nativeShare).not.toHaveBeenCalled();
  });

  it('falls back to legacy copy when Clipboard API is unavailable', async () => {
    const appended: unknown[] = [];
    const removed: unknown[] = [];
    const textarea = {
      value: '',
      setAttribute: vi.fn(),
      select: vi.fn(),
      style: {},
    };

    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
      body: {
        appendChild: vi.fn((node: unknown) => appended.push(node)),
        removeChild: vi.fn((node: unknown) => removed.push(node)),
      },
    });

    await expect(shareUrl('http://192.168.0.112/s/abc123')).resolves.toBe('copied');
    expect(textarea.value).toBe('http://192.168.0.112/s/abc123');
    expect(textarea.select).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(appended).toEqual([textarea]);
    expect(removed).toEqual([textarea]);
  });

  it('falls back to native share when clipboard copy is unavailable', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const nativeShare = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share: nativeShare,
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        value: '',
        setAttribute: vi.fn(),
        select: vi.fn(),
        style: {},
      })),
      execCommand: vi.fn(() => false),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });

    await expect(shareUrl('https://www.oddenova.com/s/abc123')).resolves.toBe('shared');
    expect(writeText).toHaveBeenCalledWith('https://www.oddenova.com/s/abc123');
    expect(nativeShare).toHaveBeenCalledWith({ url: 'https://www.oddenova.com/s/abc123' });
  });

  it('shows the share URL when automatic share targets are unavailable', async () => {
    const prompt = vi.fn();

    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        value: '',
        setAttribute: vi.fn(),
        select: vi.fn(),
        style: {},
      })),
      execCommand: vi.fn(() => false),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
    vi.stubGlobal('prompt', prompt);

    await expect(shareUrl('http://192.168.0.112/s/abc123')).resolves.toBe('shown');
    expect(prompt).toHaveBeenCalledWith('复制分享链接', 'http://192.168.0.112/s/abc123');
  });
});
