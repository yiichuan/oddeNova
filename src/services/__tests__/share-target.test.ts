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
});
