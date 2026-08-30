// @vitest-environment happy-dom

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FavoriteSummary, SessionSummary } from '../../../shared/session-api';
import type { Session } from '../useSessions';
import { useCloudSessionLibrary } from '../useCloudSessionLibrary';

const repositoryMocks = vi.hoisted(() => ({
  listCloudSessionSummaries: vi.fn(),
  getCloudSession: vi.fn(),
  listCloudFavoriteSummaries: vi.fn(),
  favoriteCloudSession: vi.fn(),
  unfavoriteCloudSession: vi.fn(),
}));

vi.mock('../../services/cloud-session-repository', () => repositoryMocks);
vi.mock('../../services/favorite-repository', () => ({
  listCloudFavoriteSummaries: repositoryMocks.listCloudFavoriteSummaries,
  favoriteCloudSession: repositoryMocks.favoriteCloudSession,
  unfavoriteCloudSession: repositoryMocks.unfavoriteCloudSession,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function summary(id: string, updatedAt = 10): SessionSummary {
  return { id, title: `会话 ${id}`, updatedAt };
}

function favorite(id: string, updatedAt = 10, favoritedAt = 20): FavoriteSummary {
  return { ...summary(id, updatedAt), favoritedAt };
}

function detail(item: SessionSummary | FavoriteSummary): Session {
  return {
    ...item,
    messages: [{ id: `${item.id}-message`, role: 'user', content: '打开详情', timestamp: 1 }],
    code: 's("bd")',
    createdAt: 1,
    updatedAt: item.updatedAt,
    ...( 'favoritedAt' in item ? { favoritedAt: item.favoritedAt } : {}),
  };
}

async function renderLibrary(options: Parameters<typeof useCloudSessionLibrary>[0] = {
  enabled: true,
  ownerId: 'user-1',
}): Promise<{
  root: Root;
  getHook: () => ReturnType<typeof useCloudSessionLibrary>;
  rerender: (nextOptions: Parameters<typeof useCloudSessionLibrary>[0]) => Promise<void>;
}> {
  let hook: ReturnType<typeof useCloudSessionLibrary> | undefined;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe({
    probeOptions,
    onValue,
  }: {
    probeOptions: Parameters<typeof useCloudSessionLibrary>[0];
    onValue: (value: ReturnType<typeof useCloudSessionLibrary>) => void;
  }) {
    const value = useCloudSessionLibrary(probeOptions);
    useEffect(() => onValue(value));
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe, {
      probeOptions: options,
      onValue: (value) => { hook = value; },
    }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return {
    root,
    getHook: () => {
      if (!hook) throw new Error('cloud session library was not rendered');
      return hook;
    },
    rerender: async (nextOptions) => {
      await act(async () => {
        root.render(createElement(Probe, {
          probeOptions: nextOptions,
          onValue: (value) => { hook = value; },
        }));
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

describe('useCloudSessionLibrary', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    repositoryMocks.listCloudSessionSummaries.mockReset();
    repositoryMocks.listCloudSessionSummaries.mockResolvedValue({ items: [], nextCursor: null });
    repositoryMocks.getCloudSession.mockReset();
    repositoryMocks.listCloudFavoriteSummaries.mockReset();
    repositoryMocks.listCloudFavoriteSummaries.mockResolvedValue({ items: [], nextCursor: null });
    repositoryMocks.favoriteCloudSession.mockReset();
    repositoryMocks.unfavoriteCloudSession.mockReset();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('loads history pages with a single in-flight request and stops at a null cursor', async () => {
    const first = summary('history-1', 30);
    const second = summary('history-2', 20);
    repositoryMocks.listCloudSessionSummaries
      .mockResolvedValueOnce({ items: [first], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [second], nextCursor: null });

    const { root, getHook } = await renderLibrary();
    roots.push(root);
    await vi.waitFor(() => expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(1));
    expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledWith(expect.objectContaining({
      limit: 20,
      expectedUserId: 'user-1',
      signal: expect.any(AbortSignal),
    }));

    let firstMore!: Promise<void>;
    let secondMore!: Promise<void>;
    await act(async () => {
      firstMore = getHook().loadMoreHistory();
      secondMore = getHook().loadMoreHistory();
      await Promise.all([firstMore, secondMore]);
    });
    expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(2);
    expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenLastCalledWith(expect.objectContaining({
      limit: 20,
      cursor: 'cursor-1',
      expectedUserId: 'user-1',
      signal: expect.any(AbortSignal),
    }));
    expect(getHook().history.items).toEqual([first, second]);

    await act(async () => {
      await getHook().loadMoreHistory();
    });
    expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(2);
  });

  it('lazy-loads favorites and resets both collections and detail cache when scope changes', async () => {
    const history = summary('history-1');
    const savedFavorite = favorite('favorite-1');
    repositoryMocks.listCloudSessionSummaries.mockResolvedValueOnce({ items: [history], nextCursor: null });
    repositoryMocks.listCloudFavoriteSummaries.mockResolvedValueOnce({ items: [savedFavorite], nextCursor: null });
    repositoryMocks.getCloudSession.mockResolvedValueOnce(detail(history));
    const acceptCloudDetail = vi.fn(async () => undefined);

    const { root, getHook, rerender } = await renderLibrary({
      enabled: true,
      ownerId: 'user-1',
      acceptCloudDetail,
    });
    roots.push(root);
    await vi.waitFor(() => expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(1));
    expect(repositoryMocks.listCloudFavoriteSummaries).not.toHaveBeenCalled();

    await act(async () => {
      await getHook().ensureFavorites();
      await Promise.resolve();
    });
    await act(async () => {
      await getHook().ensureFavorites();
      await getHook().openSession(history);
    });
    expect(repositoryMocks.listCloudFavoriteSummaries).toHaveBeenCalledTimes(1);
    expect(getHook().favorites.items).toEqual([savedFavorite]);
    expect(getHook().details.get(history.id)).toMatchObject({ updatedAt: history.updatedAt });

    await rerender({ enabled: false, ownerId: 'user-2', acceptCloudDetail });
    expect(getHook().history.items).toEqual([]);
    expect(getHook().favorites.items).toEqual([]);
    expect(getHook().details.size).toBe(0);
  });

  it('caches details by id and updatedAt, removes 404 summaries, and exposes retryable network errors', async () => {
    const cachedSummary = summary('cached', 10);
    const changedSummary = summary('cached', 11);
    const missingSummary = summary('missing', 12);
    const failedSummary = summary('failed', 13);
    const cachedDetail = detail(cachedSummary);
    const changedDetail = detail(changedSummary);
    const acceptCloudDetail = vi.fn(async () => undefined);
    const networkError = new Error('offline');
    repositoryMocks.listCloudSessionSummaries.mockResolvedValueOnce({
      items: [failedSummary, missingSummary, cachedSummary],
      nextCursor: null,
    });
    repositoryMocks.getCloudSession
      .mockResolvedValueOnce(cachedDetail)
      .mockResolvedValueOnce(changedDetail)
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
      .mockRejectedValueOnce(networkError);

    const { root, getHook } = await renderLibrary({ enabled: true, ownerId: 'user-1', acceptCloudDetail });
    roots.push(root);
    await vi.waitFor(() => expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(1));

    await act(async () => {
      await getHook().openSession(cachedSummary);
    });
    await act(async () => {
      await getHook().openSession(cachedSummary);
      await getHook().openSession(changedSummary);
    });
    expect(repositoryMocks.getCloudSession).toHaveBeenCalledTimes(2);
    expect(acceptCloudDetail).toHaveBeenCalledTimes(3);

    await act(async () => {
      try {
        await getHook().openSession(missingSummary);
        throw new Error('expected missing detail to fail');
      } catch (error) {
        expect(error).toMatchObject({ status: 404 });
      }
    });
    expect(getHook().history.items.map((item) => item.id)).toEqual(['failed', 'cached']);

    await act(async () => {
      try {
        await getHook().openSession(failedSummary);
        throw new Error('expected failed detail to fail');
      } catch (error) {
        expect(error).toBe(networkError);
      }
    });
    expect(getHook().details.get(cachedSummary.id)?.session).toEqual(changedDetail);
    expect(getHook().detailError).toMatchObject({ id: failedSummary.id, retryable: true });
    expect(getHook().retryDetail).toBeTypeOf('function');
  });

  it('loads a favorite detail without accepting it into the current workspace', async () => {
    const savedFavorite = favorite('favorite-1');
    const savedDetail = detail(savedFavorite);
    repositoryMocks.listCloudFavoriteSummaries.mockResolvedValueOnce({
      items: [savedFavorite],
      nextCursor: null,
    });
    repositoryMocks.getCloudSession.mockResolvedValueOnce(savedDetail);
    const acceptCloudDetail = vi.fn(async () => undefined);

    const { root, getHook } = await renderLibrary({
      enabled: true,
      ownerId: 'user-1',
      acceptCloudDetail,
    });
    roots.push(root);

    await act(async () => {
      await getHook().ensureFavorites();
      await getHook().openFavorite(savedFavorite);
    });

    expect(getHook().details.get(savedFavorite.id)).toMatchObject({
      updatedAt: savedFavorite.updatedAt,
      session: savedDetail,
    });
    expect(acceptCloudDetail).not.toHaveBeenCalled();
  });

  it('keeps retrying a favorite detail read-only', async () => {
    const savedFavorite = favorite('favorite-2');
    const savedDetail = detail(savedFavorite);
    const networkError = new Error('offline');
    repositoryMocks.listCloudFavoriteSummaries.mockResolvedValueOnce({
      items: [savedFavorite],
      nextCursor: null,
    });
    repositoryMocks.getCloudSession
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(savedDetail);
    const acceptCloudDetail = vi.fn(async () => undefined);

    const { root, getHook } = await renderLibrary({
      enabled: true,
      ownerId: 'user-1',
      acceptCloudDetail,
    });
    roots.push(root);

    await act(async () => {
      await getHook().ensureFavorites();
      await expect(getHook().openFavorite(savedFavorite)).rejects.toBe(networkError);
    });
    expect(getHook().detailError).toMatchObject({
      id: savedFavorite.id,
      acceptCloudDetail: false,
    });

    await act(async () => {
      await getHook().retryDetail();
    });

    expect(acceptCloudDetail).not.toHaveBeenCalled();
    expect(getHook().details.get(savedFavorite.id)?.session).toEqual(savedDetail);
  });

  it('moves summaries optimistically and restores the exact source position on failure', async () => {
    const first = summary('first', 30);
    const second = summary('second', 20);
    const serverFavorite = favorite(first.id, first.updatedAt, 99);
    repositoryMocks.listCloudSessionSummaries.mockResolvedValueOnce({ items: [first, second], nextCursor: null });
    const { root, getHook } = await renderLibrary();
    roots.push(root);
    await vi.waitFor(() => expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(1));

    let resolveFavorite!: (value: FavoriteSummary) => void;
    repositoryMocks.favoriteCloudSession.mockReturnValueOnce(new Promise<FavoriteSummary>((resolve) => {
      resolveFavorite = resolve;
    }));
    let favoriteRequest!: Promise<FavoriteSummary>;
    act(() => {
      favoriteRequest = getHook().favoriteSession(first);
    });
    expect(getHook().history.items.map((item) => item.id)).toEqual(['second']);
    expect(getHook().favorites.items[0]).toMatchObject({ id: first.id, favoritedAt: expect.any(Number) });
    await act(async () => {
      resolveFavorite(serverFavorite);
      await favoriteRequest;
    });
    expect(getHook().favorites.items).toEqual([serverFavorite]);

    const failure = new Error('favorite failed');
    repositoryMocks.favoriteCloudSession.mockRejectedValueOnce(failure);
    await act(async () => {
      await expect(getHook().favoriteSession(second)).rejects.toBe(failure);
    });
    expect(getHook().history.items.map((item) => item.id)).toEqual(['second']);

    const serverUnfavorite = summary(first.id, first.updatedAt);
    repositoryMocks.unfavoriteCloudSession.mockResolvedValueOnce(serverUnfavorite);
    await act(async () => {
      await getHook().unfavoriteSession(serverFavorite);
    });
    expect(getHook().favorites.items).toEqual([]);
    expect(getHook().history.items.map((item) => item.id)).toEqual(['first', 'second']);
    expect(getHook().history.items[0]).toEqual(serverUnfavorite);
  });

  it('keeps history summaries ordered by updatedAt after an upsert', async () => {
    const first = summary('first', 30);
    const second = summary('second', 20);
    repositoryMocks.listCloudSessionSummaries.mockResolvedValueOnce({
      items: [first, second],
      nextCursor: null,
    });

    const { root, getHook } = await renderLibrary();
    roots.push(root);
    await vi.waitFor(() => expect(repositoryMocks.listCloudSessionSummaries).toHaveBeenCalledTimes(1));

    act(() => {
      getHook().upsertHistorySummary(second);
    });

    expect(getHook().history.items).toEqual([
      first,
      second,
    ]);

    act(() => {
      getHook().upsertHistorySummary({ ...second, updatedAt: 40 });
    });

    expect(getHook().history.items).toEqual([
      { ...second, updatedAt: 40 },
      first,
    ]);
  });
});
