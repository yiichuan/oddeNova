// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t, zh } from '../../../lib/i18n';
import { NAV_COLLAPSED_WIDTH } from '../../nav/PrimaryNav';
import {
  conversationTitle,
  favoritedDateLabel,
  favoritedTimeLabel,
  turnText,
  type FavoriteConversation,
} from '../../../lib/favorite-conversations';
import FavoritesPage from '../FavoritesPage';
import { LIST_COLUMN, LIST_WIDTH } from '../FavoritesList';

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

const listRows = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLButtonElement>('[data-testid="favorites-list"] [data-favorite-id]')]
);
const shownScripts = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLElement>('[data-favorites-script]')]
);
const gallery = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-testid="favorites-gallery"]')
);
const rail = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-testid="conversation-turn-rail"]')
);
const ticks = (container: HTMLElement) => (
  [...container.querySelectorAll<HTMLButtonElement>('[data-turn-tick]')]
);
const preview = (container: HTMLElement) => (
  container.querySelector<HTMLElement>('[data-turn-tick-preview]')
);

describe('FavoritesPage', () => {
  it('stands on the Featured light field, named on the left and listed on the right', () => {
    const shuffled = [CONVERSATIONS[1], CONVERSATIONS[2], CONVERSATIONS[0]];
    const { container } = render(<FavoritesPage conversations={shuffled} />);
    const rows = listRows(container);

    expect(container.querySelector<HTMLElement>('[data-testid="featured-webgl-light-field"]')?.dataset.active)
      .toBe('true');
    expect(container.querySelector('h1')?.textContent).toBe(t('navFavorites'));
    // Newest first, and one entry per favorite — no ring, so nothing repeats.
    expect(rows.map((row) => row.dataset.favoriteId)).toEqual(['first', 'second', 'third']);
    // Title and the day it was kept, on one row; nothing finer than the date.
    expect(rows.map((row) => row.textContent?.trim())).toEqual(CONVERSATIONS.map(
      (conversation) => `${conversationTitle(conversation)}${favoritedDateLabel(conversation.favoritedAt)}`,
    ));
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[1].getAttribute('aria-selected')).toBe('false');
    // The marker is the same orange the Featured title column marks its head
    // row with, and it is only run out under the entry that is open.
    const marker = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-favorite-marker]');
    expect(marker(rows[0])?.className).toContain('bg-[#f05a28]');
    expect(marker(rows[0])?.style.transform).toBe('scaleX(1)');
    expect(marker(rows[1])?.style.transform).toBe('scaleX(0)');
  });

  it('expands the conversation to the viewport and keeps the others at two thirds', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const page = container.querySelector<HTMLElement>('[data-testid="favorites-page"]')!;
    const windows = gallery(container)!;

    // The light field, then the page's own column over it.
    expect(page.children).toHaveLength(2);
    // The list gets a column of its own on the right rather than standing over
    // the code window, and the heading stops on the same vertical.
    expect(container.querySelector('[data-testid="favorites-list"]')?.getAttribute('style'))
      .toContain(`width: ${LIST_WIDTH}`);
    // The right is what the list needs. The left is that less what the nav's
    // column holds of the page's left edge and what the reading insets itself
    // by, so the two windows stand centred on the page rather than on the
    // strip of it this page is handed.
    expect(windows.className).toContain('inset-y-0');
    // Centred, because past the reading measure both columns stop growing and
    // what is left over has to fall evenly either side or the mirror tilts.
    expect(windows.className).toContain('justify-center');
    // Air between two reading surfaces, not the studio's 6px resize divider.
    // With both outer edges pinned, this is also what sets the two widths.
    expect(windows.getAttribute('style')).toContain('--gallery-gutter: 3rem');
    expect(windows.getAttribute('style')).toContain('gap: var(--gallery-gutter)');
    // Both margins carry half of what the gutter gives up against the measure
    // that holds the two windows at their width — so tuning the middle moves
    // the pair's edges, never the width of what is being read.
    const stepBack = `calc(${NAV_COLLAPSED_WIDTH}px + var(--spacing-region) + 1.5rem)`;
    const givenBack = `calc((calc(2rem + ${stepBack}) - 3rem) / 2)`;
    expect(windows.getAttribute('style')).toContain(
      `--gallery-inset-left: calc(${LIST_COLUMN} - ${stepBack} + ${givenBack})`,
    );
    expect(windows.getAttribute('style')).toContain(
      `--gallery-inset-right: calc(${LIST_COLUMN} + ${givenBack})`,
    );
    expect(windows.getAttribute('style')).toContain('left: var(--gallery-inset-left)');
    expect(windows.getAttribute('style')).toContain('right: var(--gallery-inset-right)');
    expect(container.querySelector('header')?.getAttribute('style')).toContain(LIST_COLUMN);

    // Conversation and code — one row dividing evenly, except that the
    // conversation carries the reading's own two insets as its basis, so what
    // comes out is a block of text the width of the code window beside it.
    expect(windows.children).toHaveLength(2);

    // The conversation reaches through the app inset to the viewport edges,
    // and rests its reading on the code window's two verticals: one sixth of
    // the row's height in from either end, the same share the panel keeps.
    const conversation = windows.children[0] as HTMLElement;
    expect(conversation.getAttribute('data-testid')).toBe('favorites-conversation-panel');
    expect(conversation.getAttribute('style'))
      .toContain('flex-grow: 1; flex-shrink: 1; flex-basis: calc(1.5rem * 2);');
    expect(conversation.getAttribute('style'))
      .toContain('max-width: calc(390px + 1.5rem * 2)');
    expect(conversation.className).toContain('overflow-visible');
    expect(conversation.getAttribute('style'))
      .toContain('--spacing-conversation-window-top: calc(var(--spacing-region) * -1)');
    expect(conversation.getAttribute('style'))
      .toContain('--spacing-conversation-window-bottom: calc(var(--spacing-region) * -1)');
    // The pair sits 30px below the middle of the page, and the reading's two
    // stops carry that with it — one is measured from the column's head and
    // the other from its foot, so the drop is added to one and taken off the
    // other for both to land on the code window's own two edges.
    expect(conversation.getAttribute('style'))
      .toContain('--spacing-conversation-content-top: calc(calc(100cqh / 6) + 30px + 8px)');
    expect(conversation.getAttribute('style'))
      .toContain('--spacing-conversation-content-bottom: calc(calc(100cqh / 6) - 30px)');

    const code = windows.children[1] as HTMLElement;
    expect(code.getAttribute('style'))
      .toContain('flex-grow: 1; flex-shrink: 1; flex-basis: 0%;');
    // The pair reach their caps together — the targets differ by the same 3rem
    // the caps do — so neither can take the other's leftover.
    expect(code.getAttribute('style')).toContain('max-width: 390px');
    expect(code.getAttribute('style')).toContain('top: 30px');
    // Two thirds, written as what the stops above leave: a divisor the two
    // columns share, so neither can be retuned without the other following.
    expect(code.getAttribute('style')).toContain('height: calc(100% - 200% / 6)');
    expect(code.className).toContain('self-center');
    expect(code.firstElementChild?.getAttribute('data-favorites-script')).toBe('first-4');
  });

  it('shows the selected conversation and its last code version by default', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const turns = [...container.querySelectorAll('[data-favorites-turn]')];

    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent))
      .not.toContain(t('favoritesConversation'));
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .not.toContain('p-5');
    // The window itself holds nothing back — the scrollport reaches both of its
    // edges — while the content inside it clears the blur bands by exactly one
    // band's depth, so the first message and the last reply are sharp at rest
    // and only soften once they are scrolled out through one.
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')?.className)
      .not.toMatch(/\bp[tby]-/);
    expect(container.querySelector('.conversation-scroll')?.className)
      .toContain('py-[var(--spacing-conversation-fade)]');
    // Horizontal padding is not here: it answers to how far the window
    // overhangs its column, so it lives beside that in index.css.
    // The conversation hides its bar — its ends fade, which says the same
    // thing — while the code window shows its own, since a script has an edge
    // and nothing else there can say it runs on.
    expect(container.querySelectorAll('.scrollbar-on-hover')).toHaveLength(0);
    expect(shownScripts(container)[0]?.querySelector('.overflow-auto')?.className)
      .not.toContain('scrollbar-');
    expect(container.querySelector('.conversation-scroll')?.className)
      .toContain('scrollbar-hidden');
    // The exchange stands on the page itself — no surface, no border, and none
    // of the surface-coloured masks the studio's own stream fades its edges
    // with. Only the code beside it keeps a panel.
    const conversationPanel = container.querySelector<HTMLElement>('[data-testid="favorites-conversation-panel"]')!;
    expect(conversationPanel.className).not.toContain('bg-');
    expect(conversationPanel.className).not.toContain('border');
    expect(container.querySelectorAll('[data-conversation-edge-fade]').length).toBe(0);
    // Its two ends say the stream runs past them with blur alone — no scrim and
    // no fade of the content's own alpha, both of which would be a statement
    // about a colour this page does not have. One span per nth-child rule in
    // the stack; a span past the last rule would be an unblurred pane.
    expect(container.querySelectorAll('[data-conversation-blur-fade]').length).toBe(2);
    // The bands live at page level rather than inside the scrolling archive,
    // so they span the page without becoming fixed viewport layers.
    const archive = container.querySelector('.conversation-archive')!;
    expect(archive.querySelector(':scope > .conversation-scroll-shell')?.className)
      .toContain('conversation-scroll-shell--inset');
    expect(archive.querySelectorAll(':scope > [data-conversation-blur-fade]').length)
      .toBe(0);
    expect(container.querySelectorAll('[data-conversation-blur-fade]').length)
      .toBe(2);
    expect(container.querySelectorAll('[data-conversation-blur-fade="top"] > span').length)
      .toBe(6);
    expect(container.querySelectorAll('[data-conversation-blur-fade="bottom"] > span').length)
      .toBe(6);
    expect(container.querySelector('[data-reasoning-header="first-2-reasoning"]')?.className)
      .not.toContain('bg-conversation-surface');
    expect(container.querySelector('.reasoning-header--expanded')).toBeNull();
    // The code window is glass over the light field, the same as the Featured
    // detail's panels — not a flat surface laid on it.
    expect(shownScripts(container)[0]?.className).toContain('bg-[#0D0D0D]/55');
    expect(shownScripts(container)[0]?.className).toContain('backdrop-blur-2xl');
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

  it('switches favorites from the list and selects that favorite last code version', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    act(() => container.querySelector<HTMLButtonElement>('[data-favorite-id="second"]')!.click());

    expect(container.querySelector<HTMLButtonElement>('[data-favorite-id="second"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector<HTMLButtonElement>('[data-favorite-id="first"]')?.getAttribute('aria-selected')).toBe('false');
    expect(container.textContent).toContain(turnText(CONVERSATIONS[1].turns[0]));
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

  it('names the open favorite in full in the opposite corner', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const caption = container.querySelector<HTMLElement>('[data-testid="favorites-caption"]')!;

    expect(caption.className).toContain('bottom-2');
    expect(caption.className).toContain('right-4');
    // The whole name, not the list's cut-down one, and the whole moment
    // rather than the list's date.
    expect(caption.querySelector('h2')?.className).not.toContain('truncate');
    // The serif carries Latin only: English takes it at its one weight, and
    // 中文 stays in the page's own font and takes weight instead.
    expect(caption.querySelector('h2')?.className.includes('font-dm-serif')).toBe(!zh);
    expect(caption.querySelector('h2')?.className.includes('font-bold')).toBe(zh);
    expect(caption.querySelector('h2')?.textContent).toBe(conversationTitle(CONVERSATIONS[0]));
    expect(caption.querySelector('time')?.textContent)
      .toBe(t('favoritesSavedAt').replace('{time}', favoritedTimeLabel(CONVERSATIONS[0].favoritedAt)));

    act(() => container.querySelector<HTMLButtonElement>('[data-favorite-id="second"]')!.click());
    // Keyed, so it is a new element — re-read it rather than the detached one.
    expect(container.querySelector('[data-testid="favorites-caption"] h2')?.textContent)
      .toBe(conversationTitle(CONVERSATIONS[1]));
  });

  it('truncates a long title rather than letting the row outgrow its column', () => {
    const long: FavoriteConversation = {
      ...CONVERSATIONS[0],
      id: 'long',
      title: [
        '深夜末班地铁车厢里的环境音草稿',
        'An Ambient Sketch from the Last Subway Car of the Night',
      ],
    };
    const { container } = render(<FavoritesPage conversations={[long]} />);
    const row = listRows(container)[0];

    // The title gives up its width; the date holds its five characters, so the
    // column of days stays readable however long a name runs.
    expect(row.querySelector('[data-favorite-title="long"]')?.className)
      .toContain('min-w-0 truncate');
    expect(row.querySelector('time')?.className).toContain('shrink-0');
    expect(row.querySelector('time')?.textContent).toBe(favoritedDateLabel(long.favoritedAt));
  });

  it('opens a favorite at its end rather than at its first instruction', () => {
    // happy-dom lays nothing out, so the height the archive reads has to be
    // stood in for. What is under test is that it reads one at all and parks
    // the scrollport there — the layout effect, not the number.
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(1234);
    try {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      const scroller = container.querySelector<HTMLElement>('.conversation-scroll')!;
      expect(scroller.scrollTop).toBe(1234);

      // And again on the next favorite, which arrives as a fresh archive: what
      // was kept is the take the exchange arrived at, every time.
      scroller.scrollTop = 0;
      act(() => listRows(container)[1].click());
      expect(container.querySelector<HTMLElement>('.conversation-scroll')!.scrollTop)
        .toBe(1234);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('comes back to the end each time the page is opened, not only the first', () => {
    // The gallery pages are hidden rather than unmounted when you leave them,
    // so a return is a prop changing: without watching it, whatever the reader
    // had scrolled to before leaving would still be there on the way back.
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(1234);
    try {
      const { container, root } = render(
        <FavoritesPage active conversations={CONVERSATIONS} />,
      );
      const scroller = container.querySelector<HTMLElement>('.conversation-scroll')!;
      expect(scroller.scrollTop).toBe(1234);

      // Left the page, and read from the top of the archive while away.
      act(() => root.render(<FavoritesPage active={false} conversations={CONVERSATIONS} />));
      scroller.scrollTop = 0;
      act(() => root.render(<FavoritesPage active={false} conversations={CONVERSATIONS} />));
      expect(scroller.scrollTop).toBe(0);

      // Back on the page: the entry opens at its end again.
      act(() => root.render(<FavoritesPage active conversations={CONVERSATIONS} />));
      expect(scroller.scrollTop).toBe(1234);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('indexes what the reader asked for down the left, on the nav own vertical', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);

    // One line per thing the reader said, in the order they said it, and
    // nothing at all for the replies: the questions are what tell one part of
    // a conversation from another.
    expect(ticks(container).map((tick) => tick.dataset.turnTick))
      .toEqual(['first-1', 'first-3']);
    // Centred on the nav's column rather than on anything of this page's — the
    // rail lives in the app's left margin, in the strip the two lobes leave
    // between them, and a thing in a column stands down the middle of it.
    expect(rail(container)?.getAttribute('style'))
      .toContain(`--turn-rail-center: calc(${NAV_COLLAPSED_WIDTH / -2}px - var(--spacing-region))`);
    expect(rail(container)?.className).toContain('-translate-x-1/2');
  });

  it('opens the instruction beside the line the pointer is on, and only then', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const [first] = ticks(container);
    expect(preview(container)).toBeNull();

    act(() => {
      first.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    });
    expect(preview(container)?.textContent).toBe(turnText(CONVERSATIONS[0].turns[0]));
    // Centred on its own line, and unable to take the pointer that opened it.
    expect(preview(container)?.className).toContain('-translate-y-1/2');
    expect(preview(container)?.className).toContain('pointer-events-none');

    act(() => {
      first.dispatchEvent(new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: document.body,
      }));
    });
    expect(preview(container)).toBeNull();
  });

  it('takes the reading to the middle of the window when a line is taken', () => {
    // happy-dom lays nothing out, so both boxes the jump is measured from have
    // to be stood in for. What is under test is the arithmetic between them.
    const boxes = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const rects = new Map<Element, { top: number; height: number }>();
    boxes.mockImplementation(function box(this: HTMLElement) {
      const { top, height } = rects.get(this) ?? { top: 0, height: 0 };
      return { top, height, bottom: top + height, y: top, left: 0, right: 0, width: 0, x: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      const scroller = container.querySelector<HTMLElement>('.conversation-scroll')!;
      const bubble = container.querySelector<HTMLElement>('[data-favorites-turn="first-1"]')!;
      const scrollTo = vi.fn();
      scroller.scrollTo = scrollTo;
      // A window whose middle is at 300, holding a bubble whose middle is at
      // 520, with 100 already scrolled.
      rects.set(scroller, { top: 0, height: 600 });
      rects.set(bubble, { top: 500, height: 40 });
      scroller.scrollTop = 100;

      act(() => ticks(container)[0].click());

      // The 220 between the two middles, on top of where the reading already
      // stands. Centred rather than merely brought into view: an instruction
      // parked against the end of the window is an instruction in the blur.
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 320 }));
    } finally {
      boxes.mockRestore();
    }
  });

  it('drops the list and shows the empty message with no favorites', () => {
    const { container } = render(<FavoritesPage conversations={[]} />);

    expect(container.querySelector('[data-testid="favorites-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="favorites-caption"]')).toBeNull();
    expect(gallery(container)).not.toBeNull();
    expect(container.textContent).toContain(t('favoritesEmptyTitle'));
  });
});
