// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditableSessionTitle from '../EditableSessionTitle';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderTitle(props: Partial<React.ComponentProps<typeof EditableSessionTitle>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onRename = vi.fn();

  act(() => {
    root.render(
      <EditableSessionTitle
        title="原始标题"
        canEdit={true}
        onRename={onRename}
        {...props}
      />,
    );
  });

  return { container, root, onRename };
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('EditableSessionTitle', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('enters edit mode when editable title is clicked', () => {
    const { container, root } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('原始标题');
  });

  it('saves the trimmed title on Enter', () => {
    const { container, root, onRename } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    changeInput(input!, '  新标题  ');

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onRename).toHaveBeenCalledWith('新标题');
  });

  it('cancels without saving on Escape', () => {
    const { container, root, onRename } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    changeInput(input!, '不要保存');

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
  });

  it('does not save a blank title', () => {
    const { container, root, onRename } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    changeInput(input!, '   ');

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onRename).not.toHaveBeenCalled();
  });

  it('does not enter edit mode when canEdit is false', () => {
    const { container, root } = renderTitle({ canEdit: false });
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('原始标题');
  });
});
