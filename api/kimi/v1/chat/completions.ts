import type { VercelRequest, VercelResponse } from '@vercel/node';

const KIMI_CHAT_COMPLETIONS_URL = 'https://api.moonshot.cn/v1/chat/completions';

async function writeUpstreamResponse(response: Response, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  const requestId = response.headers.get('x-request-id');
  if (requestId) res.setHeader('x-request-id', requestId);

  res.status(response.status);
  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const upstream = await fetch(KIMI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body,
    });
    await writeUpstreamResponse(upstream, res);
  } catch {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(502).json({ error: 'Kimi provider request failed' });
  }
}
