import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { head } from '@vercel/blob';
import handler from '../../api/daily-suggestions.js';

vi.mock('@vercel/blob', () => ({ head: vi.fn() }));

const items = Array.from({ length: 10 }, (_, i) => ({
  zh: `想做一段第${i + 1}种有呼吸感的电子音乐`,
  en: `I want electronic idea number ${i + 1} with a breathing pulse`,
}));

function batch(date: string) {
  return { date, generatedAt: '2026-07-17T15:30:00.000Z', items };
}

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

describe('daily-suggestions handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-17T16:30:00.000Z');
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('falls back from a missing today batch to yesterday', async () => {
    vi.mocked(head)
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ url: 'https://blob/yesterday.json' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(batch('2026-07-17')), { status: 200 })));
    const res = makeRes();

    await handler({ method: 'GET' } as never, res as never);

    expect(head).toHaveBeenNthCalledWith(1, 'daily-suggestions/2026-07-18.json');
    expect(head).toHaveBeenNthCalledWith(2, 'daily-suggestions/2026-07-17.json');
    expect(res.body).toMatchObject({ requestedDate: '2026-07-18', sourceDate: '2026-07-17' });
    expect(res.headers['Vercel-CDN-Cache-Control']).toMatch(/^public, max-age=/);
    expect(res.headers['Cache-Control']).toBe('public, max-age=300');
  });

  it('returns a valid today batch without checking older dates', async () => {
    vi.mocked(head).mockResolvedValue({ url: 'https://blob/today.json' } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(batch('2026-07-18')), { status: 200 })));
    const res = makeRes();

    await handler({ method: 'GET' } as never, res as never);

    expect(head).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ requestedDate: '2026-07-18', sourceDate: '2026-07-18', items });
  });

  it('restarts a pending lookup when Beijing midnight changes the requested date', async () => {
    vi.setSystemTime('2026-07-17T15:59:59.900Z');
    let resolveOldFetch!: (response: Response) => void;
    let resolveNewFetch!: (response: Response) => void;
    const oldFetch = new Promise<Response>((resolve) => { resolveOldFetch = resolve; });
    const newFetch = new Promise<Response>((resolve) => { resolveNewFetch = resolve; });
    vi.mocked(head)
      .mockResolvedValueOnce({ url: 'https://blob/old-today.json' } as never)
      .mockResolvedValueOnce({ url: 'https://blob/new-today.json' } as never);
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(oldFetch)
      .mockReturnValueOnce(newFetch));
    const res = makeRes();

    const pending = handler({ method: 'GET' } as never, res as never);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    vi.setSystemTime('2026-07-17T16:00:00.100Z');
    resolveOldFetch(new Response(JSON.stringify(batch('2026-07-17')), { status: 200 }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    vi.setSystemTime('2026-07-18T15:59:59.100Z');
    resolveNewFetch(new Response(JSON.stringify(batch('2026-07-18')), { status: 200 }));
    await pending;

    expect(head).toHaveBeenNthCalledWith(1, 'daily-suggestions/2026-07-17.json');
    expect(head).toHaveBeenNthCalledWith(2, 'daily-suggestions/2026-07-18.json');
    expect(res.body).toEqual({ requestedDate: '2026-07-18', sourceDate: '2026-07-18', items });
    expect(res.headers['Cache-Control']).toBe('public, max-age=1');
    expect(res.headers['Vercel-CDN-Cache-Control']).toBe('public, max-age=1');
  });

  it('falls through a corrupt today batch to the previous date', async () => {
    vi.mocked(head)
      .mockResolvedValueOnce({ url: 'https://blob/today.json' } as never)
      .mockResolvedValueOnce({ url: 'https://blob/yesterday.json' } as never);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...batch('2026-07-18'), items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(batch('2026-07-17')), { status: 200 })));
    const res = makeRes();

    await handler({ method: 'GET' } as never, res as never);

    expect(head).toHaveBeenCalledTimes(2);
    expect(res.body).toMatchObject({ requestedDate: '2026-07-18', sourceDate: '2026-07-17' });
  });

  it('rejects non-GET requests', async () => {
    const res = makeRes();

    await handler({ method: 'POST' } as never, res as never);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
    expect(head).not.toHaveBeenCalled();
  });

  it('returns a briefly cached 503 after all eight candidates miss', async () => {
    vi.mocked(head).mockRejectedValue(new Error('not found'));
    const res = makeRes();

    await handler({ method: 'GET' } as never, res as never);

    expect(head).toHaveBeenCalledTimes(8);
    expect(head).toHaveBeenLastCalledWith('daily-suggestions/2026-07-11.json');
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Daily suggestions unavailable', requestedDate: '2026-07-18' });
    expect(res.headers['Cache-Control']).toBe('public, max-age=60');
    expect(res.headers['Vercel-CDN-Cache-Control']).toBe('public, max-age=300');
  });
});
