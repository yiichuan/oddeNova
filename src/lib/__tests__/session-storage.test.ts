// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb';

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  });
}

function stubIndexedDB() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBCursor', IDBCursor);
  vi.stubGlobal('IDBCursorWithValue', IDBCursorWithValue);
  vi.stubGlobal('IDBDatabase', IDBDatabase);
  vi.stubGlobal('IDBFactory', IDBFactory);
  vi.stubGlobal('IDBIndex', IDBIndex);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('IDBObjectStore', IDBObjectStore);
  vi.stubGlobal('IDBOpenDBRequest', IDBOpenDBRequest);
  vi.stubGlobal('IDBRequest', IDBRequest);
  vi.stubGlobal('IDBTransaction', IDBTransaction);
  vi.stubGlobal('IDBVersionChangeEvent', IDBVersionChangeEvent);
}

const fakeSession = {
  id: 'test-id',
  title: 'Test',
  messages: [],
  code: '',
  createdAt: 0,
  updatedAt: 0,
};

describe('session-storage fallback path', () => {
  // IndexedDB does not exist in the Node environment; openDB() triggers the fallback,
  // after which all write operations are silently ignored and read operations return an empty array.

  beforeEach(async () => {
    // Re-import on each test to ensure a clean module state
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('idb');
    vi.unstubAllGlobals();
  });

  it('openDB 在 Node 环境下不抛错（触发 fallback）', async () => {
    const { openDB } = await import('../session-storage');
    await expect(openDB()).resolves.toBeUndefined();
  });

  it('openDB 后 getAllSessions 返回空数组', async () => {
    const { openDB, getAllSessions } = await import('../session-storage');
    await openDB();
    const sessions = await getAllSessions();
    expect(sessions).toEqual([]);
  });

  it('openDB falls back to non-persistent storage when IndexedDB is unavailable', async () => {
    const { openDB, isSessionStoragePersistent } = await import('../session-storage');
    await openDB();
    expect(isSessionStoragePersistent()).toBe(false);
  });

  it('putSession 在 fallback 模式下静默忽略不抛错', async () => {
    const { openDB, putSession } = await import('../session-storage');
    await openDB();
    await expect(putSession(fakeSession as Parameters<typeof putSession>[0])).resolves.toBeUndefined();
  });

  it('allows imported sessions in memory fallback without treating it as a write failure', async () => {
    const { openDB, putImportedSession } = await import('../session-storage');
    await openDB();
    await expect(putImportedSession(fakeSession)).resolves.toBeUndefined();
  });

  it('allows conflict branches in memory fallback without treating them as write failures', async () => {
    const { openDB, putImportedSessionBranch } = await import('../session-storage');
    await openDB();
    await expect(putImportedSessionBranch(
      { ...fakeSession, id: 'detached' },
      { ...fakeSession, id: 'branch' },
    )).resolves.toBeUndefined();
  });

  it('deleteSession 在 fallback 模式下静默忽略不抛错', async () => {
    const { openDB, deleteSession } = await import('../session-storage');
    await openDB();
    await expect(deleteSession('nonexistent-id')).resolves.toBeUndefined();
  });
});

describe('session-storage owner namespaces', () => {
  beforeEach(async () => {
    vi.resetModules();
    stubIndexedDB();
    stubLocalStorage();
  });

  function createLegacySessionStore(session: {
    id: string;
    title: string;
    messages: { id: string; role: 'user'; content: string; timestamp: number }[];
    code: string;
    createdAt: number;
    updatedAt: number;
  }) {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('oddenova-db', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('sessions', { keyPath: 'id' }).put(session);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });
  }

  it('loads only sessions for the requested owner key', async () => {
    const { openDB, getAllSessions, putSession } = await import('../session-storage');
    await openDB();

    const guest = {
      id: 'guest-session',
      title: 'Guest',
      messages: [{ id: 'msg-1', role: 'user' as const, content: 'local', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 1,
    };
    const account = {
      ...guest,
      id: 'account-session',
      title: 'Account',
      updatedAt: 2,
    };

    await putSession(guest, 'guest');
    await putSession(account, 'user:u-1');

    expect((await getAllSessions('guest')).map((s) => s.id)).toEqual(['guest-session']);
    expect((await getAllSessions('user:u-1')).map((s) => s.id)).toEqual(['account-session']);
  });

  it('keeps guest and account copies when they share the same session id', async () => {
    const { openDB, getAllSessions, putSession } = await import('../session-storage');
    await openDB();

    const base = {
      id: 'same-session',
      title: 'Guest Copy',
      messages: [{ id: 'msg-1', role: 'user' as const, content: 'guest local chat', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 1,
    };

    await putSession(base, 'guest');
    await putSession({
      ...base,
      title: 'Account Copy',
      messages: [{ id: 'msg-2', role: 'user' as const, content: 'account chat', timestamp: 2 }],
      updatedAt: 2,
    }, 'user:u-1');

    expect((await getAllSessions('guest')).map((s) => s.title)).toEqual(['Guest Copy']);
    expect((await getAllSessions('user:u-1')).map((s) => s.title)).toEqual(['Account Copy']);
  });

  it('opens storage before reading guest sessions for login-time import checks', async () => {
    localStorage.setItem('vibe-sessions-v1', JSON.stringify([
      {
        id: 'legacy-guest-session',
        title: 'Guest',
        messages: [{ id: 'msg-1', role: 'user' as const, content: 'local', timestamp: 1 }],
        code: 's("bd")',
        createdAt: 1,
        updatedAt: 1,
      },
    ]));

    const { getAllSessions } = await import('../session-storage');

    expect((await getAllSessions('guest')).map((s) => s.id)).toContain('legacy-guest-session');
  });

  it('migrates legacy IndexedDB sessions into the guest namespace', async () => {
    await createLegacySessionStore({
      id: 'legacy-idb-session',
      title: 'Legacy IDB',
      messages: [{ id: 'msg-1', role: 'user', content: 'old local chat', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 1,
    });

    const { getAllSessions } = await import('../session-storage');

    expect((await getAllSessions('guest')).map((s) => s.id)).toContain('legacy-idb-session');
  });
});

describe('normalizeSession', () => {
  it('migrates an older numbered-option response into persisted choice mode', async () => {
    const { normalizeSession } = await import('../session-storage');
    const legacy = {
      id: 'legacy-choice',
      title: '夏日旋律',
      messages: [{
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [
          '先写了一小段夏日旋律。这个方向对吗？',
          '',
          '1. 加入鼓和贝斯',
          '2. 换个方向',
          '3. 按这个方向写完',
          '',
          '回复序号，或者直接说出你的想法。',
        ].join('\n'),
        code: 'note("c3")',
        timestamp: 1,
      }],
      code: 'note("c3")',
      createdAt: 1,
      updatedAt: 2,
    };

    const normalized = normalizeSession(legacy);

    expect(normalized.inputMode).toBe('choice');
    expect(normalized.messages[0].inputMode).toBe('choice');
  });

  it('does not let a later playback failure override a migrated choice mode', async () => {
    const { normalizeSession } = await import('../session-storage');
    const legacy = {
      id: 'legacy-choice-failure',
      title: '夏日旋律',
      messages: [
        {
          id: 'assistant-choice',
          role: 'assistant' as const,
          content: [
            '先写了一小段夏日旋律。这个方向对吗？',
            '',
            '1. 加入鼓和贝斯',
            '2. 换个方向',
            '',
            '回复序号，或者直接说出你的想法。',
          ].join('\n'),
          code: 'note("c3")',
          revisionId: 'rev-choice',
          timestamp: 1,
        },
        {
          id: 'assistant-failed',
          role: 'assistant' as const,
          content: '代码无法运行',
          code: 'note(bad)',
          revisionId: 'rev-failed',
          timestamp: 2,
        },
      ],
      revisions: [
        { id: 'rev-choice', beforeCode: '', afterCode: 'note("c3")', playbackStatus: 'played' as const, createdAt: 1 },
        { id: 'rev-failed', beforeCode: 'note("c3")', afterCode: 'note(bad)', playbackStatus: 'failed' as const, createdAt: 2 },
      ],
      code: 'note(bad)',
      createdAt: 1,
      updatedAt: 2,
    };

    const normalized = normalizeSession(legacy);

    expect(normalized.inputMode).toBe('choice');
    expect(normalized.messages[0].inputMode).toBe('choice');
    expect(normalized.messages[1].inputMode).toBeUndefined();
  });

  it('ignores legacy mode fields when reading saved sessions', async () => {
    const { normalizeSession } = await import('../session-storage');
    const legacy = {
      id: 'legacy',
      title: '旧会话',
      ['mode']: 'chat',
      messages: [],
      code: '',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(normalizeSession(legacy)).toEqual({
      id: 'legacy',
      title: '旧会话',
      messages: [],
      code: '',
      createdAt: 1,
      updatedAt: 2,
    });
  });
});

describe('session-storage strict import writes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.doUnmock('idb');
    vi.unstubAllGlobals();
  });

  it('propagates a real IndexedDB failure when writing an imported session', async () => {
    const failure = new Error('disk write failed');
    const put = vi.fn(async () => { throw failure; });
    vi.doMock('idb', () => ({
      openDB: vi.fn(async () => ({
        objectStoreNames: { contains: () => true },
        put,
      })),
    }));
    const storage = await import('../session-storage');
    await storage.openDB();

    await expect(storage.putImportedSession(fakeSession)).rejects.toThrow('disk write failed');
    expect(put).toHaveBeenCalledWith('sessions_by_owner', {
      ...fakeSession,
      ownerKey: 'guest',
    });
  });

  it('writes a conflict branch in one transaction and propagates transaction failure', async () => {
    const failure = new Error('transaction aborted');
    const put = vi.fn(async () => undefined);
    const transaction = vi.fn(() => ({
      store: { put },
      done: Promise.reject(failure),
    }));
    vi.doMock('idb', () => ({
      openDB: vi.fn(async () => ({
        objectStoreNames: { contains: () => true },
        transaction,
      })),
    }));
    const storage = await import('../session-storage');
    await storage.openDB();
    const detached = { ...fakeSession, id: 'detached' };
    const branch = { ...fakeSession, id: 'branch' };

    await expect(storage.putImportedSessionBranch(detached, branch))
      .rejects.toThrow('transaction aborted');
    expect(transaction).toHaveBeenCalledWith('sessions_by_owner', 'readwrite');
    expect(put).toHaveBeenNthCalledWith(1, { ...detached, ownerKey: 'guest' });
    expect(put).toHaveBeenNthCalledWith(2, { ...branch, ownerKey: 'guest' });
  });
});
