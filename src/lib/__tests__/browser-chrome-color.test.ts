// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyBrowserChromeColor,
  browserChromeColor,
  BROWSER_CHROME_COLORS,
  BROWSER_CHROME_CSS_VAR,
} from '../browser-chrome-color';

describe('browser-chrome-color', () => {
  beforeEach(() => {
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    document.head.append(meta);
    document.documentElement.style.removeProperty(BROWSER_CHROME_CSS_VAR);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty(BROWSER_CHROME_CSS_VAR);
  });

  it('holds exactly the two buckets the layout has, one colour per theme', () => {
    expect(BROWSER_CHROME_COLORS).toEqual({
      studio: { dark: '#0D0D0D', light: '#F7F7FA' },
      featured: { dark: '#05070a', light: '#DEDEE0' },
    });
  });

  it('looks a colour up without touching the document', () => {
    expect(browserChromeColor('studio', 'dark')).toBe('#0D0D0D');
    expect(browserChromeColor('featured', 'light')).toBe('#DEDEE0');
  });

  it('writes both surfaces that read it — the meta tag and the CSS variable', () => {
    applyBrowserChromeColor('featured', 'dark');

    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#05070a');
    expect(document.documentElement.style.getPropertyValue(BROWSER_CHROME_CSS_VAR)).toBe('#05070a');
  });

  it('repaints both on the next call rather than only the one that changed', () => {
    applyBrowserChromeColor('studio', 'dark');
    applyBrowserChromeColor('featured', 'light');

    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#DEDEE0');
    expect(document.documentElement.style.getPropertyValue(BROWSER_CHROME_CSS_VAR)).toBe('#DEDEE0');
  });

  it('does nothing where there is no document to write to', () => {
    const original = globalThis.document;
    // @ts-expect-error -- simulating an environment with no document
    delete globalThis.document;
    try {
      expect(() => applyBrowserChromeColor('studio', 'dark')).not.toThrow();
    } finally {
      globalThis.document = original;
    }
  });
});
