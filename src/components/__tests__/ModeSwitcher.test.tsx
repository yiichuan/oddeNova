// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModeSwitcher from '../ModeSwitcher';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderModeSwitcher(props: Partial<Parameters<typeof ModeSwitcher>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChange = props.onChange ?? vi.fn();

  act(() => {
    root.render(
      <ModeSwitcher
        mode={props.mode ?? 'create'}
        onChange={onChange}
      />,
    );
  });

  return { container, root, onChange };
}

describe('ModeSwitcher', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows the current create mode and switches to chat from the popover', () => {
    const { container, root, onChange } = renderModeSwitcher({ mode: 'create' });
    roots.push(root);

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Switch mode"]');
    expect(trigger?.textContent).toContain('Create');

    act(() => trigger?.click());

    const chatButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Chat'));
    expect(chatButton).not.toBeUndefined();

    act(() => chatButton?.click());

    expect(onChange).toHaveBeenCalledWith('chat');
  });

  it('cycles modes with Shift+Tab', () => {
    const { root, onChange } = renderModeSwitcher({ mode: 'chat' });
    roots.push(root);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onChange).toHaveBeenCalledWith('create');
  });
});
