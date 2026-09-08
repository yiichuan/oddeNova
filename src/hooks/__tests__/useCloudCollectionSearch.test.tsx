// @vitest-environment happy-dom

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCloudCollectionSearch } from '../useCloudCollectionSearch';
import type { CursorPage, SessionSummary } from '../../../shared/session-api';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function summary(id: string, title = id): SessionSummary {
  return { id, title, updatedAt: 1 };
}

interface RenderedSearch {
  root: Root;
  getSearch: () => ReturnType<typeof useCloudCollectionSearch<SessionSummary>>;
  rerender: (options: { enabled?: boolean; ownerId?: string }) => Promise<void>;
}

async function renderSearch(
  fetchPage: (options: {
    cursor?: string;
    limit?: number;
    q?: string;
    expectedUserId?: string;
    signal?: AbortSignal;
  }) => Promise<CursorPage<SessionSummary>>,
  options: { enabled?: boolean; ownerId?: string } = {},
): Promise<RenderedSearch> {
  let latest: ReturnType<typeof useCloudCollectionSearch<SessionSummary>> | undefined;
  let currentOptions = options;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Probe({ probeOptions }: { probeOptions: { enabled?: boolean; ownerId?: string } }) {
    const search = useCloudCollectionSearch<SessionSummary>({
      enabled: probeOptions.enabled ?? true,
      ownerId: probeOptions.ownerId ?? 'user-1',
      fetchPage,
    });
    useEffect(() => { latest = search; });
    return null;
  }
  await act(async () => { root.render(createElement(Probe, { probeOptions: currentOptions })); });
  return {
    root,
    getSearch: () => {
      if (!latest) throw new Error('search was not rendered');
      return latest;
    },
    rerender: async (nextOptions) => {
      currentOptions = nextOptions;
      await act(async () => {
        root.render(createElement(Probe, { probeOptions: currentOptions }));
      });
    },
  };
}

describe('useCloudCollectionSearch', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('debounces a title query and sends it to the first page', async () => {
    const fetchPage = vi.fn(async () => ({ items: [summary('bass')], nextCursor: null }));
    const rendered = await renderSearch(fetchPage);
    roots.push(rendered.root);

    await act(async () => { rendered.getSearch().setQuery('  Bass  '); });
    expect(fetchPage).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(fetchPage).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({
      q: 'Bass',
      limit: 20,
      expectedUserId: 'user-1',
      signal: expect.any(AbortSignal),
    }));
    expect(rendered.getSearch().collection.items).toEqual([summary('bass')]);
  });

  it('keeps the query on the next cursor and ignores an older query response', async () => {
    let resolveFirst!: (page: CursorPage<SessionSummary>) => void;
    const first = new Promise<CursorPage<SessionSummary>>((resolve) => { resolveFirst = resolve; });
    const fetchPage = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ items: [summary('new')], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [summary('older')], nextCursor: null });
    const rendered = await renderSearch(fetchPage);
    roots.push(rendered.root);

    await act(async () => { rendered.getSearch().setQuery('old'); vi.advanceTimersByTime(300); });
    await act(async () => { rendered.getSearch().setQuery('new'); vi.advanceTimersByTime(300); await Promise.resolve(); });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'new' }));

    await act(async () => { resolveFirst({ items: [summary('old')], nextCursor: null }); await Promise.resolve(); });
    expect(rendered.getSearch().collection.items).toEqual([summary('new')]);

    await act(async () => { await rendered.getSearch().loadMore(); await Promise.resolve(); });
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({
      q: 'new',
      cursor: 'next',
    }));
    expect(rendered.getSearch().collection.items).toEqual([summary('new'), summary('older')]);
  });

  it('clears an active search immediately and does not let its response repopulate the list', async () => {
    let resolve!: (page: CursorPage<SessionSummary>) => void;
    const pending = new Promise<CursorPage<SessionSummary>>((res) => { resolve = res; });
    const fetchPage = vi.fn().mockReturnValue(pending);
    const rendered = await renderSearch(fetchPage);
    roots.push(rendered.root);

    await act(async () => { rendered.getSearch().setQuery('old'); vi.advanceTimersByTime(300); });
    await act(async () => { rendered.getSearch().setQuery(''); });
    expect(rendered.getSearch().active).toBe(false);
    expect(rendered.getSearch().collection.items).toEqual([]);
    await act(async () => { resolve({ items: [summary('old')], nextCursor: null }); await Promise.resolve(); });
    expect(rendered.getSearch().collection.items).toEqual([]);
  });

  it('keeps a failed first page retryable and retries a failed next page with the same cursor', async () => {
    const firstFailure = new Error('first page failed');
    const moreFailure = new Error('next page failed');
    const fetchPage = vi.fn()
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValueOnce({ items: [summary('first')], nextCursor: 'next' })
      .mockRejectedValueOnce(moreFailure)
      .mockResolvedValueOnce({ items: [summary('older')], nextCursor: null });
    const rendered = await renderSearch(fetchPage);
    roots.push(rendered.root);

    await act(async () => {
      rendered.getSearch().setQuery('song');
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(rendered.getSearch().collection.initialError).toBe(firstFailure);
    expect(rendered.getSearch().collection.initialStatus).toBe('error');

    await act(async () => {
      rendered.getSearch().collection.retryInitial();
      await Promise.resolve();
    });
    expect(rendered.getSearch().collection.items).toEqual([summary('first')]);

    await act(async () => { await rendered.getSearch().loadMore(); });
    expect(rendered.getSearch().collection.moreError).toBe(moreFailure);
    expect(rendered.getSearch().collection.moreStatus).toBe('error');
    await act(async () => { await rendered.getSearch().loadMore(); });
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'song', cursor: 'next' }));
    expect(rendered.getSearch().collection.items).toEqual([summary('first'), summary('older')]);
  });

  it('drops the query and in-flight result when the account changes, and starts again when re-enabled', async () => {
    let resolveOld!: (page: CursorPage<SessionSummary>) => void;
    const oldPage = new Promise<CursorPage<SessionSummary>>((resolve) => { resolveOld = resolve; });
    const fetchPage = vi.fn()
      .mockReturnValueOnce(oldPage)
      .mockResolvedValueOnce({ items: [summary('new-account')], nextCursor: null });
    const rendered = await renderSearch(fetchPage, { ownerId: 'user-1' });
    roots.push(rendered.root);

    await act(async () => {
      rendered.getSearch().setQuery('song');
      vi.advanceTimersByTime(300);
    });
    await rendered.rerender({ ownerId: 'user-2' });
    expect(rendered.getSearch().query).toBe('');
    expect(rendered.getSearch().active).toBe(false);
    resolveOld({ items: [summary('old-account')], nextCursor: null });
    await act(async () => { await Promise.resolve(); });
    expect(rendered.getSearch().collection.items).toEqual([]);

    await act(async () => {
      rendered.getSearch().setQuery('song');
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({
      q: 'song',
      expectedUserId: 'user-2',
    }));
    expect(rendered.getSearch().collection.items).toEqual([summary('new-account')]);
  });

  it('cancels a search while disabled and re-requests the retained query when enabled again', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [summary('enabled')], nextCursor: null });
    const rendered = await renderSearch(fetchPage);
    roots.push(rendered.root);
    await act(async () => {
      rendered.getSearch().setQuery('song');
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    await rendered.rerender({ enabled: false, ownerId: 'user-1' });
    expect(rendered.getSearch().active).toBe(false);
    expect(rendered.getSearch().collection.items).toEqual([]);
    await rendered.rerender({ enabled: true, ownerId: 'user-1' });
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(rendered.getSearch().collection.items).toEqual([summary('enabled')]);
  });
});
