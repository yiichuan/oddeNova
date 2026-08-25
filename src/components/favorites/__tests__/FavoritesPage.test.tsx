// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import {
  conversationTitle,
  favoritedDateLabel,
  turnText,
  type FavoriteConversation,
} from '../../../lib/favorite-conversations';
import FavoritesPage from '../FavoritesPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
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

const CONVERSATIONS: FavoriteConversation[] = [
  {
    id: 'first',
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
    title: ['第二段', 'The second one'],
    favoritedAt: Date.parse('2026-08-18T09:41:00'),
    turns: [
      { id: 'second-1', role: 'user', text: ['慢一点的', 'Something slower'] },
      { id: 'second-2', role: 'assistant', text: ['60 BPM', 'At 60 BPM'], code: 'setcps(0.25)' },
    ],
  },
  {
    id: 'third',
    title: ['第三段', 'The third one'],
    favoritedAt: Date.parse('2026-08-04T07:26:00'),
    turns: [
      { id: 'third-1', role: 'user', text: ['只聊聊天', 'Just talking'] },
      { id: 'third-2', role: 'assistant', text: ['没写代码', 'No code this time'] },
    ],
  },
];

const wheelOf = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-testid="favorites-title-wheel"]')!
);
const columnsOf = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLElement>('[data-favorites-script]')]
);

describe('FavoritesPage', () => {
  it('names the page, lists every favorite with its date, and opens the newest', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);

    expect(container.querySelector('h1')?.textContent).toBe(t('navFavorites'));

    const wheel = wheelOf(container);
    const head = wheel.querySelector<HTMLElement>('[data-title-wheel-centered="true"]')!;
    expect(head.textContent?.trim()).toBe(
      `${conversationTitle(CONVERSATIONS[0])} · ${favoritedDateLabel(CONVERSATIONS[0].favoritedAt)}`,
    );

    // The conversation itself, turn by turn and in the order it happened.
    const turns = [...container.querySelectorAll('[data-favorites-turn]')];
    expect(turns.map((turn) => turn.textContent)).toEqual([
      turnText(CONVERSATIONS[0].turns[0]),
      `${turnText(CONVERSATIONS[0].turns[1])}${t('favoritesCodeColumn').replace('{n}', '1')}`,
      turnText(CONVERSATIONS[0].turns[2]),
      `${turnText(CONVERSATIONS[0].turns[3])}${t('favoritesCodeColumn').replace('{n}', '2')}`,
    ]);
  });

  it('gives every script in the conversation a column of its own, in order', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);

    const columns = columnsOf(container);
    expect(columns.map((column) => column.dataset.favoritesScript)).toEqual(['first-2', 'first-4']);
    expect(columns.map((column) => column.querySelector('code')?.textContent)).toEqual([
      's("bd*4")',
      's("bd*4, hh*8")',
    ]);
    expect(columns.map((column) => column.querySelector('h2')?.textContent)).toEqual([
      t('favoritesCodeColumn').replace('{n}', '1'),
      t('favoritesCodeColumn').replace('{n}', '2'),
    ]);
  });

  it('opens whichever favorite the list settles on', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      const next = wheelOf(container)
        .querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="1"]')!;

      act(() => {
        next.click();
        vi.advanceTimersByTime(400);
      });

      expect(container.querySelector('h2')?.textContent).toBe(conversationTitle(CONVERSATIONS[1]));
      expect(columnsOf(container).map((column) => column.dataset.favoritesScript))
        .toEqual(['second-2']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when a favorited conversation holds no code at all', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      const third = wheelOf(container)
        .querySelector<HTMLButtonElement>('[data-title-wheel-logical-index="2"]')!;

      act(() => {
        third.click();
        vi.advanceTimersByTime(800);
      });

      expect(columnsOf(container)).toHaveLength(0);
      expect(container.textContent).toContain(t('favoritesNoCode'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the column a widget chip points at, and previews it on hover', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const [firstColumn, secondColumn] = columnsOf(container);
    const secondChip = container.querySelector<HTMLButtonElement>('[data-favorites-chip="first-4"]')!;

    expect(firstColumn.dataset.highlighted).toBe('false');

    // React derives enter/leave from pointerover, so that is what a pointer
    // arriving on the chip actually looks like.
    act(() => secondChip.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    expect(secondColumn.dataset.highlighted).toBe('true');
    expect(firstColumn.dataset.highlighted).toBe('false');

    act(() => {
      secondChip.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
      secondChip.click();
    });
    expect(secondColumn.dataset.highlighted).toBe('true');
  });

  it('has something to say with nothing favorited, and no list to show', () => {
    const { container } = render(<FavoritesPage conversations={[]} />);

    expect(container.textContent).toContain(t('favoritesEmptyTitle'));
    expect(container.querySelector('[data-testid="favorites-title-wheel"]')).toBeNull();
    expect(columnsOf(container)).toHaveLength(0);
  });
});
