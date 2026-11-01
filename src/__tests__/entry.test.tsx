// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Entry (main.tsx) routing and bootstrap contract. main.tsx executes its
 * side effects at import time, so every case re-imports it under fresh
 * module mocks. The App and LearnPage modules are mocked as plain default
 * components; persona initialisation and the appearance/editor preference
 * loaders are order-observing spies.
 */

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  initPersonaCache: vi.fn(async () => {
    mocks.order.push('persona');
  }),
  loadAppearancePreferences: vi.fn(() => {
    mocks.order.push('appearance');
  }),
  loadEditorPreferences: vi.fn(() => {
    mocks.order.push('editor');
  }),
  consumeBridgeHash: vi.fn(() => {
    mocks.order.push('bridge');
  }),
  initializeAnalytics: vi.fn(),
  App: vi.fn(() => {
    mocks.order.push('render-app');
    return <div data-testid="mock-app" />;
  }),
  LearnPage: vi.fn(() => <div data-testid="mock-learn" />),
}));

vi.mock('../lib/persona-storage', () => ({
  initPersonaCache: mocks.initPersonaCache,
}));
vi.mock('../lib/appearance-preferences', () => ({
  loadAppearancePreferences: mocks.loadAppearancePreferences,
}));
vi.mock('../lib/editor-preferences', () => ({
  loadEditorPreferences: mocks.loadEditorPreferences,
}));
vi.mock('../lib/oddenova-bridge', () => ({
  consumeOddeNovaBridgeBootstrapHash: mocks.consumeBridgeHash,
}));
vi.mock('../lib/analytics', () => ({
  initializeAnalytics: mocks.initializeAnalytics,
}));
// Lazy module graph behind App: its import must not reach the real components.
vi.mock('../App', () => ({ default: mocks.App }));
vi.mock('../learn/LearnPage', () => ({ default: mocks.LearnPage }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function importEntry(): Promise<void> {
  vi.resetModules();
  await import('../main');
  // Let the dynamic import chain settle inside act.
  await actFlush();
}

async function actFlush(): Promise<void> {
  const { act } = await import('react');
  for (let i = 0; i < 25; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    });
  }
}

describe('entry bootstrap', () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.initPersonaCache.mockClear().mockImplementation(async () => {
      mocks.order.push('persona');
    });
    mocks.App.mockClear();
    mocks.LearnPage.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('restores preferences before doing anything else, then mounts the app for the studio path', async () => {
    await importEntry();

    expect(mocks.order.slice(0, 3)).toEqual(['appearance', 'editor', 'bridge']);
    expect(mocks.order).toContain('persona');
    expect(document.querySelector('[data-testid="mock-app"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="mock-learn"]')).toBeNull();
    // The persona initialisation completed before the app rendered.
    expect(mocks.order.indexOf('persona')).toBeLessThan(mocks.order.indexOf('render-app'));
  });

  it('mounts the tutorial for the /learn path and skips persona initialisation', async () => {
    window.history.replaceState(null, '', '/learn/strings/first-lesson');
    await importEntry();

    expect(document.querySelector('[data-testid="mock-learn"]')).not.toBeNull();
    expect(mocks.initPersonaCache).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="mock-app"]')).toBeNull();
  });

  it('still renders the app when persona initialisation fails', async () => {
    mocks.initPersonaCache.mockRejectedValue(new Error('IndexedDB unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await importEntry();

    expect(document.querySelector('[data-testid="mock-app"]')).not.toBeNull();
    expect(document.querySelector('[data-entry-error]')).toBeNull();
    errorSpy.mockRestore();
  });

  it('shows the entry error view when the App chunk fails to load', async () => {
    vi.resetModules();
    vi.doMock('../App', () => {
      throw new Error('chunk 404 (stale deploy)');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../main');
    await actFlush();

    expect(document.querySelector('[data-entry-error]')).not.toBeNull();
    expect(document.querySelector('[data-entry-reload]')).not.toBeNull();
    expect(document.querySelector('[data-testid="mock-app"]')).toBeNull();
    errorSpy.mockRestore();
  });
});
