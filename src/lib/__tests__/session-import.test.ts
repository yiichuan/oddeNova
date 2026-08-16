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
  const importGuestSessionsWithNormalization = importGuestSessions as unknown as (
    items: Session[],
    importSession: (session: Session) => Promise<void>,
    deleteGuestSession: (id: string) => Promise<void>,
    normalizeGuestSession: (session: Session) => Promise<Session>,
  ) => Promise<{ remaining: Session[]; error: unknown | null }>;

  it('removes every guest source only after its account import succeeds', async () => {
    const first = makeSession({ id: 'guest-1', code: 's("bd")' });
    const second = makeSession({ id: 'guest-2', code: 's("hh")' });
    const importSession = vi.fn(async () => undefined);
    const deleteGuestSession = vi.fn(async () => undefined);

    await expect(importGuestSessions([first, second], importSession, deleteGuestSession)).resolves.toEqual({
      remaining: [],
      error: null,
    });
    expect(deleteGuestSession).toHaveBeenNthCalledWith(1, expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ));
    expect(deleteGuestSession).toHaveBeenNthCalledWith(2, expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ));
  });

  it('carries code revisions over so imported turns keep their diffs', async () => {
    const revision = {
      id: 'rev-1',
      beforeCode: '',
      afterCode: 's("bd")',
      playbackStatus: 'played' as const,
      createdAt: 1,
    };
    const guest = makeSession({
      id: 'guest-1',
      code: 's("bd")',
      messages: [{ id: 'm-1', role: 'assistant', content: '好了', code: 's("bd")', revisionId: 'rev-1', timestamp: 1 }],
      revisions: [revision],
    });
    const importSession = vi.fn(async () => undefined);
    const deleteGuestSession = vi.fn(async () => undefined);

    await importGuestSessions([guest], importSession, deleteGuestSession);

    expect(importSession).toHaveBeenCalledWith(expect.objectContaining({
      revisions: [revision],
    }));
  });

  it('imports the normalized UUID with every durable session field intact', async () => {
    const normalized = makeSession({
      id: '00000000-0000-4000-8000-000000000001',
      title: '完整会话',
      code: 's("bd")',
      messages: [{ id: 'm-1', role: 'assistant', content: '完成', timestamp: 11, inputMode: 'choice' }],
      revisions: [{ id: 'r-1', beforeCode: '', afterCode: 's("bd")', playbackStatus: 'played', createdAt: 12 }],
      inputMode: 'choice',
      suggestions: { forCode: 's("bd")', items: ['加贝斯'] },
      externalSource: { type: 'oddenova-strudel-skill', projectId: 'p-1', importedContentHash: 'h-1' },
      createdAt: 13,
      updatedAt: 14,
    });
    const normalizeGuestSession = vi.fn(async () => normalized);
    const importSession = vi.fn(async () => undefined);
    const deleteGuestSession = vi.fn(async () => undefined);

    await importGuestSessionsWithNormalization([makeSession({ id: 's-legacy' })], importSession, deleteGuestSession, normalizeGuestSession);

    expect(importSession).toHaveBeenCalledWith(normalized);
    expect(deleteGuestSession).toHaveBeenCalledWith(normalized.id);
  });

  it('reuses the normalized UUID after a cloud failure without deleting its source', async () => {
    const normalized = makeSession({
      id: '00000000-0000-4000-8000-000000000002',
      code: 's("bd")',
    });
    const error = new Error('Cloud save failed');
    const normalizeGuestSession = vi.fn(async (session: Session) =>
      session.id === normalized.id ? session : normalized,
    );
    const importSession = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const deleteGuestSession = vi.fn(async () => undefined);
    const first = await importGuestSessionsWithNormalization(
      [makeSession({ id: 's-legacy', code: 's("bd")' })],
      importSession,
      deleteGuestSession,
      normalizeGuestSession,
    );

    expect(first.remaining).toEqual([normalized]);
    expect(deleteGuestSession).not.toHaveBeenCalled();

    await expect(importGuestSessionsWithNormalization(first.remaining, importSession, deleteGuestSession, normalizeGuestSession))
      .resolves.toEqual({ remaining: [], error: null });
    expect(importSession).toHaveBeenNthCalledWith(1, normalized);
    expect(importSession).toHaveBeenNthCalledWith(2, normalized);
    expect(deleteGuestSession).toHaveBeenCalledTimes(1);
    expect(deleteGuestSession).toHaveBeenCalledWith(normalized.id);
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

    const result = await importGuestSessions([first, failed, later], importSession, deleteGuestSession);
    expect(result.error).toBe(error);
    expect(result.remaining).toHaveLength(2);
    expect(result.remaining[0]).toEqual(expect.objectContaining({ code: failed.code }));
    expect(result.remaining[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.remaining[1]).toEqual(later);
    expect(deleteGuestSession).toHaveBeenCalledTimes(1);
    expect(deleteGuestSession).toHaveBeenCalledWith(expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ));
    expect(importSession).toHaveBeenCalledTimes(2);
  });
});
