import { describe, expect, it } from 'vitest';
import {
  addDateDays,
  beijingDate,
  dailySuggestionPath,
  dailySuggestionRunPath,
  expiredDailySuggestionCleanup,
  expiredDailySuggestionUrls,
  parseGeneratedItems,
  parseStoredBatch,
  readCandidateDates,
  secondsUntilNextBeijingMidnight,
  tomorrowInBeijing,
} from '../../api/daily-suggestions-core.js';

const items = Array.from({ length: 10 }, (_, i) => ({
  zh: `想做一段第${i + 1}种有呼吸感的电子音乐`,
  en: `I want electronic idea number ${i + 1} with a breathing pulse`,
}));

describe('daily suggestion server contract', () => {
  it('uses Beijing dates across the UTC boundary', () => {
    const now = new Date('2026-07-16T16:30:00.000Z');
    expect(beijingDate(now)).toBe('2026-07-17');
    expect(tomorrowInBeijing(now)).toBe('2026-07-18');
    expect(secondsUntilNextBeijingMidnight(now)).toBe(84_600);
  });

  it('does calendar-safe date arithmetic and deterministic paths', () => {
    expect(addDateDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dailySuggestionPath('2026-07-18')).toBe('daily-suggestions/2026-07-18.json');
    expect(dailySuggestionRunPath('2026-07-18', 'primary'))
      .toBe('daily-suggestions/runs/2026-07-18/primary.json');
    expect(dailySuggestionRunPath('2026-07-18', 'repair'))
      .toBe('daily-suggestions/runs/2026-07-18/repair.json');
    expect(readCandidateDates('2026-07-18')).toHaveLength(8);
    expect(readCandidateDates('2026-07-18').at(-1)).toBe('2026-07-11');
  });

  it('accepts exactly ten unique bilingual generated items', () => {
    expect(parseGeneratedItems({ items })).toEqual(items);
    expect(parseGeneratedItems({ items: items.slice(0, 9) })).toBeNull();
    expect(parseGeneratedItems({ items: [...items.slice(0, 9), items[0]] })).toBeNull();
    expect(parseGeneratedItems({ items: [{ zh: '- 列表项', en: 'A valid English phrase' }, ...items.slice(1)] })).toBeNull();
  });

  it('requires the stored date and ISO generation timestamp', () => {
    const batch = { date: '2026-07-18', generatedAt: '2026-07-17T15:30:00.000Z', items };
    expect(parseStoredBatch(batch, '2026-07-18')).toEqual(batch);
    expect(parseStoredBatch(batch, '2026-07-19')).toBeNull();
    expect(parseStoredBatch({ ...batch, generatedAt: '2026-07-17' }, '2026-07-18')).toBeNull();
    expect(parseStoredBatch({ ...batch, generatedAt: 'July 17, 2026 15:30 UTC' }, '2026-07-18')).toBeNull();
  });

  it('keeps 30 dates and ignores malformed paths', () => {
    const blobs = [
      { pathname: 'daily-suggestions/2026-06-18.json', url: 'old' },
      { pathname: 'daily-suggestions/2026-06-19.json', url: 'keep' },
      { pathname: 'daily-suggestions/2026-00-00.json', url: 'impossible' },
      { pathname: 'daily-suggestions/not-a-date.json', url: 'unknown' },
    ];
    expect(expiredDailySuggestionUrls(blobs, '2026-07-18')).toEqual(['old']);
  });

  it('expires only well-formed daily locks older than 24 hours', () => {
    const now = new Date('2026-07-18T04:00:00.000Z');
    const blobs = [
      { pathname: 'daily-suggestions/locks/2026-07-18.lock', url: 'old-lock', etag: 'old-etag', uploadedAt: new Date('2026-07-17T03:59:59.000Z') },
      { pathname: 'daily-suggestions/locks/2026-07-19.lock', url: 'recent-lock', etag: 'recent-etag', uploadedAt: new Date('2026-07-17T04:00:01.000Z') },
      { pathname: 'daily-suggestions/locks/not-a-date.lock', url: 'malformed-lock', etag: 'malformed-etag', uploadedAt: new Date('2026-07-01T00:00:00.000Z') },
      { pathname: 'daily-suggestions/locks/2026-00-00.lock', url: 'impossible-lock', etag: 'impossible-etag', uploadedAt: new Date('2026-07-01T00:00:00.000Z') },
    ];

    expect(expiredDailySuggestionCleanup(blobs, '2026-07-18', now)).toEqual({
      batchUrls: [],
      runUrls: [],
      locks: [{ url: 'old-lock', etag: 'old-etag' }],
    });
  });

  it('keeps 30 dates of well-formed primary and repair run records', () => {
    const blobs = [
      { pathname: 'daily-suggestions/runs/2026-06-18/primary.json', url: 'old-primary' },
      { pathname: 'daily-suggestions/runs/2026-06-18/repair.json', url: 'old-repair' },
      { pathname: 'daily-suggestions/runs/2026-06-19/primary.json', url: 'keep-primary' },
      { pathname: 'daily-suggestions/runs/2026-00-00/repair.json', url: 'impossible' },
      { pathname: 'daily-suggestions/runs/2026-06-18/unknown.json', url: 'unknown-trigger' },
      { pathname: 'daily-suggestions/runs/not-a-date/primary.json', url: 'unknown-date' },
    ];

    expect(expiredDailySuggestionCleanup(blobs, '2026-07-18')).toEqual({
      batchUrls: [],
      runUrls: ['old-primary', 'old-repair'],
      locks: [],
    });
  });
});
