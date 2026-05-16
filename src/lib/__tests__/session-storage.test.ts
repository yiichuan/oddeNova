import { describe, it, expect, beforeEach } from 'vitest';

describe('session-storage fallback 路径', () => {
  // 在 Node 环境中 IndexedDB 不存在，openDB() 会触发 fallback，
  // 之后所有写操作静默忽略，读操作返回空数组。

  beforeEach(async () => {
    // 每次测试重新 import，确保模块状态干净
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
