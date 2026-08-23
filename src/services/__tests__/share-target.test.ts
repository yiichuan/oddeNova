import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareUrl } from '../share-target';
import { t } from '../../lib/i18n';

describe('shareUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubCoarsePointer(matches: boolean) {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  }

  it('copies with Clipboard API before opening native share on desktop', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nativeShare = vi.fn().mockResolvedValue(undefined);

    stubCoarsePointer(false);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share: nativeShare,
    });

    await expect(shareUrl(
      'https://www.oddenova.com/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(
      'https://www.oddenova.com/s/abc123\n[oddeNova] Morning sketch',
    );
    expect(nativeShare).not.toHaveBeenCalled();
  });

  it('opens native share before falling back to Clipboard API on mobile', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nativeShare = vi.fn().mockResolvedValue(undefined);

    stubCoarsePointer(true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share: nativeShare,
    });

    await expect(shareUrl(
      'https://www.oddenova.com/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('shared');
    expect(nativeShare).toHaveBeenCalledWith({
      title: '[oddeNova] Morning sketch',
      url: 'https://www.oddenova.com/s/abc123',
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to Clipboard API when native share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });

    await expect(shareUrl(
      'https://www.oddenova.com/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(
      'https://www.oddenova.com/s/abc123\n[oddeNova] Morning sketch',
    );
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

    await expect(shareUrl(
      'http://192.168.0.112/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('copied');
    expect(textarea.value).toBe(
      'http://192.168.0.112/s/abc123\n[oddeNova] Morning sketch',
    );
    expect(textarea.select).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(appended).toEqual([textarea]);
    expect(removed).toEqual([textarea]);
  });

  it('falls back to Clipboard API when native share is rejected', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nativeShare = vi.fn().mockRejectedValue(new DOMException('NotAllowedError', 'NotAllowedError'));

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

    await expect(shareUrl(
      'https://www.oddenova.com/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('copied');
    expect(nativeShare).toHaveBeenCalledWith({
      title: '[oddeNova] Morning sketch',
      url: 'https://www.oddenova.com/s/abc123',
    });
    expect(writeText).toHaveBeenCalledWith(
      'https://www.oddenova.com/s/abc123\n[oddeNova] Morning sketch',
    );
  });

  it('stops without copying when the user cancels native share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nativeShare = vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError'));

    stubCoarsePointer(true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share: nativeShare,
    });

    await expect(shareUrl(
      'https://www.oddenova.com/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
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

    await expect(shareUrl(
      'http://192.168.0.112/s/abc123',
      '[oddeNova] Morning sketch',
    )).resolves.toBe('shown');
    expect(prompt).toHaveBeenCalledWith(
      t('copyShareLink'),
      'http://192.168.0.112/s/abc123\n[oddeNova] Morning sketch',
    );
  });
});
