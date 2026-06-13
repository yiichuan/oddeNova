// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';
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

  act(() => {
    root.render(
      <HistoryPanel
        sessions={[makeSession()]}
        currentId={null}
        onSwitch={onSwitch}
        onDelete={onDelete}
        onRename={onRename}
        {...props}
      />,
    );
  });

  return { container, root, onSwitch, onDelete, onRename };
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

  it('renames a session from the history list', () => {
    const { container, root, onRename } = renderHistory();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
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
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();

    act(() => {
      input?.click();
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSwitch).not.toHaveBeenCalled();
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
