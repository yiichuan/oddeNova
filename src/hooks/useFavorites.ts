import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from './useSessions';
import type { FavoriteConversation } from '../lib/favorite-conversations';
import { sessionAsFavorite } from '../lib/session-favorites';
import {
  deleteFavorite as deleteLocalFavorite,
  getAllFavorites,
  putFavorite,
} from '../lib/session-storage';
import {
  createCloudFavorite,
  deleteCloudFavorite,
  listCloudFavorites,
} from '../services/favorite-repository';

interface UseFavoritesOptions {
  ownerKey: string;
  userId?: string;
  sessions: readonly Session[];
  sessionsLoading: boolean;
}

export function useFavorites({ ownerKey, userId, sessions, sessionsLoading }: UseFavoritesOptions) {
  const [favorites, setFavorites] = useState<FavoriteConversation[]>([]);
  const [loadedOwnerKey, setLoadedOwnerKey] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  useEffect(() => {
    if (sessionsLoading) return;
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        let loaded = userId
          ? await listCloudFavorites(userId)
          : await getAllFavorites(ownerKey);

        if (!userId) {
          const existingSources = new Set(loaded.map((favorite) => favorite.sourceSessionId));
          const legacy = sessionsRef.current.filter(
            (session) => session.favoritedAt !== undefined && !existingSources.has(session.id),
          );
          if (legacy.length > 0) {
            const migrated = legacy.map((session) => sessionAsFavorite(session));
            await Promise.all(migrated.map((favorite) => putFavorite(favorite, ownerKey)));
            loaded = [...loaded, ...migrated].sort((a, b) => b.favoritedAt - a.favoritedAt);
          }
        }

        if (!cancelled) {
          setFavorites(loaded);
          setLoadedOwnerKey(ownerKey);
        }
      } catch (cause) {
        if (!cancelled) {
          setFavorites([]);
          setLoadedOwnerKey(ownerKey);
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [ownerKey, sessionsLoading, userId]);

  const create = useCallback(async (session: Session, finalCode: string) => {
    if (!finalCode.trim()) throw new Error('Cannot favorite an empty session');
    const favorite = userId
      ? await createCloudFavorite(session.id, userId)
      : sessionAsFavorite(session, { favoritedAt: Date.now(), finalCode });
    if (!userId) await putFavorite(favorite, ownerKey);
    setFavorites((current) => [
      favorite,
      ...current.filter((item) => item.sourceSessionId !== session.id),
    ].sort((a, b) => b.favoritedAt - a.favoritedAt));
    return favorite;
  }, [ownerKey, userId]);

  const remove = useCallback(async (favorite: FavoriteConversation) => {
    if (userId) await deleteCloudFavorite(favorite.id, userId);
    else await deleteLocalFavorite(favorite.id, ownerKey);
    setFavorites((current) => current.filter((item) => item.id !== favorite.id));
  }, [ownerKey, userId]);

  const sourceSessionIds = useMemo(
    () => new Set(favorites.flatMap((favorite) => favorite.sourceSessionId ? [favorite.sourceSessionId] : [])),
    [favorites],
  );

  return {
    favorites,
    sourceSessionIds,
    isLoading: loadedOwnerKey !== ownerKey,
    error,
    create,
    remove,
  };
}
