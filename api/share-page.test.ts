import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './share-page';
import { list } from '@vercel/blob';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('@vercel/blob', () => ({
  list: vi.fn(),
}));

const appShell = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta name="description" content="old description" />
    <meta property="og:title" content="old title" />
    <meta property="og:description" content="old og description" />
    <meta property="og:url" content="https://oddenova.com/" />
    <meta property="og:image" content="https://oddenova.com/old.png" />
    <meta name="twitter:title" content="old twitter title" />
    <meta name="twitter:description" content="old twitter description" />
    <meta name="twitter:image" content="https://oddenova.com/old.png" />
    <title>old page title</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

function makeResponse() {
  return {
    statusCode: 0,
    body: '',
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: string) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

describe('share-page handler', () => {
  beforeEach(() => {
    vi.mocked(list).mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(appShell, { status: 200 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders fallback share HTML when blob lookup fails', async () => {
    vi.mocked(list).mockRejectedValue(new Error('missing blob token'));
    const res = makeResponse();

    await handler({
      method: 'GET',
      query: { id: 'abc123' },
      headers: { host: 'www.oddenova.com', 'x-forwarded-proto': 'https' },
    } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('property="og:url" content="https://www.oddenova.com/s/abc123"');
    expect(res.body).toContain('property="og:image" content="https://www.oddenova.com/oddenova-og.png?v=c1189f30"');
    expect(res.body).toContain('name="twitter:image" content="https://www.oddenova.com/oddenova-og.png?v=c1189f30"');
    expect(res.body).toContain('content="oddeNova | Vibe Your Music, Live"');
  });

  it('does not depend on client src modules at runtime', () => {
    const source = readFileSync(fileURLToPath(new URL('./share-page.ts', import.meta.url)), 'utf8');

    expect(source).not.toContain('../src/');
  });
});
