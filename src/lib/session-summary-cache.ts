import type { FavoriteSummary, SessionSummary } from '../../shared/session-api';
import { readSetting, writeSetting } from './session-storage';

/**
 * The history and favorites lists as this device last saw them.
 *
 * The lists themselves are cloud-owned — the summary a request returns is the
 * authority on what is online. What this holds is the answer to the same
 * request from last time, so the panels can be drawn on something the moment
 * they are opened instead of on a spinner, and the request that follows
 * corrects them. Summaries are three fields wide; a page of them is a few
 * kilobytes, and stale ones cost nothing but a title that changes under a
 * conversation nobody has opened yet.
 */
export interface CachedSummaries {
  history: SessionSummary[];
  favorites: FavoriteSummary[];
}

/**
 * Only ever as many as one page of each. Beyond that the cache would be
 * remembering a scroll the user has to redo anyway, since paging past the
 * first page always goes to the network for its cursor.
 */
const CACHE_LIMIT = 20;

function cacheKey(ownerKey: string): string {
  return `summaryCache:${ownerKey}`;
}

function isSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionSummary>;
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.updatedAt === 'number';
}

function isFavoriteSummary(value: unknown): value is FavoriteSummary {
  return isSummary(value)
    && typeof (value as Partial<FavoriteSummary>).favoritedAt === 'number';
}

export async function readSummaryCache(ownerKey: string): Promise<CachedSummaries | null> {
  const raw = await readSetting(cacheKey(ownerKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedSummaries>;
    const history = Array.isArray(parsed.history) ? parsed.history.filter(isSummary) : [];
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.filter(isFavoriteSummary)
      : [];
    if (history.length === 0 && favorites.length === 0) return null;
    return { history, favorites };
  } catch {
    // A cache that cannot be read is a cache that isn't there.
    return null;
  }
}

export async function writeSummaryCache(
  ownerKey: string,
  value: CachedSummaries,
): Promise<void> {
  await writeSetting(cacheKey(ownerKey), JSON.stringify({
    history: value.history.slice(0, CACHE_LIMIT),
    favorites: value.favorites.slice(0, CACHE_LIMIT),
  } satisfies CachedSummaries));
}
