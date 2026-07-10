import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';

const DB_NAME = 'oddenova-db';
const DB_VERSION = 2;
const LEGACY_STORE_NAME = 'sessions';
const STORE_NAME = 'sessions_by_owner';
export const GUEST_OWNER_KEY = 'guest';

// localStorage keys for one-time migration
const LS_SESSIONS_KEY = 'vibe-sessions-v1';
const LS_CURRENT_KEY = 'vibe-sessions-current-v1';

let db: IDBPDatabase | null = null;
let memoryFallback = false;
let openPromise: Promise<void> | null = null;

export async function openDB(): Promise<void> {
  if (db || memoryFallback) return;
  if (openPromise) return openPromise;

  openPromise = (async () => {
    try {
      db = await idbOpenDB(DB_NAME, DB_VERSION, {
        upgrade(database, oldVersion, _newVersion, transaction) {
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: ['ownerKey', 'id'] });
          }

          if (oldVersion < 2 && database.objectStoreNames.contains(LEGACY_STORE_NAME)) {
            const legacyStore = transaction.objectStore(LEGACY_STORE_NAME);
            const nextStore = transaction.objectStore(STORE_NAME);
            void legacyStore.getAll().then((sessions) => Promise.all(
              (sessions as StoredSession[]).map((session) =>
                nextStore.put(withOwner(stripOwner(session), session.ownerKey ?? GUEST_OWNER_KEY))
              )
            ));
          }
        },
      });
      await migrateFromLocalStorage();
    } catch (err) {
      console.warn('[session-storage] IndexedDB unavailable, falling back to memory mode.', err);
      memoryFallback = true;
    } finally {
      openPromise = null;
    }
  })();

  return openPromise;
}

async function migrateFromLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
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
    await Promise.all(sessions.map((s) => tx.store.put(withOwner(s, GUEST_OWNER_KEY))));
    await tx.done;
    // Only clear localStorage after successful write
    localStorage.removeItem(LS_SESSIONS_KEY);
    localStorage.removeItem(LS_CURRENT_KEY);
  } catch (err) {
    console.warn('[session-storage] Migration from localStorage failed, will retry next launch.', err);
  }
}

type StoredSession = Session & { ownerKey?: string };

function withOwner(session: Session, ownerKey: string): StoredSession {
  return { ...session, ownerKey };
}

function matchesOwner(session: StoredSession, ownerKey: string): boolean {
  return (session.ownerKey ?? GUEST_OWNER_KEY) === ownerKey;
}

function stripOwner(session: StoredSession): Session {
  // Keep the persisted owner marker out of the app-level Session shape.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ownerKey, ...clean } = session;
  return clean;
}

export async function getAllSessions(ownerKey = GUEST_OWNER_KEY): Promise<Session[]> {
  await openDB();
  if (memoryFallback || !db) return [];
  try {
    const all = (await db.getAll(STORE_NAME)) as StoredSession[];
    return all
      .filter((s) => matchesOwner(s, ownerKey))
      .map(stripOwner)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function putSession(session: Session, ownerKey = GUEST_OWNER_KEY): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  try {
    await db.put(STORE_NAME, withOwner(session, ownerKey));
  } catch (err) {
    console.warn('[session-storage] putSession failed', err);
  }
}

export async function deleteSession(id: string, ownerKey = GUEST_OWNER_KEY): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  try {
    const existing = await db.get(STORE_NAME, [ownerKey, id]) as StoredSession | undefined;
    if (existing && !matchesOwner(existing, ownerKey)) return;
    await db.delete(STORE_NAME, [ownerKey, id]);
  } catch (err) {
    console.warn('[session-storage] deleteSession failed', err);
  }
}
