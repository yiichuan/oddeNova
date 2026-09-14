import type { IncomingMessage, ServerResponse } from 'node:http';

const PRIVACY_PATHS = new Set(['/privacy', '/privacy/']);

// Exact /privacy paths only — the Vercel rewrite for the same paths is not
// visible to Vite, so dev and preview servers get this small alias instead of
// a copy of the routing table. GET/HEAD only; every other path and method
// falls through untouched. `next()` is called exactly once, whether or not
// the URL was rewritten, so the downstream HTML handler always sees the
// request. The query string is preserved verbatim.
export function privacyRouteMiddleware(
  req: IncomingMessage,
  _res: ServerResponse,
  next: () => void,
): void {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const url = req.url ?? '';
    const queryIndex = url.indexOf('?');
    const pathname = queryIndex < 0 ? url : url.slice(0, queryIndex);
    if (PRIVACY_PATHS.has(pathname)) {
      const search = queryIndex < 0 ? '' : url.slice(queryIndex);
      req.url = `/privacy.html${search}`;
    }
  }
  next();
}
