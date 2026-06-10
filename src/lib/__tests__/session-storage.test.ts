import { describe, it, expect, beforeEach } from 'vitest';

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
      mode: 'create',
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

describe('normalizeSession', () => {
  it('backfills create mode for legacy sessions without mode', async () => {
    const { normalizeSession } = await import('../session-storage');
    const legacy = {
      id: 'legacy',
      title: '旧会话',
      messages: [],
      code: '',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(normalizeSession(legacy).mode).toBe('create');
  });

  it('preserves chat mode for saved chat sessions', async () => {
    const { normalizeSession } = await import('../session-storage');
    const saved = {
      id: 'chat',
      title: '聊天',
      mode: 'chat' as const,
      messages: [],
      code: '',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(normalizeSession(saved).mode).toBe('chat');
  });

  it('normalizes invalid mode values to create', async () => {
    const { normalizeSession } = await import('../session-storage');
    const broken = {
      id: 'broken',
      title: '坏数据',
      mode: 'compose',
      messages: [],
      code: '',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(normalizeSession(broken).mode).toBe('create');
  });
});
