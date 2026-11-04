import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  range: vi.fn(), list: vi.fn(), remove: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ range: mocks.range }) }),
    storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
  }),
}));
import { cleanupPrivateImages } from '../server/image-cleanup';

const now = new Date('2026-11-04T00:00:00Z');
const day = 86400000;
const object = (name: string, age: number) => ({ id: name, name, created_at: new Date(now.getTime() - age * day).toISOString() });

describe('private image retention', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://storage.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
    mocks.range.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.list.mockReset();
    mocks.remove.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('expires referenced images at 30 days while retaining younger references and a seven-day orphan grace period', async () => {
    mocks.range.mockResolvedValue({ data: [{ messages: [{ images: [
      { path: 'owner/old.jpg' }, { path: 'owner/boundary.jpg' }, { path: 'owner/young.jpg' },
    ] }] }], error: null });
    mocks.list.mockImplementation(async (prefix: string) => ({ data: prefix === ''
      ? [{ name: 'owner', id: null }]
      : [object('old.jpg', 31), object('boundary.jpg', 30), object('young.jpg', 29.999),
        object('orphan.jpg', 7), object('pending.jpg', 6.999)], error: null }));
    expect(await cleanupPrivateImages(now)).toBe(3);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith(['owner/old.jpg', 'owner/boundary.jpg', 'owner/orphan.jpg']);
  });

  it('lists all pages before deleting and splits large deletions into batches', async () => {
    const expired = Array.from({ length: 1001 }, (_, i) => object(`${i}.jpg`, 31));
    mocks.list.mockImplementation(async (prefix: string, options: { offset: number; limit: number }) => ({
      data: prefix === '' ? [{ name: 'owner', id: null }] : expired.slice(options.offset, options.offset + options.limit), error: null,
    }));
    expect(await cleanupPrivateImages(now)).toBe(1001);
    expect(mocks.remove).toHaveBeenCalledTimes(11);
    expect(mocks.remove.mock.calls.flatMap(call => call[0])).toEqual(expired.map(item => `owner/${item.name}`));
  });

  it('keeps old images referenced by a favorite on a later page, including shared references', async () => {
    const ordinary = { user_id: 'owner', favorited_at: null, messages: [{ images: [{ path: 'owner/shared.jpg' }] }] };
    const favorite = { user_id: 'owner', favorited_at: '2026-11-01T00:00:00Z', messages: [{ images: [
      { path: 'owner/shared.jpg' }, { path: 'owner/kept.jpg' },
    ] }] };
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ordinary), error: null })
      .mockResolvedValueOnce({ data: [favorite], error: null });
    mocks.list.mockImplementation(async (prefix: string) => ({ data: prefix === ''
      ? [{ name: 'owner', id: null }]
      : [object('shared.jpg', 365), object('kept.jpg', 365), object('expired.jpg', 30)], error: null }));
    expect(await cleanupPrivateImages(now)).toBe(1);
    expect(mocks.remove).toHaveBeenCalledWith(['owner/expired.jpg']);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it.each([null, undefined])('uses the original upload age after a favorite is removed (%s)', async favoritedAt => {
    mocks.range.mockResolvedValue({ data: [{ user_id: 'owner', favorited_at: favoritedAt,
      messages: [{ images: [{ path: 'owner/old.jpg' }] }],
    }], error: null });
    mocks.list.mockImplementation(async (prefix: string) => ({ data: prefix === ''
      ? [{ name: 'owner', id: null }] : [object('old.jpg', 60)], error: null }));
    expect(await cleanupPrivateImages(now)).toBe(1);
    expect(mocks.remove).toHaveBeenCalledWith(['owner/old.jpg']);
  });

  it('does not let a favorite protect another user’s image', async () => {
    mocks.range.mockResolvedValue({ data: [{ user_id: 'other', favorited_at: '2026-11-01T00:00:00Z',
      messages: [{ images: [{ path: 'owner/old.jpg' }] }],
    }], error: null });
    mocks.list.mockImplementation(async (prefix: string) => ({ data: prefix === ''
      ? [{ name: 'owner', id: null }] : [object('old.jpg', 60)], error: null }));
    expect(await cleanupPrivateImages(now)).toBe(1);
  });

  it('skips malformed data without losing valid legacy references or favorite protection', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mocks.range.mockResolvedValue({ data: [
        { messages: {} },
        { user_id: 'owner', favorited_at: '2026-11-01', messages: [
          null, [], 'bad message', { images: null }, { images: {} }, {},
          { images: [null, [], 'bad image', {}, { path: 1 }, { path: '' }, { path: '  ' }, { path: 'owner/kept.jpg' }] },
        ] },
        { messages: [{ images: [{ path: 'owner/young.jpg' }] }] },
      ], error: null });
      mocks.list.mockImplementation(async (prefix: string) => ({ data: prefix === ''
        ? [{ name: 'owner', id: null }]
        : [object('kept.jpg', 365), object('young.jpg', 8), object('expired.jpg', 30), object('orphan.jpg', 8)], error: null }));
      expect(await cleanupPrivateImages(now)).toBe(2);
      expect(mocks.remove).toHaveBeenCalledWith(['owner/expired.jpg', 'owner/orphan.jpg']);
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledWith('Image cleanup skipped invalid data', { invalidItems: 13 });
    } finally { warning.mockRestore(); }
  });

  it('does not delete anything if storage listing fails', async () => {
    mocks.list.mockResolvedValue({ data: null, error: new Error('listing unavailable') });
    await expect(cleanupPrivateImages(now)).rejects.toThrow('listing unavailable');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not delete anything if reference lookup fails', async () => {
    mocks.range.mockResolvedValue({ data: null, error: new Error('database unavailable') });
    await expect(cleanupPrivateImages(now)).rejects.toThrow('database unavailable');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('reports deletion failures so the scheduled task can be monitored', async () => {
    mocks.list.mockImplementation(async (prefix: string) => ({
      data: prefix === '' ? [{ name: 'owner', id: null }] : [object('old.jpg', 31)], error: null,
    }));
    mocks.remove.mockResolvedValue({ error: new Error('storage unavailable') });
    await expect(cleanupPrivateImages(now)).rejects.toThrow('storage unavailable');
  });
});
