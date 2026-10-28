// @vitest-environment happy-dom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryPanel from '../HistoryPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('history current-record positioning', () => {
  let root: Root;
  let host: HTMLDivElement;
  let height: number;
  let resized: () => void;
  let disconnect: ReturnType<typeof vi.fn>;
  let props: Partial<React.ComponentProps<typeof HistoryPanel>>;
  const scrollRef = createRef<HTMLDivElement>();
  const sessions = [
    { id: 'first', title: 'First', updatedAt: 3 },
    { id: 'current', title: 'Current', updatedAt: 2 },
    { id: 'last', title: 'Last', updatedAt: 1 },
  ];

  const render = (next: typeof props = {}) => {
    props = { ...props, ...next };
    act(() => root.render(
      <div ref={scrollRef}>
        <HistoryPanel
          sessions={sessions}
          currentId="current"
          scrollContainerRef={scrollRef}
          onSwitch={vi.fn()}
          onDelete={vi.fn()}
          onRename={vi.fn()}
          {...props}
        />
      </div>,
    ));
  };
  const settle = () => act(() => { vi.advanceTimersByTime(40); });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback; }
      observe() {}
      disconnect = disconnect;
    });
    height = 200;
    props = {};
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.dataset.sessionRow;
      const offset = id === 'first' ? 0 : id === 'current' ? 500 : 980;
      return {
        top: id ? offset - (scrollRef.current?.scrollTop ?? 0) : 0,
        height: id ? 20 : height,
      } as DOMRect;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('centers the current row in its own scrollport and retains the highlight', () => {
    render();
    settle();
    expect(scrollRef.current?.scrollTop).toBe(410);
    expect(host.querySelector('[data-session-active]')?.getAttribute('data-session-row')).toBe('current');
    expect(host.scrollTop).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not reclaim manual scrolling on rerender or pagination', () => {
    render();
    settle();
    scrollRef.current!.scrollTop = 100;
    render({ sessions: [...sessions, { id: 'more', title: 'More', updatedAt: 0 }] });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(100);
  });

  it('positions again after closing and reopening a mounted mobile section', () => {
    render();
    settle();
    render({ isOpen: false });
    scrollRef.current!.scrollTop = 0;
    settle();
    expect(scrollRef.current?.scrollTop).toBe(0);
    render({ isOpen: true });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(410);
  });

  it('positions again when the desktop panel is unmounted and reopened', () => {
    render();
    settle();
    act(() => root.render(null));
    render();
    settle();
    expect(scrollRef.current?.scrollTop).toBe(410);
  });

  it('waits for an expanded section to have stable nonzero dimensions', () => {
    height = 0;
    render();
    settle();
    expect(scrollRef.current?.scrollTop).toBe(0);
    height = 100;
    act(() => { resized(); vi.advanceTimersByTime(16); });
    height = 200;
    act(() => { resized(); });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(410);
  });

  it('waits for asynchronously loaded records', () => {
    render({ sessions: [], isLoading: true });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(0);
    render({ sessions, isLoading: false });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(410);
  });

  it.each([
    { currentId: null },
    { currentId: 'missing' },
    { query: 'First' },
    { initialError: new Error('network') },
    { isOpen: false },
  ])('does not scroll when the current row is unavailable: %o', (next) => {
    render(next);
    settle();
    expect(scrollRef.current?.scrollTop).toBe(0);
  });

  it.each([['first', 0], ['last', 800]] as const)('clamps %s to the scroll boundary', (currentId, expected) => {
    render({ currentId });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(expected);
  });

  it('cancels pending positioning when closed before the next frame', () => {
    render();
    render({ isOpen: false });
    settle();
    expect(scrollRef.current?.scrollTop).toBe(0);
  });
});
