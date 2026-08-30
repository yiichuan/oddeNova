import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DEFAULT_PAGE_LIMIT,
  type FavoriteSummary,
  type SessionSummary,
} from '../../shared/session-api';
import {
  getCloudSession,
  listCloudSessionSummaries,
} from '../services/cloud-session-repository';
import {
  favoriteCloudSession,
  listCloudFavoriteSummaries,
  unfavoriteCloudSession,
} from '../services/favorite-repository';
import type { Session } from './useSessions';

export type CloudCollectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CloudCollection<T> {
  items: T[];
  nextCursor: string | null;
  initialStatus: CloudCollectionStatus;
  moreStatus: CloudCollectionStatus;
  initialError: Error | null;
  moreError: Error | null;
  retryInitial: () => void;
  retryMore: () => void;
}

export interface CloudDetailError {
  id: string;
  updatedAt: number;
  summary: SessionSummary | FavoriteSummary;
  error: Error;
  retryable: boolean;
  acceptCloudDetail: boolean;
}

export interface UseCloudSessionLibraryOptions {
  enabled: boolean;
  ownerId?: string;
  acceptCloudDetail?: (session: Session) => Promise<void>;
}

interface CollectionState<T> {
  items: T[];
  nextCursor: string | null;
  initialStatus: CloudCollectionStatus;
  moreStatus: CloudCollectionStatus;
  initialError: Error | null;
  moreError: Error | null;
}

type CollectionAction<T> =
  | { type: 'initial-start' }
  | { type: 'initial-success'; items: T[]; nextCursor: string | null }
  | { type: 'initial-error'; error: Error }
  | { type: 'more-start' }
  | { type: 'more-success'; items: T[]; nextCursor: string | null }
  | { type: 'more-error'; error: Error }
  | { type: 'remove'; id: string }
  | { type: 'upsert'; item: T; index?: number }
  | { type: 'reset' };

const emptyCollection = <T,>(): CollectionState<T> => ({
  items: [],
  nextCursor: null,
  initialStatus: 'idle',
  moreStatus: 'idle',
  initialError: null,
  moreError: null,
});

function itemId<T extends { id: string }>(item: T): string {
  return item.id;
}

function mergeItems<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(existing.map((item) => [itemId(item), item]));
  const result = existing.map((item) => byId.get(itemId(item)) ?? item);
  for (const item of incoming) {
    const index = result.findIndex((existingItem) => itemId(existingItem) === itemId(item));
    if (index === -1) result.push(item);
    else result[index] = item;
  }
  return result;
}

function upsertAt<T extends { id: string }>(items: T[], item: T, index?: number): T[] {
  const without = items.filter((existing) => existing.id !== item.id);
  const target = index === undefined ? items.findIndex((existing) => existing.id === item.id) : index;
  if (target < 0) {
    without.push(item);
    return without;
  }
  without.splice(Math.min(target, without.length), 0, item);
  return without;
}

function collectionReducer<T extends { id: string }>(
  state: CollectionState<T>,
  action: CollectionAction<T>,
): CollectionState<T> {
  switch (action.type) {
    case 'initial-start':
      return {
        ...emptyCollection<T>(),
        initialStatus: 'loading',
      };
    case 'initial-success':
      return {
        items: mergeItems([], action.items),
        nextCursor: action.nextCursor,
        initialStatus: 'ready',
        moreStatus: 'idle',
        initialError: null,
        moreError: null,
      };
    case 'initial-error':
      return {
        ...state,
        items: [],
        nextCursor: null,
        initialStatus: 'error',
        initialError: action.error,
        moreStatus: 'idle',
        moreError: null,
      };
    case 'more-start':
      return {
        ...state,
        moreStatus: 'loading',
        moreError: null,
      };
    case 'more-success':
      return {
        ...state,
        items: mergeItems(state.items, action.items),
        nextCursor: action.nextCursor,
        moreStatus: 'ready',
        moreError: null,
      };
    case 'more-error':
      return {
        ...state,
        moreStatus: 'error',
        moreError: action.error,
      };
    case 'remove':
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
      };
    case 'upsert':
      return {
        ...state,
        items: upsertAt(state.items, action.item, action.index),
      };
    case 'reset':
      return emptyCollection<T>();
  }
}

function compareByUpdatedAt<T extends { id: string; updatedAt: number }>(a: T, b: T): number {
  const updatedAtDifference = b.updatedAt - a.updatedAt;
  if (updatedAtDifference !== 0) return updatedAtDifference;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function sortByUpdatedAt<T extends { id: string; updatedAt: number }>(items: T[]): T[] {
  return [...items].sort(compareByUpdatedAt);
}

function historyReducer(
  state: CollectionState<SessionSummary>,
  action: CollectionAction<SessionSummary>,
): CollectionState<SessionSummary> {
  const next = collectionReducer(state, action);
  return {
    ...next,
    items: sortByUpdatedAt(next.items),
  };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function responseStatus(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('status' in value)) return undefined;
  const status = (value as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function abortError(): Error {
  const error = new Error('Cloud session request was cancelled');
  error.name = 'AbortError';
  return error;
}

interface FavoriteMove {
  historyItem: SessionSummary;
  historyIndex: number;
  favoriteIndex: number;
}

export function useCloudSessionLibrary({
  enabled,
  ownerId,
  acceptCloudDetail,
}: UseCloudSessionLibraryOptions) {
  const [historyState, dispatchHistory] = useReducer(
    historyReducer,
    undefined,
    emptyCollection,
  );
  const [favoritesState, dispatchFavorites] = useReducer(
    collectionReducer<FavoriteSummary>,
    undefined,
    emptyCollection,
  );
  const [details, setDetails] = useState<Map<string, { updatedAt: number; session: Session }>>(
    () => new Map(),
  );
  const [detailError, setDetailError] = useState<CloudDetailError | null>(null);
  const historyRef = useRef(historyState);
  const favoritesRef = useRef(favoritesState);
  const detailsRef = useRef(details);
  const generationRef = useRef(0);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const requestsRef = useRef<Map<string, Promise<void>>>(new Map());
  const detailRequestsRef = useRef<Map<string, Promise<Session>>>(new Map());
  const favoriteMovesRef = useRef<Map<string, FavoriteMove>>(new Map());

  historyRef.current = historyState;
  favoritesRef.current = favoritesState;
  detailsRef.current = details;

  const scopeIsActive = useCallback((generation: number, controller: AbortController): boolean =>
    enabled
    && Boolean(ownerId)
    && generation === generationRef.current
    && !controller.signal.aborted,
  [enabled, ownerId]);

  useEffect(() => {
    const controllers = controllersRef.current;
    const requests = requestsRef.current;
    const detailRequests = detailRequestsRef.current;
    generationRef.current += 1;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    requests.clear();
    detailRequests.clear();
    favoriteMovesRef.current.clear();
    dispatchHistory({ type: 'reset' });
    dispatchFavorites({ type: 'reset' });
    const emptyDetails = new Map<string, { updatedAt: number; session: Session }>();
    detailsRef.current = emptyDetails;
    setDetails(emptyDetails);
    setDetailError(null);

    return () => {
      generationRef.current += 1;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      requests.clear();
      detailRequests.clear();
    };
  }, [enabled, ownerId]);

  const runCollectionRequest = useCallback(async (options: {
    key: string;
    collection: 'history' | 'favorites';
    more: boolean;
    cursor?: string;
  }): Promise<void> => {
    if (!enabled || !ownerId) return;
    if (requestsRef.current.has(options.key)) {
      await requestsRef.current.get(options.key);
      return;
    }

    const generation = generationRef.current;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    const request = (async () => {
      try {
        if (options.collection === 'history') {
          const page = await listCloudSessionSummaries({
            limit: DEFAULT_PAGE_LIMIT,
            ...(options.cursor ? { cursor: options.cursor } : {}),
            expectedUserId: ownerId,
            signal: controller.signal,
          });
          if (!scopeIsActive(generation, controller)) return;
          dispatchHistory(options.more
            ? { type: 'more-success', items: page.items, nextCursor: page.nextCursor }
            : { type: 'initial-success', items: page.items, nextCursor: page.nextCursor });
        } else {
          const page = await listCloudFavoriteSummaries({
            limit: DEFAULT_PAGE_LIMIT,
            ...(options.cursor ? { cursor: options.cursor } : {}),
            expectedUserId: ownerId,
            signal: controller.signal,
          });
          if (!scopeIsActive(generation, controller)) return;
          dispatchFavorites(options.more
            ? { type: 'more-success', items: page.items, nextCursor: page.nextCursor }
            : { type: 'initial-success', items: page.items, nextCursor: page.nextCursor });
        }
      } catch (value) {
        if (!scopeIsActive(generation, controller)) return;
        const error = asError(value);
        if (options.collection === 'history') {
          dispatchHistory(options.more
            ? { type: 'more-error', error }
            : { type: 'initial-error', error });
        } else {
          dispatchFavorites(options.more
            ? { type: 'more-error', error }
            : { type: 'initial-error', error });
        }
      } finally {
        controllersRef.current.delete(controller);
      }
    })();
    requestsRef.current.set(options.key, request);
    try {
      await request;
    } finally {
      if (requestsRef.current.get(options.key) === request) requestsRef.current.delete(options.key);
    }
  }, [enabled, ownerId, scopeIsActive]);

  const loadHistory = useCallback(async (): Promise<void> => {
    const state = historyRef.current;
    if (!enabled || !ownerId || state.initialStatus === 'ready') return;
    if (state.initialStatus === 'loading') {
      await requestsRef.current.get('history:initial');
      return;
    }
    dispatchHistory({ type: 'initial-start' });
    await runCollectionRequest({ key: 'history:initial', collection: 'history', more: false });
  }, [enabled, ownerId, runCollectionRequest]);

  const loadMoreHistory = useCallback(async (): Promise<void> => {
    const state = historyRef.current;
    if (!enabled || !ownerId || state.initialStatus !== 'ready' || !state.nextCursor) return;
    const cursor = state.nextCursor;
    if (state.moreStatus === 'loading') {
      await requestsRef.current.get(`history:more:${cursor}`);
      return;
    }
    dispatchHistory({ type: 'more-start' });
    await runCollectionRequest({
      key: `history:more:${cursor}`,
      collection: 'history',
      more: true,
      cursor,
    });
  }, [enabled, ownerId, runCollectionRequest]);

  const ensureFavorites = useCallback(async (): Promise<void> => {
    const state = favoritesRef.current;
    if (!enabled || !ownerId || state.initialStatus === 'ready') return;
    if (state.initialStatus === 'loading') {
      await requestsRef.current.get('favorites:initial');
      return;
    }
    dispatchFavorites({ type: 'initial-start' });
    await runCollectionRequest({ key: 'favorites:initial', collection: 'favorites', more: false });
  }, [enabled, ownerId, runCollectionRequest]);

  const loadMoreFavorites = useCallback(async (): Promise<void> => {
    const state = favoritesRef.current;
    if (!enabled || !ownerId || state.initialStatus !== 'ready' || !state.nextCursor) return;
    const cursor = state.nextCursor;
    if (state.moreStatus === 'loading') {
      await requestsRef.current.get(`favorites:more:${cursor}`);
      return;
    }
    dispatchFavorites({ type: 'more-start' });
    await runCollectionRequest({
      key: `favorites:more:${cursor}`,
      collection: 'favorites',
      more: true,
      cursor,
    });
  }, [enabled, ownerId, runCollectionRequest]);

  useEffect(() => {
    if (enabled && ownerId) void loadHistory();
  }, [enabled, loadHistory, ownerId]);

  const openSummary = useCallback(async (
    summary: SessionSummary | FavoriteSummary,
    options: { acceptCloudDetail?: boolean } = {},
  ): Promise<Session> => {
    if (!enabled || !ownerId) throw new Error('Cloud session library is unavailable');
    const shouldAcceptCloudDetail = options.acceptCloudDetail ?? true;
    const cached = detailsRef.current.get(summary.id);
    if (cached?.updatedAt === summary.updatedAt) {
      if (shouldAcceptCloudDetail) await acceptCloudDetail?.(cached.session);
      return cached.session;
    }

    const requestKey = `${summary.id}:${summary.updatedAt}`;
    const existingRequest = detailRequestsRef.current.get(requestKey);
    if (existingRequest) return existingRequest;

    const generation = generationRef.current;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    setDetailError(null);
    const request = (async () => {
      try {
        const session = await getCloudSession(summary.id, ownerId, controller.signal);
        if (!scopeIsActive(generation, controller)) throw abortError();
        if (shouldAcceptCloudDetail) await acceptCloudDetail?.(session);
        if (!scopeIsActive(generation, controller)) throw abortError();
        setDetails((previous) => {
          const next = new Map(previous);
          const existing = next.get(session.id);
          if (!existing || existing.updatedAt <= session.updatedAt) {
            next.set(session.id, { updatedAt: session.updatedAt, session });
          }
          detailsRef.current = next;
          return next;
        });
        setDetailError(null);
        return session;
      } catch (value) {
        const error = asError(value);
        if (!scopeIsActive(generation, controller)) throw error;
        if (responseStatus(value) === 404) {
          dispatchHistory({ type: 'remove', id: summary.id });
          dispatchFavorites({ type: 'remove', id: summary.id });
          setDetails((previous) => {
            const next = new Map(previous);
            next.delete(summary.id);
            detailsRef.current = next;
            return next;
          });
        }
        setDetailError({
          id: summary.id,
          updatedAt: summary.updatedAt,
          summary,
          error,
          retryable: responseStatus(value) !== 404,
          acceptCloudDetail: shouldAcceptCloudDetail,
        });
        throw error;
      } finally {
        controllersRef.current.delete(controller);
      }
    })();
    detailRequestsRef.current.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (detailRequestsRef.current.get(requestKey) === request) {
        detailRequestsRef.current.delete(requestKey);
      }
    }
  }, [acceptCloudDetail, enabled, ownerId, scopeIsActive]);

  const retryDetail = useCallback(async (): Promise<void> => {
    const failed = detailError;
    if (!failed?.retryable) return;
    await openSummary(failed.summary, {
      acceptCloudDetail: failed.acceptCloudDetail,
    }).then(() => undefined);
  }, [detailError, openSummary]);

  const removeSummary = useCallback((id: string): void => {
    dispatchHistory({ type: 'remove', id });
    dispatchFavorites({ type: 'remove', id });
    setDetails((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      detailsRef.current = next;
      return next;
    });
  }, []);

  const upsertHistorySummary = useCallback((item: SessionSummary, index?: number): void => {
    dispatchHistory({ type: 'upsert', item, index: index ?? 0 });
  }, []);

  const favoriteSession = useCallback(async (item: SessionSummary): Promise<FavoriteSummary> => {
    if (!enabled || !ownerId) throw new Error('Cloud session library is unavailable');
    const historyItems = historyRef.current.items;
    const historyIndex = historyItems.findIndex((candidate) => candidate.id === item.id);
    const favoritesIndex = favoritesRef.current.items.findIndex((candidate) => candidate.id === item.id);
    const move = historyIndex === -1
      ? null
      : {
          historyItem: historyItems[historyIndex],
          historyIndex,
          favoriteIndex: favoritesIndex,
        } satisfies FavoriteMove;
    if (move) {
      favoriteMovesRef.current.set(item.id, move);
      dispatchHistory({ type: 'remove', id: item.id });
      dispatchFavorites({
        type: 'upsert',
        item: { ...item, favoritedAt: Date.now() },
        index: 0,
      });
    }
    const generation = generationRef.current;

    try {
      const serverFavorite = await favoriteCloudSession(item.id, ownerId);
      if (generationRef.current === generation) {
        dispatchHistory({ type: 'remove', id: item.id });
        dispatchFavorites({ type: 'upsert', item: serverFavorite, index: 0 });
      }
      return serverFavorite;
    } catch (error) {
      if (move && generationRef.current === generation) {
        dispatchFavorites({ type: 'remove', id: item.id });
        dispatchHistory({ type: 'upsert', item: move.historyItem, index: move.historyIndex });
        favoriteMovesRef.current.delete(item.id);
      }
      throw error;
    }
  }, [enabled, ownerId]);

  const unfavoriteSession = useCallback(async (
    itemOrId: FavoriteSummary | string,
  ): Promise<SessionSummary> => {
    if (!enabled || !ownerId) throw new Error('Cloud session library is unavailable');
    const item = typeof itemOrId === 'string'
      ? favoritesRef.current.items.find((candidate) => candidate.id === itemOrId)
      : itemOrId;
    if (!item) throw new Error('Favorite summary is unavailable');

    const favoriteIndex = favoritesRef.current.items.findIndex((candidate) => candidate.id === item.id);
    const move = favoriteMovesRef.current.get(item.id);
    const generation = generationRef.current;
    const historyItem = move?.historyItem ?? {
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
    };
    const historyIndex = move?.historyIndex ?? 0;
    dispatchFavorites({ type: 'remove', id: item.id });
    dispatchHistory({ type: 'upsert', item: historyItem, index: historyIndex });

    try {
      const serverSession = await unfavoriteCloudSession(item.id, ownerId);
      if (generationRef.current === generation) {
        dispatchFavorites({ type: 'remove', id: item.id });
        dispatchHistory({ type: 'upsert', item: serverSession, index: historyIndex });
        favoriteMovesRef.current.delete(item.id);
      }
      return serverSession;
    } catch (error) {
      if (generationRef.current === generation) {
        dispatchHistory({ type: 'remove', id: item.id });
        dispatchFavorites({ type: 'upsert', item, index: favoriteIndex < 0 ? 0 : favoriteIndex });
      }
      throw error;
    }
  }, [enabled, ownerId]);

  const history = useMemo<CloudCollection<SessionSummary>>(() => ({
    ...historyState,
    retryInitial: () => { void loadHistory(); },
    retryMore: () => { void loadMoreHistory(); },
  }), [historyState, loadHistory, loadMoreHistory]);

  const favorites = useMemo<CloudCollection<FavoriteSummary>>(() => ({
    ...favoritesState,
    retryInitial: () => { void ensureFavorites(); },
    retryMore: () => { void loadMoreFavorites(); },
  }), [ensureFavorites, favoritesState, loadMoreFavorites]);

  const openSession = useCallback(
    (item: SessionSummary): Promise<Session> => openSummary(item),
    [openSummary],
  );
  const openFavorite = useCallback(
    (item: FavoriteSummary): Promise<Session> => openSummary(item, { acceptCloudDetail: false }),
    [openSummary],
  );

  return {
    history,
    favorites,
    details,
    detailError,
    retryDetail,
    loadHistory,
    loadMoreHistory,
    ensureFavorites,
    loadMoreFavorites,
    openSession,
    openFavorite,
    favoriteSession,
    unfavoriteSession,
    removeSummary,
    upsertHistorySummary,
  };
}
