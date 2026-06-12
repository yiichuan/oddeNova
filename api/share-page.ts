import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import { renderShareHtml } from '../src/services/share-page-meta';
import type { SharePayload } from '../src/services/share';

function getRequestOrigin(req: VercelRequest): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0];
  const host = req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const id = req.query['id'];
  if (!id || typeof id !== 'string') {
    res.status(400).send('Missing id');
    return;
  }

  const { blobs } = await list({ prefix: `shares/${id}.json`, limit: 1 });
  if (blobs.length === 0) {
    res.status(404).send('Not found');
    return;
  }

  const blobRes = await fetch(blobs[0].url);
  if (!blobRes.ok) {
    res.status(502).send('Failed to fetch share');
    return;
  }

  const payload = (await blobRes.json()) as SharePayload;
  const origin = getRequestOrigin(req);
  const indexRes = await fetch(`${origin}/`);
  if (!indexRes.ok) {
    res.status(502).send('Failed to fetch app shell');
    return;
  }

  const html = renderShareHtml(await indexRes.text(), {
    locale: payload.locale,
    url: `${origin}/s/${encodeURIComponent(id)}`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  res.status(200).send(html);
}
