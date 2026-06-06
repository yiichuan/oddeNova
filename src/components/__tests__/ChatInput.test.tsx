// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatInput from '../ChatInput';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderChatInput(props: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: Parameters<typeof ChatInput>[0] = {
    isLoading: false,
    engineReady: props.engineStatus === 'ready',
    engineStatus: 'ready',
    onSendText: vi.fn(),
    onReinitEngine: vi.fn(),
  };

  act(() => {
    root.render(<ChatInput {...defaultProps} {...props} />);
  });

  return { container, root };
}

function getSubmitButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[title="发送"]');
  if (!button) throw new Error('send button not found');
  return button;
}

describe('ChatInput engine initialization status', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('shows initializing status without retry and disables send', () => {
    const { container, root } = renderChatInput({ engineReady: false, engineStatus: 'initializing' });
    roots.push(root);

    expect(container.textContent).toContain('初始化中...');
    expect(container.querySelector('button[title="重启引擎"]')).toBeNull();
    expect(getSubmitButton(container).disabled).toBe(true);
  });

  it('shows failed status with retry button', () => {
    const onReinitEngine = vi.fn();
    const { container, root } = renderChatInput({
      engineReady: false,
      engineStatus: 'failed',
      onReinitEngine,
    });
    roots.push(root);

    expect(container.textContent).toContain('初始化失败');
    const retryButton = container.querySelector<HTMLButtonElement>('button[title="重新初始化"]');
    expect(retryButton).not.toBeNull();

    act(() => retryButton?.click());

    expect(onReinitEngine).toHaveBeenCalledOnce();
    expect(getSubmitButton(container).disabled).toBe(true);
  });

  it('hides status and enables send after text input when ready', () => {
    const { container, root } = renderChatInput({
      engineReady: true,
      engineStatus: 'ready',
      prefill: '来一段 house',
    });
    roots.push(root);

    expect(container.textContent).not.toContain('初始化中...');
    expect(container.textContent).not.toContain('初始化失败');
    expect(getSubmitButton(container).disabled).toBe(false);
  });
});
