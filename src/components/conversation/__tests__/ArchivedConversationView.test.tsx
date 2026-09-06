// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../hooks/useChat';
import ArchivedConversationView from '../ArchivedConversationView';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// The archive shares the studio's message primitives; the live-only thinking
// animation is deliberately not part of an archive.
vi.mock('../ThinkingLottie', () => ({ ThinkingLottie: () => null }));
vi.mock('lottie-react', () => ({ default: () => null }));

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

const messages = (): ChatMessage[] => [
  { id: 'u1', role: 'user', content: '来点鼓', timestamp: 1 },
  { id: 'r1', role: 'progress', progressKind: 'reasoning', content: '先定速度', timestamp: 2 },
  { id: 'c1', role: 'progress', progressKind: 'tool_call', toolName: 'setCode', content: '', timestamp: 3 },
  { id: 'a1', role: 'assistant', content: '好了', code: 's("bd")', timestamp: 4 },
];

function render(list: readonly ChatMessage[], container: HTMLElement, root: Root) {
  act(() => root.render(
    <ArchivedConversationView
      messages={list}
      onSelectCode={() => {}}
      onPlayCode={() => {}}
      onStopCode={() => {}}
      playingCodeMessageId={null}
      selectedCodeMessageId={null}
    />,
  ));
  return container;
}

/**
 * A scrollport that reports where it has been put, since happy-dom lays
 * nothing out: what these tests watch is whether the archive writes to it at
 * all, which is the whole of the bug they cover.
 */
function watchScroll(container: HTMLElement) {
  const scroller = container.querySelector<HTMLElement>('.conversation-scroll')!;
  const state = { writes: 0, top: 0 };
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => state.top,
    set: (next: number) => { state.writes += 1; state.top = next; },
  });
  return state;
}

describe('ArchivedConversationView', () => {
  it('opens at the end and stays where it is put after that', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    render(messages(), container, root);

    const scroll = watchScroll(container);
    // Where the reader has scrolled back to.
    scroll.top = 120;
    scroll.writes = 0;

    /* The same conversation handed over in a new array. Everything above this
       component derives `messages` — a page that rebuilds the object it reads
       them out of does so on any render at all — and an archive that took that
       for an arrival would pull the reading back to its end under the reader.
       This is the bug: scroll up, and the window drags you back down. */
    render(messages(), container, root);
    expect(scroll.writes).toBe(0);
    expect(scroll.top).toBe(120);

    // Nor does opening a thought move it: what grows is below the header, and
    // the reading above it holds still.
    const reasoning = container.querySelector<HTMLButtonElement>('[data-reasoning-header="r1"]')!;
    act(() => reasoning.click());
    expect(scroll.writes).toBe(0);
    expect(scroll.top).toBe(120);
    expect(container.querySelector('[data-reasoning-header="r1"]')?.nextElementSibling)
      .not.toBeNull();

    // A reply that genuinely arrives is a new end, and the reading goes to it.
    render([...messages(), {
      id: 'a2', role: 'assistant', content: '再来一层', timestamp: 5,
    }], container, root);
    expect(scroll.writes).toBe(1);
    expect(scroll.top).toBe(1000);
  });

  it('shows the bar it is read beside rather than hiding it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    render(messages(), container, root);

    /* The window clips the stream at both ends, so the only thing that can say
       how much more of it there is, is a bar — the same one the script window
       beside it shows. Its gutter stays reserved either way, so the message
       column does not shift when it appears. */
    const scroller = container.querySelector<HTMLElement>('.conversation-scroll')!;
    expect(scroller.className).not.toContain('scrollbar-hidden');
    expect(scroller.style.scrollbarGutter).toBe('stable');
  });
});
