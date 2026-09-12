// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import { takeLabel, type FavoriteConversation } from '../../../lib/favorite-conversations';
import FavoritesPage from '../FavoritesPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// The phone layout is what this file is about, and the page asks a media query
// for it — happy-dom's window is a desktop one.
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => true }));
// ArchivedConversationView shares the studio's message primitives. Stub the
// live-only thinking animation: it is intentionally excluded from archives.
vi.mock('../../conversation/ThinkingLottie', () => ({ ThinkingLottie: () => null }));
vi.mock('lottie-react', () => ({ default: () => null }));

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return { container, root };
}

const KEPT: FavoriteConversation[] = [
  {
    id: 'first',
    sessionId: 'session-first',
    title: ['第一段', 'The first one'],
    favoritedAt: Date.parse('2026-08-21T22:14:00'),
    turns: [
      { id: 'first-1', role: 'user', text: ['来点合成器', 'Something synthy'] },
      { id: 'first-2', role: 'assistant', text: ['给你一个骨架', 'Here is a skeleton'], code: 's("bd*4")' },
      { id: 'first-3', role: 'user', text: ['推起来一点', 'Push it along'] },
      { id: 'first-4', role: 'assistant', text: ['加了踩镲', 'Added hats'], code: 's("bd*4, hh*8")' },
    ],
  },
  {
    id: 'second',
    sessionId: 'session-second',
    title: ['第二段', 'The second one'],
    favoritedAt: Date.parse('2026-08-18T09:41:00'),
    turns: [
      { id: 'second-1', role: 'user', text: ['慢一点的', 'Something slower'] },
      { id: 'second-2', role: 'assistant', text: ['60 BPM', 'At 60 BPM'], code: 'setcps(0.25)' },
    ],
  },
];

/* Kept after the talking stopped: the code the session came to rest on is not
   the code the last reply committed. */
const CARRIED_ON: FavoriteConversation[] = [
  {
    ...KEPT[0]!,
    id: 'carried-on',
    code: 's("bd*4, hh*8, ~ cp")',
  },
];

/* Kept without a conversation: code that was typed straight into the studio, or
   that arrived with an imported session, never passes through a reply. */
const SCRIPT_ONLY: FavoriteConversation[] = [
  {
    id: 'script-only',
    sessionId: 'session-script-only',
    title: ['直接写的', 'Typed straight in'],
    favoritedAt: Date.parse('2026-08-11T11:03:00'),
    turns: [],
    code: 'setcps(0.5)',
  },
];

const page = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-testid="favorites-page-mobile"]')!
);
const codeWindow = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-testid="favorites-code-window"]')!
);
const listDrawer = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-testid="favorites-list-drawer"]')!
);
const chips = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLButtonElement>('[data-favorites-chip]')]
);
const listRows = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLButtonElement>('[data-testid="favorites-list-mobile"] [data-favorite-id]')]
);
const open = (element: HTMLElement) => element.style.visibility === 'visible';

/* The archive's code window is a read-only CodeMirror view, imported the first
   time the window is opened — so what it is showing has to be waited for, and is
   read off the editor's own lines rather than out of a `<pre>`. */
async function shownCode(container: HTMLElement): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const content = codeWindow(container).querySelector('.cm-content');
    if (content) {
      return [...content.querySelectorAll('.cm-line')]
        .map((line) => line.textContent)
        .join('\n');
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error('the code window never built its view');
}

/* Kept with a name longer than any line this layout can give it. */
const LONG_NAME: FavoriteConversation[] = [
  {
    ...KEPT[0]!,
    id: 'long-name',
    title: [
      '深夜末班地铁车厢里的环境音草稿',
      'An Ambient Sketch from the Last Subway Car of the Night',
    ],
  },
  KEPT[1]!,
];

describe('MobileFavoritesPage', () => {
  it('runs a name that will not fit — in the list on the row that is open, and always in the caption', () => {
    /* happy-dom lays nothing out, so the two measurements this turns on have
       to be stood in for: a name twice as wide as the room it has. */
    const nameWidth = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ ...new DOMRect(), width: 240 } as DOMRect);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
    try {
      // The caption shares the foot with the two keys, and only stands where
      // there is something to press beside it.
      const { container } = render(
        <FavoritesPage active conversations={LONG_NAME} onDelete={vi.fn()} />,
      );

      // The caption under the reading is the one thing on the page naming what
      // is open, so it runs whenever it has to.
      const caption = container
        .querySelector<HTMLElement>('[data-testid="favorites-mobile-caption"] .scrolling-title-clip')!;
      expect(caption.dataset.marquee).toBe('true');
      expect(caption.style.getPropertyValue('--scrolling-title-lap')).toBe('-288px');

      // In the list, only the row that is open — the rest are rows to choose
      // between, and say what they give up with an ellipsis.
      const rowTitle = (id: string) => listRows(container)
        .find((row) => row.dataset.favoriteId === id)!
        .querySelector<HTMLElement>('.scrolling-title-clip')!;
      expect(rowTitle('long-name').dataset.marquee).toBe('true');
      expect(rowTitle('second').dataset.marquee).toBeUndefined();
    } finally {
      nameWidth.mockRestore();
      clientWidth.mockRestore();
    }
  });

  it('stands the page name between the two doors, with neither panel out', () => {
    const { container } = render(<FavoritesPage active conversations={KEPT} />);

    expect(page(container).textContent).toContain(t('navFavorites'));
    // The desktop page's corner list and its light field belong to a display
    // this layout does not have.
    expect(container.querySelector('[data-testid="favorites-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="favorites-gallery"]')).toBeNull();
    expect(open(codeWindow(container))).toBe(false);
    expect(open(listDrawer(container).parentElement!)).toBe(false);
  });

  it('opens the take a widget points at, and hands it to the three keys above it', async () => {
    const onPlayCode = vi.fn();
    const onOpenInStudio = vi.fn();
    const { container } = render(
      <FavoritesPage
        active
        conversations={KEPT}
        onPlayCode={onPlayCode}
        onOpenInStudio={onOpenInStudio}
      />,
    );

    // Both takes of the open favorite are named in the reading.
    expect(chips(container).map((chip) => chip.textContent))
      .toEqual([expect.stringContaining(takeLabel(1)), expect.stringContaining(takeLabel(2))]);

    act(() => chips(container)[0]!.click());
    expect(open(codeWindow(container))).toBe(true);
    expect(await shownCode(container)).toBe('s("bd*4")');

    act(() => container
      .querySelector<HTMLButtonElement>('[data-testid="favorites-mobile-script-play"]')!
      .click());
    expect(onPlayCode).toHaveBeenCalledWith('s("bd*4")');

    act(() => container
      .querySelector<HTMLButtonElement>('[data-testid="favorites-mobile-script-open-in-studio"]')!
      .click());
    expect(onOpenInStudio).toHaveBeenCalledWith('s("bd*4")');

    // A second widget re-points the window rather than opening another.
    act(() => chips(container)[1]!.click());
    expect(await shownCode(container)).toBe('s("bd*4, hh*8")');
  });

  it('hangs a 最新 widget under the whole reading when the last take is not the last word', async () => {
    const { container } = render(<FavoritesPage active conversations={CARRIED_ON} />);

    const all = chips(container);
    expect(all).toHaveLength(3);
    expect(all[2]!.textContent).toContain(t('favoritesLatestScript'));
    // Standing clear of the reply above it rather than under it, the way the
    // widgets that belong to a message do.
    expect(all[2]!.parentElement!.className).toContain('mt-6');

    act(() => all[2]!.click());
    expect(open(codeWindow(container))).toBe(true);
    expect(await shownCode(container)).toBe('s("bd*4, hh*8, ~ cp")');
  });

  it('hangs no such widget when the last take is the whole of what was kept', () => {
    const { container } = render(<FavoritesPage active conversations={KEPT} />);

    expect(chips(container)).toHaveLength(2);
    expect(page(container).textContent).not.toContain(t('favoritesLatestScript'));
  });

  it('stands the only take in the middle of the page when there is no reading', async () => {
    const { container } = render(<FavoritesPage active conversations={SCRIPT_ONLY} />);

    const solo = container.querySelector<HTMLElement>('[data-testid="favorites-mobile-solo-script"]')!;
    expect(solo).not.toBeNull();
    expect(chips(container)).toHaveLength(1);
    expect(chips(container)[0]!.textContent).toContain(t('favoritesLatestScript'));

    act(() => chips(container)[0]!.click());
    expect(open(codeWindow(container))).toBe(true);
    expect(await shownCode(container)).toBe('setcps(0.5)');
  });

  const confirmPanel = (container: HTMLElement) => (
    container.querySelector<HTMLElement>('[data-testid="favorites-mobile-confirm"]')
  );
  const answer = (container: HTMLElement, which: 'cancel' | 'accept') => act(() => container
    .querySelector<HTMLButtonElement>(`[data-testid="favorites-mobile-confirm-${which}"]`)!
    .click());

  it('asks in the middle of the page before letting a favorite go, and does nothing until answered', () => {
    const onUnfavorite = vi.fn();
    const { container } = render(
      <FavoritesPage active conversations={KEPT} onUnfavorite={onUnfavorite} />,
    );

    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]')!.click());
    expect(confirmPanel(container)?.dataset.favoritesConfirm).toBe('unfavorite');
    expect(confirmPanel(container)?.textContent).toContain(t('unfavoriteAsk'));
    expect(onUnfavorite).not.toHaveBeenCalled();

    // Standing back leaves the favorite exactly as it was.
    answer(container, 'cancel');
    expect(confirmPanel(container)).toBeNull();
    expect(onUnfavorite).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]')!.click());
    answer(container, 'accept');
    expect(confirmPanel(container)).toBeNull();
    expect(onUnfavorite).toHaveBeenCalledWith(KEPT[0]);
    expect(onUnfavorite).toHaveBeenCalledTimes(1);
  });

  it('asks the same way before deleting one, in the delete’s own words', () => {
    const onDelete = vi.fn();
    const { container } = render(
      <FavoritesPage active conversations={KEPT} onDelete={onDelete} />,
    );

    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-delete]')!.click());
    expect(confirmPanel(container)?.dataset.favoritesConfirm).toBe('delete');
    expect(confirmPanel(container)?.textContent).toContain(t('deleteFavoriteAsk'));
    expect(onDelete).not.toHaveBeenCalled();

    answer(container, 'accept');
    expect(confirmPanel(container)).toBeNull();
    expect(onDelete).toHaveBeenCalledWith(KEPT[0]);
  });

  it('picks another favorite from the drawer the list key opens, and shuts it behind you', () => {
    const { container } = render(<FavoritesPage active conversations={KEPT} />);

    act(() => container
      .querySelector<HTMLButtonElement>(`[aria-label="${t('favoritesList')}"]`)!
      .click());
    expect(open(listDrawer(container).parentElement!)).toBe(true);
    expect(listRows(container).map((row) => row.dataset.favoriteId)).toEqual(['first', 'second']);
    expect(listRows(container)[0]!.getAttribute('aria-selected')).toBe('true');

    act(() => listRows(container)[1]!.click());
    expect(open(listDrawer(container).parentElement!)).toBe(false);
    expect(listRows(container)[1]!.getAttribute('aria-selected')).toBe('true');
    // The reading is the entry that was picked — one take, not two — and the
    // window that was open on the last one does not survive the move.
    expect(chips(container)).toHaveLength(1);
    expect(open(codeWindow(container))).toBe(false);
  });

  it('says nothing has been kept when nothing has', () => {
    const { container } = render(<FavoritesPage active conversations={[]} />);

    expect(container.querySelector('[data-testid="favorites-empty"]')?.textContent)
      .toContain(t('favoritesEmptyTitle'));
    expect(container.querySelector('[data-testid="favorites-mobile-actions"]')).toBeNull();
  });
});
