import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredSetting = {
  key: string;
  value: string;
};

type MockDb = {
  getAll: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function makeMockDb({
  personas = [],
  activePersonaId,
}: {
  personas?: unknown[];
  activePersonaId?: string;
} = {}): MockDb {
  return {
    getAll: vi.fn().mockResolvedValue(personas),
    get: vi.fn().mockResolvedValue(
      activePersonaId ? ({ key: 'activePersonaId', value: activePersonaId } satisfies StoredSetting) : undefined,
    ),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

async function importWithMockDb(db: MockDb) {
  vi.doMock('../session-storage', () => ({
    getStorageDb: () => db,
    openDB: vi.fn().mockResolvedValue(undefined),
    PERSONA_STORE_NAME: 'personas',
    SETTINGS_STORE_NAME: 'settings',
  }));

  return import('../persona-storage');
}

async function importWithUnavailableDb() {
  vi.doMock('../session-storage', () => ({
    getStorageDb: () => null,
    openDB: vi.fn().mockResolvedValue(undefined),
    PERSONA_STORE_NAME: 'personas',
    SETTINGS_STORE_NAME: 'settings',
  }));

  return import('../persona-storage');
}

describe('persona-storage cache behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('../session-storage');
  });

  it('returns built-in oddeNova before cache initialization', async () => {
    const { BUILTIN_PERSONA_ID, getActivePersonaSync } = await import('../persona-storage');

    expect(getActivePersonaSync()).toEqual({ id: BUILTIN_PERSONA_ID, name: 'oddeNova' });
  });

  it('creates and selects a custom persona in the synchronous cache', async () => {
    const {
      getActivePersonaSync,
      getAllPersonas,
      getPersonaPrompt,
      putPersona,
      setActivePersonaId,
    } = await importWithUnavailableDb();

    await putPersona({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Speak like a quiet midnight composer.',
      createdAt: 10,
      updatedAt: 10,
    });
    await setActivePersonaId('persona-1');

    expect(await getAllPersonas()).toEqual([
      {
        id: 'persona-1',
        name: 'Nocturne',
        prompt: 'Speak like a quiet midnight composer.',
        createdAt: 10,
        updatedAt: 10,
      },
    ]);
    expect(getActivePersonaSync()).toEqual({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Speak like a quiet midnight composer.',
    });
    expect(getPersonaPrompt('persona-1')).toBe('Speak like a quiet midnight composer.');
  });

  it('updates an existing persona and keeps active cache in sync', async () => {
    const { getActivePersonaSync, putPersona, setActivePersonaId } = await importWithUnavailableDb();

    await putPersona({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Old prompt',
      createdAt: 10,
      updatedAt: 10,
    });
    await setActivePersonaId('persona-1');
    await putPersona({
      id: 'persona-1',
      name: 'Aurora',
      prompt: 'New prompt',
      createdAt: 10,
      updatedAt: 20,
    });

    expect(getActivePersonaSync()).toEqual({
      id: 'persona-1',
      name: 'Aurora',
      prompt: 'New prompt',
    });
  });

  it('falls back to oddeNova when the active custom persona is deleted', async () => {
    const {
      BUILTIN_PERSONA_ID,
      deletePersona,
      getActivePersonaId,
      getActivePersonaSync,
      getPersonaPrompt,
      putPersona,
      setActivePersonaId,
    } = await importWithUnavailableDb();

    await putPersona({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Prompt',
      createdAt: 10,
      updatedAt: 10,
    });
    await setActivePersonaId('persona-1');
    await deletePersona('persona-1');

    expect(await getActivePersonaId()).toBe(BUILTIN_PERSONA_ID);
    expect(getActivePersonaSync()).toEqual({ id: BUILTIN_PERSONA_ID, name: 'oddeNova' });
    expect(getPersonaPrompt('persona-1')).toBeUndefined();
  });

  it('ignores attempts to delete the built-in persona', async () => {
    const { BUILTIN_PERSONA_ID, deletePersona, getActivePersonaSync } = await importWithUnavailableDb();

    await deletePersona(BUILTIN_PERSONA_ID);

    expect(getActivePersonaSync()).toEqual({ id: BUILTIN_PERSONA_ID, name: 'oddeNova' });
  });

  it('does not cache or persist a custom persona using the built-in id', async () => {
    const db = makeMockDb();
    const { BUILTIN_PERSONA_ID, getActivePersonaSync, getAllPersonas, getPersonaPrompt, putPersona } =
      await importWithMockDb(db);

    await putPersona({
      id: BUILTIN_PERSONA_ID,
      name: 'Impostor',
      prompt: 'This should never shadow the built-in persona.',
      createdAt: 10,
      updatedAt: 10,
    });

    expect(await getAllPersonas()).toEqual([]);
    expect(getActivePersonaSync()).toEqual({ id: BUILTIN_PERSONA_ID, name: 'oddeNova' });
    expect(getPersonaPrompt(BUILTIN_PERSONA_ID)).toBeUndefined();
    expect(db.put).not.toHaveBeenCalled();
  });

  it('hydrates personas and active persona id from IndexedDB while ignoring persisted built-in records', async () => {
    const db = makeMockDb({
      personas: [
        {
          id: 'persona-old',
          name: 'Old',
          prompt: 'Older prompt',
          createdAt: 10,
          updatedAt: 20,
        },
        {
          id: 'oddenova',
          name: 'Impostor',
          prompt: 'Persisted built-in shadow',
          createdAt: 10,
          updatedAt: 100,
        },
        {
          id: 'persona-new',
          name: 'New',
          prompt: 'Newer prompt',
          createdAt: 10,
          updatedAt: 30,
        },
      ],
      activePersonaId: 'persona-new',
    });
    const { getActivePersonaId, getActivePersonaSync, getAllPersonas, getPersonaPrompt } = await importWithMockDb(db);

    expect(await getAllPersonas()).toEqual([
      {
        id: 'persona-new',
        name: 'New',
        prompt: 'Newer prompt',
        createdAt: 10,
        updatedAt: 30,
      },
      {
        id: 'persona-old',
        name: 'Old',
        prompt: 'Older prompt',
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
    expect(await getActivePersonaId()).toBe('persona-new');
    expect(getActivePersonaSync()).toEqual({
      id: 'persona-new',
      name: 'New',
      prompt: 'Newer prompt',
    });
    expect(getPersonaPrompt('oddenova')).toBeUndefined();
  });

  it('persists built-in fallback setting when deleting the active custom persona from IndexedDB', async () => {
    const db = makeMockDb();
    const { BUILTIN_PERSONA_ID, deletePersona, putPersona, setActivePersonaId } = await importWithMockDb(db);

    await putPersona({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Prompt',
      createdAt: 10,
      updatedAt: 10,
    });
    await setActivePersonaId('persona-1');
    db.put.mockClear();

    await deletePersona('persona-1');

    expect(db.delete).toHaveBeenCalledWith('personas', 'persona-1');
    expect(db.put).toHaveBeenCalledWith('settings', {
      key: 'activePersonaId',
      value: BUILTIN_PERSONA_ID,
    });
  });

  it('hydrates from IndexedDB before selecting a persisted persona as the first call', async () => {
    const db = makeMockDb({
      personas: [
        {
          id: 'persisted-id',
          name: 'Persisted',
          prompt: 'Already saved',
          createdAt: 10,
          updatedAt: 10,
        },
      ],
    });
    const { getActivePersonaSync, setActivePersonaId } = await importWithMockDb(db);

    await setActivePersonaId('persisted-id');

    expect(getActivePersonaSync()).toEqual({
      id: 'persisted-id',
      name: 'Persisted',
      prompt: 'Already saved',
    });
    expect(db.put).toHaveBeenCalledWith('settings', {
      key: 'activePersonaId',
      value: 'persisted-id',
    });
  });

  it('hydrates and merges existing IndexedDB personas before putPersona as the first call', async () => {
    const db = makeMockDb({
      personas: [
        {
          id: 'persisted-id',
          name: 'Persisted',
          prompt: 'Already saved',
          createdAt: 10,
          updatedAt: 10,
        },
      ],
      activePersonaId: 'persisted-id',
    });
    const { getActivePersonaSync, getAllPersonas, putPersona } = await importWithMockDb(db);

    await putPersona({
      id: 'new-id',
      name: 'New',
      prompt: 'New prompt',
      createdAt: 20,
      updatedAt: 20,
    });

    expect(await getAllPersonas()).toEqual([
      {
        id: 'new-id',
        name: 'New',
        prompt: 'New prompt',
        createdAt: 20,
        updatedAt: 20,
      },
      {
        id: 'persisted-id',
        name: 'Persisted',
        prompt: 'Already saved',
        createdAt: 10,
        updatedAt: 10,
      },
    ]);
    expect(getActivePersonaSync()).toEqual({
      id: 'persisted-id',
      name: 'Persisted',
      prompt: 'Already saved',
    });
  });

  it('hydrates before deleting an active persisted persona as the first call', async () => {
    const db = makeMockDb({
      personas: [
        {
          id: 'active-id',
          name: 'Active',
          prompt: 'Active prompt',
          createdAt: 10,
          updatedAt: 30,
        },
        {
          id: 'kept-id',
          name: 'Kept',
          prompt: 'Kept prompt',
          createdAt: 10,
          updatedAt: 20,
        },
      ],
      activePersonaId: 'active-id',
    });
    const { BUILTIN_PERSONA_ID, deletePersona, getActivePersonaSync, getAllPersonas } = await importWithMockDb(db);

    await deletePersona('active-id');

    expect(await getAllPersonas()).toEqual([
      {
        id: 'kept-id',
        name: 'Kept',
        prompt: 'Kept prompt',
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
    expect(getActivePersonaSync()).toEqual({ id: BUILTIN_PERSONA_ID, name: 'oddeNova' });
    expect(db.delete).toHaveBeenCalledWith('personas', 'active-id');
    expect(db.put).toHaveBeenCalledWith('settings', {
      key: 'activePersonaId',
      value: BUILTIN_PERSONA_ID,
    });
  });

  it('uses one IndexedDB hydration for concurrent cold-cache mutations', async () => {
    const firstHydration = deferred<unknown[]>();
    const db = makeMockDb({
      personas: [
        {
          id: 'persisted-id',
          name: 'Persisted',
          prompt: 'Already saved',
          createdAt: 10,
          updatedAt: 10,
        },
      ],
    });
    db.getAll = vi
      .fn()
      .mockImplementationOnce(() => firstHydration.promise)
      .mockResolvedValue([
        {
          id: 'persisted-id',
          name: 'Persisted',
          prompt: 'Already saved',
          createdAt: 10,
          updatedAt: 10,
        },
      ]);
    const { getAllPersonas, putPersona } = await importWithMockDb(db);

    const firstPut = putPersona({
      id: 'first-id',
      name: 'First',
      prompt: 'First prompt',
      createdAt: 20,
      updatedAt: 20,
    });
    const secondPut = putPersona({
      id: 'second-id',
      name: 'Second',
      prompt: 'Second prompt',
      createdAt: 30,
      updatedAt: 30,
    });

    await Promise.resolve();
    firstHydration.resolve([
      {
        id: 'persisted-id',
        name: 'Persisted',
        prompt: 'Already saved',
        createdAt: 10,
        updatedAt: 10,
      },
    ]);
    await Promise.all([firstPut, secondPut]);

    expect(db.getAll).toHaveBeenCalledTimes(1);
    expect(await getAllPersonas()).toEqual([
      {
        id: 'second-id',
        name: 'Second',
        prompt: 'Second prompt',
        createdAt: 30,
        updatedAt: 30,
      },
      {
        id: 'first-id',
        name: 'First',
        prompt: 'First prompt',
        createdAt: 20,
        updatedAt: 20,
      },
      {
        id: 'persisted-id',
        name: 'Persisted',
        prompt: 'Already saved',
        createdAt: 10,
        updatedAt: 10,
      },
    ]);
  });
});
