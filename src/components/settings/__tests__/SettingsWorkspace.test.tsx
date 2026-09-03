// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import {
  getAnimationPreference,
  getStudioAnimationVisible,
  getThemePreference,
  setAnimationPreference,
  setThemePreference,
} from '../../../lib/appearance-preferences';
import AppearanceSettingsPanel from '../AppearanceSettingsPanel';
import SettingsSidebar from '../SettingsSidebar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function studioAnimationSwitch(container: HTMLElement) {
  return container.querySelector<HTMLButtonElement>('[role="switch"]')!;
}

function radios(container: HTMLElement, groupLabel: string) {
  const group = container.querySelector(`[role="radiogroup"][aria-label="${groupLabel}"]`)!;
  return Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

describe('settings workspace', () => {
  const roots: Root[] = [];

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('lists the settings sections under the 设置 title with their current values', () => {
    const onSelect = vi.fn();
    const { container, root } = render(
      <SettingsSidebar
        hints={{ model: 'DeepSeek', appearance: '深色 · Galaxy' }}
        onSelect={onSelect}
        selectedSection="model"
      />,
    );
    roots.push(root);

    const entries = container.querySelectorAll('nav button');
    expect(container.querySelector('h2')?.textContent).toBe(t('navSettings'));
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain(t('settingsModel'));
    expect(entries[0].getAttribute('aria-current')).toBe('page');
    expect(entries[1].textContent).toContain(t('settingsAppearance'));
    expect(container.textContent).toContain('深色 · Galaxy');

    act(() => (entries[1] as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith('appearance');
  });

  it('offers three previewed themes including the shipped light palette', () => {
    const { container, root } = render(<AppearanceSettingsPanel />);
    roots.push(root);

    const options = radios(container, t('theme'));
    expect(options).toHaveLength(3);
    expect(options.every((option) => option.querySelector('svg[role="presentation"]'))).toBe(true);
    expect(options[0].getAttribute('aria-checked')).toBe('true'); // system, the default
    expect(options[2].disabled).toBe(false);
    expect(options[2].textContent).not.toContain(t('comingSoon'));
  });

  it('stores the theme choice and marks it selected', () => {
    const { container, root } = render(<AppearanceSettingsPanel />);
    roots.push(root);

    act(() => radios(container, t('theme'))[1].click());

    expect(getThemePreference()).toBe('dark');
    expect(radios(container, t('theme'))[1].getAttribute('aria-checked')).toBe('true');
  });

  it('offers both previewed animations and stores the choice', () => {
    // Both cards are a dark-palette pair; the light half offers one, below.
    setThemePreference('dark');

    const { container, root } = render(<AppearanceSettingsPanel />);
    roots.push(root);

    const options = radios(container, t('animation'));
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain(t('animationGalaxy'));
    expect(options[1].getAttribute('aria-checked')).toBe('true'); // galaxy-ascii, the default

    act(() => options[0].click());

    expect(getAnimationPreference()).toBe('galaxy');
    expect(radios(container, t('animation'))[0].getAttribute('aria-checked')).toBe('true');
  });

  it('drops the particle galaxy from the list under the light palette', () => {
    // The galaxy is emissive and has no light half, so light offers the ASCII
    // field alone — and a galaxy stored from the dark half reads back as it.
    setAnimationPreference('galaxy');
    setThemePreference('light');

    const { container, root } = render(<AppearanceSettingsPanel />);
    roots.push(root);

    const options = radios(container, t('animation'));
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain(t('animationGalaxyAscii'));
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    // Nothing was written on the way through: back in the dark, it is a galaxy.
    expect(getAnimationPreference()).toBe('galaxy');
  });

  it('switches the studio animation off and dims the animation choices', () => {
    const { container, root } = render(<AppearanceSettingsPanel />);
    roots.push(root);

    const toggle = studioAnimationSwitch(container);
    expect(toggle.getAttribute('aria-label')).toBe(t('studioAnimationVisible'));
    expect(toggle.getAttribute('aria-checked')).toBe('true'); // shown by default
    expect(radios(container, t('animation')).some((option) => option.disabled)).toBe(false);

    act(() => toggle.click());

    expect(getStudioAnimationVisible()).toBe(false);
    expect(studioAnimationSwitch(container).getAttribute('aria-checked')).toBe('false');
    expect(radios(container, t('animation')).every((option) => option.disabled)).toBe(true);

    // Turning it back on keeps the animation the user had picked.
    act(() => studioAnimationSwitch(container).click());
    expect(getStudioAnimationVisible()).toBe(true);
    expect(getAnimationPreference()).toBe('galaxy-ascii');
    expect(radios(container, t('animation')).some((option) => option.disabled)).toBe(false);
  });
});
