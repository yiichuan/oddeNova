// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import InfiniteScrollSentinel from '../InfiniteScrollSentinel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('InfiniteScrollSentinel', () => {
  const roots: Root[] = [];
  let observe: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let callback: IntersectionObserverCallback | undefined;

  beforeEach(() => {
    observe = vi.fn();
    disconnect = vi.fn();
    callback = undefined;
    class TestIntersectionObserver {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  function render(props: Partial<React.ComponentProps<typeof InfiniteScrollSentinel>> = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onLoadMore = vi.fn();
    act(() => {
      root.render(
        <InfiniteScrollSentinel
          enabled
          hasMore
          isLoadingMore={false}
          loadMoreError={null}
          onLoadMore={onLoadMore}
          {...props}
        />,
      );
    });
    roots.push(root);
    return { container, onLoadMore };
  }

  it('loads once per intersection and allows another load after leaving and re-entering', () => {
    const { container, onLoadMore } = render();
    expect(observe).toHaveBeenCalledWith(container.querySelector('[data-testid="infinite-scroll-sentinel"]'));

    act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => callback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('does not auto-load while disabled, exhausted, loading, or in error state', () => {
    for (const props of [
      { enabled: false },
      { hasMore: false },
      { isLoadingMore: true },
      { loadMoreError: new Error('retry') },
    ]) {
      const { container, onLoadMore } = render(props);
      act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(onLoadMore).not.toHaveBeenCalled();
      act(() => roots.at(-1)!.unmount());
      roots.pop();
      container.remove();
    }
  });

  it('labels a pagination error before offering retry', () => {
    const { container, onLoadMore } = render({
      hasMore: true,
      loadMoreError: new Error('network'),
    });

    expect(container.querySelector('[data-testid="infinite-scroll-sentinel"]')?.textContent)
      .toContain(t('loadMoreFailed'));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('renders no footer when pagination is exhausted', () => {
    const { container } = render({ hasMore: false });

    expect(container.querySelector('[data-testid="infinite-scroll-sentinel"]')).toBeNull();
  });
});
