import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';

const DB_NAME = 'oddenova-db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

// localStorage keys for one-time migration
const LS_SESSIONS_KEY = 'vibe-sessions-v1';
const LS_CURRENT_KEY = 'vibe-sessions-current-v1';

let db: IDBPDatabase | null = null;
let memoryFallback = false;

export async function openDB(): Promise<void> {
  try {
    db = await idbOpenDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
    await migrateFromLocalStorage();
  } catch (err) {
    console.warn('[session-storage] IndexedDB unavailable, falling back to memory mode.', err);
    memoryFallback = true;
  }
}

async function migrateFromLocalStorage(): Promise<void> {
  const raw = localStorage.getItem(LS_SESSIONS_KEY);
  if (!raw || !db) return;
  try {
    const sessions = JSON.parse(raw) as Session[];
    if (!Array.isArray(sessions) || sessions.length === 0) {
      localStorage.removeItem(LS_SESSIONS_KEY);
      localStorage.removeItem(LS_CURRENT_KEY);
      return;
    }
    const tx = db.transaction(STORE_NAME, 'readwrite');
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
    const all = (await db.getAll(STORE_NAME)) as Session[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function putSession(session: Session): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.put(STORE_NAME, session);
  } catch (err) {
    console.warn('[session-storage] putSession failed', err);
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.delete(STORE_NAME, id);
  } catch (err) {
    console.warn('[session-storage] deleteSession failed', err);
  }
}
