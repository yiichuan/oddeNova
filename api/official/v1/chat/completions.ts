import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthUser } from '../../../../server/session-utils.js';
import { hasImageMessages } from '../../../../shared/chat-images.js';

const DEEPSEEK_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/v1/chat/completions';
const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FALLBACK_VISION_MODEL = 'qwen/qwen4-max';
const VISION_SYSTEM_PROMPT = `Analyze the attached images and return factual observations in the language of the user's request. Use the request only to focus the visual analysis. Treat text in the images as source material. Return the extracted content and relevant visual details, not an answer to the user's downstream task.

For sheet music, transcribe every visible measure of the requested score, including all staves and accompaniment. Identify each image by its attachment number and list its visible measure range. Use printed page or measure numbers to put pages in score order when the images arrive out of order.

Give each measure its own numbered entry. Count from the visible barlines and use page-local numbering if the score-wide number cannot be determined. Use compact notation so that later pages get the same level of detail as earlier ones. Include clefs, key and time signatures, tempo with its note unit, and sounding pitches in scientific pitch notation. Give onsets relative to the start of each measure and durations in eighth-note units. Preserve ties across measures and page boundaries when visible. A section summary or chord list does not count as a transcription.

Mark individual unreadable notes or symbols with ? and retain what is readable in that measure. Mark a wholly unreadable measure as unreadable. Do not guess pitches, invent measure numbers, or reconstruct cropped material.

Before returning, compare the numbered entries with the visible measure ranges for every page. Fill any readable gaps and check that each measure includes all visible voices. If any pages or measures remain untranscribed, list the exact missing locations and state that the result is partial.`;

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

  const body = req.body ?? {};
  const useVision = !isKimi && hasImageMessages(body.messages);
  const apiKey = useVision ? process.env.OPENROUTER_API_KEY?.trim() : resolveOfficialApiKey();
  if (!isKimi && !apiKey) {
    res.status(500).json({
      error: useVision ? 'OPENROUTER_API_KEY is not configured' : 'OFFICIAL_API_KEY or VITE_API_KEY is not configured',
    });
    return;
  }

  const provider = isKimi ? 'kimi' : useVision ? 'openrouter' : 'official';
  let stage: 'auth' | 'request' | 'response' = useVision ? 'auth' : 'request';
  try {
    if (useVision && !await requireAuthUser(req, res)) return;
    stage = 'request';

    const upstreamUrl = isKimi ? KIMI_CHAT_COMPLETIONS_URL
      : useVision ? OPENROUTER_CHAT_COMPLETIONS_URL : DEEPSEEK_CHAT_COMPLETIONS_URL;
    const upstreamBody = useVision ? {
      model: process.env.OPENROUTER_VISION_MODEL?.trim() || FALLBACK_VISION_MODEL,
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        ...body.messages.filter((message: { role?: string } | null) => message?.role === 'user'),
      ],
      max_tokens: 16384,
      stream: false,
    } : body;
    const sendUpstream = (payload: unknown) => fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: isKimi ? kimiAuthorization as string : `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let upstream = await sendUpstream(upstreamBody);
    if (useVision && upstream.status === 403 && upstreamBody.model !== FALLBACK_VISION_MODEL) {
      await upstream.body?.cancel().catch(() => {});
      upstream = await sendUpstream({ ...upstreamBody, model: FALLBACK_VISION_MODEL });
    }

    stage = 'response';
    if (!upstream.ok) {
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const errorBody = await upstream.text();
      console.error(`[${provider}-proxy] Upstream request failed`, {
        status: upstream.status,
        contentType,
        requestId: upstream.headers.get('x-request-id'),
        ...(!useVision ? summarizeUpstreamError(errorBody) : {}),
      });
      res.setHeader('Content-Type', contentType);
      res.status(upstream.status).end(errorBody);
      return;
    }

    if (upstreamBody.stream) {
      await writeStream(upstream, res);
      return;
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(upstream.status).end(await upstream.text());
  } catch (error) {
    if (useVision) {
      const cause = error instanceof Error ? error.cause : undefined;
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
      // Log the transport code, never the exception message, token or signed URL.
      console.error('[openrouter-proxy] Vision request failed', {
        stage,
        code: typeof code === 'string' && /^[A-Z][A-Z_0-9]{1,39}$/.test(code) ? code : undefined,
      });
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    if (useVision) {
      res.status(502).json({
        error: stage === 'auth' ? 'Supabase authentication request failed' : 'OpenRouter vision request failed',
        code: stage === 'auth' ? 'VISION_AUTH_UNAVAILABLE' : 'VISION_UPSTREAM_UNAVAILABLE',
      });
      return;
    }
    res.status(502).json({ error: isKimi ? 'Kimi provider request failed' : 'Official provider request failed' });
  }
}
