import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';

export const DB_NAME = 'oddenova-db';
export const DB_VERSION = 2;
export const SESSION_STORE_NAME = 'sessions';
export const PERSONA_STORE_NAME = 'personas';
export const SETTINGS_STORE_NAME = 'settings';

// localStorage keys for one-time migration
const LS_SESSIONS_KEY = 'vibe-sessions-v1';
const LS_CURRENT_KEY = 'vibe-sessions-current-v1';

let db: IDBPDatabase | null = null;
let memoryFallback = false;

type StoredSession = Session & { mode?: unknown };
type StoredSetting = {
  key: string;
  value: string;
};

const CURRENT_SESSION_SETTING_KEY = 'currentSessionId';

export function normalizeSession(session: StoredSession): Session {
  const { mode: _ignored, ...normalized } = session;
  return normalized;
}

export function getStorageDb(): IDBPDatabase | null {
  return memoryFallback ? null : db;
}

export function isSessionStoragePersistent(): boolean {
  return !memoryFallback && db !== null;
}

export async function openDB(): Promise<void> {
  // Ask the browser not to evict this data under storage pressure. Without
  // this, IndexedDB is "best-effort" and can be cleared without warning even
  // though the object stores get silently recreated empty on next open,
  // making data loss look like the site just "forgot everything". This is
  // best-effort itself: a missing `navigator` (SSR/tests) or a rejected
  // persist() request (unsupported/denied) must not prevent the actual
  // IndexedDB connection below from being attempted.
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch (err) {
    console.warn('[session-storage] storage.persist() request failed', err);
  }

  try {
    db = await idbOpenDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(SESSION_STORE_NAME)) {
          database.createObjectStore(SESSION_STORE_NAME, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(PERSONA_STORE_NAME)) {
          database.createObjectStore(PERSONA_STORE_NAME, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
          database.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
        }
      },
    });
    memoryFallback = false;
    await migrateFromLocalStorage();
  } catch (err) {
    console.warn('[session-storage] IndexedDB unavailable, falling back to memory mode.', err);
    db = null;
    memoryFallback = true;
  }
}

async function migrateFromLocalStorage(): Promise<void> {
  const raw = localStorage.getItem(LS_SESSIONS_KEY);
  if (!raw || !db) return;
  try {
    const parsed = JSON.parse(raw) as StoredSession[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(LS_SESSIONS_KEY);
      localStorage.removeItem(LS_CURRENT_KEY);
      return;
    }
    const sessions = parsed.map(normalizeSession);
    const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
    await Promise.all(sessions.map((s) => tx.store.put(s)));
    await tx.done;
    // Only clear localStorage after successful write
    localStorage.removeItem(LS_SESSIONS_KEY);
    localStorage.removeItem(LS_CURRENT_KEY);
  } catch (err) {
    console.warn('[session-storage] Migration from localStorage failed, will retry next launch.', err);
  }
}

export async function getAllSessions(): Promise<Session[]> {
  if (memoryFallback || !db) return [];
  try {
    const all = ((await db.getAll(SESSION_STORE_NAME)) as StoredSession[]).map(normalizeSession);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function putSession(session: Session): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.put(SESSION_STORE_NAME, session);
  } catch (err) {
    console.warn('[session-storage] putSession failed', err);
  }
}

export async function getCurrentSessionId(): Promise<string | null> {
  if (memoryFallback || !db) return null;
  try {
    const setting = await db.get(SETTINGS_STORE_NAME, CURRENT_SESSION_SETTING_KEY) as StoredSetting | undefined;
    return setting?.value || null;
  } catch {
    return null;
  }
}

export async function putCurrentSessionId(sessionId: string): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.put(SETTINGS_STORE_NAME, {
      key: CURRENT_SESSION_SETTING_KEY,
      value: sessionId,
    } satisfies StoredSetting);
  } catch (err) {
    console.warn('[session-storage] putCurrentSessionId failed', err);
  }
}

export async function putImportedSession(session: Session): Promise<void> {
  if (memoryFallback || !db) return;
  await db.put(SESSION_STORE_NAME, session);
}

export async function putImportedSessionBranch(detached: Session, branch: Session): Promise<void> {
  if (memoryFallback || !db) return;
  const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
  await Promise.all([tx.store.put(detached), tx.store.put(branch), tx.done]);
}

export async function deleteSession(id: string): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.delete(SESSION_STORE_NAME, id);
  } catch (err) {
    console.warn('[session-storage] deleteSession failed', err);
  }
}
