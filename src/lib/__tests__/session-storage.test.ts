import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('normalizeSession', () => {
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
    expect(put).toHaveBeenCalledWith('sessions', fakeSession);
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
    expect(transaction).toHaveBeenCalledWith('sessions', 'readwrite');
    expect(put).toHaveBeenNthCalledWith(1, detached);
    expect(put).toHaveBeenNthCalledWith(2, branch);
  });
});
