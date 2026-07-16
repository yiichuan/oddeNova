import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { del, list } from '@vercel/blob';
import handler from './cleanup';

vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

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

const request = { headers: { authorization: 'Bearer cron-secret' } };

describe('cleanup handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-18T04:00:00.000Z');
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.CRON_SECRET = 'cron-secret';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('paginates both jobs, keeps 30 Beijing dates, and ignores malformed daily paths', async () => {
    vi.mocked(list).mockImplementation(async ({ prefix, cursor }) => {
      if (prefix === 'shares/' && !cursor) {
        return {
          blobs: [{ pathname: 'shares/old', url: 'https://blob/old-share', uploadedAt: new Date('2026-06-17T00:00:00.000Z') }],
          cursor: 'shares-next',
        } as never;
      }
      if (prefix === 'shares/' && cursor === 'shares-next') {
        return {
          blobs: [{ pathname: 'shares/new', url: 'https://blob/new-share', uploadedAt: new Date('2026-07-17T00:00:00.000Z') }],
        } as never;
      }
      if (prefix === 'daily-suggestions/' && !cursor) {
        return {
          blobs: [
            { pathname: 'daily-suggestions/2026-06-19.json', url: 'https://blob/retained', uploadedAt: new Date() },
            { pathname: 'daily-suggestions/not-a-date.json', url: 'https://blob/malformed', uploadedAt: new Date() },
          ],
          cursor: 'daily-next',
        } as never;
      }
      return {
        blobs: [{ pathname: 'daily-suggestions/2026-06-18.json', url: 'https://blob/expired', uploadedAt: new Date() }],
      } as never;
    });
    const res = makeRes();

    await handler(request as never, res as never);

    expect(list).toHaveBeenCalledWith({ prefix: 'shares/', cursor: undefined, limit: 1000 });
    expect(list).toHaveBeenCalledWith({ prefix: 'shares/', cursor: 'shares-next', limit: 1000 });
    expect(list).toHaveBeenCalledWith({ prefix: 'daily-suggestions/', cursor: undefined, limit: 1000 });
    expect(list).toHaveBeenCalledWith({ prefix: 'daily-suggestions/', cursor: 'daily-next', limit: 1000 });
    expect(del).toHaveBeenCalledWith(['https://blob/old-share']);
    expect(del).toHaveBeenCalledWith(['https://blob/expired']);
    expect(del).not.toHaveBeenCalledWith(expect.arrayContaining(['https://blob/retained', 'https://blob/malformed']));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: 1, dailySuggestionsDeleted: 1, errors: [] });
  });

  it('continues daily cleanup when share listing fails', async () => {
    vi.mocked(list).mockImplementation(async ({ prefix }) => {
      if (prefix === 'shares/') throw new Error('share listing failed');
      return {
        blobs: [{ pathname: 'daily-suggestions/2026-06-18.json', url: 'https://blob/expired', uploadedAt: new Date() }],
      } as never;
    });
    const res = makeRes();

    await handler(request as never, res as never);

    expect(list).toHaveBeenCalledWith({ prefix: 'daily-suggestions/', cursor: undefined, limit: 1000 });
    expect(del).toHaveBeenCalledWith(['https://blob/expired']);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ deleted: 0, dailySuggestionsDeleted: 1, errors: ['shares'] });
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the Cron secret is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = makeRes();

    await handler({ headers: { authorization: 'Bearer undefined' } } as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });
});
