import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/v1/chat/completions';
const KIMI_CHAT_COMPLETIONS_URL = 'https://api.moonshot.cn/v1/chat/completions';

function resolveOfficialApiKey(): string {
  return process.env.OFFICIAL_API_KEY || process.env.VITE_API_KEY || '';
}

function boundedString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, 300) : undefined;
}

function summarizeUpstreamError(body: string): {
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(body) as {
      error?: { type?: unknown; code?: unknown; message?: unknown };
    };
    return {
      errorType: boundedString(parsed.error?.type),
      errorCode: boundedString(parsed.error?.code),
      errorMessage: boundedString(parsed.error?.message),
    };
  } catch {
    return {};
  }
}

async function writeStream(response: Response, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', response.headers.get('content-type') || 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) res.write(tail);
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const isKimi = req.query?.provider === 'kimi';
  const kimiAuthorization = req.headers.authorization;
  if (isKimi && (typeof kimiAuthorization !== 'string' || !kimiAuthorization.startsWith('Bearer '))) {
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  const apiKey = isKimi ? '' : resolveOfficialApiKey();
  if (!isKimi && !apiKey) {
    res.status(500).json({ error: 'OFFICIAL_API_KEY or VITE_API_KEY is not configured' });
    return;
  }

  try {
    const upstream = await fetch(isKimi ? KIMI_CHAT_COMPLETIONS_URL : DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: isKimi ? kimiAuthorization as string : `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body ?? {}),
    });

    if (!upstream.ok) {
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const errorBody = await upstream.text();
      console.error(`[${isKimi ? 'kimi' : 'official'}-proxy] Upstream request failed`, {
        status: upstream.status,
        contentType,
        requestId: upstream.headers.get('x-request-id'),
        ...summarizeUpstreamError(errorBody),
      });
      res.setHeader('Content-Type', contentType);
      res.status(upstream.status).end(errorBody);
      return;
    }

    if (req.body && typeof req.body === 'object' && 'stream' in req.body && req.body.stream) {
      await writeStream(upstream, res);
      return;
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(upstream.status).end(await upstream.text());
  } catch (_error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(502).json({ error: isKimi ? 'Kimi provider request failed' : 'Official provider request failed' });
  }
}
