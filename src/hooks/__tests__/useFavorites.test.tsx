// @vitest-environment happy-dom

import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../useSessions';
import { useFavorites } from '../useFavorites';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const session: Session = {
  id: 'session-1',
  title: 'Saved',
  messages: [],
  code: 's("bd")',
  favoritedAt: 100,
  createdAt: 1,
  updatedAt: 2,
};

describe('useFavorites', () => {
  const container = document.createElement('div');
  const root = createRoot(container);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives favorites from sessions and moves them by updating the session marker', async () => {
    const setSessionFavorite = vi.fn();
    const capture = vi.fn();
    function Probe() {
      const current = useFavorites({
        sessions: [session],
        sessionsLoading: false,
        setSessionFavorite,
      });
      useEffect(() => { capture(current); }, [current]);
      return null;
    }

    await act(async () => { root.render(<Probe />); });

    const current = capture.mock.lastCall?.[0] as ReturnType<typeof useFavorites>;
    expect(current?.favorites.map((favorite) => favorite.id)).toEqual(['session-1']);
    expect(current?.isLoading).toBe(false);
    await act(async () => { await current?.remove(current.favorites[0]); });
    expect(setSessionFavorite).toHaveBeenCalledWith('session-1', null);
  });

  it('does not derive an account favorite list from local session rows', async () => {
    const capture = vi.fn();
    function Probe() {
      const current = useFavorites({
        sessions: [session],
        sessionsLoading: false,
        setSessionFavorite: vi.fn(),
        enabled: false,
      });
      useEffect(() => { capture(current); }, [current]);
      return null;
    }

    await act(async () => { root.render(<Probe />); });

    const current = capture.mock.lastCall?.[0] as ReturnType<typeof useFavorites>;
    expect(current?.favorites).toEqual([]);
    expect(current?.sourceSessionIds).toEqual(new Set());
    expect(current?.isLoading).toBe(false);
  });
});
