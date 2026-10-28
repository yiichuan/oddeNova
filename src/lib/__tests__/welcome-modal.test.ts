import { describe, expect, it, vi } from 'vitest';
import {
  WELCOME_SEEN_KEY,
  hasSeenWelcome,
  markWelcomeSeen,
  shouldAutoOpenWelcomeModal,
} from '../welcome-modal';

function makeStorage(initial?: Record<string, string>): Storage {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    get length() { return store.size; },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
  };
}

describe('first-entry welcome modal state', () => {
  it('opens on a first visit', () => {
    expect(shouldAutoOpenWelcomeModal({
      isTopWindow: true,
      hasSeenWelcome: false,
      pathname: '/',
    })).toBe(true);
  });

  it('stays closed once it has been seen', () => {
    expect(shouldAutoOpenWelcomeModal({
      isTopWindow: true,
      hasSeenWelcome: true,
      pathname: '/',
    })).toBe(false);
  });

  it('stays closed inside an iframe', () => {
    expect(shouldAutoOpenWelcomeModal({
      isTopWindow: false,
      hasSeenWelcome: false,
      pathname: '/',
    })).toBe(false);
  });

  it.each([
    'https://oddenova.com/s/share123',
    'https://oddenova.com/s/share123?source=qr',
    'https://oddenova.com/s/share123#music',
  ])('stays closed on a first share visit: %s', (url) => {
    expect(shouldAutoOpenWelcomeModal({
      isTopWindow: true,
      hasSeenWelcome: false,
      pathname: new URL(url).pathname,
    })).toBe(false);
  });

  it.each(['/s/', '/s/share123/extra', '/settings'])(
    'preserves the first-visit welcome outside share routes: %s',
    (pathname) => {
      expect(shouldAutoOpenWelcomeModal({
        isTopWindow: true,
        hasSeenWelcome: false,
        pathname,
      })).toBe(true);
    },
  );

  it('records the welcome as seen in local storage', () => {
    const storage = makeStorage();

    expect(hasSeenWelcome(storage)).toBe(false);
    markWelcomeSeen(storage);

    expect(storage.setItem).toHaveBeenCalledWith(WELCOME_SEEN_KEY, '1');
    expect(hasSeenWelcome(storage)).toBe(true);
  });
});
