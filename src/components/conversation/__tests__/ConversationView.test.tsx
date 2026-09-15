// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../hooks/useChat';
import type { CodeRevision } from '../../../hooks/useSessions';
import ConversationView from '../ConversationView';
import { DRAFT_SEGMENT_ID } from '../../../lib/draft-diff';
import { t } from '../../../lib/i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// lottie-web crashes at import time in happy-dom (no canvas 2D context)
vi.mock('lottie-react', () => ({ default: () => null }));

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

/* What the phone's layout hands down and the desktop's does not: the take's
   own transport, drawn in the widget under the reply. */
type PlaybackProps = {
  isPlaying?: boolean;
  playingCode?: string;
  onPlaySegment?: (segmentId: string, code: string) => void;
  onStopCode?: () => void;
  draftCode?: string;
  /** Overrides the helper's own, so one render can run a turn and the next end
   *  it — which is what arms the turn anchor. */
  isLoading?: boolean;
  /** Which key started what is sounding, and the code it put on. */
  pressedSegmentId?: string | null;
  pressedSegmentCode?: string | null;
};

/** A ResizeObserver whose reports this test fires itself. */
function stubResizeObserver() {
  const callbacks = new Set<ResizeObserverCallback>();
  const original = globalThis.ResizeObserver;
  class Stub {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      callbacks.add(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() { callbacks.delete(this.callback); }
  }
  globalThis.ResizeObserver = Stub as unknown as typeof ResizeObserver;
  return {
    fire: () => {
      for (const callback of callbacks) callback([], {} as ResizeObserver);
    },
    restore: () => { globalThis.ResizeObserver = original; },
  };
}

/** Stand in for layout happy-dom does not do: a live rect read off the stub. */
function stubRect(el: HTMLElement, read: () => { top: number; bottom: number }) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      const { top, bottom } = read();
      return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top };
    },
  });
}

function renderConversationView(
  messages: ChatMessage[],
  onRollback = vi.fn(),
  isLoading = false,
  revisions?: CodeRevision[],
  playback: PlaybackProps = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = (next: PlaybackProps = playback, nextMessages: ChatMessage[] = messages) => {
    act(() => {
      root.render(
        <ConversationView
          messages={nextMessages}
          revisions={revisions}
          isLoading={isLoading}
          onRollback={onRollback}
          onBranch={vi.fn()}
          onRetry={vi.fn()}
          {...next}
        />,
      );
    });
  };
  render();

  return { container, root, render };
}

describe('ConversationView code revisions', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows compact stats and expands a Layer-grouped unified diff', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: '完成',
      code: 'stack(\n/* @layer drums */\ns("bd*2")\n)',
      revisionId: 'rev-1',
      timestamp: 1,
    }];
    const revisions: CodeRevision[] = [{
      id: 'rev-1',
      beforeCode: 'stack(\n/* @layer drums */\ns("bd")\n)',
      afterCode: 'stack(\n/* @layer drums */\ns("bd*2")\n)',
      playbackStatus: 'played',
      createdAt: 1,
    }];
    const { container, root } = renderConversationView(messages, vi.fn(), false, revisions);
    roots.push(root);

    const button = container.querySelector<HTMLButtonElement>('[data-code-diff-toggle="assistant-1"]');
    expect(button?.textContent).toContain('View changes');
    expect(button?.textContent).toContain('+1');
    expect(button?.textContent).toContain('−1');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('DRUMS');

    act(() => button?.click());

    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('DRUMS');
    expect(container.querySelector('[data-diff-kind="remove"]')?.textContent).toContain('s("bd")');
    expect(container.querySelector('[data-diff-kind="add"]')?.textContent).toContain('s("bd*2")');
  });

  /* The phone's code window is shut behind a key in the corner, so the widget
     under the reply is where a take is heard from. */
  it('sounds the take from its widget, and offers to stop the one sounding', () => {
    setMobileViewport(true);
    const afterCode = 'stack(\n/* @layer drums */\ns("bd*2")\n)';
    const messages: ChatMessage[] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: '完成',
      code: afterCode,
      revisionId: 'rev-1',
      timestamp: 1,
    }];
    const revisions: CodeRevision[] = [{
      id: 'rev-1',
      beforeCode: 'stack(\n/* @layer drums */\ns("bd")\n)',
      afterCode,
      playbackStatus: 'played',
      createdAt: 1,
    }];
    const onPlaySegment = vi.fn();
    const onStopCode = vi.fn();
    const { container, root, render } = renderConversationView(
      messages, vi.fn(), false, revisions, { onPlaySegment, onStopCode },
    );
    roots.push(root);

    const key = () => container.querySelector<HTMLButtonElement>('[data-code-diff-play="assistant-1"]');
    expect(key()?.getAttribute('aria-label')).toBe('Play');
    act(() => key()?.click());
    expect(onPlaySegment).toHaveBeenCalledWith('assistant-1', afterCode);
    expect(onStopCode).not.toHaveBeenCalled();

    // What is sounding is what the widget reports, so the key turns over.
    render({ onPlaySegment, onStopCode, isPlaying: true, playingCode: afterCode });
    expect(key()?.getAttribute('aria-label')).toBe('Stop');
    act(() => key()?.click());
    expect(onStopCode).toHaveBeenCalled();
    expect(onPlaySegment).toHaveBeenCalledTimes(1);

    // Something else sounding is not this take sounding.
    render({ onPlaySegment, onStopCode, isPlaying: true, playingCode: 's("hh*4")' });
    expect(key()?.getAttribute('aria-label')).toBe('Play');
  });

  /* The desktop hands none of this down: the code window is already open
     beside the reading, with a transport of its own. */
  it('draws no play key where the reading was given no transport', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: '完成',
      code: 's("bd*2")',
      revisionId: 'rev-1',
      timestamp: 1,
    }];
    const revisions: CodeRevision[] = [{
      id: 'rev-1',
      beforeCode: 's("bd")',
      afterCode: 's("bd*2")',
      playbackStatus: 'played',
      createdAt: 1,
    }];
    const { container, root } = renderConversationView(messages, vi.fn(), false, revisions);
    roots.push(root);

    expect(container.querySelector('[data-code-diff-play="assistant-1"]')).toBeNull();
    expect(container.querySelector('[data-code-diff-toggle="assistant-1"]')).not.toBeNull();
  });

  it('marks a persisted revision whose playback failed', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [{
      id: 'assistant-1',
      role: 'assistant',
      content: '无法播放',
      code: 's("sd")',
      revisionId: 'rev-1',
      timestamp: 1,
    }];
    const revisions: CodeRevision[] = [{
      id: 'rev-1',
      beforeCode: 's("bd")',
      afterCode: 's("sd")',
      playbackStatus: 'failed',
      createdAt: 1,
    }];
    const { container, root } = renderConversationView(messages, vi.fn(), false, revisions);
    roots.push(root);

    expect(container.textContent).toContain('Code updated · playback failed');
  });

  it('keeps the full-code viewer for legacy assistant messages', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [{
      id: 'assistant-legacy',
      role: 'assistant',
      content: '旧回复',
      code: 's("bd")',
      timestamp: 1,
    }];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    expect(container.textContent).toContain('Strudel code');
    expect(container.textContent).not.toContain('View changes');
  });
});

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

  it('renders the live status label in the primary text color', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView([], vi.fn(), true);
    roots.push(root);

    const statusLabel = Array.from(container.querySelectorAll('div')).find(
      (element) => element.childElementCount === 0 && element.textContent === 'Thinking...',
    );

    expect(statusLabel).toBeDefined();
    expect(statusLabel?.classList.contains('text-text-primary')).toBe(true);
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

  it('hides retry/branch while the final assistant message is still loading', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '写一段 indie folk', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: '基础语法没问题。现在逐步加回特性。', timestamp: 2 },
      { id: 'p1', role: 'progress', content: 'mask 的 setCode 成功了。现在 validate。', timestamp: 3, progressKind: 'thinking' },
    ];
    const { container, root } = renderConversationView(messages, vi.fn(), true);
    roots.push(root);

    expect(container.querySelectorAll('button[title="Retry"]')).toHaveLength(0);
    expect(container.querySelectorAll('button[title="Branch conversation from here"]')).toHaveLength(0);
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

  it('renders inline code with neutral message text instead of blue accent text', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '错误提示 `RolandTR808_noise` 状态在 `stack()` 内泄漏。',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const inlineCode = container.querySelector('code');
    expect(inlineCode?.className).toContain('text-text-secondary');
    expect(inlineCode?.className).not.toContain('B9D7FF');
  });

  it('renders streaming reasoning as markdown inside the live reasoning window', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '写一段 lo-fi',
        timestamp: 1,
      },
      {
        id: 'r1',
        role: 'progress',
        content: '# 编曲思路\n先定 **BPM**，再选 `gm_electric_bass_finger`。\n- 鼓要轻\n- 贝斯要暖',
        timestamp: 2,
        progressKind: 'reasoning',
      },
    ];
    const { container, root } = renderConversationView(messages, vi.fn(), true);
    roots.push(root);

    // Markdown is rendered: markers disappear, elements appear.
    expect(container.textContent).not.toContain('**BPM**');
    expect(container.querySelector('strong')?.textContent).toBe('BPM');
    expect(container.querySelector('[data-markdown-text] code')?.textContent).toBe(
      'gm_electric_bass_finger',
    );
    expect(container.querySelectorAll('[data-markdown-text] li')).toHaveLength(2);

    // Headings stay gray in the muted tone — no bright text-text-primary.
    const heading = Array.from(
      container.querySelectorAll<HTMLElement>('[data-markdown-text] div'),
    ).find((el) => el.textContent === '编曲思路');
    expect(heading).not.toBeUndefined();
    expect(heading?.className).toContain('font-semibold');
    expect(heading?.className).not.toContain('text-text-primary');

    const toggle = container.querySelector<HTMLButtonElement>('[data-live-reasoning-toggle]');
    const label = toggle?.querySelector<HTMLElement>('[data-live-reasoning-label]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(label).not.toBeNull();

    act(() => label?.click());

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-markdown-text]')).toBeNull();
  });

  it('uses the dedicated divider-to-body gap for a collapsed process group', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'thinking-1',
        role: 'progress',
        content: '正在整理编曲思路',
        timestamp: 1,
        progressKind: 'thinking',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正文回复',
        timestamp: 2,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const processGroup = container.querySelector<HTMLElement>(
      '[style*="spacing-action-divider-to-body"]',
    );
    expect(processGroup?.style.marginBlockEnd).toBe(
      'var(--spacing-action-divider-to-body)',
    );
    expect(container.querySelector('.text-text-primary.pt-0')).not.toBeNull();
  });

  it('uses one dedicated gap between every expanded process content block', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'thinking-1',
        role: 'progress',
        content: '第一段总结',
        timestamp: 1,
        progressKind: 'thinking',
      },
      {
        id: 'thinking-2',
        role: 'progress',
        content: '第二段总结',
        timestamp: 2,
        progressKind: 'thinking',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正文回复',
        timestamp: 3,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-action-process-toggle]')?.click();
    });

    const expandedBlocks = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[style*="spacing-action-expanded-content-gap"]',
      ),
    );
    expect(expandedBlocks).toHaveLength(2);
    for (const block of expandedBlocks) {
      expect(block.style.marginBlockEnd).toBe(
        'var(--spacing-action-expanded-content-gap)',
      );
    }
  });

  it('keeps streaming reasoning text constrained and wrappable inside the chat width', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '来点好听的',
        timestamp: 1,
      },
      {
        id: 'r1',
        role: 'progress',
        content: '实际上我觉得这个由子的和弦进行用 scale 不太好直接表达 abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
        timestamp: 2,
        progressKind: 'reasoning',
      },
    ];
    const { container, root } = renderConversationView(messages, vi.fn(), true);
    roots.push(root);

    // The scroll container keeps the gray mono style and overflow constraints.
    const scrollBox = container.querySelector<HTMLElement>(
      '[data-markdown-text]',
    )?.parentElement;
    expect(scrollBox).not.toBeNull();
    expect(scrollBox?.className).toContain('text-text-reasoning');
    expect(scrollBox?.className).toContain('font-mono');
    expect(scrollBox?.className).toContain('break-words');
    expect(scrollBox?.className).toContain('overflow-x-hidden');
    expect(scrollBox?.className).toContain('overflow-y-auto');
  });

  it('leaves the streamed reasoning where it is and jumps a window past its last line', () => {
    setMobileViewport(false);
    // happy-dom lays nothing out and never resizes, so the window's geometry,
    // and the observer that reports changes to it, are driven by hand here.
    const resize = stubResizeObserver();
    try {
      const reasoning: ChatMessage = {
        id: 'r1',
        role: 'progress',
        content: '一段很长的推理'.repeat(40),
        timestamp: 2,
        progressKind: 'reasoning',
      };
      const messages: ChatMessage[] = [
        { id: 'u1', role: 'user', content: '来点好听的', timestamp: 1 },
        reasoning,
      ];
      const { container, root, render } = renderConversationView(messages, vi.fn(), true);
      roots.push(root);

      const scrollBox = container.querySelector<HTMLElement>('[data-markdown-text]')?.parentElement;
      const content = container.querySelector<HTMLElement>('[data-markdown-text]');
      expect(scrollBox).not.toBeNull();
      expect(content).not.toBeNull();

      const WINDOW_HEIGHT = 300;
      let contentHeight = 200;
      stubRect(scrollBox!, () => ({ top: 0, bottom: WINDOW_HEIGHT }));
      stubRect(content!, () => ({
        top: -scrollBox!.scrollTop,
        bottom: contentHeight - scrollBox!.scrollTop,
      }));

      // Text that still fits inside the window: nothing below the fold.
      act(() => resize.fire());
      expect(container.querySelector('[data-reasoning-jump-latest]')).toBeNull();

      // It outgrows the window, and the way to the live end is offered.
      contentHeight = 1200;
      act(() => resize.fire());
      expect(container.querySelector('[data-reasoning-jump-latest]')).not.toBeNull();

      // Where the reader put the window, and where more text finds it: the
      // stream does not drag it along.
      act(() => {
        scrollBox!.scrollTop = 100;
        scrollBox!.dispatchEvent(new Event('scroll'));
      });
      contentHeight = 1500;
      render(undefined, [messages[0], { ...reasoning, content: `${reasoning.content}继续推理` }]);
      act(() => resize.fire());
      expect(scrollBox!.scrollTop).toBe(100);

      act(() => container.querySelector<HTMLButtonElement>('[data-reasoning-jump-latest]')!.click());

      // The newest line comes to rest at the top of the window, with nearly the
      // whole window left open under it for what is written next.
      const lastLineFromTop = contentHeight - scrollBox!.scrollTop;
      expect(lastLineFromTop).toBeGreaterThan(0);
      expect(lastLineFromTop).toBeLessThan(40);
      expect(WINDOW_HEIGHT - lastLineFromTop).toBeGreaterThan(WINDOW_HEIGHT * 0.8);

      // Arrived at the live end, there is nothing left to jump to.
      expect(container.querySelector('[data-reasoning-jump-latest]')).toBeNull();
    } finally {
      resize.restore();
    }
  });

  it('opens each later reasoning window at its own beginning', () => {
    setMobileViewport(false);
    // Back-to-back reasoning: the iteration between them called only
    // `validate`, which puts nothing in the stream, so the run is unbroken and
    // the window is never unmounted between the two.
    const first: ChatMessage = {
      id: 'r1',
      role: 'progress',
      content: '第一轮推理'.repeat(40),
      timestamp: 2,
      progressKind: 'reasoning',
    };
    const second: ChatMessage = {
      id: 'r2',
      role: 'progress',
      content: '第二轮推理',
      timestamp: 3,
      progressKind: 'reasoning',
    };
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '来点好听的', timestamp: 1 },
      first,
    ];
    const { container, root, render } = renderConversationView(messages, vi.fn(), true);
    roots.push(root);

    const firstBox = container.querySelector<HTMLElement>('[data-markdown-text]')?.parentElement;
    expect(firstBox).not.toBeNull();
    act(() => { firstBox!.scrollTop = 420; });

    render(undefined, [...messages, second]);

    const secondBox = container.querySelector<HTMLElement>('[data-markdown-text]')?.parentElement;
    expect(secondBox).not.toBeNull();
    // A new window, not the previous one handed over mid-scroll.
    expect(secondBox).not.toBe(firstBox);
    expect(secondBox!.scrollTop).toBe(0);
    expect(secondBox!.textContent).toContain('第二轮推理');
  });

  /* The bug: while reasoning streamed, the reading outside the window could not
     be scrolled at all — every delta re-ran the scroll effect, and a takeover
     that had not yet cleared a fixed distance was read as "still following" and
     pinned straight back. A trackpad, which moves a few px per event, never got
     out of that hole. A gesture now hands the reading over on the first px that
     moves, and the takeover stands until the reader brings it back. */
  it('leaves the reading where a reader scrolls it while reasoning streams', () => {
    setMobileViewport(false);
    const reasoning: ChatMessage = {
      id: 'r1',
      role: 'progress',
      content: '一段推理',
      timestamp: 2,
      progressKind: 'reasoning',
    };
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '来点好听的', timestamp: 1 },
      reasoning,
    ];
    const { container, root, render } = renderConversationView(messages, vi.fn(), true);
    roots.push(root);

    // A window 300 tall over 1000 of reading. Set by hand: happy-dom lays
    // nothing out, so the anchor resolves to the bottom pin (700).
    const box = container.querySelector<HTMLElement>('.conversation-scroll')!;
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(box, 'scrollHeight', { configurable: true, writable: true, value: 1000 });
    box.scrollTo = ((options: { top: number }) => { box.scrollTop = options.top; }) as typeof box.scrollTo;

    const delta = (content: string) => {
      render(undefined, [messages[0], { ...reasoning, content }]);
    };
    delta('一段推理，继续');
    expect(box.scrollTop).toBe(700);
    // The turn-start glide arrives: from here on the reading is at rest, and
    // only the reader moves it.
    act(() => { box.dispatchEvent(new Event('scroll')); });

    // A short scroll up — shorter than the old distance test — with a wheel
    // behind it, which is what says a reader did this.
    act(() => {
      box.scrollTop = 660;
      box.dispatchEvent(new Event('wheel'));
      box.dispatchEvent(new Event('scroll'));
    });
    delta('一段推理，继续，再继续');
    expect(box.scrollTop).toBe(660);

    // And it keeps standing as the stream runs on.
    delta('一段推理，继续，再继续，还在继续');
    expect(box.scrollTop).toBe(660);

    // Back at the end of the reading, the stream has it again.
    act(() => {
      box.scrollTop = 700;
      box.dispatchEvent(new Event('scroll'));
    });
    Object.defineProperty(box, 'scrollHeight', { configurable: true, writable: true, value: 1100 });
    delta('一段推理，继续，再继续，还在继续，收尾');
    expect(box.scrollTop).toBe(800);
  });

  it('renders always-visible top and bottom fades around the conversation viewport', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView([
      { id: 'a1', role: 'assistant', content: '正文回复', timestamp: 1 },
    ]);
    roots.push(root);

    expect(container.querySelector('.conversation-scroll-shell')).not.toBeNull();
    expect(container.querySelector('[data-conversation-edge-fade="top"]')).not.toBeNull();
    expect(container.querySelector('[data-conversation-edge-fade="bottom"]')).not.toBeNull();
  });

  it('aligns assistant turn action icons with the reply text', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView([
      { id: 'assistant-1', role: 'assistant', content: '正文回复', timestamp: 1 },
    ]);
    roots.push(root);

    const actions = container.querySelector<HTMLElement>('[data-assistant-turn-actions]');
    expect(actions).not.toBeNull();
    expect(actions?.className).toContain('left-1');
    expect(actions?.className).not.toContain('left-0');
  });

  it('renders finished reasoning as markdown inside the collapsed reasoning window', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '写一段 lo-fi',
        timestamp: 1,
      },
      {
        id: 'r1',
        role: 'progress',
        content: '# 思路\n先定 **BPM**，再选 `gm_electric_bass_finger`。',
        timestamp: 2,
        progressKind: 'reasoning',
      },
      {
        id: 'p1',
        role: 'progress',
        content: '编排段落…',
        timestamp: 3,
        progressKind: 'tool_call',
        toolName: 'setCode',
      },
    ];
    const { container, root } = renderConversationView(messages, vi.fn(), false);
    roots.push(root);

    const header = container.querySelector<HTMLButtonElement>('[data-reasoning-header]');
    expect(header).not.toBeNull();
    expect(header?.className).toContain('bg-conversation-surface');
    expect(header?.className).toContain('before:bg-conversation-surface');
    expect(header?.className).toContain('-mx-2');
    expect(header?.className).toContain('w-[calc(100%+1rem)]');
    expect(header?.className).toContain('px-2');
    expect(header?.className).not.toContain('reasoning-header--expanded');
    act(() => header!.click());
    expect(header?.className).toContain('reasoning-header--expanded');

    // Markdown is rendered inside a gray mono container.
    expect(container.textContent).not.toContain('**BPM**');
    expect(container.querySelector('[data-markdown-text] strong')?.textContent).toBe('BPM');
    expect(container.querySelector('[data-markdown-text] code')?.textContent).toBe(
      'gm_electric_bass_finger',
    );
    const wrapper = container.querySelector<HTMLElement>('[data-markdown-text]')?.parentElement;
    expect(wrapper?.className).toContain('text-text-reasoning');
    expect(wrapper?.className).toContain('font-mono');

    // Muted headings stay gray.
    const heading = Array.from(
      container.querySelectorAll<HTMLElement>('[data-markdown-text] div'),
    ).find((el) => el.textContent === '思路');
    expect(heading).not.toBeUndefined();
    expect(heading?.className).not.toContain('text-text-primary');
  });



  it('keeps ordered list items in one list when items have continuation lines', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: [
          '1. **Drums** - Lo-fi, loose drum pattern.',
          '   Kick on 1 and 3, snare on 2 and 4.',
          '   Probably use lpf to darken the drums.',
          '1. **Bass** - Warm melodic bass line.',
          '   Walks through a jazzy progression.',
          '1. **Pads** - Warm synth pad.',
        ].join('\n'),
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages, vi.fn());
    roots.push(root);

    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    expect(container.querySelector('ol > li')?.textContent).toContain('Kick on 1 and 3');
  });

  it('keeps ordered list items in one list when blank lines separate items', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: [
          '1. Bass: Bouncy, tight, synth bass line.',
          '   Root-fifth octave jumps.',
          '',
          '1. Chords/Pad: Warm synth pad for harmony.',
          '   Extended chords, bright but not cheesy.',
          '',
          '1. Lead/Melody: Bright synth lead.',
          '   Catchy but not overwhelming.',
        ].join('\n'),
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages, vi.fn());
    roots.push(root);

    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    expect(container.querySelectorAll('ol > li')[1].textContent).toContain('Extended chords');
  });

  it('keeps rendering when streaming markdown ends at an unfinished block marker', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'r1',
        role: 'progress',
        content: '>\n# \n- \n1. \n正文还在继续',
        timestamp: 1,
        progressKind: 'reasoning',
      },
    ];
    const { container, root } = renderConversationView(messages, vi.fn(), true);
    roots.push(root);

    expect(container.textContent).toContain('>');
    expect(container.textContent).toContain('#');
    expect(container.textContent).toContain('-');
    expect(container.textContent).toContain('1.');
    expect(container.textContent).toContain('正文还在继续');
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

  it('renders list items and blockquotes with whitespace-pre-wrap so continuation lines stay visible', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: [
          '1. **Drums** - Lo-fi, loose drum pattern.',
          '   Kick on 1 and 3, snare on 2 and 4.',
          '> a quoted line',
          '> a continuation line',
        ].join('\n'),
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const li = container.querySelector('ol > li');
    expect(li?.className).toContain('whitespace-pre-wrap');
    const blockquote = container.querySelector('blockquote');
    expect(blockquote?.className).toContain('whitespace-pre-wrap');
  });

  it('strips a spurious trailing newline the browser adds when copying a user message bubble', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '来个简单的鼓点',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const bubble = container.querySelector<HTMLDivElement>('[data-rollback-bubble]');
    expect(bubble).not.toBeNull();

    // The stored content itself has no newlines (ChatInput.doSubmit trims
    // before storage) — this simulates the browser's own clipboard
    // serialization appending trailing blank lines past the last block.
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '来个简单的鼓点\n\n\n',
    } as unknown as Selection);

    const setData = vi.fn();
    const event = new Event('copy', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { setData } });

    act(() => {
      bubble!.dispatchEvent(event);
    });

    expect(setData).toHaveBeenCalledWith('text/plain', '来个简单的鼓点');
    expect(event.defaultPrevented).toBe(true);

    getSelectionSpy.mockRestore();
  });

  it('preserves interior newlines in a multi-line user message when stripping the copy', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'line one\nline two',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const bubble = container.querySelector<HTMLDivElement>('[data-rollback-bubble]');
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '\nline one\nline two\n\n',
    } as unknown as Selection);

    const setData = vi.fn();
    const event = new Event('copy', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { setData } });

    act(() => {
      bubble!.dispatchEvent(event);
    });

    expect(setData).toHaveBeenCalledWith('text/plain', 'line one\nline two');

    getSelectionSpy.mockRestore();
  });

  it('leaves an ordinary user-bubble copy alone when there is no leading/trailing newline to strip', () => {
    setMobileViewport(false);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '来个简单的鼓点',
        timestamp: 1,
      },
    ];
    const { container, root } = renderConversationView(messages);
    roots.push(root);

    const bubble = container.querySelector<HTMLDivElement>('[data-rollback-bubble]');
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '来个简单的鼓点',
    } as unknown as Selection);

    const setData = vi.fn();
    const event = new Event('copy', { bubbles: true, cancelable: true }) as unknown as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { setData } });

    act(() => {
      bubble!.dispatchEvent(event);
    });

    expect(setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    getSelectionSpy.mockRestore();
  });
});

/* The typist's own edit, standing at the end of the reading. It is the one
   version in the stream nobody generated — and the reason reading an older take
   no longer costs an unsaved change its only home. */
describe('ConversationView manual draft segment', () => {
  const roots: Root[] = [];

  const base = 'stack(\n/* @layer drums */\ns("bd")\n)';
  const edited = 'stack(\n/* @layer drums */\ns("bd*4")\n)';

  const committed: ChatMessage[] = [{
    id: 'assistant-1',
    role: 'assistant',
    content: '好了',
    code: base,
    revisionId: 'rev-1',
    timestamp: 1,
  }];
  const revisions: CodeRevision[] = [{
    id: 'rev-1',
    beforeCode: '',
    afterCode: base,
    playbackStatus: 'played',
    createdAt: 1,
  }];

  const segment = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-code-diff-variant="draft"]');

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reports the edit against the last committed take', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: edited },
    );
    roots.push(root);

    const drawn = segment(container)!;
    expect(drawn).not.toBeNull();
    expect(drawn.textContent).toContain(t('yourEdits'));
    // One line changed against the take above it, not against an empty script.
    expect(drawn.textContent).toContain('+1');
    expect(drawn.textContent).toContain('−1');
  });

  it('stays away while the draft still matches the take', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: base },
    );
    roots.push(root);
    expect(segment(container)).toBeNull();
  });

  it('goes again once the edit is typed back out', async () => {
    vi.useFakeTimers();
    try {
      setMobileViewport(false);
      const { container, root, render } = renderConversationView(
        committed, vi.fn(), false, revisions, { draftCode: edited },
      );
      roots.push(root);
      expect(segment(container)).not.toBeNull();

      render({ draftCode: base });
      // The diff settles rather than tracks — see useSettled.
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(segment(container)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries no retry and no branch: nothing generated it', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: edited },
    );
    roots.push(root);

    const block = segment(container)!.closest('div.flex.justify-start')!;
    expect(block.querySelector('[data-assistant-turn-actions]')).toBeNull();
  });

  /* Write a script by hand into a session that has held no conversation and
     there is no earlier version for it to be a change from. The reading stays
     empty until a turn gives it something to say — and nothing is lost by that
     silence: the first turn takes the hand-written script as its own baseline,
     so it shows up as the thing that turn changed. */
  it('stays empty for a script hand-written into a session with no conversation', () => {
    setMobileViewport(false);
    const greeting: ChatMessage[] = [{
      id: 'greeting-1',
      role: 'assistant',
      content: '想做点什么？',
      isGreeting: true,
      timestamp: 1,
    }];
    const { container, root } = renderConversationView(
      greeting, vi.fn(), false, [], { draftCode: edited },
    );
    roots.push(root);
    expect(segment(container)).toBeNull();

    // And once a turn has committed a take, later edits are measured against it.
    const { container: after, root: afterRoot } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: edited },
    );
    roots.push(afterRoot);
    expect(segment(after)).not.toBeNull();
  });

  /* A session can also open already holding a script the reading never
     produced — the theme song does exactly that. */
  it('says nothing about a script the reading never committed', () => {
    setMobileViewport(false);
    const greetingOnly: ChatMessage[] = [{
      id: 'greeting-1',
      role: 'assistant',
      content: '主题曲',
      isGreeting: true,
      timestamp: 1,
    }];
    const { container, root } = renderConversationView(
      greetingOnly, vi.fn(), false, [], { draftCode: edited },
    );
    roots.push(root);
    expect(segment(container)).toBeNull();
  });

  it('keeps to itself for the length of a turn, whose baseline is already fixed', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), true, revisions, { draftCode: edited },
    );
    roots.push(root);
    expect(segment(container)).toBeNull();
  });

  it('sounds the draft under its own id, which is the way back from a preview', () => {
    setMobileViewport(false);
    const onPlaySegment = vi.fn();
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: edited, onPlaySegment },
    );
    roots.push(root);

    const key = container.querySelector<HTMLButtonElement>(
      `[data-code-diff-play="${DRAFT_SEGMENT_ID}"]`,
    )!;
    act(() => key.click());
    expect(onPlaySegment).toHaveBeenCalledWith(DRAFT_SEGMENT_ID, edited);
  });

  /* The turn filler reserves nearly a viewport below the reading's last block,
     so the anchor has somewhere to pin the user bubble to. Held by the reply
     while a segment stands after it, that reservation lands *between* the two
     and pushes the segment a whole screen down. */
  it('takes the turn filler off the reply above it, rather than sitting below it', async () => {
    vi.useFakeTimers();
    setMobileViewport(false);
    const withTurn: ChatMessage[] = [
      { id: 'u-1', role: 'user', content: '来点鼓', timestamp: 1 },
      { id: 'assistant-1', role: 'assistant', content: '好了', code: base, revisionId: 'rev-1', timestamp: 2 },
    ];
    const { container, root, render } = renderConversationView(
      withTurn, vi.fn(), false, revisions, { draftCode: base },
    );
    roots.push(root);
    // The anchor arms itself when a turn runs in this component's lifetime —
    // and the filler exists only to give that anchor somewhere to pin to.
    render({ draftCode: base, isLoading: true });
    render({ draftCode: base, isLoading: false });

    const replyRow = () => container
      .querySelector<HTMLElement>('[data-assistant-turn-actions]')!
      .closest<HTMLElement>('div.flex.justify-start')!;
    const draftRow = () => segment(container)!.closest<HTMLElement>('div.flex.justify-start')!;

    // No edit yet: the reply is last, so the reply holds the reservation.
    expect(replyRow().style.minHeight).not.toBe('');

    render({ draftCode: edited, isLoading: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    // The edit is last now. The reservation moved with it, and exactly one
    // block holds it — two would stack a second screen between them.
    expect(replyRow().style.minHeight).toBe('');
    expect(draftRow().style.minHeight).not.toBe('');
    vi.useRealTimers();
  });

  /* It should sit off the reply above by what a user bubble sits off one: the
     collapsed sibling margin, with nothing added on top. */
  it('adds no spacing of its own above the widget', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: edited },
    );
    roots.push(root);

    // The top margin a widget wears when it hangs under a paragraph in a reply.
    expect(segment(container)!.className).not.toContain('mt-4');
    expect(segment(container)!.parentElement!.className).not.toContain('pt-2');
  });

  /* The segment arrives at the very end of the reading, under a reply the turn
     anchor is holding near the top — so without this it lands below the fold and
     a typist has no way of knowing their edit was recorded at all. That was the
     bug: the segment was there, and nothing ever brought it into view.

     What is asserted here is the contract that broke, not the arithmetic on top
     of it: the reading re-anchors when the segment APPEARS, and does not when it
     merely grows. The pixel the reveal lands on is layout, which happy-dom does
     not do. */
  it('re-anchors the reading when the segment appears, and not as it grows', async () => {
    vi.useFakeTimers();
    try {
      setMobileViewport(false);
      const { container, root, render } = renderConversationView(
        committed, vi.fn(), false, revisions, { draftCode: base },
      );
      roots.push(root);
      expect(segment(container)).toBeNull();

      // A window 300 tall over 1000 of reading — enough for an anchor to have
      // somewhere to move to. Set by hand: happy-dom lays nothing out.
      const box = container.querySelector<HTMLElement>('.conversation-scroll')!;
      Object.defineProperty(box, 'clientHeight', { configurable: true, value: 300 });
      Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 1000 });
      const scrollTo = vi.fn((options: { top: number }) => { box.scrollTop = options.top; });
      box.scrollTo = scrollTo as unknown as typeof box.scrollTo;

      // It appears: the reading goes to it.
      render({ draftCode: edited });
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(segment(container)).not.toBeNull();
      expect(scrollTo).toHaveBeenCalled();

      // It grows under a typist's hands: the reading stays where it is. A
      // reading that chased every keystroke would be unusable while editing.
      scrollTo.mockClear();
      const resting = box.scrollTop;
      render({ draftCode: edited + '\n\ns("hh*8")' });
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      expect(scrollTo).not.toHaveBeenCalled();
      expect(box.scrollTop).toBe(resting);
    } finally {
      vi.useRealTimers();
    }
  });

  /* The edge follows the transport: whichever version is sounding wears it, and
     it moves as playback moves. */
  it('wears the edge while it is the one sounding', () => {
    setMobileViewport(false);
    const { container, root, render } = renderConversationView(
      committed, vi.fn(), false, revisions, { draftCode: edited },
    );
    roots.push(root);

    const sounding = () => [...container.querySelectorAll<HTMLElement>('[data-code-diff-sounding]')]
      .map((el) => el.getAttribute('data-code-diff-variant'));

    // Nothing playing: nothing wears it.
    expect(sounding()).toEqual([]);

    // The draft is put on from its own key: the draft's segment wears it.
    render({
      draftCode: edited,
      isPlaying: true,
      playingCode: edited,
      pressedSegmentId: DRAFT_SEGMENT_ID,
      pressedSegmentCode: edited,
    });
    expect(sounding()).toEqual(['draft']);

    // The take above is put on instead, and the edge moves with the sound.
    render({
      draftCode: edited,
      isPlaying: true,
      playingCode: base,
      pressedSegmentId: 'assistant-1',
      pressedSegmentCode: base,
    });
    expect(sounding()).toEqual(['turn']);
  });

  /* Two versions in one reading are often the same text — edit a take back to
     what an earlier one produced and they match exactly. Answering to the text
     lit both of them at once. */
  it('lights only the key that was pressed, where two versions share their text', () => {
    setMobileViewport(false);
    const sameText: ChatMessage[] = [
      { id: 'assistant-1', role: 'assistant', content: 'V1', code: base, revisionId: 'rev-1', timestamp: 1 },
      { id: 'assistant-2', role: 'assistant', content: 'V2', code: edited, revisionId: 'rev-2', timestamp: 2 },
    ];
    const bothRevisions: CodeRevision[] = [
      { id: 'rev-1', beforeCode: '', afterCode: base, playbackStatus: 'played', createdAt: 1 },
      { id: 'rev-2', beforeCode: base, afterCode: edited, playbackStatus: 'played', createdAt: 2 },
    ];
    // The draft has been edited back to exactly what the first take produced.
    const { container, root, render } = renderConversationView(
      sameText, vi.fn(), false, bothRevisions, { draftCode: base },
    );
    roots.push(root);

    const lit = () => [...container.querySelectorAll<HTMLElement>('[data-code-diff-sounding]')]
      .map((el) => el.getAttribute('data-code-diff-variant'));

    // Pressing the draft's key sounds text an older take holds too.
    render({
      draftCode: base,
      isPlaying: true,
      playingCode: base,
      pressedSegmentId: DRAFT_SEGMENT_ID,
      pressedSegmentCode: base,
    });
    expect(lit()).toEqual(['draft']);

    // And the other way round: the same text, the other key.
    render({
      draftCode: base,
      isPlaying: true,
      playingCode: base,
      pressedSegmentId: 'assistant-1',
      pressedSegmentCode: base,
    });
    expect(lit()).toEqual(['turn']);
  });

  /* A turn plays itself the moment it commits, and the studio's transport plays
     whatever the editor holds — neither goes through a key in the reading. The
     text is what is left to go on, and it still may only light one. */
  it('falls back to the text for a take nobody pressed, and lights one', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, {
        draftCode: base,
        isPlaying: true,
        playingCode: base,
        pressedSegmentId: null,
      },
    );
    roots.push(root);

    expect(container.querySelectorAll('[data-code-diff-sounding]')).toHaveLength(1);
  });

  /* Typing on while a draft is still playing moves the segment's text away from
     what is sounding. The light must stay on the key that was pressed rather
     than wandering off to whichever older take now matches. */
  it('keeps the light on the pressed key when the draft is typed on past it', () => {
    setMobileViewport(false);
    const { container, root } = renderConversationView(
      committed, vi.fn(), false, revisions, {
        draftCode: edited,
        isPlaying: true,
        // The draft was played, then typed on: what sounds is no longer what
        // the segment shows, and it is the take above that now matches it.
        playingCode: base,
        pressedSegmentId: DRAFT_SEGMENT_ID,
        pressedSegmentCode: base,
      },
    );
    roots.push(root);

    const lit = [...container.querySelectorAll<HTMLElement>('[data-code-diff-sounding]')];
    expect(lit).toHaveLength(1);
    expect(lit[0].getAttribute('data-code-diff-variant')).toBe('draft');
  });
});
