import { describe, expect, it, vi } from 'vitest';
import {
  COMMUNITY_INVITE_SEEN_KEY,
  hasSeenCommunityInvite,
  markCommunityInviteSeen,
  shouldAutoOpenApiKeyModal,
} from '../community-invite';

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

describe('community invite first-entry modal state', () => {
  it('opens the settings modal when no API key is configured', () => {
    expect(shouldAutoOpenApiKeyModal({
      isTopWindow: true,
      hasApiKeyConfigured: false,
      hasSeenCommunityInvite: true,
    })).toBe(true);
  });

  it('opens once for configured users who have not seen the community invite', () => {
    expect(shouldAutoOpenApiKeyModal({
      isTopWindow: true,
      hasApiKeyConfigured: true,
      hasSeenCommunityInvite: false,
    })).toBe(true);
  });

  it('stays closed for configured users who have already seen the community invite', () => {
    expect(shouldAutoOpenApiKeyModal({
      isTopWindow: true,
      hasApiKeyConfigured: true,
      hasSeenCommunityInvite: true,
    })).toBe(false);
  });

  it('stays closed inside an iframe', () => {
    expect(shouldAutoOpenApiKeyModal({
      isTopWindow: false,
      hasApiKeyConfigured: false,
      hasSeenCommunityInvite: false,
    })).toBe(false);
  });

  it('records the invite as seen in local storage', () => {
    const storage = makeStorage();

    expect(hasSeenCommunityInvite(storage)).toBe(false);
    markCommunityInviteSeen(storage);

    expect(storage.setItem).toHaveBeenCalledWith(COMMUNITY_INVITE_SEEN_KEY, '1');
    expect(hasSeenCommunityInvite(storage)).toBe(true);
  });
});
