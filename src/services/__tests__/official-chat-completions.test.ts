import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/official/v1/chat/completions';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function makeReq(
  method: string,
  body?: unknown,
  query: VercelRequest['query'] = {},
  headers: VercelRequest['headers'] = {},
): VercelRequest {
  return { method, body, query, headers } as VercelRequest;
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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.restoreAllMocks();
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

  const imageRequest = {
    model: 'deepseek-flash',
    messages: [
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://storage.test/signed' } }] },
      { role: 'user', content: 'Read this score' },
    ],
    thinking: { type: 'enabled' },
    tools: [{ type: 'function', function: { name: 'commit' } }],
    stream: true,
  };

  it('verifies image requests and calls OpenRouter without native WebSocket', async () => {
    vi.stubGlobal('WebSocket', undefined);
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-vision');
    vi.stubEnv('OPENROUTER_VISION_MODEL', 'qwen/vision-test');
    vi.stubEnv('SUPABASE_URL', 'https://auth.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
    const upstream = JSON.stringify({ choices: [{ message: { content: 'A sheet score' } }] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-id' }))
      .mockResolvedValueOnce(new Response(upstream, { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq('POST', imageRequest, {}, { authorization: 'Bearer user-token' }),
      res as unknown as VercelResponse);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://auth.test/auth/v1/user', expect.objectContaining({
      headers: expect.objectContaining({ apikey: 'anon-test', Authorization: 'Bearer user-token' }),
    }));
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request.headers.Authorization).toBe('Bearer sk-vision');
    expect(JSON.parse(request.body)).toEqual({
      model: 'qwen/vision-test',
      messages: [
        { role: 'system', content: expect.stringContaining('For sheet music') },
        ...imageRequest.messages,
      ],
      max_tokens: 16384,
      stream: false,
    });
    expect(res.chunks.join('')).toBe(upstream);
  });

  it.each([
    { primary: 'openai/gpt-6.2-sol', status: 403, fallbackStatus: 200, expectedStatus: 200 },
    { primary: 'openai/gpt-6.2-sol', status: 403, fallbackStatus: 403, expectedStatus: 403 },
    { primary: 'openai/gpt-6.2-sol', status: 429, fallbackStatus: null, expectedStatus: 429 },
    { primary: 'qwen/qwen4-max', status: 403, fallbackStatus: null, expectedStatus: 403 },
  ])('handles $status from $primary with fallback status $fallbackStatus', async ({ primary, status, fallbackStatus, expectedStatus }) => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-vision');
    vi.stubEnv('OPENROUTER_VISION_MODEL', primary);
    vi.stubEnv('SUPABASE_URL', 'https://auth.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-id' }))
      .mockResolvedValueOnce(Response.json({ error: { code: status } }, { status }));
    if (fallbackStatus !== null) {
      fetchMock.mockResolvedValueOnce(Response.json(
        fallbackStatus === 200 ? { choices: [{ message: { content: 'A sheet score' } }] } : { error: { code: fallbackStatus } },
        { status: fallbackStatus },
      ));
    }
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq('POST', imageRequest, {}, { authorization: 'Bearer user-token' }),
      res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(expectedStatus);
    expect(fetchMock).toHaveBeenCalledTimes(fallbackStatus === null ? 2 : 3);
    const primaryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(primaryBody.model).toBe(primary);
    if (fallbackStatus !== null) {
      const [url, request] = fetchMock.mock.calls[2];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(JSON.parse(request.body)).toEqual({ ...primaryBody, model: 'qwen/qwen4-max' });
    }
    if (expectedStatus === 200) expect(res.chunks.join('')).toContain('A sheet score');
  });

  it('reports the OpenRouter failure stage without logging signed image URLs', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-vision');
    vi.stubEnv('SUPABASE_URL', 'https://auth.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-id' }))
      .mockRejectedValueOnce(new Error('https://storage.test/signed', { cause: { code: 'ECONNRESET' } })));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();

    await handler(makeReq('POST', imageRequest, {}, { authorization: 'Bearer user-token' }),
      res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(502);
    expect(res.jsonBody).toMatchObject({ code: 'VISION_UPSTREAM_UNAVAILABLE' });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[openrouter-proxy] Vision request failed', {
      stage: 'request', code: 'ECONNRESET',
    });
  });

  it('does not spend the OpenRouter key on unsigned requests', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-vision');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await handler(makeReq('POST', imageRequest), res as unknown as VercelResponse);
    expect(res.statusCodeValue).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes Kimi requests to Moonshot with the user Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{"ok":true}'),
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq(
      'POST',
      { stream: false },
      { provider: 'kimi' },
      { authorization: 'Bearer sk-kimi' },
    ), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.cn/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-kimi' }),
      }),
    );
  });

  it('requires a user Bearer token for Kimi requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq('POST', { stream: true }, { provider: 'kimi' }), res as unknown as VercelResponse);

    expect(res.statusCodeValue).toBe(401);
    expect(res.jsonBody).toEqual({ error: 'Missing Bearer token' });
    expect(fetchMock).not.toHaveBeenCalled();
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
