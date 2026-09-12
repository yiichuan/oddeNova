// @vitest-environment happy-dom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCROLL_ACTIVITY_IDLE_MS, useScrollActivity } from '../useScrollActivity';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function Box({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollActivity(ref, enabled);
  return (
    <div ref={ref} data-testid="box">
      <div data-testid="first" />
      <div data-testid="second" />
    </div>
  );
}

function render(enabled = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<Box enabled={enabled} />));
  const at = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  return { container, at };
}

describe('useScrollActivity', () => {
  it('flags the scroller that moved, and only that one', () => {
    vi.useFakeTimers();
    const { at } = render();

    act(() => { at('first').dispatchEvent(new Event('scroll')); });
    expect(at('first').dataset.scrolling).toBe('true');
    expect(at('second').dataset.scrolling).toBeUndefined();
    // The container it is bound to is not itself the thing that moved.
    expect(at('box').dataset.scrolling).toBeUndefined();
  });

  it('holds the flag for the idle wait, and restarts it on every scroll', () => {
    vi.useFakeTimers();
    const { at } = render();

    act(() => { at('first').dispatchEvent(new Event('scroll')); });
    act(() => { vi.advanceTimersByTime(SCROLL_ACTIVITY_IDLE_MS - 1); });
    expect(at('first').dataset.scrolling).toBe('true');

    // Still scrolling: the bar must not go away mid-gesture.
    act(() => { at('first').dispatchEvent(new Event('scroll')); });
    act(() => { vi.advanceTimersByTime(SCROLL_ACTIVITY_IDLE_MS - 1); });
    expect(at('first').dataset.scrolling).toBe('true');

    act(() => { vi.advanceTimersByTime(1); });
    expect(at('first').dataset.scrolling).toBeUndefined();
  });

  it('keeps one clock per scroller', () => {
    vi.useFakeTimers();
    const { at } = render();

    act(() => { at('first').dispatchEvent(new Event('scroll')); });
    act(() => { vi.advanceTimersByTime(SCROLL_ACTIVITY_IDLE_MS / 2); });
    act(() => { at('second').dispatchEvent(new Event('scroll')); });
    act(() => { vi.advanceTimersByTime(SCROLL_ACTIVITY_IDLE_MS / 2); });

    expect(at('first').dataset.scrolling).toBeUndefined();
    expect(at('second').dataset.scrolling).toBe('true');
  });

  it('does nothing at all when it is turned off', () => {
    const { at } = render(false);
    act(() => { at('first').dispatchEvent(new Event('scroll')); });
    expect(at('first').dataset.scrolling).toBeUndefined();
  });

  it('clears its timers and its flags on unmount', () => {
    vi.useFakeTimers();
    const { at, container } = render();
    const scroller = at('first');

    act(() => { scroller.dispatchEvent(new Event('scroll')); });
    expect(scroller.dataset.scrolling).toBe('true');

    act(() => { roots.splice(0).forEach((root) => root.unmount()); });
    expect(scroller.dataset.scrolling).toBeUndefined();
    // Nothing left pending to fire against a detached node.
    expect(() => vi.advanceTimersByTime(SCROLL_ACTIVITY_IDLE_MS * 2)).not.toThrow();
    expect(container.querySelector('[data-testid="box"]')).toBeNull();
  });
});
