// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import MobileNavDrawer, { type MobileNavDrawerHistory } from '../MobileNavDrawer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

const session = (id: string, title: string, updatedAt: number) => ({
  id,
  title,
  messages: [{ role: 'user' as const, content: 'hi' }],
  code: '',
  createdAt: 1,
  updatedAt,
});

function renderDrawer(
  sessions = [session('a', 'Acid bassline', 2), session('b', 'Ambient pads', 1)],
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const onSwitch = vi.fn();
  const onFavorite = vi.fn();
  const history = {
    sessions,
    currentId: 'a',
    onSwitch,
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onFavorite,
  } as unknown as MobileNavDrawerHistory;

  act(() => {
    root.render(
      <MobileNavDrawer
        open
        onClose={vi.fn()}
        accountLabel="ada@example.com"
        onNewSession={vi.fn()}
        onOpenAccount={vi.fn()}
        history={history}
      />,
    );
  });
  return { container, onSwitch, onFavorite };
}

const searchKey = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[data-testid="drawer-search-open"]');
const searchField = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('[data-testid="drawer-search-input"]');
const titles = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-session-title-edit] span')].map((n) => n.textContent);

/* A finger on a row: happy-dom has no PointerEvent of its own, and the fields
   the panel reads off one are the two coordinates and the kind of pointer. */
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  return event;
}

const press = (row: HTMLElement) => { row.dispatchEvent(pointer('pointerdown', 40, 200)); };
const move = (row: HTMLElement, dx: number, dy: number) => {
  row.dispatchEvent(pointer('pointermove', 40 + dx, 200 + dy));
};

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('MobileNavDrawer search', () => {
  it('opens the field from the head key and takes the focus', () => {
    const { container } = renderDrawer();
    expect(searchField(container)).toBeNull();

    act(() => searchKey(container)?.click());

    const field = searchField(container);
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it('filters the conversation list by what is typed', () => {
    const { container } = renderDrawer();
    act(() => searchKey(container)?.click());
    type(searchField(container)!, 'acid');

    expect(titles(container)).toEqual(['Acid bassline']);
  });

  it('says so rather than showing an empty list when nothing matches', () => {
    const { container } = renderDrawer();
    act(() => searchKey(container)?.click());
    type(searchField(container)!, 'techno');

    expect(titles(container)).toEqual([]);
    expect(container.textContent).toContain(t('historySearchEmpty'));
  });

  it('stands the destinations aside while the search is up, and back after', () => {
    const { container } = renderDrawer();
    /* The block the four fixed rows live in — found through one of them, so
       the test is not pinned to the drawer's box structure. */
    const destinations = () => [...container.querySelectorAll('button')]
      .find((b) => b.textContent === t('newSession'))
      ?.parentElement;

    expect(destinations()?.hidden).toBe(false);

    act(() => searchKey(container)?.click());
    expect(destinations()?.hidden).toBe(true);

    /* Escape on an empty field backs out of the search only. */
    act(() => {
      searchField(container)!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(searchField(container)).toBeNull();
    expect(destinations()?.hidden).toBe(false);
  });

  it('offers a held row the three moves, and opens nothing on the way', () => {
    vi.useFakeTimers();
    const { container, onSwitch } = renderDrawer();
    const row = container.querySelector<HTMLElement>('[data-session-title-edit]')!
      .parentElement!;

    act(() => { press(row); });
    act(() => { vi.advanceTimersByTime(600); });

    const menu = document.querySelector<HTMLElement>('[data-testid="history-row-menu"]');
    expect([...menu!.querySelectorAll('button')].map((b) => b.textContent))
      .toEqual([t('rename'), t('favorite'), t('delete')]);
    // The word that does not come back is the only one carrying the red.
    expect(menu!.querySelector('[data-history-row-menu="delete"]')!.className)
      .toContain('text-diff-remove');

    // The press that opened the plate is not also the tap that opens the row.
    act(() => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onSwitch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('reads a press that travels as a scroll rather than a hold', () => {
    vi.useFakeTimers();
    const { container } = renderDrawer();
    const row = container.querySelector<HTMLElement>('[data-session-title-edit]')!
      .parentElement!;

    act(() => { press(row); });
    act(() => { move(row, 0, 40); });
    act(() => { vi.advanceTimersByTime(600); });

    expect(document.querySelector('[data-testid="history-row-menu"]')).toBeNull();
    vi.useRealTimers();
  });

  it('hands a kept conversation up to the app from the held row', () => {
    vi.useFakeTimers();
    const { container, onFavorite } = renderDrawer();
    const row = container.querySelector<HTMLElement>('[data-session-title-edit]')!
      .parentElement!;

    act(() => { press(row); });
    act(() => { vi.advanceTimersByTime(600); });
    act(() => {
      document.querySelector<HTMLButtonElement>('[data-history-row-menu="favorite"]')?.click();
    });
    // The star fills where the row stood and the row leaves under it; the
    // conversation is handed over once both have been seen.
    act(() => { vi.advanceTimersByTime(500); });

    expect(onFavorite).toHaveBeenCalledWith('a');
    expect(document.querySelector('[data-testid="history-row-menu"]')).toBeNull();
    vi.useRealTimers();
  });

  it('sends the held row to the same question the bin asks', () => {
    vi.useFakeTimers();
    const { container } = renderDrawer();
    const row = container.querySelector<HTMLElement>('[data-session-title-edit]')!
      .parentElement!;

    act(() => { press(row); });
    act(() => { vi.advanceTimersByTime(600); });
    act(() => {
      document.querySelector<HTMLButtonElement>('[data-history-row-menu="delete"]')?.click();
    });

    expect(document.querySelector('[data-testid="history-delete-confirm"]')?.textContent)
      .toContain(t('deleteSessionAsk'));
    vi.useRealTimers();
  });

  it('clears the words before it closes the field', () => {
    const { container } = renderDrawer();
    act(() => searchKey(container)?.click());
    type(searchField(container)!, 'acid');

    act(() => {
      searchField(container)!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(searchField(container)?.value).toBe('');
    expect(titles(container)).toEqual(['Acid bassline', 'Ambient pads']);
  });
});
