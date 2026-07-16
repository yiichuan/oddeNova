import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { del, head, put } from '@vercel/blob';
import handler from './daily-suggestions-generate';

vi.mock('@vercel/blob', () => ({ del: vi.fn(), head: vi.fn(), put: vi.fn() }));

const items = Array.from({ length: 10 }, (_, i) => ({
  zh: `想做一段第${i + 1}种带空间变化的电子音乐`,
  en: `I want electronic idea number ${i + 1} with changing space`,
}));

function makeRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string | number | readonly string[]>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers[name] = value;
      return this;
    },
  };
}

function authorizedReq() {
  return { method: 'GET', headers: { authorization: 'Bearer cron-secret' } };
}

describe('daily-suggestions-generate handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-17T15:30:00.000Z');
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.VITE_API_KEY;
    process.env.CRON_SECRET = 'cron-secret';
    process.env.OFFICIAL_API_KEY = 'official-api-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.OFFICIAL_API_KEY;
    delete process.env.VITE_API_KEY;
  });

  it('rejects a request without the Cron bearer token', async () => {
    const res = makeRes();

    await handler({ method: 'GET', headers: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects Bearer undefined when the Cron secret is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = makeRes();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer undefined' },
    } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not use the client Vite API key for server-side generation', async () => {
    delete process.env.OFFICIAL_API_KEY;
    process.env.VITE_API_KEY = 'client-api-key';
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns exists without calling the model when tomorrow is stored', async () => {
    vi.mocked(head).mockResolvedValue({ pathname: 'daily-suggestions/2026-07-18.json' } as never);
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(res.body).toMatchObject({ status: 'exists', date: '2026-07-18', attempts: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes a valid model response to tomorrow immutable path', async () => {
    vi.mocked(head).mockRejectedValue(Object.assign(new Error('not found'), { name: 'BlobNotFoundError' }));
    vi.mocked(put)
      .mockResolvedValueOnce({ etag: 'lock-etag' } as never)
      .mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(put).toHaveBeenCalledWith(
      'daily-suggestions/2026-07-18.json',
      expect.stringContaining('"date":"2026-07-18"'),
      expect.objectContaining({ access: 'public', addRandomSuffix: false }),
    );
    expect(del).toHaveBeenCalledWith(
      'daily-suggestions/locks/2026-07-18.lock',
      { ifMatch: 'lock-etag' },
    );
    expect(res.body).toMatchObject({ status: 'created', attempts: 1 });
  });

  it('retries invalid output once and never stores invalid data', async () => {
    vi.mocked(head).mockRejectedValue(Object.assign(new Error('not found'), { name: 'BlobNotFoundError' }));
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"items":[]}' } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalledWith(
      'daily-suggestions/2026-07-18.json',
      expect.anything(),
      expect.anything(),
    );
    expect(res.statusCode).toBe(502);
    expect(del).toHaveBeenCalledWith(
      'daily-suggestions/locks/2026-07-18.lock',
      { ifMatch: 'lock-etag' },
    );
  });

  it('atomically claims a date so two concurrent handlers call the model at most once', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'BlobNotFoundError' });
    vi.mocked(head).mockRejectedValue(notFound);
    let lockClaimed = false;
    vi.mocked(put).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) {
        if (lockClaimed) throw Object.assign(new Error('already exists'), { name: 'BlobPreconditionFailedError' });
        lockClaimed = true;
        return { etag: 'winner-etag' } as never;
      }
      return {} as never;
    });
    let resolveModel!: (response: Response) => void;
    const modelResponse = new Promise<Response>((resolve) => { resolveModel = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(modelResponse));
    const firstRes = makeRes();
    const secondRes = makeRes();

    const first = handler(authorizedReq() as never, firstRes as never);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await handler(authorizedReq() as never, secondRes as never);
    resolveModel(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 }));
    await first;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(secondRes.statusCode).toBe(202);
    expect(secondRes.body).toEqual({ status: 'in-progress', date: '2026-07-18', attempts: 0 });
  });

  it('recovers an abandoned lock with an ETag-guarded delete', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'BlobNotFoundError' });
    vi.mocked(head)
      .mockRejectedValueOnce(notFound)
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({
        uploadedAt: new Date('2026-07-17T15:20:00.000Z'),
        etag: 'stale-etag',
      } as never);
    vi.mocked(put)
      .mockRejectedValueOnce(Object.assign(new Error('already exists'), { name: 'BlobPreconditionFailedError' }))
      .mockResolvedValueOnce({ etag: 'fresh-etag' } as never)
      .mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(del).toHaveBeenNthCalledWith(
      1,
      'daily-suggestions/locks/2026-07-18.lock',
      { ifMatch: 'stale-etag' },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ status: 'created', date: '2026-07-18' });
  });

  it('categorizes malformed model JSON as invalid output', async () => {
    vi.mocked(head).mockRejectedValue(Object.assign(new Error('not found'), { name: 'BlobNotFoundError' }));
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{not valid JSON' } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(console.info).toHaveBeenNthCalledWith(1, 'daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 1, outcome: 'invalid_output',
    });
    expect(console.info).toHaveBeenNthCalledWith(2, 'daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 2, outcome: 'invalid_output',
    });
  });

  it('logs sanitized attempt outcomes without model content or credentials', async () => {
    vi.mocked(head).mockRejectedValue(Object.assign(new Error('not found'), { name: 'BlobNotFoundError' }));
    vi.mocked(put)
      .mockResolvedValueOnce({ etag: 'lock-etag' } as never)
      .mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('upstream unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ items }) } }],
      }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(console.info).toHaveBeenCalledWith('daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 1, outcome: 'upstream_failure',
    });
    expect(console.info).toHaveBeenCalledWith('daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 2, outcome: 'stored',
    });
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain('official-api-key');
    expect(logged).not.toContain(items[0].zh);
  });
});
