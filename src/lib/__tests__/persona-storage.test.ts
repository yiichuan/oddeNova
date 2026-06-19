import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('persona-storage cache behavior', () => {
  beforeEach(() => {
    vi.resetModules();
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
    } = await import('../persona-storage');

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
    const { getActivePersonaSync, putPersona, setActivePersonaId } = await import('../persona-storage');

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
    } = await import('../persona-storage');

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
    const { BUILTIN_PERSONA_ID, deletePersona, getActivePersonaSync } = await import('../persona-storage');

    await deletePersona(BUILTIN_PERSONA_ID);

    expect(getActivePersonaSync()).toEqual({ id: BUILTIN_PERSONA_ID, name: 'oddeNova' });
  });
});
