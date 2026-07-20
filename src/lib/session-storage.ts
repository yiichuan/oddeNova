import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';

export const DB_NAME = 'oddenova-db';
export const DB_VERSION = 3;
const LEGACY_SESSION_STORE_NAME = 'sessions';
export const SESSION_STORE_NAME = 'sessions_by_owner';
export const PERSONA_STORE_NAME = 'personas';
export const SETTINGS_STORE_NAME = 'settings';
export const GUEST_OWNER_KEY = 'guest';

// localStorage keys for one-time migration
const LS_SESSIONS_KEY = 'vibe-sessions-v1';
const LS_CURRENT_KEY = 'vibe-sessions-current-v1';

let db: IDBPDatabase | null = null;
let memoryFallback = false;
let openPromise: Promise<void> | null = null;

type StoredSession = Session & { ownerKey?: string; mode?: unknown };
type StoredSetting = {
  key: string;
  value: string;
};

function currentSessionSettingKey(ownerKey: string): string {
  return `currentSessionId:${ownerKey}`;
}

export function normalizeSession(session: StoredSession): Session {
  const { mode: _ignoredMode, ownerKey: _ignoredOwner, ...normalized } = session;
  return normalized;
}

function withOwner(session: Session, ownerKey: string): StoredSession {
  return { ...session, ownerKey };
}

function matchesOwner(session: StoredSession, ownerKey: string): boolean {
  return (session.ownerKey ?? GUEST_OWNER_KEY) === ownerKey;
}

export function getStorageDb(): IDBPDatabase | null {
  return memoryFallback ? null : db;
}

export function isSessionStoragePersistent(): boolean {
  return !memoryFallback && db !== null;
}

export async function openDB(): Promise<void> {
  if (db || memoryFallback) return;
  if (openPromise) return openPromise;

  openPromise = (async () => {
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
        upgrade(database, _oldVersion, _newVersion, transaction) {
          if (!database.objectStoreNames.contains(SESSION_STORE_NAME)) {
            database.createObjectStore(SESSION_STORE_NAME, { keyPath: ['ownerKey', 'id'] });
          }
          if (!database.objectStoreNames.contains(PERSONA_STORE_NAME)) {
            database.createObjectStore(PERSONA_STORE_NAME, { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
            database.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
          }

          // Both parent branches shipped a v2 database: the account branch used
          // sessions_by_owner, while NOVA-90 used sessions. Migrate the latter
          // into the guest namespace when upgrading either shape to v3.
          if (database.objectStoreNames.contains(LEGACY_SESSION_STORE_NAME)) {
            const legacyStore = transaction.objectStore(LEGACY_SESSION_STORE_NAME);
            const nextStore = transaction.objectStore(SESSION_STORE_NAME);
            void legacyStore.getAll().then((sessions) => Promise.all(
              (sessions as StoredSession[]).map((session) =>
                nextStore.put(withOwner(normalizeSession(session), session.ownerKey ?? GUEST_OWNER_KEY))
              )
            ));
          }
        },
      });
      memoryFallback = false;
      await migrateFromLocalStorage();
    } catch (err) {
      console.warn('[session-storage] IndexedDB unavailable, falling back to memory mode.', err);
      db = null;
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
    const parsed = JSON.parse(raw) as StoredSession[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(LS_SESSIONS_KEY);
      localStorage.removeItem(LS_CURRENT_KEY);
      return;
    }
    const sessions = parsed.map(normalizeSession);
    const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
    await Promise.all(sessions.map((session) =>
      tx.store.put(withOwner(session, GUEST_OWNER_KEY))
    ));
    await tx.done;
    // Only clear localStorage after successful write
    localStorage.removeItem(LS_SESSIONS_KEY);
    localStorage.removeItem(LS_CURRENT_KEY);
  } catch (err) {
    console.warn('[session-storage] Migration from localStorage failed, will retry next launch.', err);
  }
}

export async function getAllSessions(ownerKey = GUEST_OWNER_KEY): Promise<Session[]> {
  await openDB();
  if (memoryFallback || !db) return [];
  try {
    const all = (await db.getAll(SESSION_STORE_NAME)) as StoredSession[];
    return all
      .filter((session) => matchesOwner(session, ownerKey))
      .map(normalizeSession)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function putSession(
  session: Session,
  ownerKey = GUEST_OWNER_KEY,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  try {
    await db.put(SESSION_STORE_NAME, withOwner(session, ownerKey));
  } catch (err) {
    console.warn('[session-storage] putSession failed', err);
  }
}

export async function getCurrentSessionId(
  ownerKey = GUEST_OWNER_KEY,
): Promise<string | null> {
  await openDB();
  if (memoryFallback || !db) return null;
  try {
    const setting = await db.get(
      SETTINGS_STORE_NAME,
      currentSessionSettingKey(ownerKey),
    ) as StoredSetting | undefined;
    return setting?.value || null;
  } catch {
    return null;
  }
}

export async function putCurrentSessionId(
  sessionId: string,
  ownerKey = GUEST_OWNER_KEY,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  try {
    await db.put(SETTINGS_STORE_NAME, {
      key: currentSessionSettingKey(ownerKey),
      value: sessionId,
    } satisfies StoredSetting);
  } catch (err) {
    console.warn('[session-storage] putCurrentSessionId failed', err);
  }
}

export async function putImportedSession(
  session: Session,
  ownerKey = GUEST_OWNER_KEY,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  await db.put(SESSION_STORE_NAME, withOwner(session, ownerKey));
}

export async function putImportedSessionBranch(
  detached: Session,
  branch: Session,
  ownerKey = GUEST_OWNER_KEY,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
  await Promise.all([
    tx.store.put(withOwner(detached, ownerKey)),
    tx.store.put(withOwner(branch, ownerKey)),
    tx.done,
  ]);
}

export async function deleteSession(
  id: string,
  ownerKey = GUEST_OWNER_KEY,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  try {
    await db.delete(SESSION_STORE_NAME, [ownerKey, id]);
  } catch (err) {
    console.warn('[session-storage] deleteSession failed', err);
  }
}
