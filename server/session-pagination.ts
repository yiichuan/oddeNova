import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  type FavoriteSummary,
  type SessionSummary,
} from '../shared/session-api.js';
import { isUuid, toEpochMillis, type SessionRow } from './session-utils.js';

export interface SessionCursor {
  sortValue: string;
  id: string;
}

const POSTGRES_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function isValidSessionCursor(cursor: unknown): cursor is SessionCursor {
  if (!cursor || typeof cursor !== 'object') return false;
  const candidate = cursor as Record<string, unknown>;
  return Object.keys(candidate).every((key) => key === 'v' || key === 'sortValue' || key === 'id')
    && candidate.v === 1
    && typeof candidate.sortValue === 'string'
    && POSTGRES_TIMESTAMPTZ.test(candidate.sortValue)
    && typeof candidate.id === 'string'
    && isUuid(candidate.id);
}

export function parsePageLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_LIMIT;

  if (!/^\d+$/.test(value)) {
    throw new Error('Invalid limit');
  }

  const limit = Number(value);
  if (limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new Error('Invalid limit');
  }

  return limit;
}

export function encodeSessionCursor(cursor: SessionCursor): string {
  if (!isValidSessionCursor({ ...cursor, v: 1 })) {
    throw new Error('Invalid cursor');
  }

  return Buffer.from(JSON.stringify({
    v: 1,
    sortValue: cursor.sortValue,
    id: cursor.id,
  }), 'utf8').toString('base64url');
}

export function decodeSessionCursor(value: string): SessionCursor {
  try {
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid cursor');
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!isValidSessionCursor(decoded)) throw new Error('Invalid cursor');
    return {
      sortValue: decoded.sortValue,
      id: decoded.id,
    };
  } catch {
    throw new Error('Invalid cursor');
  }
}

export function rowToSessionSummary(
  row: Pick<SessionRow, 'id' | 'title' | 'updated_at'>,
): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: toEpochMillis(row.updated_at),
  };
}

export function rowToFavoriteSummary(
  row: Pick<SessionRow, 'id' | 'title' | 'updated_at' | 'favorited_at'>,
): FavoriteSummary {
  if (row.favorited_at == null) throw new Error('Invalid favorite row');
  return {
    ...rowToSessionSummary(row),
    favoritedAt: toEpochMillis(row.favorited_at),
  };
}
