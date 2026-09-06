// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '../../../../shared/session-api';
import type { Session } from '../../../hooks/useSessions';
import { t } from '../../../lib/i18n';
import HistoryPanel from '../HistoryPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: '旧标题',
    messages: [{ id: 'msg-1', role: 'user', content: 'hello', timestamp: 1 }],
    code: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function renderHistory(props: Partial<React.ComponentProps<typeof HistoryPanel>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSwitch = vi.fn();
  const onDelete = vi.fn();
  const onRename = vi.fn();
  const onFavorite = vi.fn();

  act(() => {
    root.render(
      <HistoryPanel
        sessions={[makeSession()]}
        currentId={null}
        onSwitch={onSwitch}
        onDelete={onDelete}
        onRename={onRename}
        onFavorite={onFavorite}
        {...props}
      />,
    );
  });

  return { container, root, onSwitch, onDelete, onRename, onFavorite };
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('HistoryPanel title editing', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('switches sessions when clicking a history title', () => {
    const { container, root, onSwitch } = renderHistory();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    expect(onSwitch).toHaveBeenCalledWith('s-1');
    expect(container.querySelector('input[aria-label="Edit session title"]')).toBeNull();
  });

  it('renders server summaries in the supplied order without complete session fields', () => {
    const summaries: SessionSummary[] = [
      { id: 'summary-2', title: '第二条', updatedAt: 20 },
      { id: 'summary-1', title: '第一条', updatedAt: 10 },
    ];
    const { container, root, onSwitch } = renderHistory({ sessions: summaries });
    roots.push(root);

    expect([...container.querySelectorAll('button[data-session-title-edit]')]
      .map((button) => button.textContent)).toEqual(['第二条', '第一条']);
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-session-title-edit]')?.click();
    });
    expect(onSwitch).toHaveBeenCalledWith('summary-2');
  });

  it('orders history rows by updatedAt when the input is out of order', () => {
    const { container, root } = renderHistory({
      sessions: [
        makeSession({ id: 'older', title: '更早', updatedAt: 10 }),
        makeSession({ id: 'newer', title: '更新', updatedAt: 20 }),
      ],
    });
    roots.push(root);

    expect([...container.querySelectorAll('button[data-session-title-edit]')]
      .map((button) => button.textContent)).toEqual(['更新', '更早']);
  });

  it('shows pagination loading and retry states without an exhausted-list label', () => {
    const { container, root } = renderHistory({
      hasMore: true,
      isLoadingMore: true,
    });
    roots.push(root);
    expect(container.querySelector('[data-testid="infinite-scroll-sentinel"]')?.textContent)
      .toContain(t('loading'));

    const retry = renderHistory({
      hasMore: true,
      loadMoreError: new Error('network'),
    });
    roots.push(retry.root);
    expect(retry.container.querySelector('[data-testid="infinite-scroll-sentinel"] button')?.textContent)
      .toContain(t('retry'));

    const end = renderHistory({ hasMore: false });
    roots.push(end.root);
    expect(end.container.querySelector('[data-testid="infinite-scroll-sentinel"]')).toBeNull();
  });

  it('labels an initial history loading error before offering retry', () => {
    const { container, root } = renderHistory({
      sessions: [],
      initialError: new Error('network'),
    });
    roots.push(root);

    expect(container.textContent).toContain(t('sessionListNetworkError'));
  });

  it('renames a session from the history list', () => {
    const { container, root, onRename } = renderHistory();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Edit"]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    changeInput(input!, '新标题');

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onRename).toHaveBeenCalledWith('s-1', '新标题');
  });

  it('does not switch sessions while editing a history title', () => {
    const { container, root, onSwitch } = renderHistory();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Edit"]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();

    act(() => {
      input?.click();
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('fills the star in before handing the conversation over to Favorites', () => {
    vi.useFakeTimers();
    const { container, root, onFavorite, onSwitch } = renderHistory();
    roots.push(root);
    const star = container.querySelector<HTMLButtonElement>('button[title="Add to favorites"]');
    expect(star?.querySelector('svg')?.getAttribute('fill')).toBe('none');

    act(() => { star?.click(); });

    // The star answers the click at once; the row leaves under it, and the
    // conversation is not handed over until both have been seen.
    expect(star?.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
    expect(container.querySelector('[data-session-keeping]')).not.toBeNull();
    expect(onFavorite).not.toHaveBeenCalled();
    // Pressing the star is not pressing the row it stands in.
    expect(onSwitch).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(400); });

    expect(onFavorite).toHaveBeenCalledWith('s-1');
    vi.useRealTimers();
  });

  it('leaves the star out entirely when there is nowhere to keep a conversation', () => {
    const { container, root } = renderHistory({ onFavorite: undefined });
    roots.push(root);

    expect(container.querySelector('button[title="Add to favorites"]')).toBeNull();
    expect(container.querySelector('button[title="Delete"]')).not.toBeNull();
  });

  it('leaves kept conversations out of the list', () => {
    const { container, root } = renderHistory({
      sessions: [makeSession(), makeSession({ id: 's-2', title: '已收藏', favoritedAt: 2 })],
    });
    roots.push(root);

    const titles = [...container.querySelectorAll('button[data-session-title-edit]')]
      .map((button) => button.textContent);
    expect(titles).toEqual(['旧标题']);
  });

  it('keeps delete behavior unchanged', () => {
    const { container, root, onDelete } = renderHistory();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Delete"]')?.click();
    });

    expect(onDelete).toHaveBeenCalledWith('s-1');
  });
});

describe('HistoryPanel search', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const titlesIn = (container: HTMLElement) =>
    [...container.querySelectorAll('button[data-session-title-edit]')].map((b) => b.textContent);

  const searchIn = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('[data-testid="history-search-input"]');

  it('narrows the list to titles matching what is typed', () => {
    const { container, root } = renderHistory({
      sessions: [
        makeSession({ id: 's-1', title: '鼓组实验', updatedAt: 2 }),
        makeSession({ id: 's-2', title: 'Bass line', updatedAt: 1 }),
      ],
    });
    roots.push(root);

    changeInput(searchIn(container)!, 'bass');

    expect(titlesIn(container)).toEqual(['Bass line']);
  });

  it('says the query found nothing rather than that there are no sessions', () => {
    const { container, root } = renderHistory();
    roots.push(root);

    changeInput(searchIn(container)!, '没有这个');

    expect(titlesIn(container)).toEqual([]);
    expect(container.textContent).toContain(t('historySearchEmpty'));
    expect(container.textContent).not.toContain(t('noSessions'));
  });

  it('puts the whole list back when the field is cleared', () => {
    const { container, root } = renderHistory();
    roots.push(root);

    changeInput(searchIn(container)!, '没有这个');
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="history-search-clear"]')?.click();
    });

    expect(titlesIn(container)).toEqual(['旧标题']);
    expect(searchIn(container)!.value).toBe('');
  });

  it('leaves the field out while the list is still loading', () => {
    const { container, root } = renderHistory({ sessions: [], isLoading: true });
    roots.push(root);

    expect(searchIn(container)).toBeNull();
  });
});
