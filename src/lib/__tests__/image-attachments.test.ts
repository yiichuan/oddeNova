import { describe, expect, it, vi } from 'vitest';
const signed = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null }));
vi.mock('../../services/auth-service', () => ({ requireSupabase: () => ({ storage: { from: () => ({ createSignedUrl: signed }) } }) }));
vi.mock('../../services/llm-config', () => ({ getActiveModelConfig: () => ({ provider: 'deepseek', model: 'deepseek-flash' }) }));
import { imageUrl, supportsImages, userContent, type ImageAttachment } from '../image-attachments';
const image: ImageAttachment = { id: 'one', name: 'score.png', path: 'owner/one.jpg', width: 100, height: 100, size: 100, mimeType: 'image/jpeg' };
describe('image attachments', () => {
  it('gates models individually', () => {
    expect(supportsImages('deepseek', 'deepseek-flash')).toBe(true);
    expect(supportsImages('deepseek', 'deepseek-v4-pro')).toBe(false);
    expect(supportsImages('glm', 'glm-5.3')).toBe(false);
    expect(supportsImages('kimi', 'kimi-k2.7-code')).toBe(true);
  });
  it('preserves text-only requests and serializes pictures as user content blocks', async () => {
    expect(await userContent('hello')).toBe('hello');
    expect(await userContent('score', [image])).toEqual([{ type: 'text', text: 'score' }, { type: 'image_url', image_url: { url: 'https://storage.test/signed' } }]);
    expect(signed).toHaveBeenCalledWith(image.path, 3600);
  });
  it('reads public shares without copying an object', async () => {
    signed.mockClear();
    expect(await imageUrl({ ...image, publicUrl: 'https://public.test/image.jpg' })).toBe('https://public.test/image.jpg');
    expect(signed).not.toHaveBeenCalled();
  });
  it('replaces deleted or expired attachments with context so follow-up requests still work', async () => {
    signed.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const content = await userContent('continue', [image, { ...image, id: 'two', path: 'owner/two.jpg' }]);
    expect(content).toEqual([
      { type: 'text', text: 'continue' },
      { type: 'text', text: '图片已过期' },
      { type: 'image_url', image_url: { url: 'https://storage.test/signed' } },
    ]);
  });
  it('does not hide permission or network failures as expiration', async () => {
    const error = { message: 'Unauthorized', status: 403 };
    signed.mockResolvedValueOnce({ data: null, error });
    await expect(userContent('continue', [image])).rejects.toEqual(error);
  });
});
