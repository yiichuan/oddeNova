// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInput from '../ChatInput';

import type { HummingInputController } from '../../../hooks/useHummingInput';
import { hummingDraft } from '../../../lib/__tests__/fixtures/humming';

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

  it('reveals the Tab key only after each desktop suggestion finishes typing', () => {
    vi.useFakeTimers();
    try {
      const { container, root } = renderChatInput({ suggestions: ['First idea', 'Second idea'] });
      roots.push(root);
      const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
      const tabKey = () => container.querySelector('kbd');

      advance(400);
      expect(container.textContent).toContain('First');
      expect(tabKey()).toBeNull();

      advance(80);
      expect(container.textContent).toContain('First idea');
      expect(tabKey()).toBeNull();
      advance(349);
      expect(tabKey()).toBeNull();
      advance(1);
      expect(tabKey()?.textContent).toBe('Tab');
      expect(container.querySelector('textarea')?.getAttribute('aria-keyshortcuts')).toBe('Tab');

      const key = tabKey()!;
      act(() => key.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
      expect(container.textContent).toContain('Press Tab to fill');
      advance(10_000);
      expect(container.textContent).toContain('First idea');
      expect(tabKey()).toBe(key);

      act(() => key.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
      expect(container.textContent).not.toContain('Press Tab to fill');
      advance(5500);
      advance(350);
      advance(400);
      expect(container.textContent).toContain('Second');
      expect(tabKey()).toBeNull();

      advance(80);
      advance(350);
      expect(tabKey()?.textContent).toBe('Tab');
    } finally {
      vi.useRealTimers();
    }
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

  it('shows a delayed Return keycap only while the mobile input is focused', () => {
    mobileState.value = true;
    vi.useFakeTimers();
    try {
      const { container, root } = renderChatInput({ suggestions: ['Jazz'] });
      roots.push(root);
      const form = container.querySelector('form')!;
      const textarea = container.querySelector('textarea')!;

      act(() => { vi.advanceTimersByTime(400); });
      expect(container.textContent).toContain('Jazz');
      expect(container.querySelector('kbd')).toBeNull();

      act(() => form.click());
      expect(document.activeElement).toBe(textarea);
      expect(textarea.value).toBe('');
      expect(container.querySelector('kbd')).toBeNull();
      expect(container.textContent).not.toContain('⏎ to use');

      act(() => { vi.advanceTimersByTime(350); });
      expect(container.querySelector('kbd')?.textContent).toBe('⏎');
      expect(textarea.getAttribute('aria-keyshortcuts')).toBe('Enter');

      act(() => textarea.blur());
      expect(container.querySelector('kbd')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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

    expect(textarea.placeholder).toBe('Or write your own idea…');
    expect(container.querySelector('kbd')).toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(textarea.value).toBe('');
  });

  it('sends a selected option as the message and preserves the typed draft', async () => {
    let finishSend: (() => void) | undefined;
    const onSendText = vi.fn(() => new Promise<void>((resolve) => { finishSend = resolve; }));
    const option = 'Add a **soft heartbeat** with the timpani';
    const { container, root } = renderChatInput({
      inputMode: 'choice',
      choiceOptions: [option, 'Let the choir grow brighter'],
      onSendText,
    });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    const button = container.querySelector<HTMLButtonElement>('[role="group"] button');
    if (!textarea || !button) throw new Error('choice composer not found');
    expect(textarea.placeholder).toBe('Or write your own idea…');
    expect(button.textContent).toBe('Add a soft heartbeat with the timpani');
    expect(button.querySelector('svg')).toBeNull();
    expect(button.closest('.chat-input-surface')).toBeNull();
    expect(button.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;

    await act(async () => {
      setter?.call(textarea, 'Keep this extra idea');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      button.click();
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      button.click();
    });

    expect(onSendText).toHaveBeenCalledTimes(1);
    expect(onSendText).toHaveBeenCalledWith('Add a soft heartbeat with the timpani', 'choice');
    expect(textarea.value).toBe('Keep this extra idea');
    expect(button.disabled).toBe(true);
    expect(getSubmitButton(container).disabled).toBe(true);

    await act(async () => { finishSend?.(); });
    expect(button.disabled).toBe(false);
    expect(getSubmitButton(container).disabled).toBe(false);
  });

  it('blocks a choice while a manually entered message is sending', async () => {
    let finishSend: (() => void) | undefined;
    const onSendText = vi.fn(() => new Promise<void>((resolve) => { finishSend = resolve; }));
    const { container, root } = renderChatInput({
      inputMode: 'choice',
      choiceOptions: ['Add a soft heartbeat'],
      prefill: 'Use a piano instead',
      onSendText,
    });
    roots.push(root);
    const button = container.querySelector<HTMLButtonElement>('[role="group"] button');
    if (!button) throw new Error('choice button not found');

    act(() => {
      getSubmitButton(container).click();
      button.click();
    });

    expect(onSendText).toHaveBeenCalledTimes(1);
    expect(onSendText).toHaveBeenCalledWith('Use a piano instead', 'text');
    expect(button.disabled).toBe(true);
    await act(async () => { finishSend?.(); });
    expect(button.disabled).toBe(false);
  });

  it('keeps choices available and reports a synchronous send failure', async () => {
    const onSendText = vi.fn().mockRejectedValue(new Error('Session changed'));
    const { container, root } = renderChatInput({
      inputMode: 'choice',
      choiceOptions: ['Add a soft heartbeat', 'Let the choir grow brighter'],
      onSendText,
    });
    roots.push(root);
    const button = container.querySelector<HTMLButtonElement>('[role="group"] button');
    if (!button) throw new Error('choice button not found');

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(onSendText).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Session changed');
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

describe('ChatInput guide preset on a phone', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    mobileState.value = true;
  });

  afterEach(() => {
    mobileState.value = false;
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('does not pull focus into the read-only preset when the card is tapped', () => {
    const onSend = vi.fn();
    const onFocusChange = vi.fn();
    const { container, root } = renderChatInput({
      onFocusChange,
      presetLock: { text: 'Keep the chords, add a piano run.', busy: false, onSend },
    });
    roots.push(root);
    const card = container.querySelector<HTMLElement>('.chat-input-surface');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!card || !textarea) throw new Error('chat input not found');

    act(() => card.click());

    expect(document.activeElement).not.toBe(textarea);
    expect(onFocusChange).not.toHaveBeenCalledWith(true);
    // Even a direct tap asks for no keyboard.
    expect(textarea.readOnly).toBe(true);
    expect(textarea.getAttribute('inputmode')).toBe('none');
    expect(container.textContent).not.toContain('Guided practice · preset example');
  });

  it('shows no placeholder or suggestion while the guide runs', () => {
    const { container, root } = renderChatInput({ guided: true, suggestions: ['Try a sparse jazz groove'] });
    roots.push(root);
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('chat input not found');

    expect(textarea.placeholder).toBe('');
    expect(container.textContent).not.toContain('Try a sparse jazz groove');
  });

  it('leaves the stop key unpressable while the guide runs', () => {
    const onStop = vi.fn();
    const { container, root } = renderChatInput({ guided: true, isLoading: true, onStop });
    roots.push(root);
    const stop = container.querySelector<HTMLButtonElement>('button[title="Stop"]');
    if (!stop) throw new Error('stop key not found');

    expect(stop.disabled).toBe(true);
    act(() => stop.click());
    expect(onStop).not.toHaveBeenCalled();
  });

  it('sends the preset once through the real send key and not while it loads', () => {
    const onSend = vi.fn();
    const { container, root } = renderChatInput({
      presetLock: { text: 'Keep the chords, add a piano run.', busy: false, onSend },
    });
    roots.push(root);
    const send = getSubmitButton(container);

    expect(send.dataset.onboardingTarget).toBe('send');
    act(() => send.click());
    expect(onSend).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <ChatInput
          isLoading={false}
          engineReady
          onSendText={vi.fn()}
          onReinitEngine={vi.fn()}
          presetLock={{ text: 'Keep the chords, add a piano run.', busy: true, onSend }}
        />,
      );
    });
    expect(getSubmitButton(container).disabled).toBe(true);
    act(() => getSubmitButton(container).click());
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe('rollback image draft', () => {
  it('restores an image-only draft and lets the user remove it', async () => {
    const image = { id: 'img', name: 'score.jpg', path: 'owner/img.jpg', mimeType: 'image/jpeg', width: 100, height: 100, size: 100 };
    const onSendText = vi.fn();
    const { container, root } = renderChatInput({ prefill: '', prefillImages: [image], focusTrigger: 1, onSendText });
    await act(async () => { await Promise.resolve(); });
    expect(getSubmitButton(container).disabled).toBe(false);
    const remove = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Remove score.jpg'))!;
    act(() => remove.click());
    expect(getSubmitButton(container).disabled).toBe(true);
    act(() => root.unmount()); container.remove();
  });
});

describe('ChatInput humming recording controls', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    mobileState.value = false;
  });

  function controller(patch: Partial<HummingInputController> = {}): HummingInputController {
    return {
      draft: null,
      earlierTakes: [],
      audioUrl: null,
      isPersistent: true,
      isStarting: false,
      isRecording: false,
      recordingStream: null,
      recordingElapsedSeconds: 0,
      isFinalizingRecording: false,
      isRerecording: false,
      isTranscribing: false,
      waveformToolCalled: false,
      isSavingDraft: false,
      isSavingReplacement: false,
      error: null,
      replacementCandidate: null,
      replacementAudioUrl: null,
      canRecord: true,
      analysis: null,
      understanding: { analyze: vi.fn(async () => null), cancel: vi.fn(), pending: false, result: null, error: null },
      analyze: vi.fn(async () => false),
      startRecording: vi.fn(),
      cancelRecording: vi.fn(),
      stopRecording: vi.fn(),
      reRecord: vi.fn(),
      cancelRerecord: vi.fn(),
      retrySaveReplacement: vi.fn(async () => false),
      useOriginalRecording: vi.fn(),
      retrySave: vi.fn(async () => false),
      discard: vi.fn(),
      cancelTranscription: vi.fn(),
      restoreAttachment: vi.fn(async () => false),
      submit: vi.fn(async () => false),
      ...patch,
    };
  }

  it('opens the recording menu and starts humming only after selection', () => {
    const humming = controller();
    const { container, root } = renderChatInput({ humming });
    roots.push(root);
    const button = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    expect(button).not.toBeNull();
    act(() => button!.click());
    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(humming.startRecording).not.toHaveBeenCalled();
    act(() => items[1].click());
    expect(humming.startRecording).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('puts cancel, level dots, and stop next to the disabled send button', () => {
    const humming = controller({ isRecording: true, recordingElapsedSeconds: 8, canRecord: false });
    const { container, root } = renderChatInput({ humming, prefill: '写入这段旋律' });
    roots.push(root);

    expect(container.textContent).toContain('Recording');
    const stop = container.querySelector<HTMLButtonElement>('button[aria-label="Stop recording"]');
    const cancel = container.querySelector<HTMLButtonElement>('button[aria-label="Discard recording"]');
    const send = getSubmitButton(container);
    const pill = stop?.closest('[data-expanded="true"]');
    expect(pill?.querySelector('[role="timer"]')?.textContent).toBe('0:08');
    expect(pill?.contains(cancel)).toBe(true);
    expect(pill?.querySelector('svg path[stroke-linecap="round"]')).not.toBeNull();
    expect(pill?.parentElement?.nextElementSibling).toBe(send);
    expect(send.querySelector('.lucide-mic-vocal')).not.toBeNull();
    expect(send.disabled).toBe(true);
    expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    act(() => cancel?.click());
    expect(humming.cancelRecording).toHaveBeenCalledOnce();
    act(() => stop?.click());
    expect(humming.stopRecording).toHaveBeenCalledOnce();
  });

  it('replaces the humming waveform with a receiving status while the take is saved', () => {
    const { container, root } = renderChatInput({ humming: controller({ isFinalizingRecording: true }) });
    roots.push(root);

    const pill = container.querySelector('[data-capture-phase="receiving"]');
    expect(pill?.querySelector('[role="status"]')?.textContent).toBe('Receiving');
    expect(pill?.querySelector('.chat-recording-waveform')).toBeNull();
    expect(pill?.querySelector('.lucide-loader-circle')?.classList.contains('animate-spin')).toBe(true);
    expect(pill?.querySelector<HTMLButtonElement>('.chat-recording-pill-action')?.disabled).toBe(true);
    expect(getSubmitButton(container).disabled).toBe(true);
  });

  it('switches the voice recording action to progress until the recorder finishes', async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
    let finishRecording = () => {};
    class TestMediaRecorder {
      static isTypeSupported() { return false; }
      state = 'inactive';
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        finishRecording = () => this.onstop?.();
      }
    }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('MediaRecorder', TestMediaRecorder);
    try {
      const { container, root } = renderChatInput({ humming: controller(), prefill: 'Voice prompt' });
      roots.push(root);
      const recordButton = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
      act(() => recordButton.click());
      await act(async () => container.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());

      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(container.textContent).toContain('Recording voice');
      expect(container.querySelector('button[aria-label="Stop recording"]')).toBe(recordButton);
      expect(recordButton.parentElement?.getAttribute('data-expanded')).toBe('true');
      expect(recordButton.parentElement?.querySelector('[role="timer"]')?.textContent).toBe('0:00');
      expect(getSubmitButton(container).disabled).toBe(true);
      expect(getSubmitButton(container).querySelector('.lucide-message-circle-more')).not.toBeNull();
      act(() => recordButton.click());
      expect(recordButton.parentElement?.getAttribute('data-capture-phase')).toBe('receiving');
      expect(recordButton.getAttribute('aria-label')).toBe('Receiving');
      expect(container.querySelector('.chat-recording-waveform')).toBeNull();
      expect(container.querySelector('.chat-recording-pill-progress .animate-spin')).not.toBeNull();
      expect(getSubmitButton(container).disabled).toBe(true);

      act(finishRecording);
      expect(stopTrack).toHaveBeenCalledOnce();
      expect(container.querySelector('button[aria-haspopup="menu"]')).toBe(recordButton);
      expect(recordButton.parentElement?.getAttribute('data-expanded')).toBe('false');
      expect(getSubmitButton(container).disabled).toBe(false);
      expect(getSubmitButton(container).querySelector('.lucide-message-circle-more')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a compact recording above the text field and sends it through the existing attachment path', () => {
    const humming = controller({ draft: hummingDraft(), audioUrl: 'blob:draft', canRecord: false });
    const { container, root } = renderChatInput({ humming });
    roots.push(root);

    const card = container.querySelector('[data-humming-audio-player]')!;
    const field = container.querySelector('textarea')!;
    expect(card.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector('[aria-label="Play Humming 01"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Analysis result"]')).toBeNull();
    expect([...container.querySelectorAll('button')].map(button => button.textContent?.trim()))
      .not.toContain('Analyze');
    act(() => getSubmitButton(container).click());
    expect(humming.submit).toHaveBeenCalledWith('Write out this melody', 'text');
  });

  it('keeps recognition progress and cancellation on the recording card', () => {
    const humming = controller({
      draft: hummingDraft(), audioUrl: 'blob:draft', isTranscribing: true, canRecord: false,
    });
    const { container, root } = renderChatInput({ humming });
    roots.push(root);

    const card = container.querySelector('[data-humming-audio-player]')!;
    expect(card.querySelector('.lucide-loader-circle')).not.toBeNull();
    expect(container.textContent).not.toContain('Requesting analysis from the agent');
    act(() => card.querySelector<HTMLButtonElement>('[aria-label="Cancel recognition"]')!.click());
    expect(humming.cancelTranscription).toHaveBeenCalledOnce();
    expect(getSubmitButton(container).disabled).toBe(true);
  });

  it('appends a second card in the same row and removes each take by ID', () => {
    const first = hummingDraft();
    const second = { ...hummingDraft(), id: '22222222-2222-4222-8222-222222222222' };
    const humming = controller({
      draft: second, audioUrl: 'blob:second',
      earlierTakes: [{ draft: first, audioUrl: 'blob:first', isPersistent: true }],
    });
    const { container, root } = renderChatInput({ humming });
    roots.push(root);

    const [firstCard, secondCard] = container.querySelectorAll('[data-humming-audio-player]');
    expect(firstCard.parentElement).toBe(secondCard.parentElement);
    expect(firstCard.querySelector('[aria-label="Play Humming 01"]')).not.toBeNull();
    expect(secondCard.querySelector('[aria-label="Play Humming 02"]')).not.toBeNull();
    act(() => firstCard.querySelector<HTMLButtonElement>('[aria-label="Delete recording"]')!.click());
    expect(humming.discard).toHaveBeenCalledWith(first.id);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click());
    act(() => container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1].click());
    expect(humming.startRecording).toHaveBeenCalledOnce();
  });

  it('can dismiss an unsaved replacement from its own card', () => {
    const humming = controller({
      draft: hummingDraft(), audioUrl: 'blob:original', canRecord: false,
      replacementCandidate: { ...hummingDraft(), id: '22222222-2222-4222-8222-222222222222' },
      replacementAudioUrl: 'blob:candidate', error: 'replacement_storage_unavailable',
    });
    const { container, root } = renderChatInput({ humming });
    roots.push(root);

    const [, candidate] = container.querySelectorAll('[data-humming-audio-player]');
    expect(candidate.querySelector('[aria-label="Play Humming 02"]')).not.toBeNull();
    act(() => candidate.querySelector<HTMLButtonElement>('[aria-label="Delete recording"]')!.click());
    expect(humming.useOriginalRecording).toHaveBeenCalledOnce();
    expect(humming.discard).not.toHaveBeenCalled();
  });
});
