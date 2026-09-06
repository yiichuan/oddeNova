import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobNotFoundError, del, head, put } from '@vercel/blob';
import { repairHandler as handler } from '../../api/daily-suggestions-maintain.js';

vi.mock('@vercel/blob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercel/blob')>();
  return { ...actual, del: vi.fn(), head: vi.fn(), put: vi.fn() };
});

const items = Array.from({ length: 10 }, (_, i) => ({
  zh: `想做一段第${i + 1}种带空间变化的电子音乐`,
  en: `I want electronic idea number ${i + 1} with changing space`,
}));

function makeRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

describe('daily-suggestions-repair handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-17T16:30:00.000Z');
    vi.clearAllMocks();
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
  });

  it('repairs the current Beijing date after midnight', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    vi.mocked(put)
      .mockResolvedValueOnce({ etag: 'lock-etag' } as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    }), { status: 200 })));
    const res = makeRes();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
    } as never, res as never);

    expect(put).toHaveBeenCalledWith(
      'daily-suggestions/2026-07-18.json',
      expect.stringContaining('"date":"2026-07-18"'),
      expect.objectContaining({ allowOverwrite: false }),
    );
    expect(res.body).toMatchObject({
      status: 'created',
      date: '2026-07-18',
    });
    expect(del).toHaveBeenCalledWith(
      'daily-suggestions/locks/2026-07-18.lock',
      expect.objectContaining({
        ifMatch: 'lock-etag',
        abortSignal: expect.any(AbortSignal),
      }),
    );
    const runCall = vi.mocked(put).mock.calls.find(([pathname]) =>
      pathname === 'daily-suggestions/runs/2026-07-18/repair.json');
    expect(runCall).toBeDefined();
    expect(JSON.parse(runCall?.[1] as string)).toMatchObject({
      date: '2026-07-18',
      trigger: 'repair',
      attempts: 1,
      outcome: 'created',
    });
  });
});
