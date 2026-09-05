// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t, zh } from '../../../lib/i18n';
import type { FavoriteSummary } from '../../../../shared/session-api';
import { NAV_COLLAPSED_WIDTH } from '../../nav/PrimaryNav';
import {
  conversationTitle,
  favoritedDateLabel,
  favoritedTimeLabel,
  takeLabel,
  turnText,
  type FavoriteConversation,
} from '../../../lib/favorite-conversations';
import FavoritesPage, { READING_LEFT_INSET } from '../FavoritesPage';
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

const SUMMARIES: FavoriteSummary[] = [
  { id: 'summary-first', title: 'First summary', updatedAt: 30, favoritedAt: 300 },
  { id: 'summary-second', title: 'Second summary', updatedAt: 20, favoritedAt: 200 },
];

/* Three, so that "the newest one left" is a different entry from both the one
   removed and the one under it. */
const THREE_KEPT: FavoriteSummary[] = [
  { id: 'newest', title: 'Newest kept', updatedAt: 30, favoritedAt: 300 },
  { id: 'middle', title: 'Middle kept', updatedAt: 20, favoritedAt: 200 },
  { id: 'oldest', title: 'Oldest kept', updatedAt: 10, favoritedAt: 100 },
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
const searchInput = (container: HTMLElement) => (
  container.querySelector<HTMLInputElement>('[data-testid="favorites-search-input"]')!
);

/** Type into a controlled input the way React hears it. */
function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('FavoritesPage', () => {
  it('renders cloud summaries in service order without fabricating a conversation', () => {
    const onSelect = vi.fn();
    const loadMore = vi.fn();
    const { container } = render(
      <FavoritesPage
        active={false}
        summaries={SUMMARIES}
        onSelect={onSelect}
        hasMore
        onLoadMore={loadMore}
      />,
    );

    expect(listRows(container).map((row) => row.dataset.favoriteId))
      .toEqual(['summary-first', 'summary-second']);
    expect(listRows(container).map((row) => row.textContent?.trim()))
      .toEqual(['First summary01/01', 'Second summary01/01']);
    expect(container.querySelector('[data-testid="favorites-gallery"]')).toBeNull();

    act(() => listRows(container)[1]!.click());
    expect(onSelect).toHaveBeenCalledWith(SUMMARIES[1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does not show an exhausted-pagination label in the favorites list', () => {
    const { container } = render(
      <FavoritesPage active summaries={SUMMARIES} onSelect={vi.fn()} />,
    );

    expect(container.querySelector('[data-testid="infinite-scroll-sentinel"]')).toBeNull();
    expect(container.textContent).not.toContain(t('noMoreSessions'));
  });

  it('auto-selects the first cloud summary once on first active entry', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FavoritesPage active summaries={SUMMARIES} onSelect={onSelect} />,
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(SUMMARIES[0]);
    expect(container.querySelector('[data-testid="favorites-gallery"]')).toBeNull();
  });

  it('opens the cached first entry while the list is still refreshing, and again if it comes back re-dated', () => {
    const onSelect = vi.fn();
    const { root } = render(
      <FavoritesPage active summaries={SUMMARIES} onSelect={onSelect} isLoading />,
    );

    // The rows are the ones this device kept; the reader does not wait on the
    // request that refreshes them.
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(SUMMARIES[0]);

    // The same entry back unchanged is the one already open.
    act(() => root.render(
      <FavoritesPage active summaries={[...SUMMARIES]} onSelect={onSelect} />,
    ));
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Re-dated, it is a version the page has not opened.
    const moved = { ...SUMMARIES[0], updatedAt: SUMMARIES[0].updatedAt + 1 };
    act(() => root.render(
      <FavoritesPage active summaries={[moved, SUMMARIES[1]]} onSelect={onSelect} />,
    ));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(moved);
  });

  const openEntry = (container: HTMLElement) => listRows(container)
    .find((row) => row.getAttribute('aria-selected') === 'true')?.dataset.favoriteId ?? null;

  it('opens the newest entry left when the one on screen is let go of', () => {
    const onSelect = vi.fn();
    const { container, root } = render(
      <FavoritesPage active summaries={THREE_KEPT} selectedId="middle" onSelect={onSelect} />,
    );
    expect(openEntry(container)).toBe('middle');
    onSelect.mockClear();

    /* What letting go of an entry looks like from in here: it leaves this list
       at once — the notice holds the undo, so the row cannot still be standing
       — while the id the page was handed goes on pointing at it, because the
       account's own rows keep it until the notice is committed. A page that
       took that id on trust would find nothing behind it and draw its empty
       state over a shelf with two things still on it. */
    act(() => root.render(
      <FavoritesPage
        active
        summaries={[THREE_KEPT[0], THREE_KEPT[2]]}
        selectedId="middle"
        onSelect={onSelect}
      />,
    ));

    expect(container.querySelector('[data-testid="favorites-empty"]')).toBeNull();
    expect(openEntry(container)).toBe('newest');
    // And said upward, so the detail for it is actually fetched.
    expect(onSelect).toHaveBeenCalledWith(THREE_KEPT[0]);
  });

  it('does the same for a deletion, and for an entry this page picked itself', () => {
    const onSelect = vi.fn();
    const { container, root } = render(
      <FavoritesPage active summaries={THREE_KEPT} onSelect={onSelect} />,
    );
    act(() => listRows(container)[2].click());
    expect(openEntry(container)).toBe('oldest');
    onSelect.mockClear();

    // A deletion takes the row out from under a pick this page is holding on
    // its own, with no parent id involved at all.
    act(() => root.render(
      <FavoritesPage active summaries={[THREE_KEPT[0], THREE_KEPT[1]]} onSelect={onSelect} />,
    ));

    expect(container.querySelector('[data-testid="favorites-empty"]')).toBeNull();
    expect(openEntry(container)).toBe('newest');
    expect(onSelect).toHaveBeenCalledWith(THREE_KEPT[0]);
  });

  it('still says the account has kept nothing when nothing is left', () => {
    const { container } = render(
      <FavoritesPage active summaries={[]} selectedId="middle" onSelect={vi.fn()} />,
    );

    expect(container.querySelector('[data-testid="favorites-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="favorites-gallery"]')).toBeNull();
  });

  it('shows collection and detail loading or retry states without making a fake detail', () => {
    const onRetry = vi.fn();
    const { container, root } = render(
      <FavoritesPage
        active
        summaries={[]}
        onSelect={vi.fn()}
        isLoading
        onRetry={onRetry}
      />,
    );

    expect(container.querySelector('[data-testid="favorites-loading"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="favorites-gallery"]')).toBeNull();

    act(() => root.render(
      <FavoritesPage
        active
        summaries={[]}
        onSelect={vi.fn()}
        error={new Error('network')}
        onRetry={onRetry}
      />,
    ));
    expect(container.querySelector('[data-testid="favorites-error"]')?.textContent)
      .toContain(t('sessionListNetworkError'));

    act(() => root.render(
      <FavoritesPage
        active
        summaries={SUMMARIES}
        onSelect={vi.fn()}
        detailLoading
        detailError={new Error('network')}
        onRetryDetail={onRetry}
      />,
    ));
    expect(container.querySelector('[data-testid="favorites-detail-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="favorites-detail-error"]')?.textContent)
      .toContain(t('sessionDetailNetworkError'));
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="favorites-detail-retry"]')!.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

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
    expect(marker(rows[0])?.className).toContain('bg-brand-accent');
    expect(marker(rows[0])?.style.transform).toBe('scaleX(1)');
    expect(marker(rows[1])?.style.transform).toBe('scaleX(0)');
  });

  it('sets the two windows against the list\u2019s vertical, the wider one first', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const page = container.querySelector<HTMLElement>('[data-testid="favorites-page"]')!;
    const windows = gallery(container)!;

    // The light field, then the page's own column over it.
    expect(page.children).toHaveLength(2);
    // The list gets a column of its own on the right rather than standing over
    // the code window, and the heading stops on the same vertical.
    const list = container.querySelector<HTMLElement>('[data-testid="favorites-list"]')!;
    expect(list.getAttribute('style')).toContain(`width: ${LIST_WIDTH}`);
    // Six 22px entries deep whatever the viewport is doing, and the rest of
    // the collection scrolled to rather than shown.
    expect(list.style.maxHeight).toBe(`${6 * 22}px`);
    expect(list.className).toContain('overflow-y-auto');
    // The right is the list's column and nothing more, so the code window
    // comes as far right as anything on this page can. The left is the
    // reading's own vertical, which is how its width is set.
    // The row is the spread's own box on all four sides: the two windows state
    // no height and no offset of their own, they fill what it gives them.
    expect(windows.getAttribute('style')).toContain('top: calc(100% / 10 + 30px)');
    expect(windows.getAttribute('style')).toContain('bottom: calc(100% / 6 - 30px)');
    // Set against the right rather than centred: what the two windows do not
    // take collects on the far side of the reading instead of opening a gap
    // between the code and the list it answers to.
    expect(windows.className).toContain('justify-end');
    // Air between two windows, and the same measure a Featured record holds
    // its own two apart by — not the studio's 6px resize divider.
    expect(windows.getAttribute('style')).toContain('--gallery-gutter: 1.5rem');
    expect(windows.getAttribute('style')).toContain('gap: var(--gallery-gutter)');
    expect(windows.getAttribute('style'))
      .toContain(`--gallery-inset-left: ${READING_LEFT_INSET}`);
    expect(windows.getAttribute('style')).toContain(`--gallery-inset-right: ${LIST_COLUMN}`);
    expect(windows.getAttribute('style')).toContain('left: var(--gallery-inset-left)');
    expect(windows.getAttribute('style')).toContain('right: var(--gallery-inset-right)');
    // The heading keeps the page's own two edges: it stops on the list's
    // vertical and starts on the page's, not on the reading's.
    expect(container.querySelector('header')?.getAttribute('style')).toContain(LIST_COLUMN);
    expect(container.querySelector('header')?.getAttribute('style')).toContain('left: 1rem');

    // Conversation and code, and the reading gets the wider of the two — it is
    // the longer read and the one that reflows.
    expect(windows.children).toHaveLength(2);

    const conversation = windows.children[0] as HTMLElement;
    expect(conversation.getAttribute('data-testid')).toBe('favorites-conversation-panel');
    // The reading takes everything the script leaves, so its left edge lands on
    // the row's own left inset — the page's heading vertical — and its width is
    // that line rather than a cap of its own.
    expect(conversation.getAttribute('style'))
      .toContain('flex-grow: 1; flex-shrink: 1; flex-basis: 0%;');
    expect(conversation.getAttribute('style')).not.toContain('max-width');
    // A window with edges of its own: it clips its reading rather than blurring
    // it out, and it stands between the row's two horizontals like the script
    // beside it, without stating either of them itself.
    expect(conversation.className).toContain('overflow-hidden');
    expect(conversation.getAttribute('style')).not.toContain('height');
    expect(conversation.getAttribute('style')).not.toContain('top');
    // Nothing is handed down to the archive any more — where the reading stands
    // off the window's edges is the window's own padding, the same p-5 the
    // script's window keeps.
    expect(conversation.getAttribute('style')).not.toContain('--spacing-conversation');
    expect(conversation.className).toContain('p-5');

    const code = windows.children[1] as HTMLElement;
    // The narrow half: its measure is its basis and it never grows past it.
    // The cap is what happens when the page runs out — half the spread, gutter
    // taken off first, so a row too narrow to hold the reading beside a full
    // measure freezes the script at the cap and hands the rest to the reading:
    // two equal halves the same air apart. Width is the only thing it says —
    // the row holds both of its horizontals.
    expect(code.getAttribute('style'))
      .toBe('max-width: calc((100% - var(--gallery-gutter)) / 2); '
        + 'flex-grow: 0; flex-shrink: 1; flex-basis: 390px;');
    expect(code.firstElementChild?.getAttribute('data-favorites-script')).toBe('first-4');
  });

  it('shows the selected conversation and its last code version by default', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    const turns = [...container.querySelectorAll('[data-favorites-turn]')];

    // Both windows are named across the top, on one baseline: the reading takes
    // the standing title and the script takes the take it is showing.
    const titles = [...container.querySelectorAll('h2')].map((heading) => heading.textContent);
    expect(titles).toContain(t('favoritesConversation'));
    expect(titles.indexOf(t('favoritesConversation'))).toBe(0);
    // The reading holds nothing back from either end of what is left below the
    // title: the first message stands on the top of it and the last reply on
    // the foot, and both are cut off by the window rather than faded out.
    expect(container.querySelector('.conversation-scroll')?.className)
      .not.toMatch(/\bpy-/);
    expect(container.querySelector('.conversation-scroll-shell')?.className)
      .not.toContain('conversation-scroll-shell--inset');
    // Both windows clip what they hold, so both show a bar: neither can say
    // "this is not all of it" any other way. Neither waits for the pointer.
    expect(container.querySelectorAll('.scrollbar-on-hover')).toHaveLength(0);
    expect(shownScripts(container)[0]?.querySelector('.overflow-auto')?.className)
      .not.toContain('scrollbar-');
    expect(container.querySelector('.conversation-scroll')?.className)
      .not.toContain('scrollbar-hidden');
    // The reading reaches into the window's right-hand padding so its bar can
    // stand where the script's does — the two are on one vertical.
    expect(container.querySelector('.favorites-reading')).not.toBeNull();
    // The exchange is held in the same window as the code beside it, and both
    // are a Featured record's panel rather than a copy of one: the same class,
    // so the fill, the radius and the masked ring at the edge are stated once
    // and both pages turn together on paper. No border — the ring is inside
    // the padding box, where a window that clips its own body cannot lose it.
    const conversationPanel = container.querySelector<HTMLElement>('[data-testid="favorites-conversation-panel"]')!;
    const scriptPanel = shownScripts(container)[0]!;
    for (const panel of [conversationPanel, scriptPanel]) {
      expect(panel.className).toContain('featured-panel');
      expect(panel.className).toContain('bg-[#0D0D0D]/55');
      expect(panel.className).toContain('backdrop-blur-2xl');
      expect(panel.className).toContain('rounded-[10px]');
      expect(panel.className).not.toContain('border');
    }
    // Nothing is laid over either end of the reading — in particular none of
    // the studio's surface-coloured edge masks, which would be a claim about a
    // flat colour this window's glass does not have.
    expect(container.querySelectorAll('[data-conversation-edge-fade]').length).toBe(0);
    // The 构思过程 header does freeze at the top, the way the studio's does,
    // because a thought that has scrolled past its own control cannot be shut.
    // What it does not take is the studio's colours: `bg-conversation-surface`
    // is that stream's flat panel, and this band is the composite the glass
    // resolves to where it actually appears — see `.favorites-reasoning-sticky`.
    const archiveReasoning = container
      .querySelector<HTMLElement>('[data-reasoning-header="first-2-reasoning"]')!;
    expect(archiveReasoning.className).toContain('sticky');
    expect(archiveReasoning.className).toContain('favorites-reasoning-sticky');
    expect(archiveReasoning.className).not.toContain('bg-conversation-surface');
    expect(container.querySelector('.reasoning-header--expanded')).toBeNull();
    // The code window is glass over the light field, the same as the Featured
    // detail's panels — not a flat surface laid on it.
    expect(shownScripts(container)[0]?.className).toContain('bg-[#0D0D0D]/55');
    expect(shownScripts(container)[0]?.className).toContain('backdrop-blur-2xl');
    // Its scrollbars sit in the panel's own padding rather than beside it, so
    // the code's two ends and the two bars keep one rhythm — see
    // `.favorites-script-scroll`.
    expect(shownScripts(container)[0]?.querySelector('.favorites-script-scroll')).not.toBeNull();
    expect(turns.map((turn) => turn.textContent)).toEqual([
      turnText(CONVERSATIONS[0].turns[0]),
      `${turnText(CONVERSATIONS[0].turns[1])}${takeLabel(1)}·1 ${t('lines')}`,
      turnText(CONVERSATIONS[0].turns[2]),
      `${turnText(CONVERSATIONS[0].turns[3])}${takeLabel(2)}·1 ${t('lines')}`,
    ]);
    const reasoning = container.querySelector<HTMLButtonElement>('[data-reasoning-header="first-2-reasoning"]')!;
    expect(reasoning.textContent).toContain(t('favoritesReasoningTitle'));
    const process = container.querySelector<HTMLElement>('[data-archive-process="first-2-reasoning"]')!;
    expect(process.style.marginBlockEnd)
      .toBe('var(--spacing-action-divider-to-body)');
    expect(container.textContent).not.toContain('安排段落…');
    expect(container.textContent).not.toContain('准备播放…');
    // Folded until asked for: the archive is opened to read the conversation.
    expect(container.textContent).not.toContain('Checking rhythm, tone, and layering before arranging this revision.');
    act(() => reasoning.click());
    expect(process.textContent).toContain('Checking rhythm, tone, and layering before arranging this revision.');
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

  it('selects every take from the title menu and scrolls the reading to the end for final', () => {
    const favorite: FavoriteConversation = {
      ...CONVERSATIONS[0],
      id: 'with-final',
      code: 's("bd*4, hh*8, cp*2")',
    };
    const { container } = render(<FavoritesPage conversations={[favorite]} />);
    const versionSelect = () => container.querySelector<HTMLButtonElement>('[data-testid="favorites-version-select"]')!;
    const archive = container.querySelector<HTMLElement>('.conversation-scroll')!;
    Object.defineProperty(archive, 'scrollHeight', { configurable: true, value: 420 });

    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('with-final-final');
    expect(versionSelect().textContent).toContain(t('favoritesLatestScript'));

    act(() => versionSelect().click());
    expect(versionSelect().getAttribute('aria-expanded')).toBe('true');
    const versionRoot = versionSelect().parentElement;
    expect(versionRoot).not.toBeNull();
    const menu = versionRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    const selectedOption = menu.querySelector<HTMLElement>('[aria-selected="true"]')!;
    expect(menu.className).toContain('w-[126px]');
    expect(menu.className).toContain('bg-[#242424]/95');
    expect(menu.className).toContain('gap-1.5');
    expect(selectedOption.className).toContain('rounded-[5px]');
    expect(selectedOption.className).toContain('py-0.5');
    expect(selectedOption.className).toContain('bg-white/[0.16]');
    expect(selectedOption.className).not.toContain('text-[#f05a28]');
    expect(selectedOption.querySelector('[aria-hidden="true"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-version-option="first-2"]')!.click());

    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('first-2');
    expect(versionSelect().textContent).toContain(takeLabel(1));
    expect(versionSelect().getAttribute('aria-expanded')).toBe('false');

    archive.scrollTop = 0;
    act(() => versionSelect().click());
    act(() => container.querySelector<HTMLButtonElement>(
      '[data-favorites-version-option="with-final-final"]',
    )!.click());

    expect(shownScripts(container)[0]?.dataset.favoritesScript).toBe('with-final-final');
    expect(archive.scrollTop).toBe(420);
  });

  it('archives only the thinking that wrote code, and leaves it folded', () => {
    /* A real run's message stream, twice over: the agent thinks, writes, then
       thinks again — once to read the validator, once to decide it is done.
       Neither `validate` nor `commit` draws a progress line of its own, so
       those two thoughts are followed by no tool call at all, and the next
       thing that looks like one is the *following* reply's `setCode`. */
    const run: FavoriteConversation = {
      id: 'run',
      title: ['一次运行', 'One run'],
      favoritedAt: Date.parse('2026-08-22T10:00:00'),
      turns: [
        { id: 'run-1', role: 'user', text: ['来点鼓', 'Some drums'] },
        { id: 'run-2', role: 'assistant', text: ['铺好了底鼓', 'Kick is down'], code: 's("bd*4")' },
        { id: 'run-3', role: 'user', text: ['加个踩镲', 'Add hats'] },
        { id: 'run-4', role: 'assistant', text: ['踩镲进来了', 'Hats are in'], code: 's("bd*4, hh*8")' },
      ],
      messages: [
        { id: 'run-1', role: 'user', content: 'Some drums', timestamp: 1 },
        { id: 'run-think', role: 'progress', progressKind: 'reasoning', timestamp: 2, content: 'Four on the floor at 120, room to add hats later.' },
        { id: 'run-set', role: 'progress', progressKind: 'tool_call', toolName: 'setCode', timestamp: 3, content: '安排段落…' },
        { id: 'run-check', role: 'progress', progressKind: 'reasoning', timestamp: 4, content: '代码写完了，调用 validate 校验语法。' },
        { id: 'run-done', role: 'progress', progressKind: 'reasoning', timestamp: 5, content: '校验通过，commit 用检查点格式。' },
        { id: 'run-commit', role: 'progress', progressKind: 'commit', timestamp: 6, content: '准备播放…' },
        { id: 'run-2', role: 'assistant', content: 'Kick is down', code: 's("bd*4")', timestamp: 7 },
        { id: 'run-3', role: 'user', content: 'Add hats', timestamp: 8 },
        { id: 'run-think-2', role: 'progress', progressKind: 'reasoning', timestamp: 9, content: 'Eighth-note hats, quiet enough to sit under the kick.' },
        { id: 'run-set-2', role: 'progress', progressKind: 'tool_call', toolName: 'setCode', timestamp: 10, content: '安排段落…' },
        { id: 'run-commit-2', role: 'progress', progressKind: 'commit', timestamp: 11, content: '准备播放…' },
        { id: 'run-4', role: 'assistant', content: 'Hats are in', code: 's("bd*4, hh*8")', timestamp: 12 },
      ],
    };
    const { container } = render(<FavoritesPage conversations={[run]} />);
    const shownProcess = [...container.querySelectorAll<HTMLElement>('[data-archive-process]')];

    expect(shownProcess.map((entry) => entry.dataset.archiveProcess)).toEqual(['run-think', 'run-think-2']);
    expect(container.textContent).not.toContain('代码写完了，调用 validate 校验语法。');
    expect(container.textContent).not.toContain('校验通过，commit 用检查点格式。');
    // Folded, so even the composing thought is a line until it is asked for.
    expect(container.textContent).not.toContain('Four on the floor at 120, room to add hats later.');

    act(() => container.querySelector<HTMLButtonElement>('[data-reasoning-header="run-think"]')!.click());
    expect(shownProcess[0].textContent).toContain('Four on the floor at 120, room to add hats later.');
  });

  it('leaves a lone script unnumbered, in the window and on its widget', () => {
    const { container } = render(<FavoritesPage conversations={[CONVERSATIONS[1]]} />);
    const panel = shownScripts(container)[0]!;

    expect(panel.dataset.favoritesScript).toBe('second-2');
    // Nothing to pick between, so no picker — the name is a name, not a menu.
    expect(container.querySelector('[data-testid="favorites-version-select"]')).toBeNull();
    expect(panel.querySelector('h2')?.textContent).toBe(t('favoritesCodeTitle'));
    expect(container.querySelector('[data-favorites-chip="second-2"]')?.textContent)
      .toContain(t('favoritesCodeTitle'));
    // A V01 with nothing after it would promise a second version.
    expect(container.textContent).not.toContain(takeLabel(1));
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

  it('drops the code window and centres the reading when a favorite has no code', () => {
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
    act(() => container.querySelector<HTMLButtonElement>('[data-favorite-id="third"]')!.click());

    // No frame standing in for an absent script — the panel is simply not
    // drawn, and the conversation still is.
    expect(shownScripts(container)).toHaveLength(0);
    const reading = container.querySelector<HTMLElement>('[data-testid="favorites-conversation-panel"]')!;
    // The one case where the reading carries a width of its own: with no script
    // to hold its right edge, nothing else would stop it spanning the display.
    expect(reading.getAttribute('style')).toContain('max-width: 500px');
    // With nothing beside it the reading answers to the page's middle rather
    // than to the two verticals the spread is built from, and the page's
    // middle is the window's: its own left edge stands the nav column inside
    // the window's, so that much comes off the right.
    const windows = gallery(container)!;
    const pageLeftInset = `calc(${NAV_COLLAPSED_WIDTH}px + var(--spacing-region))`;
    expect(windows.className).toContain('justify-center');
    expect(windows.getAttribute('style')).toContain('left: 0');
    expect(windows.getAttribute('style')).toContain(`--favorites-page-inset: ${pageLeftInset}`);
    expect(windows.getAttribute('style')).toContain('right: var(--favorites-page-inset)');
    expect(windows.getAttribute('style')).not.toContain('--gallery-inset-left');
  });

  it('drops the reading and centres the code when a favorite is only a script', () => {
    /* The mirror of the case above: code typed straight in, on a session that
       never got past the app's own opening line. There is no exchange to read,
       so the script takes the page rather than standing beside a blank half. */
    const script: FavoriteConversation = {
      id: 'script-only',
      title: ['只有代码', 'Script only'],
      favoritedAt: Date.parse('2026-08-22T10:00:00'),
      turns: [],
      code: 'setcps(0.5)',
    };
    const { container } = render(<FavoritesPage conversations={[script]} />);
    const windows = gallery(container)!;

    expect(shownScripts(container)).toHaveLength(1);
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')).toBeNull();
    // The reading's own furniture goes with it — no turns for the rail to
    // index, so no rail.
    expect(rail(container)).toBeNull();
    expect(windows.getAttribute('style')).toContain('right: var(--favorites-page-inset)');
  });

  it('names a take the way its own widget in the conversation does', () => {
    /* The window and the widget are the same take named twice, and following
       one to the other is reading the same words. */
    const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);

    expect(shownScripts(container)[0]?.getAttribute('aria-label')).toBe(takeLabel(2));

    act(() => container.querySelector<HTMLButtonElement>('[data-favorites-chip="first-2"]')!.click());

    expect(shownScripts(container)[0]?.getAttribute('aria-label')).toBe(takeLabel(1));
  });

  it('offers the script itself three things, cut to the transport\u2019s pattern', () => {
    const onPlayCode = vi.fn();
    const onStopCode = vi.fn();
    const onOpenInStudio = vi.fn();
    const kept: FavoriteConversation = { ...CONVERSATIONS[0], sessionId: 'session-first' };
    const { container } = render(
      <FavoritesPage
        conversations={[kept]}
        onPlayCode={onPlayCode}
        onStopCode={onStopCode}
        onOpenInStudio={onOpenInStudio}
      />,
    );
    const action = (name: string) => (
      container.querySelector<HTMLButtonElement>(`[data-testid="favorites-script-${name}"]`)!
    );

    // Hear it, take it, or go and work on it — the studio transport's own grey,
    // and its own way of naming a mark only when the pointer is on it.
    expect(action('play').getAttribute('aria-label')).toBe(t('play'));
    expect(action('play').className).toContain('text-icon-idle');
    expect(action('play').className).toContain('hover:text-text-primary');
    // An outline, not the transport's filled triangle: this is one action of
    // three, not the one button a bar exists for.
    expect(action('play').querySelector('svg')?.getAttribute('fill')).toBe('none');
    expect(action('copy').getAttribute('aria-label')).toBe(t('copyCode'));
    expect(action('open-in-studio').getAttribute('aria-label')).toBe(t('openInStudio'));

    act(() => action('play').click());
    expect(onPlayCode).toHaveBeenCalledWith(CONVERSATIONS[0].turns[3].code);

    // The script and nothing else: the studio is handed code to carry on from,
    // not the conversation that wrote it.
    act(() => action('open-in-studio').click());
    expect(onOpenInStudio).toHaveBeenCalledWith('s("bd*4, hh*8")');
  });

  it('turns the script\u2019s play into a stop while that take is sounding', () => {
    const onStopCode = vi.fn();
    const { container } = render(
      <FavoritesPage
        conversations={CONVERSATIONS}
        isPlaying
        playingCode={CONVERSATIONS[0].turns[3].code}
        onStopCode={onStopCode}
      />,
    );
    const play = container.querySelector<HTMLButtonElement>('[data-testid="favorites-script-play"]')!;

    expect(play.getAttribute('aria-label')).toBe(t('stop'));

    act(() => play.click());

    expect(onStopCode).toHaveBeenCalledOnce();
  });

  it('can continue an immutable favorite even when its source session is gone', () => {
    const { container } = render(
      <FavoritesPage conversations={CONVERSATIONS} onOpenInStudio={vi.fn()} />,
    );

    expect(container.querySelector('[data-testid="favorites-script-open-in-studio"]')).not.toBeNull();
  });

  it('shows the script a conversation ended on when no reply carries one', () => {
    /* Code typed straight into the editor never passes through a reply, so
       the conversation holds no widget to hang a take off — but the favorite
       still kept a script, and the page has to show it. */
    const typed: FavoriteConversation = {
      id: 'typed',
      title: ['手写的', 'Typed by hand'],
      favoritedAt: Date.parse('2026-08-22T10:00:00'),
      turns: [
        { id: 'typed-1', role: 'user', text: ['随便聊聊', 'Just chatting'] },
        { id: 'typed-2', role: 'assistant', text: ['好', 'Sure'] },
      ],
      code: 'setcps(0.5)',
    };
    const { container } = render(<FavoritesPage conversations={[typed]} />);
    const shown = shownScripts(container);

    expect(shown).toHaveLength(1);
    // One take, under an id no message answers to: there is no widget in the
    // reading for the column to point back at.
    expect(shown[0]?.dataset.favoritesScript).toBe('typed-final');
    expect(shown[0]?.textContent).toContain('setcps(0.5)');
    // Named "code" rather than "take 1" — no reply asked for it, so it is not
    // the first of anything.
    expect(shown[0]?.getAttribute('aria-label')).toBe(t('favoritesLatestScript'));
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

  it('drops every window and holds one line in the middle with no favorites', () => {
    const { container } = render(<FavoritesPage conversations={[]} />);

    expect(container.querySelector('[data-testid="favorites-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="favorites-caption"]')).toBeNull();
    // Neither window is drawn empty: what a favorite looks like when opened is
    // not what the page should look like when there are none.
    expect(gallery(container)).toBeNull();
    expect(container.querySelector('[data-testid="favorites-conversation-panel"]')).toBeNull();
    expect(shownScripts(container)).toHaveLength(0);

    const empty = container.querySelector<HTMLElement>('[data-testid="favorites-empty"]')!;
    expect(empty.textContent).toBe(t('favoritesEmptyTitle'));
    // Set the way the studio sets its own opening line — same face, same
    // arrival out of a blur.
    const line = empty.querySelector<HTMLElement>('p')!;
    expect(line.className).toContain('animate-blur-fade-in');
    expect(line.className).toContain('text-text-greeting');
    expect(line.className.includes('font-jinghua-laosongti')).toBe(zh);
    expect(line.className.includes('font-eb-garamond')).toBe(!zh);
  });

  describe('narrowing the list', () => {
    it('keeps only the entries a query names, over both titles and what was said', () => {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      expect(listRows(container)).toHaveLength(3);

      // A title, typed in whichever case is easiest to type.
      changeInput(searchInput(container), conversationTitle(CONVERSATIONS[1]).toUpperCase());
      expect(listRows(container).map((row) => row.dataset.favoriteId)).toEqual(['second']);

      // And a phrase from inside a conversation, which no title carries.
      changeInput(searchInput(container), turnText(CONVERSATIONS[2].turns[0]));
      expect(listRows(container).map((row) => row.dataset.favoriteId)).toEqual(['third']);
    });

    it('says nothing matched rather than emptying the corner, and gives it back', () => {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      changeInput(searchInput(container), 'nothing in the collection says this');

      expect(listRows(container)).toHaveLength(0);
      expect(container.querySelector('[data-testid="favorites-search-empty"]')?.textContent)
        .toBe(t('favoritesSearchEmpty'));

      act(() => container.querySelector<HTMLButtonElement>(
        '[data-testid="favorites-search-clear"]',
      )!.click());

      expect(searchInput(container).value).toBe('');
      expect(listRows(container)).toHaveLength(3);
    });

    it('holds the open favorite on the page when the list is narrowed past it', () => {
      const { container } = render(<FavoritesPage conversations={CONVERSATIONS} />);
      changeInput(searchInput(container), conversationTitle(CONVERSATIONS[1]));

      // The column no longer lists what is open; the reading still shows it.
      expect(listRows(container).map((row) => row.dataset.favoriteId)).toEqual(['second']);
      expect(container.textContent).toContain(turnText(CONVERSATIONS[0].turns[0]));
    });
  });

  describe('letting a favorite go', () => {
    /* Only a favorite that is a real session can be let go of or deleted —
       a fixture has no session behind it to move or to remove. */
    const KEPT: FavoriteConversation[] = CONVERSATIONS.map((conversation) => ({
      ...conversation,
      sessionId: `session-${conversation.id}`,
    }));

    it('offers both moves beside the name, on the open favorite', () => {
      const onUnfavorite = vi.fn();
      const onDelete = vi.fn();
      const { container } = render(
        <FavoritesPage conversations={KEPT} onUnfavorite={onUnfavorite} onDelete={onDelete} />,
      );
      const caption = container.querySelector<HTMLElement>('[data-testid="favorites-caption"]')!;
      const unfavorite = caption.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]')!;
      const remove = caption.querySelector<HTMLButtonElement>('[data-favorites-delete]')!;

      // Past the name, at the caption's own right edge.
      expect(unfavorite.compareDocumentPosition(caption.querySelector('h2')!))
        .toBe(Node.DOCUMENT_POSITION_PRECEDING);
      // The star is filled: it says the conversation is kept, and pressing it
      // is what stops keeping it.
      expect(unfavorite.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');

      act(() => unfavorite.click());
      act(() => remove.click());

      expect(onUnfavorite).toHaveBeenCalledWith(KEPT[0]);
      expect(onDelete).toHaveBeenCalledWith(KEPT[0]);
    });

    it('still allows deleting a favorite whose source session is gone', () => {
      const { container } = render(
        <FavoritesPage conversations={CONVERSATIONS} onUnfavorite={vi.fn()} onDelete={vi.fn()} />,
      );
      const caption = container.querySelector<HTMLElement>('[data-testid="favorites-caption"]')!;

      expect(caption.querySelector('[data-favorites-unfavorite]')).toBeNull();
      expect(caption.querySelector('[data-favorites-delete]')).not.toBeNull();
    });

    it('opens on the favorite it was sent here to show, and yields to the list after', () => {
      const { container, root } = render(<FavoritesPage conversations={KEPT} />);
      const openName = () => (
        container.querySelector('[data-testid="favorites-caption"] h2')?.textContent
      );
      expect(openName()).toBe(conversationTitle(KEPT[0]));

      act(() => root.render(<FavoritesPage conversations={KEPT} focus={{ id: 'third' }} />));
      expect(openName()).toBe(conversationTitle(KEPT[2]));

      // The reader's own pick outranks the arrival that is already answered.
      act(() => listRows(container)[1].click());
      expect(openName()).toBe(conversationTitle(KEPT[1]));

      // Being sent here again is a second arrival, even to the same entry.
      act(() => root.render(<FavoritesPage conversations={KEPT} focus={{ id: 'third' }} />));
      expect(openName()).toBe(conversationTitle(KEPT[2]));
    });
  });
});
