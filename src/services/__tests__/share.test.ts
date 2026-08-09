import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadShare, fetchShare } from '../share';

describe('uploadShare', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /api/share with correct payload and returns shareId', async () => {
    const mockShareId = 'abc1234567';
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ shareId: mockShareId }),
    } as Response);

    const shareId = await uploadShare({
      title: 'My Session',
      code: 'note "c5"',
      messages: [],
      revisions: [{
        id: 'rev-1',
        beforeCode: '',
        afterCode: 'note "c5"',
        playbackStatus: 'played',
        createdAt: 1,
      }],
      locale: 'zh-CN',
    });

    expect(fetch).toHaveBeenCalledWith('/api/share', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
    );
    expect(body.version).toBe(1);
    expect(body.title).toBe('My Session');
    expect(body.code).toBe('note "c5"');
    expect(body.revisions).toEqual([{
      id: 'rev-1',
      beforeCode: '',
      afterCode: 'note "c5"',
      playbackStatus: 'played',
      createdAt: 1,
    }]);
    expect(body.locale).toBe('zh-CN');
    expect(typeof body.sharedAt).toBe('number');
    expect(shareId).toBe(mockShareId);
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(
      uploadShare({ title: '', code: '', messages: [], locale: 'en' })
    ).rejects.toThrow('Share failed: 500');
  });
});

describe('fetchShare', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls GET /api/share?id=... and returns payload', async () => {
    const mockPayload = {
      version: 1,
      title: 'Test',
      code: 'c',
      messages: [],
      sharedAt: 0,
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    const result = await fetchShare('abc123');

    expect(fetch).toHaveBeenCalledWith('/api/share?id=abc123');
    expect(result).toEqual(mockPayload);
  });

  it('throws when share not found', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(fetchShare('invalid')).rejects.toThrow('Fetch share failed: 404');
  });
});
