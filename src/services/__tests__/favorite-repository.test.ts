import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn<(_expectedUserId?: string) => Promise<string | null>>(),
}));

vi.mock('../auth-service', () => ({
  getAccessToken: authMocks.getAccessToken,
}));

const favoriteId = '00000000-0000-4000-8000-000000000001';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: favoriteId,
    title: 'Favorite',
    messages: [],
    code: 's("bd")',
    createdAt: 1,
    updatedAt: 2,
    favoritedAt: 3,
    ...overrides,
  };
}

describe('favorite-repository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.getAccessToken.mockReset();
  });

  it('loads favorite summaries from the independent favorites endpoint', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    const body = {
      items: [{ id: favoriteId, title: 'Favorite', updatedAt: 2, favoritedAt: 3 }],
      nextCursor: null,
    };
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse(body));

    const { listCloudFavoriteSummaries } = await import('../favorite-repository');
    await expect(listCloudFavoriteSummaries({ limit: 20, expectedUserId: 'user-1' })).resolves.toEqual(body);

    expect(fetch).toHaveBeenCalledWith('/api/favorites?limit=20', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('passes the abort signal through the favorite summary request', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
    const controller = new AbortController();

    const { listCloudFavoriteSummaries } = await import('../favorite-repository');
    await listCloudFavoriteSummaries({ expectedUserId: 'user-1', signal: controller.signal });

    expect(fetch).toHaveBeenCalledWith('/api/favorites?limit=20', {
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('sends idempotent favorite and unfavorite writes to the favorites endpoint', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    const favorite = { id: favoriteId, title: 'Favorite', updatedAt: 2, favoritedAt: 3 };
    const unfavorited = { id: favoriteId, title: 'Favorite', updatedAt: 2 };
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ favorite }))
      .mockResolvedValueOnce(jsonResponse({ session: unfavorited }));

    const { favoriteCloudSession, unfavoriteCloudSession } = await import('../favorite-repository');
    await expect(favoriteCloudSession(favoriteId, 'user-1')).resolves.toEqual(favorite);
    await expect(unfavoriteCloudSession(favoriteId, 'user-1')).resolves.toEqual(unfavorited);

    expect(fetch).toHaveBeenNthCalledWith(1, `/api/favorites/${favoriteId}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer token-123' },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, `/api/favorites/${favoriteId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('continues a favorite through the favorites URL with the selected code', async () => {
    authMocks.getAccessToken.mockResolvedValue('token-123');
    const continued = session({ id: '00000000-0000-4000-8000-000000000002', favoritedAt: undefined });
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ session: continued }, 201));

    const { continueCloudFavorite } = await import('../favorite-repository');
    await expect(continueCloudFavorite(favoriteId, 's("hh")', 'user-1')).resolves.toEqual(continued);

    expect(fetch).toHaveBeenCalledWith(`/api/favorites/${favoriteId}/continue`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 's("hh")' }),
    });
  });

  it('throws before making a request when the account token is missing', async () => {
    authMocks.getAccessToken.mockResolvedValue(null);
    global.fetch = vi.fn();

    const { listCloudFavoriteSummaries } = await import('../favorite-repository');
    await expect(listCloudFavoriteSummaries({ expectedUserId: 'user-1' })).rejects.toThrow('Not signed in');
    expect(fetch).not.toHaveBeenCalled();
  });
});
