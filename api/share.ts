import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import { requireUser } from '../server/session-utils.js';
import { randomBytes } from 'crypto';
import { isSafeChatMessageTransfer } from '../src/lib/humming-transfer.js';

const SHARE_PAYLOAD_KEYS = new Set([
  'version',
  'title',
  'code',
  'messages',
  'revisions',
  'sharedAt',
  'locale',
]);
const REVISION_KEYS = new Set(['id', 'beforeCode', 'afterCode', 'playbackStatus', 'createdAt']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeShareRevision(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).some((key) => !REVISION_KEYS.has(key))) return false;
  return typeof value.id === 'string'
    && typeof value.beforeCode === 'string'
    && typeof value.afterCode === 'string'
    && ['played', 'failed', 'not_attempted'].includes(String(value.playbackStatus))
    && typeof value.createdAt === 'number'
    && Number.isFinite(value.createdAt);
}

function isSafeSharePayload(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some((key) => !SHARE_PAYLOAD_KEYS.has(key))) return false;
  return value.version === 1
    && typeof value.title === 'string'
    && typeof value.code === 'string'
    && Array.isArray(value.messages)
    && value.messages.every(isSafeChatMessageTransfer)
    && (value.revisions === undefined
      || (Array.isArray(value.revisions) && value.revisions.every(isSafeShareRevision)))
    && typeof value.sharedAt === 'number'
    && Number.isFinite(value.sharedAt)
    && (value.locale === undefined || value.locale === 'zh-CN' || value.locale === 'en');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB
    const body = req.body;
    if (!isSafeSharePayload(body)) {
      res.status(400).json({ error: 'Invalid share payload or device-local data included' });
      return;
    }
    const rawBody = JSON.stringify(body);
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }

    const shareId = randomBytes(8).toString('base64url').slice(0, 10);
    const payload = req.body as { messages?: Array<{ images?: Array<{ id: string; path: string; publicUrl?: string }> }> };
    const images = payload.messages?.flatMap(message => message.images ?? []) ?? [];
    if (images.length) {
      const auth = await requireUser(req, res);
      if (!auth) return;
      const copied = new Map<string, string>();
      for (const image of images) {
        if (!image.path.startsWith(`${auth.user.id}/`) || image.path.includes('..')) {
          res.status(403).json({ error: 'Invalid image ownership' }); return;
        }
        let url = copied.get(image.path);
        if (!url) {
          const { data, error } = await auth.supabase.storage.from('chat-images').download(image.path);
          if (error || !data || data.size > 2 * 1024 * 1024) {
            res.status(400).json({ error: 'Image unavailable' }); return;
          }
          const blob = await put(`shares/${shareId}/images/${copied.size}.jpg`, data, { access: 'public', contentType: 'image/jpeg' });
          url = blob.url; copied.set(image.path, url);
        }
        image.publicUrl = url;
      }
    }

    const { url } = await put(`shares/${shareId}.json`, JSON.stringify(payload), {
      access: 'public',
      contentType: 'application/json',
    });

    res.status(200).json({ shareId, url });
    return;
  }

  if (req.method === 'GET') {
    const id = req.query['id'];
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const { blobs } = await list({ prefix: `shares/${id}.json`, limit: 1 });
    if (blobs.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const blobRes = await fetch(blobs[0].url);
    if (!blobRes.ok) {
      res.status(502).json({ error: 'Failed to fetch blob' });
      return;
    }

    const data = await blobRes.json();
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
