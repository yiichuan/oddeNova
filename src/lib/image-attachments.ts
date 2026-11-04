import { requireSupabase } from '../services/auth-service';
import { getActiveModelConfig } from '../services/llm-config';

import type { ImageAttachment, UserContent } from './image-types';
export type { ImageAttachment, UserContent } from './image-types';
const BUCKET = 'chat-images';
export function supportsImages(provider: string, model: string): boolean {
  return provider === 'official' || (provider === 'deepseek' && model === 'deepseek-flash') ||
    (provider === 'openai' && model.startsWith('gpt-')) ||
    (provider === 'anthropic' && model.startsWith('claude-')) ||
    (provider === 'kimi' && ['kimi-k2.6', 'kimi-k3', 'kimi-k2.7-code'].includes(model));
}
export async function imageUrl(image: ImageAttachment): Promise<string> {
  if (image.publicUrl) return image.publicUrl;
  const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrl(image.path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
export async function userContent(text: string, images?: ImageAttachment[]): Promise<UserContent> {
  if (!images?.length) return text;
  const config = getActiveModelConfig();
  if (!supportsImages(config.provider, config.model)) throw new Error('当前模型不支持图片，请切换视觉模型');
  return [{ type: 'text', text }, ...await Promise.all(images.map(async image => {
    try {
      return { type: 'image_url' as const, image_url: { url: await imageUrl(image) } };
    } catch (error) {
      // Expired attachments must not prevent follow-up messages in old conversations.
      const missing = error && typeof error === 'object' && (
        ('code' in error && error.code === 'NoSuchKey') ||
        ('status' in error && Number(error.status) === 404) ||
        ('message' in error && typeof error.message === 'string' && /^object not found\.?$/i.test(error.message))
      );
      if (!missing) throw error;
      return { type: 'text' as const, text: '图片已过期' };
    }
  }))];
}
export async function uploadImage(file: File): Promise<ImageAttachment> {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('请登录后添加图片');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('支持 JPEG、PNG、WebP 和 GIF');
  if (file.size > 20 * 1024 * 1024) throw new Error('单张原图不能超过 20 MiB');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('图片处理失败'); }
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片处理失败')), 'image/jpeg', .9));
  if (blob.size > 2 * 1024 * 1024) throw new Error('优化后的图片超过 2 MiB，请缩小图片');
  const id = crypto.randomUUID();
  const path = `${user.id}/${id}.jpg`;
  const { error } = await client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return { id, path, name: file.name, mimeType: 'image/jpeg', size: blob.size, width: canvas.width, height: canvas.height };
}

const adopted = new Map<string, Promise<ImageAttachment>>();
/** Called only on a creative action or publishing, never while viewing a share. */
export async function ownImage(image: ImageAttachment): Promise<ImageAttachment> {
  if (!image.publicUrl) return image;
  const { data: { user } } = await requireSupabase().auth.getUser();
  if (!user) throw new Error('请登录后继续使用图片');
  const key = `${user.id}:${image.publicUrl}`;
  let pending = adopted.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(image.publicUrl!);
      if (!response.ok) throw new Error('分享图片不可用');
      const blob = await response.blob();
      return uploadImage(new File([blob], image.name, { type: blob.type }));
    })();
    adopted.set(key, pending);
    pending.catch(() => adopted.delete(key));
  }
  return pending;
}
