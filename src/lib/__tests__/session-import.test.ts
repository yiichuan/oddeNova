import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import {
  collectImportableGuestSessions,
  getNextImportPromptUserMarker,
  importGuestSessions,
} from '../session-import';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: 'Session',
    messages: [],
    code: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('collectImportableGuestSessions', () => {
  it('filters a fresh guest session that only contains its greeting', () => {
    const sessions = collectImportableGuestSessions([], [
      makeSession({
        id: 'fresh-session',
        messages: [{
          id: 'greeting-1',
          role: 'assistant',
          content: '今天想做什么音乐？',
          timestamp: 1,
          isGreeting: true,
        }],
      }),
    ]);

    expect(sessions).toEqual([]);
  });

  it('uses in-memory guest sessions when persisted guest history is empty', () => {
    const sessions = collectImportableGuestSessions([], [
      makeSession({
        id: 'memory-session',
        messages: [{ id: 'msg-1', role: 'user', content: 'local chat', timestamp: 1 }],
      }),
    ]);

    expect(sessions.map((session) => session.id)).toEqual(['memory-session']);
  });

  it('filters empty sessions and de-duplicates persisted and in-memory copies', () => {
    const persisted = makeSession({
      id: 'same-session',
      title: 'Persisted',
      code: 's("bd")',
      updatedAt: 2,
    });
    const memory = makeSession({
      id: 'same-session',
      title: 'Memory',
      messages: [{ id: 'msg-1', role: 'user', content: 'local chat', timestamp: 1 }],
      updatedAt: 3,
    });

    const sessions = collectImportableGuestSessions([persisted], [
      memory,
      makeSession({ id: 'empty-session' }),
    ]);

    expect(sessions).toEqual([persisted]);
  });
});

describe('getNextImportPromptUserMarker', () => {
  it('resets the checked user marker after sign out so the same account can import new guest history later', () => {
    expect(getNextImportPromptUserMarker(null, 'user-1')).toBe(null);
  });

  it('keeps the marker while the same user remains signed in', () => {
    expect(getNextImportPromptUserMarker('user-1', 'user-1')).toBe('user-1');
  });
});

describe('importGuestSessions', () => {
  it('removes every guest source only after its account import succeeds', async () => {
    const first = makeSession({ id: 'guest-1', code: 's("bd")' });
    const second = makeSession({ id: 'guest-2', code: 's("hh")' });
    const importSession = vi.fn(async () => undefined);
    const deleteGuestSession = vi.fn(async () => undefined);

    await expect(importGuestSessions([first, second], importSession, deleteGuestSession)).resolves.toEqual({
      remaining: [],
      error: null,
    });
    expect(deleteGuestSession).toHaveBeenNthCalledWith(1, 'guest-1');
    expect(deleteGuestSession).toHaveBeenNthCalledWith(2, 'guest-2');
  });

  it('stops after a failed import and leaves the failed and later guest sources for retry', async () => {
    const first = makeSession({ id: 'guest-1' });
    const failed = makeSession({ id: 'guest-2' });
    const later = makeSession({ id: 'guest-3' });
    const error = new Error('Cloud save failed');
    const importSession = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);
    const deleteGuestSession = vi.fn(async () => undefined);

    await expect(importGuestSessions([first, failed, later], importSession, deleteGuestSession)).resolves.toEqual({
      remaining: [failed, later],
      error,
    });
    expect(deleteGuestSession).toHaveBeenCalledTimes(1);
    expect(deleteGuestSession).toHaveBeenCalledWith('guest-1');
    expect(importSession).toHaveBeenCalledTimes(2);
  });
});
