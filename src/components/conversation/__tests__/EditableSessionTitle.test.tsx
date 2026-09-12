// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditableSessionTitle from '../EditableSessionTitle';
import { SESSION_TITLE_LIMIT, sessionTitleLength } from '../../../lib/session-title';

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

/** Write through React's own value descriptor so the controlled input sees it. */
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  setter?.call(input, value);
}

function changeInput(input: HTMLInputElement, value: string) {
  act(() => {
    setInputValue(input, value);
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
    const shellBefore = container.querySelector('[data-session-title-shell]');
    expect(shellBefore?.className).toContain('h-8');
    expect(container.querySelector('[data-session-title-edit-icon]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('原始标题');
    expect(container.querySelector('[data-session-title-shell]')).toBe(shellBefore);
    expect(shellBefore?.getAttribute('data-editing')).toBe('true');
    expect(container.querySelector('[data-session-title-edit-icon]')).toBeNull();
    expect(input?.className).toContain('h-8');
    expect(input?.className).toContain('absolute inset-0');
    expect(input?.className).toContain('w-full');
  });

  // A one-character title sizes the box down to the caret. The floor only
  // applies while editing, so the resting box still hugs the title.
  it('opens a one-character title to a minimum editing width', () => {
    const { container, root } = renderTitle({ title: '气' });
    roots.push(root);

    const shell = container.querySelector<HTMLElement>('[data-session-title-shell]');
    expect(shell?.style.minWidth).toBe('');

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    // Clamped against the max so the field can never outgrow a narrow sidebar.
    expect(shell?.style.minWidth).toBe('min(200px, calc(100% - 16px))');
    expect(shell?.style.maxWidth).toBe('calc(100% - 16px)');
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

  it('holds the field to the shared limit in visible characters, not code units', () => {
    const { container, root, onRename } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]')!;
    // No `maxLength`: the browser would count UTF-16 units and would enforce it
    // mid-composition.
    expect(input.getAttribute('maxlength')).toBeNull();

    // An astronaut costs seven code units and reads as one character. Pasting
    // seventy of them leaves sixty, not eight.
    changeInput(input, '👩🏽‍🚀'.repeat(70));
    expect(sessionTitleLength(input.value)).toBe(SESSION_TITLE_LIMIT);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onRename).toHaveBeenCalledWith('👩🏽‍🚀'.repeat(60));
  });

  it('lets an IME finish its word before measuring it', () => {
    const { container, root, onRename } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]')!;

    // While a composition is open the buffer is left alone — cutting it here is
    // what makes an IME rewrite text that is no longer there.
    act(() => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    changeInput(input, '字'.repeat(70));
    expect(input.value).toBe('字'.repeat(70));

    // It is measured the moment the word is committed.
    act(() => {
      setInputValue(input, '字'.repeat(70));
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    expect(input.value).toBe('字'.repeat(60));

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onRename).toHaveBeenCalledWith('字'.repeat(60));
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

  it('saves on blur after a previous Escape cancel', () => {
    const { container, root, onRename } = renderTitle();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const firstInput = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(firstInput).not.toBeNull();

    act(() => {
      firstInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onRename).not.toHaveBeenCalled();

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });
    const secondInput = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(secondInput).not.toBeNull();
    changeInput(secondInput!, '第二次标题');

    act(() => {
      secondInput?.blur();
    });

    expect(onRename).toHaveBeenCalledWith('第二次标题');
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

  // The title must not shift when canEdit flips — a read-only title used to
  // render as a bare span, landing 9px further left and 32px shorter.
  it('keeps the title box identical whether or not it is editable', () => {
    const shellOf = (canEdit: boolean) => {
      const { container, root } = renderTitle({ canEdit, className: 'min-w-0 flex-1 text-left' });
      roots.push(root);
      return container.querySelector('[data-session-title-shell]');
    };

    const editable = shellOf(true);
    const readOnly = shellOf(false);

    // The shell owns the box; the control inside it owns the horizontal inset.
    // Together they put the first glyph at the same offset in both branches.
    for (const cls of ['h-8', 'w-fit', 'border', 'border-transparent', 'rounded-[6px]']) {
      expect(readOnly?.className).toContain(cls);
      expect(editable?.className).toContain(cls);
    }
    expect(readOnly?.firstElementChild?.className).toContain('px-2');
    expect(editable?.firstElementChild?.className).toContain('px-2');
    expect(readOnly?.getAttribute('style')).toBe(editable?.getAttribute('style'));
    // Both branches hand the caller's layout classes to the same wrapper depth.
    expect(readOnly?.parentElement?.className).toBe(editable?.parentElement?.className);
  });
});
