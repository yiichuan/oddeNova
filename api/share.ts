import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import { randomBytes } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB
    const rawBody = JSON.stringify(req.body);
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }

    const shareId = randomBytes(8).toString('base64url').slice(0, 10);
    const payload = req.body as object;

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
