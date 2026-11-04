import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), user: vi.fn(), url: vi.fn(), open: vi.fn() }));
vi.mock('idb', () => ({ openDB: mocks.open }));
vi.mock('../../services/auth-service', () => ({ requireSupabase: () => ({ auth: { getUser: mocks.user } }) }));
vi.mock('../image-attachments', () => ({ imageUrl: mocks.url }));
import { previewImageUrl } from '../image-cache';
const image = { id: 'i', name: 'x.jpg', path: 'owner/i.jpg', mimeType: 'image/jpeg', width: 100, height: 100, size: 100 };
describe('image preview cache', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'owner' } } });
    mocks.open.mockResolvedValue({ get: mocks.get, put: mocks.put, close: vi.fn() });
    mocks.url.mockResolvedValue('https://signed.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) }));
  });
  it('uses cached data without a download', async () => {
    mocks.get.mockResolvedValue(new Blob(['cached']));
    const url = await previewImageUrl(image);
    expect(url).toMatch(/^blob:/); URL.revokeObjectURL(url);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('downloads when IndexedDB is unavailable', async () => {
    mocks.open.mockRejectedValue(new Error('storage unavailable'));
    const url = await previewImageUrl(image);
    expect(fetch).toHaveBeenCalledWith('https://signed.test'); URL.revokeObjectURL(url);
  });
  it('rejects a different account before reading cache', async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: 'other' } } });
    await expect(previewImageUrl(image)).rejects.toThrow('图片不可用');
    expect(mocks.open).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('reports failed downloads without writing cache', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(previewImageUrl(image)).rejects.toThrow('图片加载失败');
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
