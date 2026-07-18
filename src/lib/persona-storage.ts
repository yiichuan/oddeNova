import {
  getStorageDb,
  openDB,
  PERSONA_STORE_NAME,
  SETTINGS_STORE_NAME,
} from './session-storage';

export const BUILTIN_PERSONA_ID = 'oddenova';

export type CustomPersona = {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
};

export type ActivePersona = {
  id: string;
  name: string;
  prompt?: string;
};

type StoredSetting = {
  key: string;
  value: string;
};

const ACTIVE_PERSONA_SETTING_KEY = 'activePersonaId';
const BUILTIN_PERSONA: ActivePersona = { id: BUILTIN_PERSONA_ID, name: 'oddeNova' };

let cacheInitialized = false;
let initPromise: Promise<void> | null = null;
let personaCache = new Map<string, CustomPersona>();
let activePersonaId = BUILTIN_PERSONA_ID;

function sortPersonas(personas: CustomPersona[]): CustomPersona[] {
  return personas.sort((a, b) => b.updatedAt - a.updatedAt);
}

function isCustomPersona(persona: CustomPersona): boolean {
  return persona.id !== BUILTIN_PERSONA_ID;
}

function resolveActivePersonaId(id: string): string {
  if (id === BUILTIN_PERSONA_ID || personaCache.has(id)) {
    return id;
  }
  return BUILTIN_PERSONA_ID;
}

function markInitialized(): void {
  cacheInitialized = true;
}

async function persistActivePersonaId(): Promise<void> {
  const db = getStorageDb();
  if (!db) return;

  try {
    await db.put(SETTINGS_STORE_NAME, {
      key: ACTIVE_PERSONA_SETTING_KEY,
      value: activePersonaId,
    } satisfies StoredSetting);
  } catch (err) {
    console.warn('[persona-storage] setActivePersonaId failed', err);
  }
}

async function hydratePersonaCache(): Promise<void> {
  try {
    if (!getStorageDb()) {
      await openDB();
    }

    const db = getStorageDb();
    if (!db) {
      markInitialized();
      return;
    }

    const [personas, setting] = await Promise.all([
      db.getAll(PERSONA_STORE_NAME) as Promise<CustomPersona[]>,
      db.get(SETTINGS_STORE_NAME, ACTIVE_PERSONA_SETTING_KEY) as Promise<StoredSetting | undefined>,
    ]);

    personaCache = new Map(personas.filter(isCustomPersona).map((persona) => [persona.id, persona]));
    activePersonaId = resolveActivePersonaId(setting?.value ?? BUILTIN_PERSONA_ID);
    markInitialized();
  } catch (err) {
    console.warn('[persona-storage] initPersonaCache failed', err);
    personaCache = new Map();
    activePersonaId = BUILTIN_PERSONA_ID;
    markInitialized();
  }
}

export async function initPersonaCache(): Promise<void> {
  if (cacheInitialized) return;
  if (!initPromise) {
    initPromise = hydratePersonaCache().finally(() => {
      initPromise = null;
    });
  }
  await initPromise;
}

async function ensureCacheReadyForMutation(): Promise<void> {
  if (cacheInitialized) return;
  await initPersonaCache();
}

export async function getAllPersonas(): Promise<CustomPersona[]> {
  await initPersonaCache();
  return sortPersonas(Array.from(personaCache.values()));
}

export async function putPersona(persona: CustomPersona): Promise<void> {
  await ensureCacheReadyForMutation();

  if (!isCustomPersona(persona)) {
    personaCache.delete(BUILTIN_PERSONA_ID);
    activePersonaId = resolveActivePersonaId(activePersonaId);
    markInitialized();
    return;
  }

  personaCache.set(persona.id, persona);
  activePersonaId = resolveActivePersonaId(activePersonaId);
  markInitialized();

  const db = getStorageDb();
  if (!db) return;

  try {
    await db.put(PERSONA_STORE_NAME, persona);
  } catch (err) {
    console.warn('[persona-storage] putPersona failed', err);
  }
}

export async function deletePersona(id: string): Promise<void> {
  await ensureCacheReadyForMutation();

  if (id === BUILTIN_PERSONA_ID) {
    markInitialized();
    return;
  }

  personaCache.delete(id);
  const deletedActivePersona = activePersonaId === id;
  if (deletedActivePersona) {
    activePersonaId = BUILTIN_PERSONA_ID;
  }
  markInitialized();

  const db = getStorageDb();
  if (!db) return;

  try {
    await db.delete(PERSONA_STORE_NAME, id);
  } catch (err) {
    console.warn('[persona-storage] deletePersona failed', err);
  }

  if (deletedActivePersona) {
    await persistActivePersonaId();
  }
}

export async function getActivePersonaId(): Promise<string> {
  await initPersonaCache();
  activePersonaId = resolveActivePersonaId(activePersonaId);
  return activePersonaId;
}

export async function setActivePersonaId(id: string): Promise<void> {
  await ensureCacheReadyForMutation();

  activePersonaId = resolveActivePersonaId(id);
  markInitialized();
  await persistActivePersonaId();
}

export function getActivePersonaSync(): ActivePersona {
  const activePersona = personaCache.get(activePersonaId);
  if (!activePersona) {
    return BUILTIN_PERSONA;
  }

  return {
    id: activePersona.id,
    name: activePersona.name,
    prompt: activePersona.prompt,
  };
}

export function getPersonaPrompt(id: string): string | undefined {
  return personaCache.get(id)?.prompt;
}

export function resetPersonaCacheForTests(): void {
  cacheInitialized = false;
  initPromise = null;
  personaCache = new Map();
  activePersonaId = BUILTIN_PERSONA_ID;
}
