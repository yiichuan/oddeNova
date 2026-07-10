import { describe, expect, it } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { collectImportableGuestSessions, getNextImportPromptUserMarker } from '../session-import';

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
