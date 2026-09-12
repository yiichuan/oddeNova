// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBrowserChromeColor } from '../useBrowserChromeColor';
import { BROWSER_CHROME_CSS_VAR } from '../../lib/browser-chrome-color';
import { setThemePreference } from '../../lib/appearance-preferences';
import type { BrowserChromePage } from '../../lib/browser-chrome-color';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

function Probe({ page }: { page: BrowserChromePage }) {
  useBrowserChromeColor(page);
  return null;
}

function render(page: BrowserChromePage) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<Probe page={page} />));
  return root;
}

const meta = () => document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const cssVar = () => document.documentElement.style.getPropertyValue(BROWSER_CHROME_CSS_VAR);

describe('useBrowserChromeColor', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const el = document.createElement('meta');
    el.name = 'theme-color';
    document.head.append(el);
    delete document.documentElement.dataset.theme;
    setThemePreference('dark');
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('paints the page it is given, in the theme currently active', () => {
    render('featured');
    expect(meta()?.content).toBe('#05070a');
    expect(cssVar()).toBe('#05070a');
  });

  it('repaints when the declared page changes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<Probe page="studio" />));
    expect(meta()?.content).toBe('#0D0D0D');

    act(() => root.render(<Probe page="featured" />));
    expect(meta()?.content).toBe('#05070a');
  });

  it('repaints on a theme flip without the declared page changing', () => {
    render('featured');
    expect(meta()?.content).toBe('#05070a');

    act(() => { setThemePreference('light'); });
    expect(meta()?.content).toBe('#DEDEE0');
  });
});
