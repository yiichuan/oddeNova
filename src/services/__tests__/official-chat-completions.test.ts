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
    sentHeaders: {},
    chunks: [],
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
    delete process.env.VITE_API_KEY;
  });

  it('returns 405 for non-POST requests', async () => {
    const res = makeRes();

    await handler(makeReq('GET'), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(405);
    expect(res.jsonBody).toEqual({ error: 'Method not allowed' });
  });

  it('returns 500 when no official key fallback is configured', async () => {
    const res = makeRes();

    await handler(makeReq('POST', { stream: false }), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(500);
    expect(res.jsonBody).toEqual({ error: 'OFFICIAL_API_KEY or VITE_API_KEY is not configured' });
  });

  it('prefers OFFICIAL_API_KEY over VITE_API_KEY', async () => {
    process.env.OFFICIAL_API_KEY = 'sk-official';
    process.env.VITE_API_KEY = 'sk-vite';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{"ok":true}'),
    }));

    await handler(makeReq('POST', { stream: false }), makeRes() as unknown as VercelResponse);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-official' }),
      }),
    );
  });

  it('falls back to VITE_API_KEY when OFFICIAL_API_KEY is unavailable', async () => {
    process.env.VITE_API_KEY = 'sk-vite';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{"ok":true}'),
    }));

    await handler(makeReq('POST', { stream: false }), makeRes() as unknown as VercelResponse);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-vite' }),
      }),
    );
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

    await handler(makeReq('POST', { stream: true }), res as unknown as VercelResponse);

    expect(res.sentHeaders['content-type']).toBe('text/event-stream');
    expect(res.chunks.join('')).toContain('data: {"ok":true}');
  });

  it('preserves and safely logs an upstream error for streaming requests', async () => {
    process.env.OFFICIAL_API_KEY = 'sk-official';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorBody = JSON.stringify({
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        code: 'rate_limit',
      },
      private_detail: 'must not be logged',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'req-123',
      }),
      text: () => Promise.resolve(errorBody),
    }));
    const res = makeRes();

    await handler(makeReq('POST', {
      stream: true,
      messages: [{ role: 'user', content: 'private prompt' }],
    }), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(429);
    expect(res.sentHeaders['content-type']).toBe('application/json');
    expect(res.chunks.join('')).toBe(errorBody);
    expect(consoleError).toHaveBeenCalledWith('[official-proxy] Upstream request failed', {
      status: 429,
      contentType: 'application/json',
      requestId: 'req-123',
      errorType: 'rate_limit_error',
      errorCode: 'rate_limit',
      errorMessage: 'Rate limit reached',
    });
    consoleError.mockRestore();
  });
});
