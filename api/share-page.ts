import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';

const DEFAULT_CARD_TITLE = 'oddeNova 即兴音乐创作';
const DEFAULT_CARD_DESCRIPTION =
  'oddeNova是一款即兴音乐制作agent。你如何vibe coding，就如何vibe一支属于你自己的单曲。让灵感，自由发声。';
const DEFAULT_CARD_IMAGE = 'https://oddenova.com/oddenova-og.png';

interface SharePayload {
  title?: string;
  code?: string;
  messages?: Array<{ role?: string; content?: string }>;
  card?: {
    title?: string;
    description?: string;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function deriveCard(payload: SharePayload): { title: string; description: string } {
  const cardTitle = normalizeText(payload.card?.title ?? '');
  const cardDescription = normalizeText(payload.card?.description ?? '');
  if (cardTitle && cardDescription) {
    return {
      title: truncate(cardTitle, 80),
      description: truncate(cardDescription, 160),
    };
  }

  const firstUser = payload.messages?.find((m) => m.role === 'user')?.content ?? '';
  const firstAssistant = payload.messages?.find((m) => m.role === 'assistant')?.content ?? '';
  const titleSource = cleanText(payload.title ?? '') || cleanText(firstUser || firstAssistant);
  const descriptionSource =
    cleanText(firstUser) ||
    cleanText(firstAssistant) ||
    cleanText(payload.code ?? '');

  return {
    title: titleSource ? `${truncate(titleSource, 42)} | oddeNova` : DEFAULT_CARD_TITLE,
    description: descriptionSource
      ? truncate(`听听这段用 oddeNova 生成的即兴音乐：${descriptionSource}`, 110)
      : DEFAULT_CARD_DESCRIPTION,
  };
}

function getBaseUrl(req: VercelRequest): string {
  const host = req.headers.host ?? 'oddenova.com';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return `${proto || 'https'}://${host}`;
}

export function buildSharePageHtml(params: {
  id: string;
  payload: SharePayload;
  baseUrl: string;
}): string {
  const { title, description } = deriveCard(params.payload);
  const shareUrl = `${params.baseUrl}/s/${encodeURIComponent(params.id)}`;
  const importUrl = `/?share=${encodeURIComponent(params.id)}`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:site_name" content="oddeNova" />
    <meta property="og:image" content="${DEFAULT_CARD_IMAGE}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${DEFAULT_CARD_IMAGE}" />
    <script>location.replace(${JSON.stringify(importUrl)});</script>
  </head>
  <body>
    <p>正在打开 oddeNova 分享内容...</p>
    <p><a href="${escapeHtml(importUrl)}">如果没有自动跳转，请点击这里</a></p>
  </body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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

  const payload = await blobRes.json() as SharePayload;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(buildSharePageHtml({
    id,
    payload,
    baseUrl: getBaseUrl(req),
  }));
}
