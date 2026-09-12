// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReadOnlyCodeView from '../ReadOnlyCodeView';
import { READ_ONLY_CODE_CLASS } from '../../../lib/read-only-code-editor';
import { SCROLL_ACTIVITY_IDLE_MS } from '../../../hooks/useScrollActivity';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function render(props: React.ComponentProps<typeof ReadOnlyCodeView>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<ReadOnlyCodeView {...props} />));
  return { container, root };
}

const host = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-testid="read-only-code"]')!;

/** The view is imported on demand, so it has to be waited for. */
async function settle(container: HTMLElement): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const content = host(container).querySelector<HTMLElement>('.cm-content');
    if (content) return content;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error('the read-only view never built');
}

const linesOf = (content: HTMLElement) =>
  [...content.querySelectorAll('.cm-line')].map((line) => line.textContent);

describe('ReadOnlyCodeView', () => {
  it('sets the script as the studio does, wearing the editor’s own classes', async () => {
    const { container } = render({ code: 'setcps(0.5)\nstack(s("bd*4"))' });
    const content = await settle(container);

    expect(linesOf(content)).toEqual(['setcps(0.5)', 'stack(s("bd*4"))']);
    // The rules that make code legible hang on these, in index.css.
    expect(host(container).className).toContain(READ_ONLY_CODE_CLASS);
    expect(host(container).className).toContain('code-editor-fade-top');
    expect(host(container).className).toContain('code-scroll-autohide');
    expect(host(container).querySelector('.cm-editor')).not.toBeNull();
    // Line numbers, the same as the composing editor's.
    expect(host(container).querySelector('.cm-lineNumbers')).not.toBeNull();
  });

  it('has nothing to type into, and still has something to copy from', async () => {
    const { container } = render({ code: 's("bd")' });
    const content = await settle(container);

    // `contenteditable` off is what keeps a tap from raising the soft keyboard.
    expect(content.getAttribute('contenteditable')).not.toBe('true');
    // The text itself is still there to be selected.
    expect(content.textContent).toContain('s("bd")');
  });

  it('builds nothing while the window holding it is shut', async () => {
    const { container, root } = render({ code: 's("bd")', active: false });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(host(container).querySelector('.cm-editor')).toBeNull();

    act(() => root.render(<ReadOnlyCodeView code={'s("bd")'} active />));
    expect(linesOf(await settle(container))).toEqual(['s("bd")']);
  });

  it('opens a new version at the top and leaves the same one where it was', async () => {
    const { container, root } = render({ code: 'a\nb\nc' });
    const content = await settle(container);
    const scroller = host(container).querySelector<HTMLElement>('.cm-scroller')!;

    scroller.scrollTop = 240;
    // Re-rendering with the same script — which is what a play or a stop does —
    // must not send the reader back to line one.
    act(() => root.render(<ReadOnlyCodeView code={'a\nb\nc'} />));
    expect(scroller.scrollTop).toBe(240);
    expect(linesOf(content)).toEqual(['a', 'b', 'c']);

    // A different version is a different script, and starts at its first line.
    act(() => root.render(<ReadOnlyCodeView code={'x\ny'} />));
    expect(scroller.scrollTop).toBe(0);
    expect(linesOf(host(container).querySelector<HTMLElement>('.cm-content')!)).toEqual(['x', 'y']);
  });

  it('shows the bar while the code is moving and takes it away once it stops', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<ReadOnlyCodeView code={'a\nb'} />));

    // The flag lands on the scroller that moved, not on the host it is bound to.
    const scroller = document.createElement('div');
    host(container).appendChild(scroller);
    act(() => { scroller.dispatchEvent(new Event('scroll')); });
    expect(scroller.dataset.scrolling).toBe('true');
    expect(host(container).dataset.scrolling).toBeUndefined();

    act(() => { vi.advanceTimersByTime(SCROLL_ACTIVITY_IDLE_MS - 1); });
    expect(scroller.dataset.scrolling).toBe('true');
    act(() => { vi.advanceTimersByTime(1); });
    expect(scroller.dataset.scrolling).toBeUndefined();
  });
});
