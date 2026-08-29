// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import FavoriteActionDialog, {
  LEAVING_MS,
  LINGER_MS,
  type FavoriteActionKind,
} from '../FavoriteActionDialog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

/* Every way out of the notice is animated, so nothing it was asked to do
   happens until the bar has finished going. */
const settle = () => act(() => { vi.advanceTimersByTime(LEAVING_MS); });

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function render(kind: FavoriteActionKind, props: {
  onView?: () => void;
  onUndo?: () => void;
  onClose?: () => void;
} = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const onView = props.onView ?? vi.fn();
  const onUndo = props.onUndo ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();

  act(() => {
    root.render(
      <FavoriteActionDialog
        kind={kind}
        title="午夜霓虹"
        onView={kind === 'deleted' ? undefined : onView}
        onUndo={onUndo}
        onClose={onClose}
      />,
    );
  });

  const dialog = container.querySelector<HTMLElement>('[data-testid="favorite-action-dialog"]')!;
  const card = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const button = (label: string) => (
    [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate) => candidate.textContent === label) ?? null
  );
  const close = () => dialog.querySelector<HTMLButtonElement>(`button[aria-label="${t('close')}"]`);
  return { container, dialog, card, button, close, onView, onUndo, onClose };
}

describe('FavoriteActionDialog', () => {
  it('names the conversation it is about and offers both ways out', () => {
    const { dialog, button } = render('kept');

    expect(dialog.textContent).toContain(t('favoriteDoneTitle'));
    expect(dialog.textContent).toContain('午夜霓虹');
    expect(button(t('favoriteActionView'))).not.toBeNull();
    expect(button(t('favoriteActionUndo'))).not.toBeNull();
  });

  it('reports from the top of the page without taking it over', () => {
    const { dialog, card } = render('kept');

    // Nothing here is waiting on an answer, so the page keeps its colour, its
    // focus and its clicks: a strip across the top, and only the bar in it
    // takes the pointer.
    expect(dialog.className).toContain('top-6');
    expect(dialog.className).toContain('justify-center');
    expect(dialog.className).toContain('pointer-events-none');
    expect(dialog.className).not.toContain('backdrop-blur');
    expect(dialog.className).not.toContain('inset-0');
    expect(card.className).toContain('pointer-events-auto');
    expect(document.activeElement).toBe(document.body);
  });

  it('lays the whole notice out along one line', () => {
    const { card, button, close } = render('kept');
    const parts = [...card.children];

    // Mark, then what happened, then which conversation, then what can be done
    // about it, then the way out.
    expect(parts[0]?.querySelector('svg')).not.toBeNull();
    expect(parts[1]?.textContent).toBe(t('favoriteDoneTitle'));
    expect(parts[2]?.textContent).toBe('午夜霓虹');
    expect(parts[3]?.contains(button(t('favoriteActionUndo'))!)).toBe(true);
    expect(parts[3]?.contains(button(t('favoriteActionView'))!)).toBe(true);
    expect(parts.at(-1)).toBe(close());
    // The mark and the headline are one phrase, so they carry one colour.
    expect(parts[0]?.className).toContain('text-[#f05a28]');
    expect(parts[1]?.className).toContain('text-[#f05a28]');
  });

  it('reports a deletion in the delete red instead', () => {
    const { card } = render('deleted');
    const parts = [...card.children];

    expect(parts[0]?.className).toContain('text-[#E01A1A]');
    expect(parts[1]?.className).toContain('text-[#E01A1A]');
  });

  it('offers no way onward for a deletion, only a way back', () => {
    const { dialog, button } = render('deleted');

    expect(dialog.textContent).toContain(t('favoriteDeletedTitle'));
    expect(button(t('favoriteActionView'))).toBeNull();
    expect(button(t('favoriteActionUndo'))).not.toBeNull();
  });

  it('goes before it does what it was asked, whichever way it was answered', () => {
    const { card, button, onView } = render('kept');

    act(() => { button(t('favoriteActionView'))?.click(); });
    // Answered, and on its way out — but not yet gone, and no longer able to
    // be answered again on the way.
    expect(card.className).toContain('animate-favorite-dialog-out');
    expect(card.className).toContain('pointer-events-none');
    expect(onView).not.toHaveBeenCalled();

    settle();
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('takes the first answer only', () => {
    const { button, onView, onUndo, onClose } = render('kept');

    act(() => { button(t('favoriteActionView'))?.click(); });
    act(() => { button(t('favoriteActionUndo'))?.click(); });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    settle();

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets the move stand when dismissed by the cross', () => {
    const { close, onClose } = render('deleted');

    act(() => { close()?.click(); });
    settle();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets the move stand when dismissed by Escape', () => {
    const { onClose } = render('deleted');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    settle();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when the bar itself is clicked', () => {
    const { card, onClose } = render('kept');

    act(() => { card.click(); });

    expect(onClose).not.toHaveBeenCalled();
  });

  describe('left alone', () => {
    it('lets the move stand after a few seconds', () => {
      const { card, onClose } = render('deleted');

      act(() => { vi.advanceTimersByTime(LINGER_MS - 1); });
      expect(onClose).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(1); });
      // The wait running out is answering it too, so it goes the same way the
      // buttons send it.
      expect(card.className).toContain('animate-favorite-dialog-out');
      expect(onClose).not.toHaveBeenCalled();

      settle();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('waits as long as the pointer is on it, then starts over', () => {
      const { card, onClose } = render('kept');

      act(() => { card.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); });
      act(() => { vi.advanceTimersByTime(60_000); });
      // Someone is deciding. Nothing decides for them while they are.
      expect(onClose).not.toHaveBeenCalled();

      act(() => {
        card.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
      });
      act(() => { vi.advanceTimersByTime(LINGER_MS - 1); });
      expect(onClose).not.toHaveBeenCalled();

      act(() => { vi.advanceTimersByTime(1); });
      settle();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
