// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTypewriter } from '../useTypewriter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ text, start }: { text?: string; start?: boolean }) {
  const shown = useTypewriter(text, start);
  return <span data-none={shown === undefined || undefined}>{shown}</span>;
}

let root: Root;
let host: HTMLElement;
const render = (text?: string, start?: boolean) => act(() => root.render(<Probe text={text} start={start} />));
/** What the hook shows right now; `undefined` when it shows nothing at all. */
const shownText = () => {
  const span = host.querySelector('span');
  return span?.hasAttribute('data-none') ? undefined : span?.textContent ?? '';
};

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTypewriter', () => {
  it('reveals the text one character at a time', () => {
    render('一段节奏');
    expect(shownText()).toBe('');
    act(() => vi.advanceTimersByTime(45));
    expect(shownText()).toBe('一');
    act(() => vi.advanceTimersByTime(45 * 3));
    expect(shownText()).toBe('一段节奏');
    act(() => vi.advanceTimersByTime(1000));
    expect(shownText()).toBe('一段节奏');
  });

  it('restarts when the text changes and finishes long text within the cap', () => {
    render('abc');
    act(() => vi.advanceTimersByTime(1000));
    const long = 'x'.repeat(200);
    render(long);
    expect(shownText()).toBe('');
    act(() => vi.advanceTimersByTime(1400));
    expect(shownText()).toBe(long);
  });

  it('waits for start, then keeps typing and stays once begun', () => {
    render('abcd', false);
    act(() => vi.advanceTimersByTime(1000));
    expect(shownText()).toBe('');
    render('abcd', true);
    act(() => vi.advanceTimersByTime(45));
    expect(shownText()).toBe('a');
    render('abcd', false);
    act(() => vi.advanceTimersByTime(45 * 3));
    expect(shownText()).toBe('abcd');
  });

  it('never splits an astral character', () => {
    render('🪄a');
    act(() => vi.advanceTimersByTime(45));
    expect(shownText()).toBe('🪄');
  });

  it('shows everything at once with reduced motion, and nothing without text', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    render('abc');
    expect(shownText()).toBe('abc');
    render(undefined);
    expect(shownText()).toBeUndefined();
  });
});
