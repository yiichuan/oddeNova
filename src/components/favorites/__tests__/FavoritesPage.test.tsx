// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import {
  conversationTitle,
  favoritedTimeLabel,
  turnText,
  type FavoriteConversation,
} from '../../../lib/favorite-conversations';
import FavoritesPage from '../FavoritesPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

const sidebarRows = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLButtonElement>('[data-favorite-id]')]
);
const shownScripts = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLElement>('[data-favorites-script]')]
);

describe('FavoritesPage', () => {
  it('uses a newest-first settings-style sidebar and selects the first favorite by default', () => {
    const shuffled = [CONVERSATIONS[1], CONVERSATIONS[2], CONVERSATIONS[0]];
    const { container } = render(<FavoritesPage conversations={shuffled} />);
    const rows = sidebarRows(container);

    expect(rows.map((row) => row.dataset.favoriteId)).toEqual(['first', 'second', 'third']);
    expect(rows.map((row) => row.textContent?.trim())).toEqual(CONVERSATIONS.map(
      (conversation) => `${conversationTitle(conversation)}${favoritedTimeLabel(conversation.favoritedAt)}`,
    ));
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    expect(rows[0].className).toContain('h-[52px]');
    expect(rows[0].style.height).toBe('52px');
    expect(rows[0].className).toContain('px-2 py-0');
    expect(container.querySelector('h1')?.textContent).toBe(t('navFavorites'));
  });

  it('shows the selected conversation and its last code version by default', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const page = container.querySelector<HTMLElement>('[data-testid="favorites-page"]')!;
    const turns = [...container.querySelectorAll('[data-favorites-turn]')];

    expect(page.children).toHaveLength(3);
    expect(page.className).toContain('gap-[var(--spacing-divider)]');
    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent))
      .not.toContain(t('favoritesConversation'));
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .toContain('h-full');
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .not.toContain('p-5');
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .toContain('pt-[42px]');
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .toContain('pb-[14px]');
    expect(container.querySelector('.conversation-scroll')?.className).toContain('pt-[24px]');
    expect(container.querySelector('.conversation-scroll')?.className).toContain('px-4');
    expect(container.querySelectorAll('[data-conversation-edge-fade]').length).toBe(2);
    expect(container.querySelector('aside')?.className).toContain('bg-conversation-surface');
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .toContain('bg-conversation-surface');
    expect(shownScripts(container)[0]?.className).toContain('bg-conversation-surface');
    expect(turns.map((turn) => turn.textContent)).toEqual([
      turnText(CONVERSATIONS[0].turns[0]),
      `${turnText(CONVERSATIONS[0].turns[1])}代码 V01·1 ${t('lines')}`,
      turnText(CONVERSATIONS[0].turns[2]),
      `${turnText(CONVERSATIONS[0].turns[3])}代码 V02·1 ${t('lines')}`,
    ]);
    const reasoning = container.querySelector<HTMLButtonElement>('[data-reasoning-header="first-2-reasoning"]')!;
    expect(reasoning.textContent).toContain(t('favoritesReasoningTitle'));
    const process = container.querySelector<HTMLElement>('[data-archive-process="first-2-reasoning"]')!;
    expect(process.style.marginBlockEnd)
      .toBe('var(--spacing-action-divider-to-body)');
    expect(container.textContent).not.toContain('安排段落…');
    expect(container.textContent).not.toContain('准备播放…');
    expect(container.textContent).toContain('Checking rhythm, tone, and layering before arranging this revision.');
    act(() => reasoning.click());
    expect(process.textContent).not.toContain('Checking rhythm, tone, and layering before arranging this revision.');
    expect(shownScripts(container)).toHaveLength(1);
    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('first-4');
    expect(shownScripts(container)[0]?.querySelector('code')?.textContent).toBe('s("bd*4, hh*8")');
    expect(container.querySelector('[data-favorites-chip="first-2"]')?.parentElement?.className)
      .toContain('gap-0.5');
  });

  it('switches favorites from the sidebar and selects that favorite last code version', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    act(() => container.querySelector<HTMLButtonElement>('[data-favorite-id="second"]')!.click());

    expect(container.querySelector<HTMLButtonElement>('[data-favorite-id="second"]')?.getAttribute('aria-current')).toBe('page');
    expect(container.textContent).toContain(conversationTitle(CONVERSATIONS[1]));
    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('second-2');
  });

  it('lets a conversation code chip choose an earlier version for the right window', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const firstChip = container.querySelector<HTMLButtonElement>('[data-favorites-chip="first-2"]')!;
    expect(firstChip.getAttribute('aria-pressed')).toBe('false');

    act(() => firstChip.click());

    expect(firstChip.getAttribute('aria-pressed')).toBe('true');
    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('first-2');
    expect(shownScripts(container)[0]?.querySelector('code')?.textContent).toBe('s("bd*4")');
  });

  it('plays a version from its archive widget and selects it in the code window', () => {
    const onPlayCode = vi.fn();
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} onPlayCode={onPlayCode} />);

    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-code-play="first-2"]')!.click());

    expect(onPlayCode).toHaveBeenCalledWith('s("bd*4")');
    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('first-2');
  });

  it('stops when the archive widget version is already playing', () => {
    const onStopCode = vi.fn();
    const { container } = render(
      <FavoritesPage
        conversations={CONVERSATIONS}
        isPlaying
        playingCode={'s("bd*4, hh*8")'}
        onStopCode={onStopCode}
      />,
    );

    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-code-play="first-4"]')!.click());

    expect(onStopCode).toHaveBeenCalledOnce();
  });

  it('keeps the code window present when a favorite has no code', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    act(() => container.querySelector<HTMLButtonElement>('[data-favorite-id="third"]')!.click());

    expect(shownScripts(container)).toHaveLength(0);
    expect(container.textContent).toContain(t('favoritesNoCode'));
  });

  it('keeps the sidebar shell and shows the empty message with no favorites', () => {
    const { container } = render(<FavoritesPage conversations={[]} />);

    expect(container.querySelector('[data-testid="favorites-list"]')).not.toBeNull();
    expect(sidebarRows(container)).toHaveLength(0);
    expect(container.textContent).toContain(t('favoritesEmptyTitle'));
  });
});
