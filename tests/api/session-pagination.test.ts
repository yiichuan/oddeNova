import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../../shared/session-api';
import {
  decodeSessionCursor,
  encodeSessionCursor,
  parsePageLimit,
} from '../../server/session-pagination';

describe('session pagination contract', () => {
  it('uses the bounded default page size and rejects invalid limits', () => {
    expect(DEFAULT_PAGE_LIMIT).toBe(20);
    expect(MAX_PAGE_LIMIT).toBe(50);
    expect(parsePageLimit(undefined)).toBe(20);
    expect(() => parsePageLimit('0')).toThrow('Invalid limit');
    expect(() => parsePageLimit('51')).toThrow('Invalid limit');
    expect(() => parsePageLimit('2.5')).toThrow('Invalid limit');
  });

  it('round-trips the database timestamp string without losing precision', () => {
    const cursor = {
      sortValue: '2026-08-30T10:11:12.123456+00:00',
      id: '00000000-0000-4000-8000-000000000001',
    };

    expect(decodeSessionCursor(encodeSessionCursor(cursor))).toEqual(cursor);
  });

  it('rejects malformed and legacy cursors', () => {
    const encodedWithLegacyId = Buffer.from(JSON.stringify({
      v: 1,
      sortValue: '2026-08-30T10:11:12.123456+00:00',
      id: 's-1786465556711-wi5as4',
    })).toString('base64url');

    expect(() => decodeSessionCursor('not-a-cursor')).toThrow('Invalid cursor');
    expect(() => decodeSessionCursor(encodedWithLegacyId)).toThrow('Invalid cursor');
  });
});
