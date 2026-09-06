import { useEffect, useRef } from 'react';
import { t } from '../../lib/i18n';

export interface InfiniteScrollSentinelProps {
  enabled: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: Error | null;
  onLoadMore: () => void;
  onRetryLoadMore?: () => void;
}

/**
 * A small, state-aware intersection target for cursor-paginated lists.
 *
 * IntersectionObserver can report the same visible target repeatedly while a
 * request is in flight. The latch below makes one visible crossing one request;
 * leaving the viewport resets it so the next crossing can load another page.
 */
export default function InfiniteScrollSentinel({
  enabled,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  onRetryLoadMore = () => {},
}: InfiniteScrollSentinelProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const intersectedRef = useRef(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        intersectedRef.current = false;
        return;
      }
      if (
        intersectedRef.current
        || !enabled
        || !hasMore
        || isLoadingMore
        || loadMoreError
      ) return;
      intersectedRef.current = true;
      onLoadMore();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, hasMore, isLoadingMore, loadMoreError, onLoadMore]);

  if (!hasMore && !loadMoreError) return null;

  return (
    <div
      ref={targetRef}
      data-testid="infinite-scroll-sentinel"
      className="px-4 py-3 text-center text-[11px] text-text-muted"
    >
      {loadMoreError ? (
        <span className="inline-flex items-center gap-2">
          <span>{t('loadMoreFailed')}</span>
          <button
            type="button"
            onClick={onRetryLoadMore}
            className="text-text-secondary underline decoration-border underline-offset-2 hover:text-text-primary"
          >
            {t('retry')}
          </button>
        </span>
      ) : isLoadingMore ? (
        t('loading')
      ) : null}
    </div>
  );
}
