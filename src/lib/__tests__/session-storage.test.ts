// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('session-storage fallback path', () => {
  // IndexedDB does not exist in the Node environment; openDB() triggers the fallback,
  // after which all write operations are silently ignored and read operations return an empty array.

  beforeEach(async () => {
    // Re-import on each test to ensure a clean module state
    const { vi } = await import('vitest');
    vi.resetModules();
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

  it('putSession 在 fallback 模式下静默忽略不抛错', async () => {
    const { openDB, putSession } = await import('../session-storage');
    await openDB();
    const fakeSession = {
      id: 'test-id',
      title: 'Test',
      messages: [],
      code: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await expect(putSession(fakeSession as Parameters<typeof putSession>[0])).resolves.toBeUndefined();
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
