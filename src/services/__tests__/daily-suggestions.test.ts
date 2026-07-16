import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDailySuggestions, pickSuggestions } from '../daily-suggestions';

const items = Array.from({ length: 10 }, (_, index) => ({
  zh: ` 中文提示${index} `,
  en: ` English suggestion ${index} `,
}));

describe('fetchDailySuggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('projects a valid daily batch into the active language', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      requestedDate: '2026-07-18',
      sourceDate: '2026-07-18',
      items,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDailySuggestions(true)).resolves.toEqual(
      items.map((item) => item.zh.trim()),
    );
    await expect(fetchDailySuggestions(false)).resolves.toEqual(
      items.map((item) => item.en.trim()),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/daily-suggestions', { signal: undefined });
  });

  it.each([
    ['a non-OK response', new Response('unavailable', { status: 503 })],
    ['a payload without dates', new Response(JSON.stringify({ items }), { status: 200 })],
    ['a payload without exactly ten items', new Response(JSON.stringify({
      requestedDate: '2026-07-18',
      sourceDate: '2026-07-18',
      items: items.slice(0, 9),
    }), { status: 200 })],
    ['a payload with an empty translation', new Response(JSON.stringify({
      requestedDate: '2026-07-18',
      sourceDate: '2026-07-18',
      items: [{ zh: ' ', en: 'missing' }, ...items.slice(1)],
    }), { status: 200 })],
  ])('returns null for %s', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(fetchDailySuggestions(true)).resolves.toBeNull();
  });

  it('returns null when the request or JSON parsing fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    await expect(fetchDailySuggestions(true)).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));
    await expect(fetchDailySuggestions(true)).resolves.toBeNull();
  });

  it('passes the abort signal to fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestedDate: '2026-07-18',
      sourceDate: '2026-07-18',
      items,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchDailySuggestions(true, controller.signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/daily-suggestions', { signal: controller.signal });
  });
});

describe('pickSuggestions', () => {
  it('selects at most five unique values without mutating the pool', () => {
    const pool = ['0', '1', '2', '2', '3', '4', '5', '6', '7', '8', '9'];
    const original = [...pool];

    const selected = pickSuggestions(pool, 5, () => 0.5);

    expect(selected).toHaveLength(5);
    expect(new Set(selected)).toHaveLength(5);
    expect(selected.every((value) => pool.includes(value))).toBe(true);
    expect(pool).toEqual(original);
  });

  it('returns all available unique values when the limit exceeds the pool', () => {
    expect(pickSuggestions(['one', 'one', 'two'], 5, () => 0)).toHaveLength(2);
  });

  it('enforces the global maximum when the requested limit exceeds five', () => {
    const pool = Array.from({ length: 10 }, (_, index) => String(index));

    expect(pickSuggestions(pool, 10, () => 0)).toHaveLength(5);
  });

  it('returns no values when the requested limit is negative', () => {
    const pool = Array.from({ length: 10 }, (_, index) => String(index));

    expect(pickSuggestions(pool, -2, () => 0)).toEqual([]);
  });
});
