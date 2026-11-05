import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Same-origin passthrough for VCSL's sample files (GET /api/vcsl?path=<path>).
 *
 * GitHub's raw host sends every file with
 * `Content-Disposition: attachment; filename=<the file's path>`, unquoted, and
 * Chrome reads a path with a comma in it as two such headers and refuses the
 * response outright (ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION). VCSL
 * names many of its folders "Snare Drum, Rope Tension"-style, so the browser
 * can never fetch those sounds directly. Here the file is fetched server-side,
 * where nothing objects to the header, and streamed back without it.
 *
 * Only this one repository and only .wav files: it is a fix for one upstream
 * header, not a general proxy. Responses are marked cacheable for a year so
 * the CDN answers repeat requests — the files at a path never change.
 *
 * Shared by the Vercel function (api/vcsl.ts) and the Vite dev server.
 */

export const VCSL_UPSTREAM = 'https://raw.githubusercontent.com/sgossner/VCSL/master/';
export const VCSL_PROXY_BASE = '/api/vcsl?path=';

/* A relative path as the sample index writes it: percent-escapes and plain
   path characters, slash-separated, ending in .wav. Nothing that could start
   a query, a fragment or a second URL. */
const SAFE_PATH = /^(?:[A-Za-z0-9._~!$'()*+,;=:@-]|%[0-9A-Fa-f]{2})+(?:\/(?:[A-Za-z0-9._~!$'()*+,;=:@-]|%[0-9A-Fa-f]{2})+)*\.wav$/i;

/**
 * The upstream address a proxy request asks for, or null when it is not a
 * VCSL .wav path.
 *
 * Read from the raw query rather than through URLSearchParams: the path is
 * already escaped the way the upstream wants it, and decoding it here would
 * turn a `+` in a file name into a space.
 */
export function vcslUpstreamUrl(requestUrl: string): string | null {
  const queryAt = requestUrl.indexOf('?');
  if (queryAt < 0) return null;
  const query = requestUrl.slice(queryAt + 1);
  if (!query.startsWith('path=')) return null;
  const path = query.slice('path='.length);
  if (!SAFE_PATH.test(path)) return null;
  const segments = path.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return null;
    }
  });
  if (segments.some((segment) => segment === null || segment === '.' || segment === '..')) return null;
  return VCSL_UPSTREAM + path;
}

/**
 * `fetchUpstream` is the global fetch, in production and in dev alike (the
 * Vite dev server routes that through the developer's HTTP proxy); tests
 * hand in their own.
 */
export async function vcslProxyHandler(
  req: IncomingMessage,
  res: ServerResponse,
  fetchUpstream: typeof fetch = fetch,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const upstreamUrl = vcslUpstreamUrl(req.url ?? '');
  if (!upstreamUrl) {
    res.statusCode = 400;
    res.end();
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(upstreamUrl, { method: req.method });
  } catch {
    res.statusCode = 502;
    res.end();
    return;
  }

  res.statusCode = upstream.status;
  if (!upstream.ok) {
    res.setHeader('Cache-Control', 'no-store');
    res.end();
    return;
  }
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/wav');
  const length = upstream.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  if (req.method === 'HEAD' || !upstream.body) {
    res.end();
    return;
  }
  /* Streamed rather than buffered: the pianos' takes run to several
     megabytes each, past what a function may hold as one response body. */
  await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream), res);
}
