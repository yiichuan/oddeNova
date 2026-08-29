import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudFavorite, listCloudFavorites } from '../favorite-repository';

vi.mock('../auth-service', () => ({
  getAccessToken: vi.fn(async () => 'token'),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('favorite repository', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads immutable detail snapshots and preserves their source session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        favorites: [{
          id: 'favorite-1',
          sourceSessionId: 'session-1',
          title: 'Saved',
          createdAt: 100,
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        favorite: {
          id: 'favorite-1',
          sourceSessionId: 'session-1',
          title: 'Saved',
          createdAt: 100,
          code: 's("bd, hh")',
          messages: [
            { id: 'u-1', role: 'user', content: '写一段', timestamp: 1 },
            { id: 'a-1', role: 'assistant', content: '第一版', code: 's("bd")', timestamp: 2 },
          ],
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const [favorite] = await listCloudFavorites('user-1');

    expect(favorite).toEqual(expect.objectContaining({
      id: 'favorite-1',
      sourceSessionId: 'session-1',
      sessionId: 'session-1',
      code: 's("bd, hh")',
    }));
    expect(favorite.turns).toEqual([
      { id: 'u-1', role: 'user', text: '写一段' },
      { id: 'a-1', role: 'assistant', text: '第一版', code: 's("bd")' },
    ]);
  });

  it('creates a favorite from the checkpointed source session and fetches its snapshot', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        favorite: { id: 'favorite-1', sourceSessionId: 'session-1', title: 'Saved', createdAt: 100 },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        favorite: {
          id: 'favorite-1',
          sourceSessionId: 'session-1',
          title: 'Saved',
          createdAt: 100,
          code: 's("bd")',
          messages: [],
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await createCloudFavorite('session-1', 'user-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/favorites', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session-1' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/favorites/favorite-1',
      expect.any(Object),
    );
  });
});
