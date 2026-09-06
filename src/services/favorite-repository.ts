import { DEFAULT_PAGE_LIMIT, type CursorPage, type FavoriteSummary, type SessionSummary } from '../../shared/session-api';
import type { Session } from '../hooks/useSessions';
import {
  requestJson,
  type CloudSessionListOptions,
} from './cloud-session-repository';

export type CloudFavoriteListOptions = CloudSessionListOptions;

export async function listCloudFavoriteSummaries(
  options: CloudFavoriteListOptions = {},
): Promise<CursorPage<FavoriteSummary>> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_PAGE_LIMIT),
  });
  if (options.cursor) params.set('cursor', options.cursor);
  return requestJson<CursorPage<FavoriteSummary>>(
    `/api/favorites?${params.toString()}`,
    { method: 'GET', ...(options.signal ? { signal: options.signal } : {}) },
    options.expectedUserId,
  );
}

export async function favoriteCloudSession(
  id: string,
  expectedUserId?: string,
): Promise<FavoriteSummary> {
  const body = await requestJson<{ favorite: FavoriteSummary }>(
    `/api/favorites/${encodeURIComponent(id)}`,
    { method: 'PUT' },
    expectedUserId,
  );
  return body.favorite;
}

export async function unfavoriteCloudSession(
  id: string,
  expectedUserId?: string,
): Promise<SessionSummary> {
  const body = await requestJson<{ session: SessionSummary }>(
    `/api/favorites/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    expectedUserId,
  );
  return body.session;
}

export async function continueCloudFavorite(
  id: string,
  code: string,
  expectedUserId?: string,
): Promise<Session> {
  const body = await requestJson<{ session: Session }>(
    `/api/favorites/${encodeURIComponent(id)}/continue`,
    {
      method: 'POST',
      body: JSON.stringify({ code }),
    },
    expectedUserId,
  );
  return body.session;
}
