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
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
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

    expect(container.textContent).toContain('Initializing...');
    expect(container.querySelector('button[title="Restart engine"]')).toBeNull();
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

    expect(container.textContent).toContain('Engine init failed');
    const retryButton = container.querySelector<HTMLButtonElement>('button[title="Restart engine"]');
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

  it('reports textarea focus changes to the parent', () => {
    const onFocusChange = vi.fn();
    const { container, root } = renderChatInput({
      engineReady: true,
      engineStatus: 'ready',
      onFocusChange,
    });
    roots.push(root);

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).not.toBeNull();

    act(() => {
      textarea?.focus();
    });

    expect(onFocusChange).toHaveBeenCalledWith(true);

    act(() => {
      textarea?.blur();
    });

    expect(onFocusChange).toHaveBeenCalledWith(false);
  });

  it('focusTrigger 变化时即使 prefill 内容相同也会重新回填输入框', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const baseProps = {
      isLoading: false,
      engineReady: true,
      engineStatus: 'ready' as const,
      onSendText: vi.fn(),
      onReinitEngine: vi.fn(),
    };

    act(() => {
      root.render(<ChatInput {...baseProps} prefill="来一段 house" focusTrigger={1} />);
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');
    expect(textarea.value).toBe('来一段 house');

    // Simulate user editing the prefilled text
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
    act(() => {
      setter?.call(textarea, '用户编辑后的内容');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(textarea.value).toBe('用户编辑后的内容');

    // Roll back to a message with the same content again: prefill string unchanged, but focusTrigger incremented
    act(() => {
      root.render(<ChatInput {...baseProps} prefill="来一段 house" focusTrigger={2} />);
    });

    expect(textarea.value).toBe('来一段 house');
  });

  it('waits for an explicit video focus trigger before focusing replay text', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    const baseProps = {
      isLoading: false,
      engineReady: true,
      engineStatus: 'ready' as const,
      onSendText: vi.fn(),
      onReinitEngine: vi.fn(),
      isVideoMode: true,
      replayValue: '',
    };

    act(() => {
      root.render(<ChatInput {...baseProps} focusTrigger={0} />);
    });

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');
    expect(textarea.value).toBe('');
    expect(textarea.readOnly).toBe(true);
    expect(document.activeElement).not.toBe(textarea);

    act(() => {
      root.render(<ChatInput {...baseProps} focusTrigger={1} />);
    });

    expect(document.activeElement).toBe(textarea);
    expect(textarea.readOnly).toBe(true);
  });
});
