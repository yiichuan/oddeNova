// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../lib/i18n';
import { GITHUB_URL, LEARN_URL } from '../../lib/external-links';
import PrimaryNav from '../PrimaryNav';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = '';
});

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
    expect(container.querySelector('nav')?.className).toContain('primary-nav-surface');
    expect(container.querySelector('nav')?.className).toContain('primary-nav-outline');
    const labelsIn = (testId: string) => [...container.querySelectorAll(`[data-testid="${testId}"] button`)]
      .map((button) => button.getAttribute('aria-label'));

    expect(labelsIn('primary-nav-top')).toEqual([t('navHome'), t('navFeatured')]);
    expect(labelsIn('primary-nav-bottom')).toEqual([t('navMore'), t('navSettings'), t('navAccount')]);
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

  it('opens external links above More without selecting a primary destination', () => {
    const { container, onSelect } = renderPrimaryNav();
    const more = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navMore')}"]`);
    const menu = container.querySelector<HTMLElement>('[role="menu"]');

    expect(more?.getAttribute('aria-expanded')).toBe('false');

    act(() => more?.click());

    expect(more?.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.dataset.open).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();

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
    expect(tooltip?.parentElement?.style.left).toBe('8px');

    act(() => home?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('expands to reveal labels and collapses again', () => {
    const { container } = renderPrimaryNav();
    const navContainer = container.querySelector<HTMLElement>('[data-expanded]');
    const toggle = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('expandNavigation')}"]`);

    expect(navContainer?.dataset.expanded).toBe('false');
    expect(navContainer?.className).toContain('mr-region');
    expect(navContainer?.className).toContain('w-[48px]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.className).toContain('w-[34px]');

    act(() => toggle?.click());

    const collapse = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('collapseNavigation')}"]`);
    expect(navContainer?.dataset.expanded).toBe('true');
    expect(navContainer?.className).toContain('w-[188px]');
    expect(collapse?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain(t('navFeatured'));

    act(() => collapse?.click());

    expect(navContainer?.dataset.expanded).toBe('false');
  });
});
