// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import { GITHUB_URL, LEARN_URL } from '../../../lib/external-links';
import { REJOIN_MS, SPLIT_MS } from '../liquid-column';
import PrimaryNav, { NAV_COLLAPSED_WIDTH } from '../PrimaryNav';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = '';
});

function stubColumnBox(width = 60, height = 900) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

function renderPrimaryNav(selectedItem: React.ComponentProps<typeof PrimaryNav>['selectedItem'] = 'home') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSelect = vi.fn();
  roots.push(root);

  act(() => {
    root.render(<PrimaryNav selectedItem={selectedItem} onSelect={onSelect} />);
  });

  return { container, onSelect };
}

describe('PrimaryNav', () => {
  it('groups items in the requested top-to-bottom order', () => {
    const { container } = renderPrimaryNav();
    const lobes = [...container.querySelectorAll('.primary-nav-pod')];
    expect(lobes.map((lobe) => lobe.getAttribute('data-anchor'))).toEqual(['top', 'bottom']);
    // One glass body and one border, both clipped to the shared silhouette.
    expect(container.querySelectorAll('.primary-nav-glass')).toHaveLength(1);
    expect(container.querySelectorAll('.primary-nav-edge')).toHaveLength(1);
    const labelsIn = (testId: string) => [...container.querySelectorAll(`[data-testid="${testId}"] button`)]
      .map((button) => button.getAttribute('aria-label'));

    expect(labelsIn('primary-nav-top')).toEqual([t('navHome'), t('navFavorites'), t('navFeatured')]);
    expect(labelsIn('primary-nav-bottom')).toEqual([t('navMore'), t('navVinylLab'), t('navSettings'), t('navAccount')]);

  });

  it('marks the selected item and reports menu changes', () => {
    const { container, onSelect } = renderPrimaryNav('featured');
    const featured = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFeatured')}"]`);
    const settings = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navSettings')}"]`);

    expect(featured?.getAttribute('aria-current')).toBe('page');
    expect(settings).not.toBeNull();

    act(() => settings?.click());

    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('turns the brand mark into the Featured icon while the Featured navigation is active', () => {
    const { container } = renderPrimaryNav('featured');
    const mark = container.querySelector<HTMLElement>('[data-testid="primary-nav-section-mark"]');

    expect(mark?.className).toContain('[transform:rotateY(180deg)]');
    expect(mark?.className).not.toContain('group-hover:');
    expect(mark?.querySelector('svg')).not.toBeNull();
    expect(mark?.parentElement?.className).not.toContain('hover:bg-white/10');
  });

  it('turns the brand mark into the Favorites icon while Favorites is active', () => {
    const { container } = renderPrimaryNav('favorites');
    const mark = container.querySelector<HTMLElement>('[data-testid="primary-nav-section-mark"]');

    expect(mark?.className).toContain('[transform:rotateY(180deg)]');
    expect(mark?.className).not.toContain('group-hover:');
    expect(mark?.querySelector('svg')).not.toBeNull();
    expect(mark?.parentElement?.className).not.toContain('hover:bg-white/10');
  });

  it('keeps the regular brand mark on a workspace page', () => {
    const { container } = renderPrimaryNav('home');
    const mark = container.querySelector<HTMLElement>('[data-testid="primary-nav-section-mark"]');

    expect(mark?.className).not.toContain('[transform:rotateY(180deg)]');
    expect(mark?.className).toContain('group-hover:opacity-0');
    expect(mark?.querySelector('svg')).toBeNull();
    expect(mark?.parentElement?.className).toContain('hover:bg-white/10');
  });

  it('opens external links above More without selecting a primary destination', () => {
    const { container, onSelect } = renderPrimaryNav();
    const more = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navMore')}"]`);
    const menu = container.querySelector<HTMLElement>('[role="menu"]');

    expect(more?.getAttribute('aria-expanded')).toBe('false');

    act(() => more?.click());

    expect(more?.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.dataset.open).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();

    const vinylLab = menu?.querySelector<HTMLButtonElement>(`button[aria-label="${t('navVinylLab')}"]`);
    expect(vinylLab?.getAttribute('role')).toBe('menuitem');

    const learn = menu?.querySelector<HTMLAnchorElement>(`a[href="${LEARN_URL}"]`);
    const github = menu?.querySelector<HTMLAnchorElement>(`a[href="${GITHUB_URL}"]`);
    expect(learn?.getAttribute('aria-label')).toBe(t('navLearnStrudel'));
    expect(github?.querySelector('.primary-nav-github-logo')).not.toBeNull();
    expect(learn?.target).toBe('_blank');
    expect(github?.target).toBe('_blank');
    expect(learn?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(github?.getAttribute('rel')).toBe('noopener noreferrer');

    act(() => more?.click());
    expect(more?.getAttribute('aria-expanded')).toBe('false');
  });

  it('selects the Three.js vinyl lab from More', () => {
    const { container, onSelect } = renderPrimaryNav();
    const more = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navMore')}"]`);
    act(() => more?.click());
    const lab = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navVinylLab')}"]`);
    act(() => lab?.click());
    expect(onSelect).toHaveBeenCalledWith('vinylLab');
  });

  it('shows collapsed button labels directly to the right after a short hover delay', () => {
    vi.useFakeTimers();
    const { container } = renderPrimaryNav();
    const home = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navHome')}"]`);

    act(() => {
      home?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(249);
    });
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();

    act(() => vi.advanceTimersByTime(1));

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.textContent).toBe(t('navHome'));
    expect(tooltip?.parentElement?.style.left).toBe('12px');

    act(() => home?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('expands to reveal labels and collapses again', () => {
    const { container } = renderPrimaryNav();
    const navContainer = container.querySelector<HTMLElement>('[data-expanded]');
    const toggle = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('expandNavigation')}"]`);

    expect(navContainer?.dataset.expanded).toBe('false');
    expect(navContainer?.className).toContain('mr-region');
    // Through the constant, so the column and the pages that subtract it from
    // the page's left edge cannot drift apart unnoticed.
    expect(navContainer?.className).toContain(`w-[${NAV_COLLAPSED_WIDTH}px]`);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.className).toContain('w-[40px]');

    act(() => toggle?.click());

    const collapse = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('collapseNavigation')}"]`);
    expect(navContainer?.dataset.expanded).toBe('true');
    expect(navContainer?.className).toContain('w-[188px]');
    expect(collapse?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain(t('navFeatured'));

    act(() => collapse?.click());

    expect(navContainer?.dataset.expanded).toBe('false');
  });

  it('settles into two lobes on Featured, unfolding each on hover', () => {
    stubColumnBox();
    const { container } = renderPrimaryNav('featured');
    const shell = container.querySelector<HTMLElement>('[data-nav-shape]');
    const top = container.querySelector<HTMLElement>('[data-testid="primary-nav-pod-top"]');
    const bottom = container.querySelector<HTMLElement>('[data-testid="primary-nav-pod-bottom"]');
    const mark = container.querySelector<HTMLElement>('[data-testid="primary-nav-section-mark"]');
    const face = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('expandNavPages')}"]`);

    // Selecting Featured before mount lands on the settled shape directly, each
    // lobe wrapped around its own icon rather than squared off to a shared size.
    expect(shell?.dataset.navShape).toBe('pods');
    expect(top?.style.height).toBe('54px');
    expect(bottom?.style.height).toBe('64px');
    expect(face?.getAttribute('aria-expanded')).toBe('false');

    const home = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navHome')}"]`);
    const settings = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navSettings')}"]`);
    const account = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navAccount')}"]`);
    expect(home?.className).toContain('opacity-0');
    expect(settings?.className).toContain('opacity-0');
    expect(account?.className).not.toContain('opacity-0');

    act(() => top?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(face?.getAttribute('aria-expanded')).toBe('true');
    expect(mark?.className).toContain('[transform:rotateY(0deg)]');
    expect(home?.className).toContain('opacity-100');
    expect(settings?.className).toContain('opacity-0');

    act(() => {
      top?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      bottom?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(face?.getAttribute('aria-expanded')).toBe('false');
    expect(mark?.className).toContain('[transform:rotateY(180deg)]');
    expect(home?.className).toContain('opacity-0');
    expect(settings?.className).toContain('opacity-100');
  });

  it('settles into the same two lobes on Favorites', () => {
    stubColumnBox();
    const { container } = renderPrimaryNav('favorites');
    const shell = container.querySelector<HTMLElement>('[data-nav-shape]');
    const top = container.querySelector<HTMLElement>('[data-testid="primary-nav-pod-top"]');
    const bottom = container.querySelector<HTMLElement>('[data-testid="primary-nav-pod-bottom"]');

    expect(shell?.dataset.navShape).toBe('pods');
    expect(top?.style.height).toBe('54px');
    expect(bottom?.style.height).toBe('64px');
    expect(container.querySelector(`button[aria-label="${t('expandNavPages')}"]`)).not.toBeNull();
  });

  it('keeps the navigation joined on a workspace page', () => {
    stubColumnBox();
    const { container } = renderPrimaryNav('home');
    const shell = container.querySelector<HTMLElement>('[data-nav-shape]');
    const top = container.querySelector<HTMLElement>('[data-testid="primary-nav-pod-top"]');
    const bottom = container.querySelector<HTMLElement>('[data-testid="primary-nav-pod-bottom"]');

    expect(shell?.dataset.navShape).toBe('bar');
    expect(top?.style.height).toBe('450px');
    expect(bottom?.style.height).toBe('450px');
    expect(container.querySelector(`button[aria-label="${t('expandNavigation')}"]`)).not.toBeNull();
  });

  it('clips one body while the strand holds, and two once it snaps', () => {
    stubColumnBox();
    const { container } = renderPrimaryNav();
    const glass = container.querySelector<HTMLElement>('.primary-nav-glass');
    const edge = container.querySelector<HTMLElement>('.primary-nav-edge');
    const subpaths = (element: HTMLElement | null) => (element?.style.clipPath.split('M').length ?? 1) - 1;

    // Joined: a single closed outline, and a border ring drawn from two of them.
    expect(glass?.style.clipPath).toMatch(/^path\("M/);
    expect(subpaths(glass)).toBe(1);
    expect(edge?.style.clipPath).toContain('evenodd');
    expect(subpaths(edge)).toBe(2);

    const { container: split } = renderPrimaryNav('featured');
    const splitGlass = split.querySelector<HTMLElement>('.primary-nav-glass');
    expect(subpaths(splitGlass)).toBe(2);
    expect(subpaths(split.querySelector<HTMLElement>('.primary-nav-edge'))).toBe(4);
  });

  it('stays mid-transition until the liquid has finished moving', () => {
    vi.useFakeTimers();
    const { container, onSelect } = renderPrimaryNav();
    const shell = container.querySelector<HTMLElement>('[data-nav-shape]');
    const root = roots[roots.length - 1];

    expect(shell?.dataset.navShape).toBe('bar');

    const featured = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFeatured')}"]`);
    act(() => featured?.click());
    expect(onSelect).toHaveBeenCalledWith('featured');

    // App owns the selection, so replay it the way the real parent would.
    act(() => root.render(<PrimaryNav selectedItem="featured" onSelect={onSelect} />));
    expect(shell?.dataset.navShape).toBe('breaking');

    act(() => vi.advanceTimersByTime(SPLIT_MS - 1));
    expect(shell?.dataset.navShape).toBe('breaking');
    act(() => vi.advanceTimersByTime(1));
    expect(shell?.dataset.navShape).toBe('pods');

    act(() => root.render(<PrimaryNav selectedItem="home" onSelect={onSelect} />));
    expect(shell?.dataset.navShape).toBe('breaking');

    /* Rejoining is measured from wherever the lobes actually stand, which the
       frame loop owns — so only its outer bound is knowable here. */
    act(() => vi.advanceTimersByTime(REJOIN_MS));
    expect(shell?.dataset.navShape).toBe('bar');
  });

  it('re-forms the column for a piece opened out of the collection', () => {
    vi.useFakeTimers();
    const { container, onSelect } = renderPrimaryNav('featured');
    const shell = container.querySelector<HTMLElement>('[data-nav-shape]');
    const nav = container.querySelector<HTMLElement>('[data-expanded]');
    const root = roots[roots.length - 1];

    expect(shell?.dataset.navShape).toBe('pods');

    /* Opening a piece is not a change of page, but the column belongs to the
       shelf rather than to the record — so it flows back together on the same
       transition that leaving Featured altogether would run. */
    act(() => root.render(
      <PrimaryNav selectedItem="featured" onSelect={onSelect} featuredPieceOpen />,
    ));
    expect(nav?.dataset.featuredDetail).toBe('true');
    expect(shell?.dataset.navShape).toBe('breaking');
    expect(container.querySelector<HTMLElement>('[data-testid="primary-nav-section-mark"]')?.className)
      .not.toContain('[transform:rotateY(180deg)]');
    act(() => vi.advanceTimersByTime(REJOIN_MS));
    expect(shell?.dataset.navShape).toBe('bar');

    act(() => root.render(<PrimaryNav selectedItem="featured" onSelect={onSelect} />));
    expect(shell?.dataset.navShape).toBe('breaking');
    act(() => vi.advanceTimersByTime(SPLIT_MS));
    expect(shell?.dataset.navShape).toBe('pods');
  });
});
