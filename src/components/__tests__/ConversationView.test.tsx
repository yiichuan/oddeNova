// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import ConversationView from '../ConversationView';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function setMobileViewport(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderConversationView(
  messages: ChatMessage[],
  onRollback = vi.fn(),
  isLoading = false,
  showThinkingIndicator = true,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ConversationView
        messages={messages}
        isLoading={isLoading}
        showThinkingIndicator={showThinkingIndicator}
        onRollback={onRollback}
        onBranch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
  });

  return { container, root };
}

describe('ConversationView mobile interactions', () => {
  const roots: Root[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('prevents text selection and the native callout on mobile rollback bubbles', () => {
    setMobileViewport(true);
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: '来点动感音乐',
      timestamp: 1,
    };
    const { container, root } = renderConversationView([message]);
    roots.push(root);

    const bubble = container.querySelector<HTMLElement>('[data-rollback-bubble="user-1"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.classList.contains('mobile-rollback-bubble-no-select')).toBe(true);
    expect(bubble?.style.userSelect).toBe('none');

    const contextMenuEvent = new Event('contextmenu', { bubbles: true, cancelable: true });
    bubble?.dispatchEvent(contextMenuEvent);

    expect(contextMenuEvent.defaultPrevented).toBe(true);
  });

  it('keeps the mobile rollback button disabled until a long press completes', () => {
    vi.useFakeTimers();
    setMobileViewport(true);
    const onRollback = vi.fn();
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: '来点动感音乐',
      timestamp: 1,
    };
    const { container, root } = renderConversationView([message], onRollback);
    roots.push(root);

    const bubble = container.querySelector<HTMLElement>('[data-rollback-bubble="user-1"]');
    const button = container.querySelector<HTMLButtonElement>('button[title="Roll back to here"]');
    expect(button?.disabled).toBe(true);

    act(() => {
      button?.click();
    });
    expect(onRollback).not.toHaveBeenCalled();

    act(() => {
      bubble?.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(500);
    });

    expect(button?.disabled).toBe(false);

    act(() => {
      button?.click();
    });
    expect(onRollback).toHaveBeenCalledWith('user-1');
  });

  it('cancels the previous pending long press when another touch starts', () => {
    vi.useFakeTimers();
    setMobileViewport(true);
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '第一条',
        timestamp: 1,
      },
      {
        id: 'user-2',
        role: 'user',
        content: '第二条',
        timestamp: 2,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const firstBubble = container.querySelector<HTMLElement>('[data-rollback-bubble="user-1"]');
    const secondBubble = container.querySelector<HTMLElement>('[data-rollback-bubble="user-2"]');
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[title="Roll back to here"]'));

    act(() => {
      firstBubble?.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
      secondBubble?.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
      secondBubble?.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(500);
    });

    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});

describe('ConversationView chat streaming', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('can suppress the generic thinking row while chat text streams in assistant bubbles', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '你是谁',
        timestamp: 1,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '我是 oddeNova',
        timestamp: 2,
      },
    ];
    const { container, root } = renderConversationView(
      messages,
      vi.fn(),
      true,
      false,
    );
    roots.push(root);

    expect(container.textContent).toContain('我是 oddeNova');
    expect(container.textContent).not.toContain('Thinking...');
  });
});
