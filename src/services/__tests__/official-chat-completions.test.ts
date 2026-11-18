import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/official/v1/chat/completions';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const supabaseGetUser = vi.hoisted(() => vi.fn());

// These HTTP-only tests should not initialize Supabase Realtime on Node 20.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: supabaseGetUser } }),
}));

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
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    supabaseGetUser.mockReset();
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

  it('runs image requests as a standalone OpenRouter analysis with a server key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-vision');
    vi.stubEnv('OPENROUTER_VISION_MODEL', 'qwen/vision-test');
    vi.stubEnv('SUPABASE_URL', 'https://auth.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
    const upstream = JSON.stringify({ choices: [{ message: { content: 'A sheet score' } }] });
    supabaseGetUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(upstream, { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    await handler(makeReq('POST', imageRequest, {}, { authorization: 'Bearer user-token' }),
      res as unknown as VercelResponse);

    expect(supabaseGetUser).toHaveBeenCalledWith('user-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
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

  it('reports the OpenRouter failure stage without logging signed image URLs', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-vision');
    vi.stubEnv('SUPABASE_URL', 'https://auth.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test');
    supabaseGetUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null });
    vi.stubGlobal('fetch', vi.fn()
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
