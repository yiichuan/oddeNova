import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/official/v1/chat/completions';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function makeReq(method: string, body?: unknown): VercelRequest {
  return { method, body, headers: {} } as VercelRequest;
}

interface TestResponse {
  statusCodeValue?: number;
  jsonBody?: unknown;
  sentHeaders: Record<string, string>;
  chunks: unknown[];
  status: (code: number) => TestResponse;
  json: (body: unknown) => TestResponse;
  setHeader: (name: string, value: string) => TestResponse;
  write: (chunk: unknown) => boolean;
  end: (chunk?: unknown) => TestResponse;
}

function makeRes(): TestResponse {
  const res: TestResponse = {
    sentHeaders: {} as Record<string, string>,
    chunks: [] as unknown[],
    status(code: number) {
      this.statusCodeValue = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.sentHeaders[name.toLowerCase()] = value;
      return this;
    },
    write(chunk: unknown) {
      this.chunks.push(chunk);
      return true;
    },
    end(chunk?: unknown) {
      if (chunk) this.chunks.push(chunk);
      return this;
    },
  };
  return res;
}

describe('/api/official/v1/chat/completions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.OFFICIAL_API_KEY;
  });

  it('returns 405 for non-POST requests', async () => {
    const res = makeRes();

    await handler(makeReq('GET'), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(405);
    expect(res.jsonBody).toEqual({ error: 'Method not allowed' });
  });

  it('returns 500 when OFFICIAL_API_KEY is missing', async () => {
    const res = makeRes();

    await handler(makeReq('POST', { stream: false }), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(500);
    expect(res.jsonBody).toEqual({ error: 'OFFICIAL_API_KEY is not configured' });
  });

  it('proxies streaming responses as text/event-stream', async () => {
    process.env.OFFICIAL_API_KEY = 'sk-official';
    const upstream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"ok":true}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: upstream,
    }));
    const res = makeRes();

    await handler(makeReq('POST', { stream: true, model: 'deepseek-v4-pro' }), res as unknown as VercelResponse);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-official',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(res.sentHeaders['content-type']).toBe('text/event-stream');
    expect(res.chunks.join('')).toContain('data: {"ok":true}');
  });
});
