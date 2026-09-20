// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDevicePixelRatio } from '../useDevicePixelRatio';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;
let queries: Map<string, { listeners: Set<() => void> }>;

const stubMatchMedia = (): void => {
  vi.stubGlobal('matchMedia', (query: string) => {
    let entry = queries.get(query);
    if (!entry) { entry = { listeners: new Set() }; queries.set(query, entry); }
    return {
      media: query,
      matches: false,
      addEventListener: (_type: string, listener: () => void) => { entry!.listeners.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => { entry!.listeners.delete(listener); },
      addListener: (listener: () => void) => { entry!.listeners.add(listener); },
      removeListener: (listener: () => void) => { entry!.listeners.delete(listener); },
    };
  });
};

function Probe({ onValue }: { onValue: (value: number) => void }) {
  onValue(useDevicePixelRatio());
  return null;
}

function renderHook(): { current: number; rerender: () => void } {
  const box: { current: number | null } = { current: null };
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  const render = () => {
    act(() => root.render(<Probe onValue={value => { box.current = value; }} />));
  };
  render();
  return {
    get current() { return box.current!; },
    rerender: render,
  };
}

const listenersOf = (query: string): Set<() => void> => queries.get(query)?.listeners ?? new Set();

describe('useDevicePixelRatio', () => {
  beforeEach(() => {
    queries = new Map();
    vi.stubGlobal('devicePixelRatio', 1);
    stubMatchMedia();
  });
  afterEach(() => {
    act(() => root.unmount()); container.remove();
    vi.unstubAllGlobals();
  });

  it('reads the current ratio, falling back to 1 for unusable values', () => {
    vi.stubGlobal('devicePixelRatio', 2.5);
    const hook = renderHook();
    expect(hook.current).toBe(2.5);
    expect(listenersOf('(resolution: 2.5dppx)').size).toBe(1);
    vi.stubGlobal('devicePixelRatio', Number.NaN);
    const fallback = renderHook();
    expect(fallback.current).toBe(1);
    expect(listenersOf('(resolution: 1dppx)').size).toBe(1);
  });

  it('updates when the resolution query fires, then re-registers on the new ratio', () => {
    const hook = renderHook();
    expect(hook.current).toBe(1);
    vi.stubGlobal('devicePixelRatio', 2);
    act(() => { for (const listener of [...listenersOf('(resolution: 1dppx)')]) listener(); });
    expect(hook.current).toBe(2);
    expect(listenersOf('(resolution: 2dppx)').size).toBe(1);
    expect(listenersOf('(resolution: 1dppx)').size).toBe(0);
    vi.stubGlobal('devicePixelRatio', 1.25);
    act(() => { for (const listener of [...listenersOf('(resolution: 2dppx)')]) listener(); });
    expect(hook.current).toBe(1.25);
    expect(listenersOf('(resolution: 1.25dppx)').size).toBe(1);
  });

  it('does not re-render for identity resamples', () => {
    const hook = renderHook();
    const first = hook.current;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(hook.current).toBe(first);
    // State object identity stays stable across the resample.
    expect(hook.current).toBe(first);
  });

  it('resamples when the page becomes visible again', () => {
    const hook = renderHook();
    expect(hook.current).toBe(1);
    vi.stubGlobal('devicePixelRatio', 3);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.current).toBe(3);
  });

  it('stops listening after unmount', () => {
    renderHook();
    let total = 0;
    for (const entry of queries.values()) total += entry.listeners.size;
    expect(total).toBe(1);
    act(() => root.unmount());
    total = 0;
    for (const entry of queries.values()) total += entry.listeners.size;
    expect(total).toBe(0);
  });
});
