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

  it('hides retry/branch actions on a greeting bubble but keeps them on a normal assistant message', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'greeting-1',
        role: 'assistant',
        content: '嗨，我在这儿。',
        timestamp: 1,
        isGreeting: true,
      },
      {
        id: 'u1',
        role: 'user',
        content: '来段鼓点',
        timestamp: 2,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '已经加上了。',
        timestamp: 3,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const retryButtons = container.querySelectorAll('button[title="Retry"]');
    const branchButtons = container.querySelectorAll('button[title="Branch conversation from here"]');

    expect(retryButtons).toHaveLength(1);
    expect(branchButtons).toHaveLength(1);
  });

  it('shows retry/branch only on the final assistant message of a turn, not on intermediate narration', () => {
    setMobileViewport(false);
    // One turn where the model narrates mid-loop (an intermediate assistant
    // bubble), then commits a final answer. Progress messages interleave, so the
    // two assistant texts never merge. Retry/branch are turn-level actions —
    // they must appear once, on the final message only.
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '好', timestamp: 1 },
      { id: 'p1', role: 'progress', content: 'setCode(...)', timestamp: 2, progressKind: 'tool_call' },
      { id: 'a1', role: 'assistant', content: '代码各层之间漏了逗号。修正一下。', timestamp: 3 },
      { id: 'p2', role: 'progress', content: '准备播放...', timestamp: 4, progressKind: 'commit' },
      { id: 'a2', role: 'assistant', content: '把橘色光芒转译成了温暖的 ambient。', timestamp: 5, code: 'setcps(0.5)' },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const retryButtons = container.querySelectorAll('button[title="Retry"]');
    const branchButtons = container.querySelectorAll('button[title="Branch conversation from here"]');

    expect(retryButtons).toHaveLength(1);
    expect(branchButtons).toHaveLength(1);
  });

  it('renders assistant markdown without exposing formatting markers', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '我是 **chay**，可以写 `lo-fi`。\n\n接下来可以：\n- 加一点 swing\n- 铺柔和钢琴',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    expect(container.textContent).toContain('我是 chay，可以写 lo-fi。');
    expect(container.textContent).not.toContain('**chay**');
    expect(container.querySelector('strong')?.textContent).toBe('chay');
    expect(container.querySelector('code')?.textContent).toBe('lo-fi');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a horizontal rule for thematic breaks instead of literal dashes', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '方向一\n\n---\n\n方向二',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    expect(container.querySelectorAll('hr')).toHaveLength(1);
    expect(container.textContent).not.toContain('---');
  });

  it('renders safe links and drops unsafe markdown hrefs', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '[官网](https://www.oddenova.com) [坏链接](javascript:alert(1))',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const link = container.querySelector<HTMLAnchorElement>('a');
    expect(link?.textContent).toBe('官网');
    expect(link?.href).toBe('https://www.oddenova.com/');
    expect(container.textContent).toContain('坏链接');
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
});
