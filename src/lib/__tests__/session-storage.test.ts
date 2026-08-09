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
