import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobNotFoundError, BlobPreconditionFailedError, del, head, put } from '@vercel/blob';
import { waitUntil } from '@vercel/functions';
import maintenanceHandler, { primaryHandler as handler } from '../../api/daily-suggestions-maintain.js';

vi.mock('@vercel/blob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercel/blob')>();
  return { ...actual, del: vi.fn(), head: vi.fn(), put: vi.fn() };
});

vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));

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

  it('dispatches primary and repair triggers to their explicit target dates', async () => {
    vi.mocked(head).mockImplementation(async (pathname) => ({ pathname }) as never);
    const primaryRes = makeRes();
    const repairRes = makeRes();

    await maintenanceHandler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { trigger: 'primary' },
    } as never, primaryRes as never);
    await maintenanceHandler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
      query: { trigger: 'repair' },
    } as never, repairRes as never);

    expect(primaryRes.body).toEqual({ status: 'exists', date: '2026-07-18', attempts: 0 });
    expect(repairRes.body).toEqual({ status: 'exists', date: '2026-07-17', attempts: 0 });
  });

  it('rejects an invalid maintenance trigger', async () => {
    const res = makeRes();

    await maintenanceHandler({ query: { trigger: 'late' } } as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid trigger' });
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
    vi.mocked(put).mockResolvedValue({} as never);
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(res.statusCode).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
    const runCall = vi.mocked(put).mock.calls.find(([pathname]) =>
      pathname === 'daily-suggestions/runs/2026-07-18/primary.json');
    expect(runCall).toBeDefined();
    expect(JSON.parse(runCall?.[1] as string)).toMatchObject({
      date: '2026-07-18',
      trigger: 'primary',
      attempts: 0,
      outcome: 'configuration_error',
      failure: { category: 'configuration' },
    });
  });

  it('returns exists without calling the model when tomorrow is stored', async () => {
    vi.mocked(head).mockResolvedValue({ pathname: 'daily-suggestions/2026-07-18.json' } as never);
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(res.body).toMatchObject({ status: 'exists', date: '2026-07-18', attempts: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a controlled store failure when the final Blob lookup fails', async () => {
    vi.mocked(head).mockRejectedValue(new Error('Blob lookup unavailable'));
    vi.mocked(put).mockResolvedValue({} as never);
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({
      error: 'Failed to claim daily suggestion generation',
      date: '2026-07-18',
    });
    expect(fetch).not.toHaveBeenCalled();
    const runCall = vi.mocked(put).mock.calls.find(([pathname]) =>
      pathname === 'daily-suggestions/runs/2026-07-18/primary.json');
    expect(JSON.parse(runCall?.[1] as string)).toMatchObject({
      attempts: 0,
      outcome: 'store_failed',
      failure: { category: 'store' },
    });
  });

  it('returns a controlled store failure when lock creation fails without a winner', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put)
      .mockRejectedValueOnce(new Error('Blob write unavailable'))
      .mockResolvedValueOnce({} as never);
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({
      error: 'Failed to claim daily suggestion generation',
      date: '2026-07-18',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aborts a stalled lock request so it cannot create a late orphan lock', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    let lockSignal: AbortSignal | undefined;
    let lockCreated = false;
    vi.mocked(put).mockImplementation(async (pathname, _body, options) => {
      if (pathname.includes('/locks/')) {
        lockSignal = options?.abortSignal;
        await new Promise<void>((resolve, reject) => {
          const lateLock = setTimeout(() => {
            lockCreated = true;
            resolve();
          }, 50_001);
          lockSignal?.addEventListener('abort', () => {
            clearTimeout(lateLock);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
        return { etag: 'late-lock' } as never;
      }
      if (pathname.includes('/runs/')) return {} as never;
      throw new Error(`Unexpected Blob path: ${pathname}`);
    });
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.advanceTimersByTimeAsync(50_001);
    await pending;

    expect(lockSignal?.aborted).toBe(true);
    expect(lockCreated).toBe(false);
    expect(res.statusCode).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes a valid model response to tomorrow immutable path', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
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
      expect.objectContaining({
        ifMatch: 'lock-etag',
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(res.body).toMatchObject({ status: 'created', attempts: 1 });
  });

  it('retries invalid output up to five total calls and never stores invalid data', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"items":[]}' } }],
    }), { status: 200 })));
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(put).not.toHaveBeenCalledWith(
      'daily-suggestions/2026-07-18.json',
      expect.anything(),
      expect.anything(),
    );
    expect(res.statusCode).toBe(502);
    expect(del).toHaveBeenCalledWith(
      'daily-suggestions/locks/2026-07-18.lock',
      expect.objectContaining({
        ifMatch: 'lock-etag',
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('waits for a successful winner and returns exists without a second model call', async () => {
    const notFound = new BlobNotFoundError();
    let lockEtag: string | null = null;
    let finalStored = false;
    vi.mocked(head).mockImplementation(async (pathname) => {
      if (pathname.endsWith('.json') && finalStored) return { pathname } as never;
      if (pathname.includes('/locks/') && lockEtag) {
        return { etag: lockEtag, uploadedAt: new Date() } as never;
      }
      throw notFound;
    });
    vi.mocked(put).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) {
        if (lockEtag) throw new BlobPreconditionFailedError();
        lockEtag = 'winner-etag';
        return { etag: lockEtag } as never;
      }
      finalStored = true;
      return {} as never;
    });
    vi.mocked(del).mockImplementation(async (_pathname, options) => {
      if (options?.ifMatch === lockEtag) lockEtag = null;
    });
    let resolveWinner!: (response: Response) => void;
    const winnerResponse = new Promise<Response>((resolve) => { resolveWinner = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(winnerResponse));
    const firstRes = makeRes();
    const secondRes = makeRes();

    const first = handler(authorizedReq() as never, firstRes as never);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = handler(authorizedReq() as never, secondRes as never);
    resolveWinner(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 }));
    await first;
    await vi.advanceTimersByTimeAsync(100);
    await second;

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.body).toEqual({ status: 'exists', date: '2026-07-18', attempts: 0 });
  });

  it('keeps a waiting loser out and lets a later invocation claim after winner failure', async () => {
    const notFound = new BlobNotFoundError();
    let lockEtag: string | null = null;
    let lockNumber = 0;
    let finalStored = false;
    vi.mocked(head).mockImplementation(async (pathname) => {
      if (pathname.endsWith('.json') && finalStored) return { pathname } as never;
      if (pathname.includes('/locks/') && lockEtag) {
        return { etag: lockEtag, uploadedAt: new Date() } as never;
      }
      throw notFound;
    });
    vi.mocked(put).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) {
        if (lockEtag) throw new BlobPreconditionFailedError();
        lockNumber += 1;
        lockEtag = `owner-${lockNumber}`;
        return { etag: lockEtag } as never;
      }
      if (pathname === 'daily-suggestions/2026-07-18.json') {
        finalStored = true;
        return {} as never;
      }
      if (pathname.includes('/runs/')) return {} as never;
      throw new Error(`Unexpected Blob path: ${pathname}`);
    });
    vi.mocked(del).mockImplementation(async (_pathname, options) => {
      if (options?.ifMatch === lockEtag) lockEtag = null;
    });
    const pendingResolvers: Array<(response: Response) => void> = [];
    let activeModelCalls = 0;
    let maxActiveModelCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      activeModelCalls += 1;
      maxActiveModelCalls = Math.max(maxActiveModelCalls, activeModelCalls);
      return new Promise<Response>((resolve) => {
        pendingResolvers.push((response) => {
          activeModelCalls -= 1;
          resolve(response);
        });
      });
    }));
    const winnerRes = makeRes();
    const waitingLoserRes = makeRes();
    const retryRes = makeRes();

    const winner = handler(authorizedReq() as never, winnerRes as never);
    await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
    const waitingLoser = handler(authorizedReq() as never, waitingLoserRes as never);
    const retryBackoffs = [500, 1_000, 2_000, 4_000];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      pendingResolvers.shift()!(new Response('unavailable', { status: 503 }));
      if (attempt < retryBackoffs.length) {
        await vi.advanceTimersByTimeAsync(retryBackoffs[attempt]);
        await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
      }
    }
    await winner;
    await waitingLoser;

    const retry = handler(authorizedReq() as never, retryRes as never);
    await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
    pendingResolvers.shift()!(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 }));
    await retry;

    expect(winnerRes.statusCode).toBe(502);
    expect(waitingLoserRes.statusCode).toBe(503);
    expect(retryRes.body).toMatchObject({ status: 'created', date: '2026-07-18' });
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(maxActiveModelCalls).toBe(1);
  });

  it('returns an error when bounded polling expires with a valid owner', async () => {
    const notFound = new BlobNotFoundError();
    vi.mocked(head).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) {
        return { etag: 'active-owner', uploadedAt: new Date() } as never;
      }
      throw notFound;
    });
    vi.mocked(put).mockRejectedValue(
      new BlobPreconditionFailedError(),
    );
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: 'Daily suggestion generation is still in progress',
      date: '2026-07-18',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('recovers an abandoned lock with an ETag-guarded delete', async () => {
    const notFound = new BlobNotFoundError();
    vi.mocked(head)
      .mockRejectedValueOnce(notFound)
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({
        uploadedAt: new Date('2026-07-17T15:20:00.000Z'),
        etag: 'stale-etag',
      } as never)
      .mockRejectedValueOnce(notFound);
    vi.mocked(put)
      .mockRejectedValueOnce(new BlobPreconditionFailedError())
      .mockResolvedValueOnce({ etag: 'fresh-etag' } as never)
      .mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(del).toHaveBeenNthCalledWith(
      1,
      'daily-suggestions/locks/2026-07-18.lock',
      expect.objectContaining({
        ifMatch: 'stale-etag',
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ status: 'created', date: '2026-07-18' });
  });

  it('categorizes malformed model JSON as invalid output', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{not valid JSON' } }],
      }),
    } as Response));
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(console.info).toHaveBeenNthCalledWith(1, 'daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 1, outcome: 'invalid_output',
    });
    expect(console.info).toHaveBeenNthCalledWith(5, 'daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 5, outcome: 'invalid_output',
    });
  });

  it('logs sanitized attempt outcomes without model content or credentials', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put)
      .mockResolvedValueOnce({ etag: 'lock-etag' } as never)
      .mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('upstream unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ items }) } }],
      }), { status: 200 })));
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

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

  it('retries every upstream HTTP status five total times with exponential backoff', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    const res = makeRes();
    const startedAt = Date.now();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(Date.now() - startedAt).toBe(7_500);
    expect(res.statusCode).toBe(502);
    const runCall = vi.mocked(put).mock.calls.find(([pathname]) =>
      pathname === 'daily-suggestions/runs/2026-07-18/primary.json');
    expect(JSON.parse(runCall?.[1] as string)).toMatchObject({
      date: '2026-07-18',
      trigger: 'primary',
      attempts: 5,
      outcome: 'generation_failed',
      durationMs: 7_500,
      failure: { category: 'http', status: 401 },
    });
  });

  it('adds a correction only after an invalid model output', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put)
      .mockResolvedValueOnce({ etag: 'lock-etag' } as never)
      .mockResolvedValueOnce({} as never);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"items":[]}' } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ items }) } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      messages: Array<{ content: string }>;
    };
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as {
      messages: Array<{ content: string }>;
    };
    expect(JSON.stringify(firstBody.messages)).not.toContain('previous response was invalid');
    expect(JSON.stringify(secondBody.messages)).toContain('previous response was invalid');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.body).toMatchObject({ status: 'created', attempts: 2 });
  });

  it('uses per-call abort signals and stops at the fifty-second generation budget', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (!init?.signal) return Promise.reject(new Error('missing abort signal'));
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    const startedAt = Date.now();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.advanceTimersByTimeAsync(50_000);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every((call) => call[1]?.signal instanceof AbortSignal)).toBe(true);
    expect(Date.now() - startedAt).toBe(50_000);
    expect(res.statusCode).toBe(502);
  });

  it('keeps the per-call timeout active while reading the model response body', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put)
      .mockResolvedValueOnce({ etag: 'lock-etag' } as never)
      .mockResolvedValueOnce({} as never);
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (fetchMock.mock.calls.length > 1) {
        return Promise.resolve(new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items }) } }],
        }), { status: 200 }));
      }
      return Promise.resolve({
        ok: true,
        json: () => new Promise((resolve, reject) => {
          const lateBody = setTimeout(() => resolve({
            choices: [{ message: { content: '{"items":[]}' } }],
          }), 20_001);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(lateBody);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    expect(console.info).toHaveBeenNthCalledWith(1, 'daily_suggestions_generation_attempt', {
      date: '2026-07-18', attempt: 1, outcome: 'upstream_failure',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.body).toMatchObject({ status: 'created', attempts: 2 });
  });

  it('classifies a model response-body transport failure as a network failure', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockResolvedValueOnce({ etag: 'lock-etag' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new TypeError('terminated')),
    } as Response));
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.runAllTimersAsync();
    await pending;

    const runCall = vi.mocked(put).mock.calls.find(([pathname]) =>
      pathname === 'daily-suggestions/runs/2026-07-18/primary.json');
    expect(JSON.parse(runCall?.[1] as string)).toMatchObject({
      outcome: 'generation_failed',
      failure: { category: 'network' },
    });
  });

  it('reuses one valid batch across three Blob write attempts', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    const finalPayloads: string[] = [];
    vi.mocked(put).mockImplementation(async (pathname, body) => {
      if (pathname.includes('/locks/')) return { etag: 'lock-etag' } as never;
      if (pathname === 'daily-suggestions/2026-07-18.json') {
        finalPayloads.push(body as string);
        if (finalPayloads.length < 3) throw new Error('temporary Blob failure');
        return {} as never;
      }
      throw new Error(`Unexpected Blob path: ${pathname}`);
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(finalPayloads).toHaveLength(3);
    expect(new Set(finalPayloads).size).toBe(1);
    expect(res.body).toMatchObject({ status: 'created', attempts: 1 });
  });

  it('bounds a stalled final Blob write before the function timeout', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    let storeSignal: AbortSignal | undefined;
    let batchCreated = false;
    vi.mocked(put).mockImplementation(async (pathname, _body, options) => {
      if (pathname.includes('/locks/')) return { etag: 'lock-etag' } as never;
      if (pathname === 'daily-suggestions/2026-07-18.json') {
        storeSignal = options?.abortSignal;
        await new Promise<void>((resolve, reject) => {
          const lateBatch = setTimeout(() => {
            batchCreated = true;
            resolve();
          }, 56_001);
          storeSignal?.addEventListener('abort', () => {
            clearTimeout(lateBatch);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
        return {} as never;
      }
      if (pathname.includes('/runs/')) return {} as never;
      throw new Error(`Unexpected Blob path: ${pathname}`);
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ items }) } }],
      }),
    } as Response));
    const res = makeRes();
    const startedAt = Date.now();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.advanceTimersByTimeAsync(56_001);
    await pending;

    expect(Date.now() - startedAt).toBe(56_001);
    expect(storeSignal?.aborted).toBe(true);
    expect(batchCreated).toBe(false);
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      error: 'Failed to store daily suggestions',
      date: '2026-07-18',
    });
  });

  it('stores a sanitized primary run record', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) return { etag: 'lock-etag' } as never;
      return {} as never;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    const runCall = vi.mocked(put).mock.calls.find(([pathname]) =>
      pathname === 'daily-suggestions/runs/2026-07-18/primary.json');
    expect(runCall).toBeDefined();
    expect(runCall?.[2]).toEqual(expect.objectContaining({
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    }));
    const record = JSON.parse(runCall?.[1] as string);
    expect(record).toMatchObject({
      date: '2026-07-18',
      trigger: 'primary',
      attempts: 1,
      outcome: 'created',
      durationMs: 0,
    });
    expect(record.startedAt).toBe('2026-07-17T15:30:00.000Z');
    expect(record.finishedAt).toBe('2026-07-17T15:30:00.000Z');
    const serializedRecord = JSON.stringify(record);
    expect(serializedRecord).not.toContain('official-api-key');
    expect(serializedRecord).not.toContain(items[0].zh);
    expect(res.body).toMatchObject({ status: 'created', attempts: 1 });
  });

  it('keeps a created response when the best-effort run record write fails', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) return { etag: 'lock-etag' } as never;
      if (pathname === 'daily-suggestions/2026-07-18.json') return {} as never;
      if (pathname.includes('/runs/')) throw new Error('run record unavailable');
      throw new Error(`Unexpected Blob path: ${pathname}`);
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);
    await vi.mocked(waitUntil).mock.calls.at(-1)?.[0];

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'created', date: '2026-07-18', attempts: 1 });
    expect(console.error).toHaveBeenCalledWith('daily_suggestions_run_record_failed', {
      date: '2026-07-18',
      trigger: 'primary',
    });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain('run record unavailable');
    expect(logged).not.toContain('official-api-key');
  });

  it('sends the successful response without waiting for the run record write', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    let finishRunRecord!: () => void;
    vi.mocked(put).mockImplementation(async (pathname) => {
      if (pathname.includes('/locks/')) return { etag: 'lock-etag' } as never;
      if (pathname === 'daily-suggestions/2026-07-18.json') return {} as never;
      if (pathname.includes('/runs/')) {
        await new Promise<void>((resolve) => { finishRunRecord = resolve; });
        return {} as never;
      }
      throw new Error(`Unexpected Blob path: ${pathname}`);
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    const pending = handler(authorizedReq() as never, res as never);
    await vi.waitFor(() => expect(put).toHaveBeenCalledWith(
      'daily-suggestions/runs/2026-07-18/primary.json',
      expect.any(String),
      expect.any(Object),
    ));
    const statusBeforeRunRecordFinished = res.statusCode;
    finishRunRecord();
    await pending;

    expect(statusBeforeRunRecordFinished).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
