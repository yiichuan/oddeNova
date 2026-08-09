// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import type { CodeRevision } from '../../hooks/useSessions';
import ConversationView from '../ConversationView';

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

function renderConversationView(
  messages: ChatMessage[],
  onRollback = vi.fn(),
  isLoading = false,
  revisions?: CodeRevision[],
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ConversationView
        messages={messages}
        revisions={revisions}
        isLoading={isLoading}
        onRollback={onRollback}
        onBranch={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
  });

  return { container, root };
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
});
