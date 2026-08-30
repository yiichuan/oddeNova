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
    })).toBe(true);
  });

  it('stays closed once it has been seen', () => {
    expect(shouldAutoOpenWelcomeModal({
      isTopWindow: true,
      hasSeenWelcome: true,
    })).toBe(false);
  });

  it('stays closed inside an iframe', () => {
    expect(shouldAutoOpenWelcomeModal({
      isTopWindow: false,
      hasSeenWelcome: false,
    })).toBe(false);
  });

  it('records the welcome as seen in local storage', () => {
    const storage = makeStorage();

    expect(hasSeenWelcome(storage)).toBe(false);
    markWelcomeSeen(storage);

    expect(storage.setItem).toHaveBeenCalledWith(WELCOME_SEEN_KEY, '1');
    expect(hasSeenWelcome(storage)).toBe(true);
  });
});
