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
import { SESSION_TITLE_LIMIT, sessionTitleLength } from '../session-title';

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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hashBridgeSnapshot(snapshot: {
  projectId: string;
  baseUrl: string;
  revision: number;
  skillRevision: number;
  title: string;
  code: string;
  messages: unknown[];
}): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stableJson(snapshot)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

  /**
   * Memory fallback must keep the same validation, idempotency, and rollback
   * semantics as the IndexedDB path — including the async hash validation
   * being re-checked against the authoritative maps before the write.
   */
  it('rebinds in memory fallback and keeps idempotency and drift fail-closed', async () => {
    const storage = await import('../session-storage');
    await storage.openDB();
    expect(storage.isSessionStoragePersistent()).toBe(false);
    const ownerKey = 'guest';
    const baseUrl = 'https://oddenova.example/studio';
    const projectId = 'memory-rebind-project';
    const projectKey = `${baseUrl}\0${projectId}`;
    const previousBindingId = 'memory-binding-old';
    const sessionId = 'memory-session';
    const snapshotContent = {
      projectId,
      baseUrl,
      revision: 4,
      skillRevision: 7,
      title: 'Memory piece',
      code: 'note("page")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 4 }],
    };
    const contentHash = await hashBridgeSnapshot(snapshotContent);
    const session = {
      ...fakeSession,
      id: sessionId,
      title: 'Atomic piece',
      code: 'note("page")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', timestamp: 1 }],
      updatedAt: 44,
      externalSource: {
        type: 'oddenova-strudel-skill' as const,
        projectId,
        baseUrl,
        importedContentHash: 'memory-local-hash',
        protocolVersion: 3 as const,
        revision: 4,
        skillRevision: 7,
        bindingId: previousBindingId,
        bridgeContentHash: contentHash,
      },
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      sessionId,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        ...snapshotContent,
        bindingId: previousBindingId,
        contentHash,
      },
      editorPresentation: { revision: 4, skillRevision: 7, status: 'pending' as const },
      updatedAt: 44,
    };
    const rebindInput = {
      ownerKey,
      projectKey,
      previousBindingId,
      bindingId: 'memory-binding-new',
      clientId: 'memory-client-new',
    };

    await storage.commitBridgeSessionState({ ownerKey, session, checkpoint, checkpointExpectation: 'initial' });
    await storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      changeId: 'memory-change',
      payload: { protocolVersion: 3, bindingId: previousBindingId, clientId: 'old-client', code: 'draft' },
      createdAt: 2,
    });

    const result = await storage.rebindBridgeSessionState(rebindInput);

    expect(result.session).toEqual(expect.objectContaining({
      id: sessionId,
      updatedAt: 44,
      externalSource: expect.objectContaining({ bindingId: rebindInput.bindingId }),
    }));
    expect(result.checkpoint).toEqual(expect.objectContaining({
      bindingId: rebindInput.bindingId,
      sessionId,
      editorPresentation: { revision: 4, skillRevision: 7, status: 'pending' },
    }));
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, rebindInput.bindingId)).toEqual(result.checkpoint);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, rebindInput.bindingId)).toEqual([
      expect.objectContaining({
        changeId: 'memory-change',
        payload: { protocolVersion: 3, bindingId: rebindInput.bindingId, clientId: rebindInput.clientId, code: 'draft' },
      }),
    ]);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, previousBindingId)).toEqual([]);

    // A chained rebind from the current generation stays allowed, but it must
    // move the exact session identity with it.
    const chained = await storage.rebindBridgeSessionState({
      ...rebindInput,
      previousBindingId: rebindInput.bindingId,
      bindingId: 'memory-binding-older',
    });
    expect(chained.session.externalSource).toEqual(expect.objectContaining({ bindingId: 'memory-binding-older' }));
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, rebindInput.bindingId)).toBeUndefined();

    // Drift between validation and the authoritative read stays fail-closed.
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      const resultDigest = await digest(algorithm, data);
      const mutated = {
        ...checkpoint,
        bindingId: 'memory-binding-older',
        snapshot: { ...checkpoint.snapshot, bindingId: 'memory-binding-older', code: 'note("drifted")' },
      };
      await storage.putBridgeCheckpoint(mutated);
      return resultDigest;
    });
    try {
      await expect(storage.rebindBridgeSessionState({
        ...rebindInput,
        previousBindingId: 'memory-binding-older',
        bindingId: 'memory-binding-stale',
      })).rejects.toMatchObject({ code: 'recovery-required' });
    } finally {
      digestSpy.mockRestore();
    }
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
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Account',
      updatedAt: 2,
    };

    await putSession(guest, 'guest');
    await putSession(account, 'user:u-1');

    expect((await getAllSessions('guest')).map((s) => s.id)).toEqual(['guest-session']);
    expect((await getAllSessions('user:u-1')).map((s) => s.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
    ]);
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

  it('drops the legacy favorite store on the next database upgrade', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('oddenova-db', 4);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        const favorites = database.createObjectStore('favorites_by_owner', { keyPath: ['ownerKey', 'id'] });
        favorites.put({
          ownerKey: 'guest',
          id: 'legacy-favorite',
          title: 'Legacy',
          turns: [],
          messages: [],
          code: 's("bd")',
          favoritedAt: 100,
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    const storage = await import('../session-storage');
    await storage.openDB();

    expect(await storage.getAllSessions('guest')).toEqual([]);
    expect(storage.getStorageDb()?.objectStoreNames.contains('favorites_by_owner')).toBe(false);
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

  it('normalizes a legacy guest id in one transaction and moves the current-session pointer', async () => {
    const storage = await import('../session-storage');
    await storage.openDB();
    const legacy = {
      id: 's-1720000000000-abc123',
      title: 'Legacy guest',
      messages: [{ id: 'm-1', role: 'user' as const, content: '保留我', timestamp: 1 }],
      code: 's("bd")',
      inputMode: 'choice' as const,
      suggestions: { forCode: 's("bd")', items: ['加贝斯'] },
      createdAt: 10,
      updatedAt: 11,
    };
    await storage.putSession(legacy);
    await storage.putCurrentSessionId(legacy.id, 'guest');

    const normalized = await storage.normalizeGuestSessionForImport(legacy);

    expect(normalized.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect((await storage.getAllSessions('guest')).map((session) => session.id)).toEqual([normalized.id]);
    expect(await storage.getCurrentSessionId('guest')).toBe(normalized.id);
    expect(await storage.getAllSessions('guest')).toEqual([
      expect.objectContaining({ ...legacy, id: normalized.id }),
    ]);
  });

  it('atomically rekeys all owner state for a legacy account session', async () => {
    const storage = await import('../session-storage');
    const syncStorage = await import('../session-sync-storage');
    await storage.openDB();
    const ownerKey = 'user:u-1';
    const legacy = {
      id: 's-1786465556711-wi5as4',
      title: '旧账号会话',
      messages: [{ id: 'm-1', role: 'user' as const, content: '保留完整内容', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 10,
      updatedAt: 11,
    };
    await storage.putSession(legacy, ownerKey);
    await storage.putCurrentSessionId(legacy.id, ownerKey);
    await syncStorage.markPendingSessionSync(ownerKey, legacy.id);
    await syncStorage.markPendingSessionDelete(ownerKey, legacy.id);

    const sessions = await storage.getAllSessions(ownerKey);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(expect.objectContaining({
      ...legacy,
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    }));
    const migratedId = sessions[0].id;
    expect(await storage.getCurrentSessionId(ownerKey)).toBe(migratedId);
    expect(await syncStorage.readPendingSessionOperations(ownerKey)).toEqual({
      syncIds: new Set([migratedId]),
      deleteIds: new Set([migratedId]),
    });
    expect(await storage.getStorageDb()?.get(
      storage.SESSION_STORE_NAME,
      [ownerKey, legacy.id],
    )).toBeUndefined();
  });

  it('drops orphan legacy operation markers while preserving UUID retries', async () => {
    const storage = await import('../session-storage');
    const syncStorage = await import('../session-sync-storage');
    await storage.openDB();
    const ownerKey = 'user:u-1';
    const legacyId = 's-1786464777419-eaop23';
    const uuid = '00000000-0000-4000-8000-000000000001';
    await syncStorage.markPendingSessionSync(ownerKey, legacyId);
    await syncStorage.markPendingSessionDelete(ownerKey, legacyId);
    await syncStorage.markPendingSessionSync(ownerKey, uuid);
    await syncStorage.markPendingSessionDelete(ownerKey, uuid);

    await storage.getAllSessions(ownerKey);

    expect(await syncStorage.readPendingSessionOperations(ownerKey)).toEqual({
      syncIds: new Set([uuid]),
      deleteIds: new Set([uuid]),
    });
  });

  it('reuses an existing UUID v7 guest id without normalization', async () => {
    const storage = await import('../session-storage');
    await storage.openDB();
    const existing = {
      id: '018f5f7e-8b7c-7000-8000-000000000001',
      title: 'UUID v7',
      messages: [{ id: 'm-1', role: 'user' as const, content: '保持 id', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 2,
    };

    await expect(storage.normalizeGuestSessionForImport(existing)).resolves.toBe(existing);
  });

  it('reuses one normalized UUID for concurrent calls on the same legacy id', async () => {
    const storage = await import('../session-storage');
    await storage.openDB();
    const legacy = {
      id: 's-concurrent-legacy',
      title: '并发导入',
      messages: [{ id: 'm-1', role: 'user' as const, content: '同一份', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 2,
    };
    await storage.putSession(legacy);

    const [first, second] = await Promise.all([
      storage.normalizeGuestSessionForImport(legacy),
      storage.normalizeGuestSessionForImport({ ...legacy }),
    ]);

    expect(first.id).toBe(second.id);
    expect((await storage.getAllSessions('guest')).map((session) => session.id)).toEqual([first.id]);
  });

  it('physically rewrites legacy tokenStats out of IndexedDB rows when loaded', async () => {
    const storage = await import('../session-storage');
    await storage.openDB();
    const legacy = {
      id: 'legacy-token-stats',
      title: '旧 token stats',
      messages: [{ id: 'm-1', role: 'user' as const, content: '清理字段', timestamp: 1 }],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 2,
      tokenStats: { promptTokens: 9, systemEstimate: 2, modelId: 'old' },
    };
    await storage.putSession(legacy as never);

    expect((await storage.getAllSessions('guest'))[0]).not.toHaveProperty('tokenStats');
    const raw = await storage.getStorageDb()?.get(storage.SESSION_STORE_NAME, ['guest', legacy.id]);
    expect(raw).not.toHaveProperty('tokenStats');
  });
  /**
   * Fixture for the atomic rebind tests: one previous generation with a
   * session, a valid checkpoint hash, and two outbox generations.
   */
  async function setupRebindFixture(options: {
    ownerKey: string;
    projectKey?: string;
    previousBindingId?: string;
  }) {
    const storage = await import('../session-storage');
    const ownerKey = options.ownerKey;
    const baseUrl = 'https://oddenova.example/studio';
    const projectId = 'atomic-rebind-project';
    const projectKey = options.projectKey ?? `${baseUrl}\0${projectId}`;
    const previousBindingId = options.previousBindingId ?? 'binding-old';
    const sessionId = '00000000-0000-4000-8000-000000000091';
    const snapshotContent = {
      projectId,
      baseUrl,
      revision: 4,
      skillRevision: 7,
      title: 'Atomic piece',
      code: 'note("page")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 4 }],
    };
    const contentHash = await hashBridgeSnapshot(snapshotContent);
    const session = {
      ...fakeSession,
      id: sessionId,
      title: 'Atomic piece',
      code: 'note("page")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', timestamp: 1 }],
      updatedAt: 44,
      externalSource: {
        type: 'oddenova-strudel-skill' as const,
        projectId,
        baseUrl,
        importedContentHash: 'atomic-local-hash',
        protocolVersion: 3 as const,
        revision: 4,
        skillRevision: 7,
        bindingId: previousBindingId,
        bridgeContentHash: contentHash,
      },
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      sessionId,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        ...snapshotContent,
        bindingId: previousBindingId,
        contentHash,
      },
      editorPresentation: { revision: 4, skillRevision: 7, status: 'pending' as const },
      updatedAt: 44,
    };
    await storage.commitBridgeSessionState({ ownerKey, session, checkpoint, checkpointExpectation: 'initial' });
    await storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      changeId: 'pending-change',
      payload: { protocolVersion: 3, bindingId: previousBindingId, clientId: 'old-client', code: 'draft' },
      createdAt: 2,
    });
    const rebindInput = {
      ownerKey,
      projectKey,
      previousBindingId,
      bindingId: 'binding-new',
      clientId: 'new-client',
    };
    return { storage, ownerKey, projectKey, baseUrl, projectId, sessionId, previousBindingId, session, checkpoint, snapshotContent, contentHash, rebindInput };
  }

  /** Run an action while the rebind pre-validation hash is being computed. */
  function injectDuringRebindValidation(storage: {
    SESSION_STORE_NAME: string;
    BRIDGE_CHECKPOINT_STORE_NAME: string;
    getStorageDb: () => unknown;
  }, action: () => Promise<void> | void): void {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      const result = await digest(algorithm, data);
      await action();
      return result;
    });
    void storage;
  }

  it('reads the authoritative session inside the rebind transaction', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-session' });
    const { storage, ownerKey, rebindInput } = fixture;
    // A draft write lands between the pre-validation reads and the
    // transaction: the rebind must carry it forward, not overwrite it.
    injectDuringRebindValidation(storage, async () => {
      const db = storage.getStorageDb();
      await db?.put(storage.SESSION_STORE_NAME, {
        ...fixture.session,
        ownerKey,
        messages: [...fixture.session.messages, { id: 'm-2', role: 'assistant' as const, content: 'late draft', timestamp: 2 }],
        updatedAt: 99,
        suggestions: { forCode: 'note("page")', items: ['late chip'] },
      });
    });

    const result = await storage.rebindBridgeSessionState(rebindInput);

    expect(result.session.updatedAt).toBe(99);
    expect(result.session.messages.map(({ id }) => id)).toEqual(['m-1', 'm-2']);
    expect(result.session.suggestions).toEqual({ forCode: 'note("page")', items: ['late chip'] });
    expect(result.session.externalSource).toEqual(expect.objectContaining({ bindingId: 'binding-new' }));
    const stored = (await storage.getAllSessions(ownerKey)).find((s) => s.id === fixture.sessionId);
    expect(stored?.messages.map(({ id }) => id)).toEqual(['m-1', 'm-2']);
  });

  it('migrates an outbox entry queued after the pre-validation reads', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-outbox' });
    const { storage, projectKey, rebindInput } = fixture;
    injectDuringRebindValidation(storage, () => storage.putBridgeOutboxEntry({
      ownerKey: fixture.ownerKey,
      projectKey,
      bindingId: 'binding-old',
      changeId: 'late-entry',
      payload: { protocolVersion: 3, bindingId: 'binding-old', clientId: 'old-client', code: 'queued later' },
      createdAt: 3,
    }));

    await storage.rebindBridgeSessionState(rebindInput);

    const rebound = await storage.getBridgeOutboxEntries(fixture.ownerKey, projectKey, 'binding-new');
    expect(rebound.map((entry) => entry.changeId).sort()).toEqual(['late-entry', 'pending-change']);
    expect(rebound.every((entry) => entry.bindingId === 'binding-new' && (entry.payload as { clientId?: string }).clientId === 'new-client')).toBe(true);
    expect(await storage.getBridgeOutboxEntries(fixture.ownerKey, projectKey, 'binding-old')).toEqual([]);
  });

  it('aborts once on a validation-time record change and fails closed with zero writes when it persists', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-drift' });
    const { storage, ownerKey, projectKey, previousBindingId, checkpoint } = fixture;
    let mutations = 0;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      const result = await digest(algorithm, data);
      // Rewrite the checkpoint between validation and the transaction, every
      // time validation runs.
      mutations += 1;
      const db = storage.getStorageDb();
      await db?.put(storage.BRIDGE_CHECKPOINT_STORE_NAME, {
        ...checkpoint,
        snapshot: { ...checkpoint.snapshot, code: `note("changed-${mutations}")` },
      });
      return result;
    });

    await expect(storage.rebindBridgeSessionState(fixture.rebindInput)).rejects.toMatchObject({ code: 'recovery-required' });

    expect(mutations).toBeGreaterThanOrEqual(2);
    digestSpy.mockRestore();
    // The rebind itself wrote nothing: no target checkpoint, no migrated
    // outbox, and the session still carries the previous binding.
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, 'binding-new')).toBeUndefined();
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, previousBindingId)).toHaveLength(1);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, 'binding-new')).toEqual([]);
    const storedSession = (await storage.getAllSessions(ownerKey)).find((s) => s.id === fixture.sessionId);
    expect(storedSession?.externalSource).toEqual(expect.objectContaining({ bindingId: previousBindingId }));
  });

  it('keeps the previous state when a store write fails inside the rebind transaction', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-failure' });
    const { storage, ownerKey, projectKey, previousBindingId, checkpoint } = fixture;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: unknown[]) {
      putCalls += 1;
      if (putCalls === 1) throw new Error('disk write failed');
      return IDBObjectStore.prototype.put.apply(this, args as never);
    });
    let putCalls = 0;

    await expect(storage.rebindBridgeSessionState(fixture.rebindInput)).rejects.toThrow('disk write failed');
    putSpy.mockRestore();

    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toEqual(checkpoint);
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, 'binding-new')).toBeUndefined();
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, previousBindingId)).toHaveLength(1);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, 'binding-new')).toEqual([]);
  });

  it('rejects a conflicting target checkpoint with zero writes', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-conflict' });
    const { storage, ownerKey, projectKey, previousBindingId, snapshotContent } = fixture;
    // A half-finished retry left a different, self-consistent target
    // checkpoint behind.
    const conflictingContent = { ...snapshotContent, code: 'note("other")' };
    const conflictingTarget = {
      ...fixture.checkpoint,
      bindingId: 'binding-new',
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        ...conflictingContent,
        bindingId: 'binding-new',
        contentHash: await hashBridgeSnapshot(conflictingContent),
      },
      updatedAt: 50,
    };
    await storage.putBridgeCheckpoint(conflictingTarget);
    await storage.putSession(
      { ...fixture.session, externalSource: { ...fixture.session.externalSource, bindingId: 'binding-new' } },
      ownerKey,
    );

    await expect(storage.rebindBridgeSessionState({
      ...fixture.rebindInput,
    })).rejects.toMatchObject({ code: 'conflict' });

    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toEqual(fixture.checkpoint);
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, 'binding-new')).toEqual(conflictingTarget);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, previousBindingId)).toHaveLength(1);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, 'binding-new')).toEqual([]);
  });

  it('allows a fully identical target checkpoint as an idempotent rebind retry', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-idempotent' });
    const { storage, ownerKey, projectKey, previousBindingId, session, snapshotContent, contentHash } = fixture;
    const expectedTarget = {
      ...fixture.checkpoint,
      bindingId: 'binding-new',
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        ...snapshotContent,
        bindingId: 'binding-new',
        contentHash,
      },
      updatedAt: 50,
    };
    await storage.putBridgeCheckpoint(expectedTarget);
    const reboundSession = { ...session, externalSource: { ...session.externalSource, bindingId: 'binding-new' } };
    await storage.putSession(reboundSession, ownerKey);
    await storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: 'binding-new',
      changeId: 'pending-change',
      payload: { protocolVersion: 3, bindingId: 'binding-new', clientId: 'new-client', code: 'draft' },
      createdAt: 2,
    });

    const result = await storage.rebindBridgeSessionState(fixture.rebindInput);

    expect(result.checkpoint).toEqual(expectedTarget);
    expect(result.session).toEqual(expect.objectContaining({
      id: session.id,
      externalSource: expect.objectContaining({ bindingId: 'binding-new' }),
    }));
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, 'binding-new')).toEqual(expectedTarget);
    expect((await storage.getBridgeOutboxEntries(ownerKey, projectKey, 'binding-new')).map((entry) => entry.changeId).sort()).toEqual(['pending-change']);
  });

  it('rejects a v3 outbox write whose checkpoint generation no longer exists', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-guard' });
    const { storage, ownerKey, projectKey, previousBindingId } = fixture;

    // The rebind commits first and removes the previous checkpoint.
    await storage.rebindBridgeSessionState(fixture.rebindInput);
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();

    // A stale page that still holds the old connection must not resurrect the
    // old generation by queueing an outbox entry for it.
    await expect(storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      changeId: 'stale-write',
      payload: { protocolVersion: 3, bindingId: previousBindingId, clientId: 'old-client', code: 'late' },
      createdAt: 9,
    }, { generationGuard: true })).rejects.toThrow();
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, previousBindingId)).toEqual([]);

    // The current generation still accepts guarded writes.
    await expect(storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: 'binding-new',
      changeId: 'fresh-write',
      payload: { protocolVersion: 3, bindingId: 'binding-new', clientId: 'new-client', code: 'current' },
      createdAt: 10,
    }, { generationGuard: true })).resolves.toBeUndefined();
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, 'binding-new')).toHaveLength(2);
  });

  it('rejects a bridge session commit that would recreate a moved generation', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:atomic-commit' });
    const { storage, ownerKey, projectKey, previousBindingId, sessionId } = fixture;
    await storage.rebindBridgeSessionState(fixture.rebindInput);

    await expect(storage.commitBridgeSessionState({
      ownerKey,
      session: fixture.session,
      checkpoint: fixture.checkpoint,
      checkpointExpectation: 'update',
    })).rejects.toThrow();
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();

    // A stale page cannot label a moved generation as an initial import.
    await expect(storage.commitBridgeSessionState({
      ownerKey,
      session: fixture.session,
      checkpoint: fixture.checkpoint,
      checkpointExpectation: 'initial',
    })).rejects.toThrow();
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();
    expect((await storage.getAllSessions(ownerKey)).some((s) => s.id === sessionId)).toBe(true);

    await storage.deleteSessionStrict(sessionId, ownerKey);
    await expect(storage.commitBridgeSessionState({
      ownerKey,
      session: fixture.session,
      checkpoint: fixture.checkpoint,
      checkpointExpectation: 'initial',
    })).rejects.toThrow();
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();
  });

  it('rejects an idempotent rebind retry when the target session no longer matches its checkpoint', async () => {
    const fixture = await setupRebindFixture({ ownerKey: 'user:rebind-target-drift' });
    const { storage, ownerKey, rebindInput, sessionId } = fixture;
    await storage.rebindBridgeSessionState(rebindInput);
    const db = storage.getStorageDb();
    const target = (await storage.getAllSessions(ownerKey)).find((session) => session.id === sessionId)!;
    await db?.put(storage.SESSION_STORE_NAME, {
      ...target,
      ownerKey,
      externalSource: { ...target.externalSource, revision: 99 },
    });

    await expect(storage.rebindBridgeSessionState(rebindInput)).rejects.toMatchObject({ code: 'recovery-required' });
    expect(await storage.getBridgeCheckpoint(ownerKey, fixture.projectKey, rebindInput.bindingId)).toBeDefined();
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

  it('holds a title written before the shared limit to it, and changes nothing else', async () => {
    const { normalizeSession } = await import('../session-storage');
    const stored = {
      id: 'legacy-long',
      title: ` 一段\n很长的 标题${'字'.repeat(200)}`,
      messages: [],
      code: 's("bd")',
      createdAt: 1,
      updatedAt: 2,
    };

    const normalized = normalizeSession(stored);
    expect(sessionTitleLength(normalized.title)).toBe(SESSION_TITLE_LIMIT);
    expect(normalized.title.endsWith('…')).toBe(true);
    // Read-side only: the row is not touched, so nothing re-sorts or re-saves.
    expect(normalized.updatedAt).toBe(2);
    expect(normalized.code).toBe('s("bd")');
  });

  it('persists bridge outbox entries within owner, project, and binding boundaries', async () => {
    const { deleteBridgeOutboxEntry, getBridgeOutboxEntries, putBridgeOutboxEntry, rebindBridgeOutboxEntries } = await import('../session-storage');
    const entry = {
      ownerKey: 'user:u-1', projectKey: 'origin\0project', bindingId: 'binding-1', changeId: 'change-1',
      payload: { code: 'page edit' }, createdAt: 1,
    };
    await putBridgeOutboxEntry(entry);
    await putBridgeOutboxEntry({ ...entry, ownerKey: 'user:u-2', changeId: 'change-2', createdAt: 2 });
    expect(await getBridgeOutboxEntries('user:u-1', entry.projectKey, entry.bindingId)).toEqual([entry]);
    await deleteBridgeOutboxEntry(entry);
    expect(await getBridgeOutboxEntries('user:u-1', entry.projectKey, entry.bindingId)).toEqual([]);
    expect(await getBridgeOutboxEntries('user:u-2', entry.projectKey, entry.bindingId)).toHaveLength(1);
    await rebindBridgeOutboxEntries('user:u-2', entry.projectKey, 'binding-2', 'client-2');
    expect(await getBridgeOutboxEntries('user:u-2', entry.projectKey, entry.bindingId)).toEqual([]);
    expect(await getBridgeOutboxEntries('user:u-2', entry.projectKey, 'binding-2')).toEqual([
      expect.objectContaining({
        bindingId: 'binding-2',
        payload: expect.objectContaining({ bindingId: 'binding-2', clientId: 'client-2' }),
      }),
    ]);
  });

  it('commits a bridge session, checkpoint, and processed outbox atomically by owner', async () => {
    const storage = await import('../session-storage');
    const projectKey = 'https://oddenova.example/studio\0project-a';
    const bindingId = 'binding-1';
    const session = {
      ...fakeSession,
      id: '00000000-0000-4000-8000-000000000021',
      title: 'Bridge piece',
      code: 'note("page")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make a page', timestamp: 1 }],
      externalSource: {
        type: 'oddenova-strudel-skill' as const,
        projectId: 'project-a',
        baseUrl: 'https://oddenova.example/studio',
        importedContentHash: 'local-hash-4',
        protocolVersion: 3 as const,
        revision: 4,
        skillRevision: 7,
        bridgeContentHash: 'hash-4',
      },
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey: 'user:u-1',
      projectKey,
      bindingId,
      sessionId: session.id,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        projectId: 'project-a',
        baseUrl: 'https://oddenova.example/studio',
        bindingId,
        revision: 4,
        skillRevision: 7,
        title: session.title,
        code: session.code,
        messages: [{ id: 'm-1', role: 'user' as const, content: 'make a page', createdAt: 1, order: 1, updatedRevision: 4 }],
        contentHash: 'hash-4',
      },
      updatedAt: 10,
    };
    const outbox = {
      ownerKey: checkpoint.ownerKey,
      projectKey,
      bindingId,
      changeId: 'change-1',
      payload: { changeId: 'change-1' },
      createdAt: 9,
    };

    await storage.putBridgeOutboxEntry(outbox);
    await storage.commitBridgeSessionState({
      ownerKey: checkpoint.ownerKey,
      session,
      checkpoint,
      deleteOutboxChangeIds: [outbox.changeId],
      checkpointExpectation: 'initial',
    });

    expect(await storage.getBridgeCheckpoint(checkpoint.ownerKey, projectKey, bindingId)).toEqual(checkpoint);
    expect(await storage.getAllSessions(checkpoint.ownerKey)).toEqual([session]);
    expect(await storage.getBridgeOutboxEntries(checkpoint.ownerKey, projectKey, bindingId)).toEqual([]);
    expect(await storage.getBridgeCheckpoint('user:u-2', projectKey, bindingId)).toBeUndefined();

    const rebound = await storage.rebindBridgeCheckpoint(checkpoint.ownerKey, projectKey, 'binding-2');
    expect(rebound).toMatchObject({ bindingId: 'binding-2', snapshot: { bindingId: 'binding-2', contentHash: 'hash-4' } });
    expect(await storage.getBridgeCheckpoint(checkpoint.ownerKey, projectKey, bindingId)).toBeUndefined();
  });

  it('rebinds one exact binding to the same session and leaves older generations untouched', async () => {
    const storage = await import('../session-storage');
    const ownerKey = 'user:rebind';
    const projectKey = 'https://oddenova.example/studio\0rebind-project';
    const baseUrl = 'https://oddenova.example/studio';
    const sessionId = '00000000-0000-4000-8000-000000000041';
    const previousBindingId = 'binding-1';
    const bindingId = 'binding-2';
    const messages = [{ id: 'm-1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 4 }];
    const snapshotContent = {
      projectId: 'rebind-project',
      baseUrl,
      revision: 4,
      skillRevision: 7,
      title: 'Rebind piece',
      code: 'note("page")',
      messages,
    };
    const contentHash = await hashBridgeSnapshot(snapshotContent);
    const session = {
      ...fakeSession,
      id: sessionId,
      title: 'Rebind piece',
      code: 'note("page")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', timestamp: 1 }],
      updatedAt: 44,
      externalSource: {
        type: 'oddenova-strudel-skill' as const,
        projectId: 'rebind-project',
        baseUrl,
        importedContentHash: 'local-content-hash',
        protocolVersion: 3 as const,
        revision: 4,
        skillRevision: 7,
        bindingId: previousBindingId,
        bridgeContentHash: contentHash,
      },
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      sessionId,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        ...snapshotContent,
        bindingId: previousBindingId,
        contentHash,
      },
      editorPresentation: { revision: 4, skillRevision: 7, status: 'pending' as const },
      updatedAt: 44,
    };
    await storage.commitBridgeSessionState({ ownerKey, session, checkpoint, checkpointExpectation: 'initial' });
    await storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: 'binding-0',
      changeId: 'old-generation',
      payload: { bindingId: 'binding-0', clientId: 'old-client', code: 'old' },
      createdAt: 1,
    });
    await storage.putBridgeOutboxEntry({
      ownerKey,
      projectKey,
      bindingId: previousBindingId,
      changeId: 'pending-change',
      payload: { bindingId: previousBindingId, clientId: 'old-client', code: 'draft' },
      createdAt: 2,
    });

    const result = await storage.rebindBridgeSessionState({
      ownerKey,
      projectKey,
      previousBindingId,
      bindingId,
      clientId: 'new-client',
    });

    expect(result.session.id).toBe(sessionId);
    expect(result.session.updatedAt).toBe(44);
    expect(result.session.externalSource).toEqual(expect.objectContaining({ bindingId }));
    expect(result.checkpoint).toEqual(expect.objectContaining({
      bindingId,
      sessionId,
      editorPresentation: { revision: 4, skillRevision: 7, status: 'pending' },
    }));
    expect(result.checkpoint.snapshot.bindingId).toBe(bindingId);
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, previousBindingId)).toBeUndefined();
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, bindingId)).toEqual(result.checkpoint);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, 'binding-0')).toHaveLength(1);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, previousBindingId)).toEqual([]);
    expect(await storage.getBridgeOutboxEntries(ownerKey, projectKey, bindingId)).toEqual([
      expect.objectContaining({
        changeId: 'pending-change',
        payload: { bindingId, clientId: 'new-client', code: 'draft' },
      }),
    ]);
  });

  it('fails closed when the exact previous session was deleted', async () => {
    const storage = await import('../session-storage');
    const ownerKey = 'user:deleted-rebind';
    const projectKey = 'https://oddenova.example/studio\0deleted-project';
    const baseUrl = 'https://oddenova.example/studio';
    const sessionId = '00000000-0000-4000-8000-000000000042';
    const messages: never[] = [];
    const snapshotContent = {
      projectId: 'deleted-project', baseUrl, revision: 1, skillRevision: 1,
      title: 'Deleted', code: 'note("deleted")', messages,
    };
    const contentHash = await hashBridgeSnapshot(snapshotContent);
    const session = {
      ...fakeSession,
      id: sessionId,
      title: 'Deleted',
      code: 'note("deleted")',
      externalSource: {
        type: 'oddenova-strudel-skill' as const,
        projectId: 'deleted-project', baseUrl,
        importedContentHash: 'deleted-local', protocolVersion: 3 as const,
        revision: 1, skillRevision: 1, bindingId: 'binding-old', bridgeContentHash: contentHash,
      },
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey,
      projectKey,
      bindingId: 'binding-old',
      sessionId,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        ...snapshotContent,
        bindingId: 'binding-old',
        contentHash,
      },
      updatedAt: 1,
    };
    await storage.commitBridgeSessionState({ ownerKey, session, checkpoint, checkpointExpectation: 'initial' });
    await storage.deleteSessionStrict(sessionId, ownerKey);

    await expect(storage.rebindBridgeSessionState({
      ownerKey,
      projectKey,
      previousBindingId: 'binding-old',
      bindingId: 'binding-new',
      clientId: 'new-client',
    })).rejects.toMatchObject({ code: 'recovery-required' });
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, 'binding-old')).toEqual(checkpoint);
    expect(await storage.getBridgeCheckpoint(ownerKey, projectKey, 'binding-new')).toBeUndefined();
  });

  it('confirms only the exact pending editor presentation', async () => {
    const storage = await import('../session-storage');
    const ownerKey = 'user:u-presentation';
    const projectKey = 'https://oddenova.example/studio\0presentation-project';
    const bindingId = 'presentation-binding';
    const sessionId = '00000000-0000-4000-8000-000000000031';
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey,
      projectKey,
      bindingId,
      sessionId,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        projectId: 'presentation-project',
        baseUrl: 'https://oddenova.example/studio',
        bindingId,
        revision: 8,
        skillRevision: 5,
        title: 'Presentation',
        code: 'note("new")',
        messages: [],
        contentHash: 'presentation-hash',
      },
      editorPresentation: { revision: 8, skillRevision: 5, status: 'pending' as const },
      updatedAt: 10,
    };
    await storage.putBridgeCheckpoint(checkpoint);

    await expect(storage.confirmBridgeCheckpointPresentation({
      ownerKey,
      projectKey,
      bindingId,
      sessionId,
      revision: 7,
      skillRevision: 4,
    })).resolves.toBe(false);
    expect((await storage.getBridgeCheckpoint(ownerKey, projectKey, bindingId))?.editorPresentation?.status).toBe('pending');

    await expect(storage.confirmBridgeCheckpointPresentation({
      ownerKey,
      projectKey,
      bindingId,
      sessionId,
      revision: 8,
      skillRevision: 5,
    })).resolves.toBe(true);
    expect((await storage.getBridgeCheckpoint(ownerKey, projectKey, bindingId))?.editorPresentation).toEqual({
      revision: 8,
      skillRevision: 5,
      status: 'confirmed',
    });
  });

  it('leaves an empty title empty, for the caller\u2019s own stand-in', async () => {
    const { normalizeSession } = await import('../session-storage');
    expect(normalizeSession({
      id: 'blank',
      title: '   ',
      messages: [],
      code: '',
      createdAt: 1,
      updatedAt: 2,
    }).title).toBe('');
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

  it('does not expose staged bridge state after its transaction is aborted', async () => {
    const failure = new Error('bridge transaction aborted');
    const committed = {
      sessions: new Map<string, unknown>(),
      checkpoints: new Map<string, unknown>(),
      outbox: new Set(['change-1']),
    };
    const staged = {
      sessions: new Map(committed.sessions),
      checkpoints: new Map(committed.checkpoints),
      outbox: new Set(committed.outbox),
    };
    const transaction = vi.fn(() => ({
      objectStore: (name: string) => ({
        get: vi.fn(async () => undefined),
        getAll: vi.fn(async () => []),
        put: vi.fn(async (value: { id?: string; sessionId?: string }) => {
          if (name === 'sessions_by_owner') staged.sessions.set(value.id ?? '', value);
          if (name === 'oddenova_bridge_checkpoints') staged.checkpoints.set(value.sessionId ?? '', value);
        }),
        delete: vi.fn(async () => {
          if (name === 'oddenova_bridge_outbox') staged.outbox.delete('change-1');
        }),
      }),
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

    const session = { ...fakeSession, id: 'bridge-session' };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey: 'guest',
      projectKey: 'origin\0project',
      bindingId: 'binding-1',
      sessionId: session.id,
      snapshot: {
        protocolVersion: 3 as const,
        source: 'oddenova-strudel-skill' as const,
        projectId: 'project',
        baseUrl: 'https://origin.example',
        bindingId: 'binding-1',
        revision: 1,
        skillRevision: 1,
        title: 'Test',
        code: '',
        messages: [],
        contentHash: 'hash',
      },
      updatedAt: 1,
    };

    await expect(storage.commitBridgeSessionState({ ownerKey: 'guest', session, checkpoint, checkpointExpectation: 'initial' }))
      .rejects.toThrow('bridge transaction aborted');
    expect(transaction).toHaveBeenCalledWith(
      ['sessions_by_owner', 'oddenova_bridge_checkpoints', 'oddenova_bridge_outbox'],
      'readwrite',
    );
    expect(committed.sessions).toEqual(new Map());
    expect(committed.checkpoints).toEqual(new Map());
    expect(committed.outbox).toEqual(new Set(['change-1']));
    expect(staged.sessions.size).toBe(1);
    expect(staged.checkpoints.size).toBe(1);
  });
});
