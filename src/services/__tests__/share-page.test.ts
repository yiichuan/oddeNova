import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { buildSharePageHtml } from '../../../api/share-page';
import { list } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({
  list: vi.fn(),
}));

function makeReq(method: string, query: Record<string, string> = {}): VercelRequest {
  return {
    method,
    query,
    headers: {
      host: 'www.oddenova.com',
      'x-forwarded-proto': 'https',
    },
  } as unknown as VercelRequest;
}

interface TestResponse {
  statusCodeValue?: number;
  jsonBody?: unknown;
  sentBody?: string;
  sentHeaders: Record<string, string>;
  status: (code: number) => TestResponse;
  json: (body: unknown) => TestResponse;
  send: (body: string) => TestResponse;
  setHeader: (name: string, value: string) => TestResponse;
}

function makeRes(): TestResponse {
  const res: TestResponse = {
    sentHeaders: {},
    status(code: number) {
      this.statusCodeValue = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
    send(body: string) {
      this.sentBody = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.sentHeaders[name.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

describe('buildSharePageHtml', () => {
  it('renders dynamic Open Graph and Twitter metadata with escaped content', () => {
    const html = buildSharePageHtml({
      id: 'abc123',
      baseUrl: 'https://www.oddenova.com',
      payload: {
        card: {
          title: 'Rain & "Bass" <demo>',
          description: 'A <deep> share & preview',
        },
      },
    });

    expect(html).toContain('content="Rain &amp; &quot;Bass&quot; &lt;demo&gt;"');
    expect(html).toContain('content="A &lt;deep&gt; share &amp; preview"');
    expect(html).toContain('property="og:url" content="https://www.oddenova.com/s/abc123"');
    expect(html).toContain('location.replace("/?share=abc123")');
  });
});

describe('/api/share-page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns a dynamic HTML share card page', async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [{ url: 'https://blob.example/share.json' }],
      hasMore: false,
    } as Awaited<ReturnType<typeof list>>);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        card: {
          title: '雨夜城市 | oddeNova',
          description: '听听这段用 oddeNova 生成的即兴音乐',
        },
      }),
    } as Response);
    const res = makeRes();

    await handler(makeReq('GET', { id: 'abc123' }), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(200);
    expect(res.sentHeaders['content-type']).toBe('text/html; charset=utf-8');
    expect(res.sentBody).toContain('雨夜城市 | oddeNova');
    expect(res.sentBody).toContain('/?share=abc123');
  });

  it('returns 404 when the share payload does not exist', async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [],
      hasMore: false,
    } as Awaited<ReturnType<typeof list>>);
    const res = makeRes();

    await handler(makeReq('GET', { id: 'missing' }), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(404);
    expect(res.jsonBody).toEqual({ error: 'Not found' });
  });
});
