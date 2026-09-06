import { useCallback, useMemo } from 'react';
import type { Session } from './useSessions';
import type { FavoriteConversation } from '../lib/favorite-conversations';
import { favoritedConversations, sessionAsFavorite } from '../lib/session-favorites';

interface UseFavoritesOptions {
  sessions: readonly Session[];
  sessionsLoading: boolean;
  setSessionFavorite: (sessionId: string, favoritedAt: number | null) => void;
  /** The derived IndexedDB path is for guests; account collections live in the cloud hook. */
  enabled?: boolean;
}

export function useFavorites({
  sessions,
  sessionsLoading,
  setSessionFavorite,
  enabled = true,
}: UseFavoritesOptions) {
  const favorites = useMemo(
    () => enabled ? favoritedConversations(sessions) : [],
    [enabled, sessions],
  );

  const create = useCallback(async (session: Session, finalCode: string) => {
    if (!enabled) throw new Error('Account favorites use the cloud session library');
    if (!finalCode.trim()) throw new Error('Cannot favorite an empty session');
    const favoritedAt = Date.now();
    setSessionFavorite(session.id, favoritedAt);
    const favorite = sessionAsFavorite(session, { favoritedAt, finalCode });
    return favorite;
  }, [enabled, setSessionFavorite]);

  const remove = useCallback(async (favorite: FavoriteConversation) => {
    if (!enabled) throw new Error('Account favorites use the cloud session library');
    const sessionId = favorite.sourceSessionId ?? favorite.sessionId ?? favorite.id;
    setSessionFavorite(sessionId, null);
  }, [enabled, setSessionFavorite]);

  const sourceSessionIds = useMemo(
    () => new Set(favorites.map((favorite) => favorite.sourceSessionId ?? favorite.sessionId ?? favorite.id)),
    [favorites],
  );

  return {
    favorites,
    sourceSessionIds,
    isLoading: enabled && sessionsLoading,
    error: null,
    create,
    remove,
  };
}
