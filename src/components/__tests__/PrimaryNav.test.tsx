// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../lib/i18n';
import PrimaryNav from '../PrimaryNav';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
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
    expect(container.querySelector('nav')?.className).toContain('surface-glow');
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

  it('expands to reveal labels and collapses again', () => {
    const { container } = renderPrimaryNav();
    const navContainer = container.querySelector<HTMLElement>('[data-expanded]');
    const toggle = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('expandNavigation')}"]`);

    expect(navContainer?.dataset.expanded).toBe('false');
    expect(navContainer?.className).toContain('mr-region');
    expect(navContainer?.className).toContain('w-[48px]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

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
