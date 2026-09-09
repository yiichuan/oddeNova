import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_PAGE_LIMIT,
  type CursorPage,
} from '../../shared/session-api';
import type { CloudSessionListOptions } from '../services/cloud-session-repository';
import type { CloudCollection } from './useCloudSessionLibrary';

export interface CloudCollectionSearchOptions<T extends { id: string }> {
  enabled: boolean;
  ownerId?: string;
  fetchPage: (options: CloudSessionListOptions) => Promise<CursorPage<T>>;
}

export interface CloudCollectionSearch<T extends { id: string }> {
  query: string;
  setQuery: (value: string) => void;
  active: boolean;
  collection: CloudCollection<T>;
  loadMore: () => Promise<void>;
  invalidate: () => void;
}

interface SearchState<T> {
  items: T[];
  nextCursor: string | null;
  initialStatus: CloudCollection<T>['initialStatus'];
  moreStatus: CloudCollection<T>['moreStatus'];
  initialError: Error | null;
  moreError: Error | null;
}

const emptySearchState = <T,>(): SearchState<T> => ({
  items: [],
  nextCursor: null,
  initialStatus: 'idle',
  moreStatus: 'idle',
  initialError: null,
  moreError: null,
});

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function trimQuery(value: string): string {
  return value.trim();
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function uniqueItems<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function useCloudCollectionSearch<T extends { id: string }>({
  enabled,
  ownerId,
  fetchPage,
}: CloudCollectionSearchOptions<T>): CloudCollectionSearch<T> {
  const [query, setQueryState] = useState('');
  const [state, setState] = useState<SearchState<T>>(() => emptySearchState<T>());
  const normalizedQueryRef = useRef('');
  // Keep the text sent to the server separate from the normalized key used to
  // deduplicate and invalidate requests. Postgres performs the case-insensitive
  // match; changing the user's Unicode text in JavaScript can change the bytes
  // that the backend actually matches.
  const requestQueryRef = useRef('');
  const stateRef = useRef(state);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const requestsRef = useRef<Map<string, Promise<void>>>(new Map());

  stateRef.current = state;

  const cancelInFlight = useCallback((): void => {
    generationRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    for (const controller of controllersRef.current) controller.abort();
    controllersRef.current.clear();
    requestsRef.current.clear();
  }, []);

  const requestInitial = useCallback(async (
    generation: number,
    normalizedQuery: string,
    requestQuery: string,
  ): Promise<void> => {
    if (!enabled || !ownerId || !normalizedQuery || !requestQuery) return;
    const requestKey = `initial:${generation}`;
    const existing = requestsRef.current.get(requestKey);
    if (existing) {
      await existing;
      return;
    }

    const controller = new AbortController();
    controllersRef.current.add(controller);
    const isCurrent = (): boolean =>
      generationRef.current === generation
      && normalizedQueryRef.current === normalizedQuery
      && !controller.signal.aborted;
    const request = (async () => {
      try {
        const page = await fetchPage({
          limit: DEFAULT_PAGE_LIMIT,
          q: requestQuery,
          expectedUserId: ownerId,
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        setState({
          items: uniqueItems(page.items),
          nextCursor: page.nextCursor,
          initialStatus: 'ready',
          moreStatus: 'idle',
          initialError: null,
          moreError: null,
        });
      } catch (value) {
        if (!isCurrent()) return;
        setState((previous) => ({
          ...previous,
          initialStatus: 'error',
          initialError: asError(value),
          nextCursor: null,
          moreStatus: 'idle',
          moreError: null,
        }));
      } finally {
        controllersRef.current.delete(controller);
        requestsRef.current.delete(requestKey);
      }
    })();
    requestsRef.current.set(requestKey, request);
    await request;
  }, [enabled, fetchPage, ownerId]);

  const scheduleInitial = useCallback((
    generation: number,
    normalizedQuery: string,
    requestQuery: string,
  ): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (
        generationRef.current !== generation
        || normalizedQueryRef.current !== normalizedQuery
        || !enabled
        || !ownerId
      ) return;
      void requestInitial(generation, normalizedQuery, requestQuery);
    }, 300);
  }, [enabled, ownerId, requestInitial]);

  const setQuery = useCallback((value: string): void => {
    const requestQuery = trimQuery(value);
    const normalizedQuery = normalizeQuery(value);
    setQueryState(value);
    if (normalizedQuery === normalizedQueryRef.current) return;

    normalizedQueryRef.current = normalizedQuery;
    requestQueryRef.current = requestQuery;
    cancelInFlight();
    if (!normalizedQuery || !enabled || !ownerId) {
      setState(emptySearchState<T>());
      return;
    }

    const generation = generationRef.current;
    setState({
      ...emptySearchState<T>(),
      initialStatus: 'loading',
    });
    scheduleInitial(generation, normalizedQuery, requestQuery);
  }, [cancelInFlight, enabled, ownerId, scheduleInitial]);

  const loadMore = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    const normalizedQuery = normalizedQueryRef.current;
    const requestQuery = requestQueryRef.current;
    const cursor = current.nextCursor;
    if (
      !enabled
      || !ownerId
      || !normalizedQuery
      || !requestQuery
      || current.initialStatus !== 'ready'
      || !cursor
    ) return;

    const generation = generationRef.current;
    const requestKey = `more:${generation}:${cursor}`;
    const existing = requestsRef.current.get(requestKey);
    if (existing) {
      await existing;
      return;
    }

    setState((previous) => ({
      ...previous,
      moreStatus: 'loading',
      moreError: null,
    }));
    const controller = new AbortController();
    controllersRef.current.add(controller);
    const isCurrent = (): boolean =>
      generationRef.current === generation
      && normalizedQueryRef.current === normalizedQuery
      && !controller.signal.aborted;
    const request = (async () => {
      try {
        const page = await fetchPage({
          limit: DEFAULT_PAGE_LIMIT,
          q: requestQuery,
          cursor,
          expectedUserId: ownerId,
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        setState((previous) => {
          const merged = uniqueItems([...previous.items, ...page.items]);
          return {
            ...previous,
            items: merged,
            nextCursor: page.nextCursor,
            moreStatus: 'ready',
            moreError: null,
          };
        });
      } catch (value) {
        if (!isCurrent()) return;
        setState((previous) => ({
          ...previous,
          moreStatus: 'error',
          moreError: asError(value),
        }));
      } finally {
        controllersRef.current.delete(controller);
        requestsRef.current.delete(requestKey);
      }
    })();
    requestsRef.current.set(requestKey, request);
    await request;
  }, [enabled, fetchPage, ownerId]);

  const retryInitial = useCallback((): void => {
    const normalizedQuery = normalizedQueryRef.current;
    const requestQuery = requestQueryRef.current;
    if (!enabled || !ownerId || !normalizedQuery || !requestQuery) return;
    cancelInFlight();
    const generation = generationRef.current;
    setState({
      ...emptySearchState<T>(),
      initialStatus: 'loading',
    });
    void requestInitial(generation, normalizedQuery, requestQuery);
  }, [cancelInFlight, enabled, ownerId, requestInitial]);

  const invalidate = useCallback((): void => {
    if (!enabled || !ownerId || !normalizedQueryRef.current) return;
    retryInitial();
  }, [enabled, ownerId, retryInitial]);

  useEffect(() => {
    // The list belongs to the account scope. Never carry a query across owners.
    normalizedQueryRef.current = '';
    requestQueryRef.current = '';
    setQueryState('');
    cancelInFlight();
    setState(emptySearchState<T>());
  }, [cancelInFlight, ownerId]);

  useEffect(() => {
    if (enabled && ownerId && normalizedQueryRef.current) {
      cancelInFlight();
      const generation = generationRef.current;
      setState({
        ...emptySearchState<T>(),
        initialStatus: 'loading',
      });
      scheduleInitial(generation, normalizedQueryRef.current, requestQueryRef.current);
      return;
    }
    if (!enabled || !ownerId) {
      cancelInFlight();
      setState(emptySearchState<T>());
    }
  }, [cancelInFlight, enabled, ownerId, scheduleInitial]);

  useEffect(() => () => {
    cancelInFlight();
  }, [cancelInFlight]);

  const collection = useMemo<CloudCollection<T>>(() => ({
    ...state,
    retryInitial,
    retryMore: () => { void loadMore(); },
  }), [loadMore, retryInitial, state]);

  return {
    query,
    setQuery,
    active: Boolean(enabled && ownerId && normalizeQuery(query)),
    collection,
    loadMore,
    invalidate,
  };
}
