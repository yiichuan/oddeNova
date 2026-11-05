import { openDB } from 'idb';
import { requireSupabase } from '../services/auth-service';
import { imageUrl, type ImageAttachment } from './image-attachments';
const database = () => openDB('oddenova-image-cache', 1, { upgrade(db) { db.createObjectStore('images'); } });
export async function previewImageUrl(image: ImageAttachment): Promise<string> {
  if (image.publicUrl) return image.publicUrl;
  const { data: { user } } = await requireSupabase().auth.getUser();
  if (!user || !image.path.startsWith(`${user.id}/`)) throw new Error('图片不可用');
  let blob: Blob | undefined;
  try { const db = await database(); blob = await db.get('images', image.path); db.close(); } catch { /* Cache is optional. */ }
  if (!blob) {
    const response = await fetch(await imageUrl(image));
    if (!response.ok) throw new Error('图片加载失败');
    blob = await response.blob();
    try { const db = await database(); await db.put('images', blob, image.path); db.close(); } catch { /* Cloud remains authoritative. */ }
  }
  return URL.createObjectURL(blob);
}
