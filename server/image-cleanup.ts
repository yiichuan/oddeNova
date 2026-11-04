import { createClient } from '@supabase/supabase-js';
const DAY_MS = 86400000;
/** Keep favorite attachments; expire other images after 30 days and orphans after seven. */
export async function cleanupPrivateImages(now: Date): Promise<number> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Image cleanup requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const referenced = new Set<string>();
  const kept = new Set<string>();
  let invalidItems = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('sessions').select('messages,favorited_at,user_id').range(offset, offset + 499);
    if (error) throw error;
    for (const session of data) {
      if (!Array.isArray(session.messages)) { invalidItems += 1; continue; }
      for (const message of session.messages) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) { invalidItems += 1; continue; }
        if (message.images === undefined) continue;
        if (!Array.isArray(message.images)) { invalidItems += 1; continue; }
        for (const image of message.images) {
          if (!image || typeof image !== 'object' || Array.isArray(image) ||
              typeof image.path !== 'string' || !image.path.trim()) { invalidItems += 1; continue; }
          referenced.add(image.path);
          // A session can only protect attachments belonging to its owner.
          if (session.favorited_at != null && image.path.startsWith(`${session.user_id}/`)) kept.add(image.path);
        }
      }
    }
    if (data.length < 500) break;
  }
  if (invalidItems) console.warn('Image cleanup skipped invalid data', { invalidItems });
  const storage = client.storage.from('chat-images');
  const list = async (prefix: string) => {
    const objects = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      objects.push(...data);
      if (data.length < 1000) return objects;
    }
  };
  const stale: string[] = [];
  for (const folder of await list('')) {
    if (folder.id) continue;
    for (const object of await list(folder.name)) {
      const path = `${folder.name}/${object.name}`;
      const age = now.getTime() - Date.parse(object.created_at);
      if (object.id && !kept.has(path) && (age >= 30 * DAY_MS || (!referenced.has(path) && age >= 7 * DAY_MS))) stale.push(path);
    }
  }
  for (let offset = 0; offset < stale.length; offset += 100) {
    const { error } = await storage.remove(stale.slice(offset, offset + 100));
    if (error) throw error;
  }
  return stale.length;
}
