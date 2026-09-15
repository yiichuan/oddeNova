// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInput from '../ChatInput';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Provide localStorage mock for happy-dom (ThinkingLevelControl reads it on mount)
if (!globalThis.localStorage) {
  const store: Record<string, string> = {};
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      key: (index: number) => Object.keys(store)[index] ?? null,
      length: () => Object.keys(store).length,
    },
  });
}

const mobileState = vi.hoisted(() => ({ value: false }));
vi.mock('../../../hooks/useIsMobile', () => ({
  useIsMobile: () => mobileState.value,
}));

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
    mobileState.value = false;
  });

  it('shows initializing status without retry and keeps send available for text', () => {
    const { container, root } = renderChatInput({
      engineReady: false,
      engineStatus: 'initializing',
      prefill: '先聊聊今天',
    });
    roots.push(root);

    expect(container.textContent).toContain('Initializing...');
    expect(container.querySelector('button[title="Restart engine"]')).toBeNull();
    expect(getSubmitButton(container).disabled).toBe(false);
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

  it('always draws the input outline inside the card', () => {
    const { container, root } = renderChatInput();
    roots.push(root);

    const inputCard = container.querySelector('form')?.firstElementChild;
    expect(inputCard?.className).toContain('chat-input-surface');
    expect(inputCard?.className).toContain('chat-input-outline');
    expect(inputCard?.className).toContain('rounded-t-none');
    expect(inputCard?.className).toContain('rounded-b-region');
    expect(inputCard?.className).not.toContain('ring-[#323232]');
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

  it('reports a Tab-adopted suggestion as the suggestion entry point', () => {
    const onSendText = vi.fn();
    const { container, root } = renderChatInput({
      onSendText,
      suggestions: ['Try a sparse jazz groove'],
    });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(textarea.value).toBe('Try a sparse jazz groove');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onSendText).toHaveBeenCalledWith('Try a sparse jazz groove', 'suggestion');
  });

  it('reports manually edited text as the text entry point', () => {
    const onSendText = vi.fn();
    const { container, root } = renderChatInput({
      onSendText,
      suggestions: ['Try a sparse jazz groove'],
    });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }));
      setter?.call(textarea, 'Try a sparse jazz groove with brushes');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onSendText).toHaveBeenCalledWith('Try a sparse jazz groove with brushes', 'text');
  });

  it('focuses without adopting the suggestion when the input card is tapped on mobile', () => {
    mobileState.value = true;
    const { container, root } = renderChatInput({
      suggestions: ['Try a sparse jazz groove'],
    });
    roots.push(root);
    const form = container.querySelector<HTMLFormElement>('form');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!form || !textarea) throw new Error('chat input not found');

    act(() => form.click());

    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe('');
    expect(container.textContent).toContain('⏎ to use');
  });

  it('adopts instead of sending the suggestion when Enter is pressed on an empty mobile input', () => {
    mobileState.value = true;
    const onSendText = vi.fn();
    const { container, root } = renderChatInput({
      onSendText,
      suggestions: ['Try a sparse jazz groove'],
    });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');

    act(() => textarea.focus());
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(textarea.value).toBe('Try a sparse jazz groove');
    expect(onSendText).not.toHaveBeenCalled();
  });

  it('leaves mobile Enter for text entry instead of submitting choice input', () => {
    mobileState.value = true;
    const onSendText = vi.fn();
    const { container, root } = renderChatInput({
      inputMode: 'choice',
      onSendText,
      suggestions: ['Try a sparse jazz groove'],
    });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;

    act(() => {
      setter?.call(textarea, '1');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    act(() => textarea.dispatchEvent(enter));

    expect(enter.defaultPrevented).toBe(false);
    expect(onSendText).not.toHaveBeenCalled();
  });

  it('shows dedicated copy and disables the suggestion carousel in choice mode', () => {
    const { container, root } = renderChatInput({
      inputMode: 'choice',
      suggestions: ['Try a sparse jazz groove'],
    });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');

    expect(textarea.placeholder).toBe('Reply with a number or describe your idea...');
    expect(container.textContent).not.toContain('Tab to use');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(textarea.value).toBe('');
  });
});

describe('ChatInput Thinking level control', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('renders next to the send button when not in replay mode', () => {
    const { container, root } = renderChatInput();
    roots.push(root);

    expect(container.querySelector('button[title="Thinking level"]')).not.toBeNull();
  });

  it('is disabled while the agent is loading, same as the rest of the input', () => {
    const { container, root } = renderChatInput({ isLoading: true });
    roots.push(root);

    const trigger = container.querySelector<HTMLButtonElement>('button[title="Thinking level"]');
    expect(trigger?.disabled).toBe(true);
  });

  it('is not rendered during replay', () => {
    const { container, root } = renderChatInput({ replayValue: 's("bd")' });
    roots.push(root);

    expect(container.querySelector('button[title="Thinking level"]')).toBeNull();
  });
});

describe('ChatInput thinking level focus decoupling', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    localStorage.clear();
  });

  function getTrigger(container: HTMLElement): HTMLButtonElement {
    const trigger = container.querySelector<HTMLButtonElement>('button[title="Thinking level"]');
    if (!trigger) throw new Error('thinking level trigger not found');
    return trigger;
  }

  function getPopover(container: HTMLElement): HTMLElement {
    const popover = container.querySelector<HTMLElement>('[data-testid="thinking-level-popover"]');
    if (!popover) throw new Error('thinking level popover not found');
    return popover;
  }

  function getSlider(container: HTMLElement): HTMLInputElement {
    const slider = container.querySelector<HTMLInputElement>('[data-testid="thinking-level-slider"]');
    if (!slider) throw new Error('thinking level slider not found');
    return slider;
  }

  function press(el: Element, type: string, init: PointerEventInit = {}): PointerEvent {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
    act(() => el.dispatchEvent(event));
    return event;
  }

  it('does not focus the textarea when tapping the control while it is unfocused', () => {
    const onFocusChange = vi.fn();
    const { container, root } = renderChatInput({ onFocusChange });
    roots.push(root);
    const textarea = container.querySelector('textarea');

    act(() => getTrigger(container).click());

    expect(getPopover(container)).not.toBeNull();
    expect(document.activeElement).not.toBe(textarea);
    expect(onFocusChange).not.toHaveBeenCalledWith(true);

    act(() => getSlider(container).click());
    const heading = container.querySelector<HTMLElement>('[data-testid="thinking-level-heading"]');
    if (!heading) throw new Error('thinking level heading not found');
    act(() => heading.click());

    expect(document.activeElement).not.toBe(textarea);
    expect(onFocusChange).not.toHaveBeenCalledWith(true);
  });

  it('still focuses the textarea when the card blank area is clicked', () => {
    const onFocusChange = vi.fn();
    const { container, root } = renderChatInput({ onFocusChange });
    roots.push(root);
    const textarea = container.querySelector('textarea');

    const card = container.querySelector<HTMLElement>('.chat-input-surface');
    if (!card) throw new Error('input card not found');
    act(() => card.click());

    expect(document.activeElement).toBe(textarea);
    expect(onFocusChange).toHaveBeenCalledWith(true);
  });

  it('clicking the send button sends without focusing the textarea', () => {
    const onSendText = vi.fn();
    const onFocusChange = vi.fn();
    const { container, root } = renderChatInput({ onSendText, onFocusChange });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;

    act(() => {
      setter?.call(textarea, '来一段 house');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    onFocusChange.mockClear();
    act(() => getSubmitButton(container).click());

    expect(onSendText).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(textarea);
    expect(onFocusChange).not.toHaveBeenCalled();
  });

  it('cancels press defaults on the control while the textarea is focused and keeps text intact', () => {
    const onFocusChange = vi.fn();
    const { container, root } = renderChatInput({ onFocusChange });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('textarea not found');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;

    act(() => {
      setter?.call(textarea, 'hello world');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => textarea.setSelectionRange(3, 7));
    act(() => textarea.focus());
    expect(onFocusChange).toHaveBeenCalledWith(true);
    onFocusChange.mockClear();

    act(() => getTrigger(container).click());

    for (const el of [getTrigger(container), getSlider(container), getPopover(container)]) {
      const pointerDown = press(el, 'pointerdown', {
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
        button: 0,
      });
      expect(pointerDown.defaultPrevented).toBe(true);
      const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
      act(() => el.dispatchEvent(mouseDown));
      expect(mouseDown.defaultPrevented).toBe(true);
    }

    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe('hello world');
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(7);
    expect(onFocusChange).not.toHaveBeenCalled();
  });

  it('keeps native press defaults while the textarea is unfocused', () => {
    const { container, root } = renderChatInput();
    roots.push(root);

    const pointerDown = press(getTrigger(container), 'pointerdown', {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      button: 0,
    });
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    act(() => getTrigger(container).dispatchEvent(mouseDown));

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(mouseDown.defaultPrevented).toBe(false);
  });

  it('still focuses through focusTrigger after the decoupling changes', () => {
    const { container, root } = renderChatInput({ focusTrigger: 1 });
    roots.push(root);
    const textarea = container.querySelector('textarea');

    expect(document.activeElement).toBe(textarea);
  });
});
