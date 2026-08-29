// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../hooks/useSessions';
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
    expect(container.querySelector('input')).toBeNull();
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
