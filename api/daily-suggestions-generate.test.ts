import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { head, put } from '@vercel/blob';
import handler from './daily-suggestions-generate';

vi.mock('@vercel/blob', () => ({ head: vi.fn(), put: vi.fn() }));

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
    process.env.CRON_SECRET = 'cron-secret';
    process.env.OFFICIAL_API_KEY = 'official-api-key';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    delete process.env.OFFICIAL_API_KEY;
  });

  it('rejects a request without the Cron bearer token', async () => {
    const res = makeRes();

    await handler({ method: 'GET', headers: {} } as never, res as never);

    expect(res.statusCode).toBe(401);
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
    expect(res.body).toMatchObject({ status: 'created', attempts: 1 });
  });

  it('retries invalid output once and never stores invalid data', async () => {
    vi.mocked(head).mockRejectedValue(Object.assign(new Error('not found'), { name: 'BlobNotFoundError' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"items":[]}' } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler(authorizedReq() as never, res as never);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
  });
});
