import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import { renderShareHtml } from '../src/services/share-page-meta';
import type { SharePayload } from '../src/services/share';

const FALLBACK_APP_SHELL = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="" />
    <meta property="og:title" content="" />
    <meta property="og:description" content="" />
    <meta property="og:url" content="" />
    <meta property="og:image" content="" />
    <meta name="twitter:title" content="" />
    <meta name="twitter:description" content="" />
    <meta name="twitter:image" content="" />
    <title>oddeNova</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

function getRequestOrigin(req: VercelRequest): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0];
  const host = req.headers.host;
  return `${proto}://${host}`;
}

async function fetchAppShell(origin: string): Promise<string> {
  try {
    const indexRes = await fetch(`${origin}/`);
    if (indexRes.ok) {
      return indexRes.text();
    }
    console.error(`[share-page] Failed to fetch app shell: ${indexRes.status}`);
  } catch (error) {
    console.error('[share-page] Failed to fetch app shell', error);
  }
  return FALLBACK_APP_SHELL;
}

async function sendShareHtml(
  req: VercelRequest,
  res: VercelResponse,
  id: string,
  locale?: SharePayload['locale'],
) {
  const origin = getRequestOrigin(req);
  const html = renderShareHtml(await fetchAppShell(origin), {
    locale,
    url: `${origin}/s/${encodeURIComponent(id)}`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  res.status(200).send(html);
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

  let blobs: Awaited<ReturnType<typeof list>>['blobs'];
  try {
    ({ blobs } = await list({ prefix: `shares/${id}.json`, limit: 1 }));
  } catch (error) {
    console.error('[share-page] Failed to lookup share blob', error);
    await sendShareHtml(req, res, id);
    return;
  }

  if (blobs.length === 0) {
    res.status(404).send('Not found');
    return;
  }

  const blobRes = await fetch(blobs[0].url);
  if (!blobRes.ok) {
    console.error(`[share-page] Failed to fetch share blob: ${blobRes.status}`);
    await sendShareHtml(req, res, id);
    return;
  }

  let payload: SharePayload;
  try {
    payload = (await blobRes.json()) as SharePayload;
  } catch (error) {
    console.error('[share-page] Failed to parse share blob', error);
    await sendShareHtml(req, res, id);
    return;
  }

  await sendShareHtml(req, res, id, payload.locale);
}
