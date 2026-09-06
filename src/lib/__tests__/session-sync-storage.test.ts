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
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
}

describe('session sync storage', () => {
  beforeEach(() => {
    vi.resetModules();
    stubIndexedDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps pending sync and delete operations isolated by owner and kind', async () => {
    const {
      clearPendingSessionSync,
      markPendingSessionDelete,
      markPendingSessionSync,
      readPendingSessionOperations,
    } = await import('../session-sync-storage');

    await markPendingSessionSync('user:a', 'shared/id');
    await markPendingSessionDelete('user:a', 'delete/me');
    await markPendingSessionSync('user:b', 'shared/id');

    expect(await readPendingSessionOperations('user:a')).toEqual({
      syncIds: new Set(['shared/id']),
      deleteIds: new Set(['delete/me']),
    });
    expect(await readPendingSessionOperations('user:b')).toEqual({
      syncIds: new Set(['shared/id']),
      deleteIds: new Set(),
    });

    await clearPendingSessionSync('user:a', 'shared/id');
    expect(await readPendingSessionOperations('user:a')).toEqual({
      syncIds: new Set(),
      deleteIds: new Set(['delete/me']),
    });
  });

  it('clears a delete tombstone without clearing a pending sync marker', async () => {
    const {
      clearPendingSessionDelete,
      markPendingSessionDelete,
      markPendingSessionSync,
      readPendingSessionOperations,
    } = await import('../session-sync-storage');

    await markPendingSessionSync('user:a', 's-1');
    await markPendingSessionDelete('user:a', 's-1');
    await clearPendingSessionDelete('user:a', 's-1');

    expect(await readPendingSessionOperations('user:a')).toEqual({
      syncIds: new Set(['s-1']),
      deleteIds: new Set(),
    });
  });
});
