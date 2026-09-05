import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';
import { isStepwiseChoice } from '../services/suggestions';
import {
  decodePendingSessionId,
  pendingSessionMarkerKey,
} from './session-sync-keys';

export const DB_NAME = 'oddenova-db';
export const DB_VERSION = 5;
const LEGACY_SESSION_STORE_NAME = 'sessions';
const LEGACY_FAVORITE_STORE_NAME = 'favorites_by_owner';
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
const guestNormalizationInFlight = new Map<string, Promise<Session>>();

type StoredSession = Session & { ownerKey?: string; mode?: unknown; tokenStats?: unknown };
type StoredSetting = {
  key: string;
  value: string;
};

function currentSessionSettingKey(ownerKey: string): string {
  return `currentSessionId:${ownerKey}`;
}

export function normalizeSession(session: StoredSession): Session {
  const {
    mode: _ignoredMode,
    ownerKey: _ignoredOwner,
    tokenStats: _ignoredTokenStats,
    ...normalized
  } = session;
  const failedRevisionIds = new Set(
    normalized.revisions
      ?.filter((revision) => revision.playbackStatus === 'failed')
      .map((revision) => revision.id) ?? [],
  );
  const messages = normalized.messages.map((message) => {
    if (
      message.role !== 'assistant'
      || !message.code
      || message.inputMode !== undefined
      || (message.revisionId !== undefined && failedRevisionIds.has(message.revisionId))
    ) {
      return message;
    }
    return {
      ...message,
      inputMode: isStepwiseChoice(message.content) ? 'choice' as const : 'normal' as const,
    };
  });
  const inferredInputMode = [...messages].reverse().find(
    (message) => message.role === 'assistant' && message.inputMode !== undefined,
  )?.inputMode;

  return inferredInputMode === undefined
    ? normalized
    : { ...normalized, messages, inputMode: normalized.inputMode ?? inferredInputMode };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID is unavailable');
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
          // Favorites used to be stored as duplicated snapshots. They now live
          // on the session row, so discard the obsolete store when upgrading a
          // database that still has it. No legacy snapshot is imported: the
          // feature was not released with durable local favorites.
          if (database.objectStoreNames.contains(LEGACY_FAVORITE_STORE_NAME)) {
            database.deleteObjectStore(LEGACY_FAVORITE_STORE_NAME);
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
    if (ownerKey !== GUEST_OWNER_KEY) {
      await migrateLegacyAccountSessionIds(ownerKey);
    }
    const all = (await db.getAll(SESSION_STORE_NAME)) as StoredSession[];
    const owned = all.filter((session) => matchesOwner(session, ownerKey));
    const normalized = owned
      .map(normalizeSession)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const legacyRows = owned.filter((session) =>
      Object.prototype.hasOwnProperty.call(session, 'tokenStats'),
    );
    if (legacyRows.length > 0) {
      try {
        const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
        await Promise.all(legacyRows.map((session) => {
          const clean = normalizeSession(session);
          return tx.store.put(withOwner(clean, session.ownerKey ?? ownerKey));
        }));
        await tx.done;
      } catch (err) {
        console.warn('[session-storage] legacy tokenStats cleanup failed', err);
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

async function migrateLegacyAccountSessionIds(ownerKey: string): Promise<void> {
  if (!db) return;

  const tx = db.transaction([SESSION_STORE_NAME, SETTINGS_STORE_NAME], 'readwrite');
  const sessions = tx.objectStore(SESSION_STORE_NAME);
  const settings = tx.objectStore(SETTINGS_STORE_NAME);
  const all = await sessions.getAll() as StoredSession[];
  const legacySessions = all.filter(
    (session) => matchesOwner(session, ownerKey) && !isUuid(session.id),
  );

  const currentKey = currentSessionSettingKey(ownerKey);
  const current = legacySessions.length > 0
    ? await settings.get(currentKey) as StoredSetting | undefined
    : undefined;

  for (const legacy of legacySessions) {
    const migrated = { ...normalizeSession(legacy), id: randomUuid() };
    await sessions.put(withOwner(migrated, ownerKey));

    if (current?.value === legacy.id) {
      await settings.put({ key: currentKey, value: migrated.id } satisfies StoredSetting);
    }

    for (const operation of ['sync', 'delete'] as const) {
      const oldMarkerKey = pendingSessionMarkerKey(operation, ownerKey, legacy.id);
      const marker = await settings.get(oldMarkerKey) as StoredSetting | undefined;
      if (marker) {
        await settings.put({
          ...marker,
          key: pendingSessionMarkerKey(operation, ownerKey, migrated.id),
        });
        await settings.delete(oldMarkerKey);
      }
    }

    await sessions.delete([ownerKey, legacy.id]);
  }

  const remainingSettings = await settings.getAll() as StoredSetting[];
  for (const setting of remainingSettings) {
    for (const operation of ['sync', 'delete'] as const) {
      const sessionId = decodePendingSessionId(setting.key, operation, ownerKey);
      if (sessionId !== null && !isUuid(sessionId)) {
        await settings.delete(setting.key);
        break;
      }
    }
  }

  await tx.done;
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

/**
 * One session by id, as this device last held it. The cloud library reads it
 * before going to the network so a conversation this device has already seen
 * opens on what it has rather than on a round trip.
 */
export async function getSession(
  id: string,
  ownerKey = GUEST_OWNER_KEY,
): Promise<Session | null> {
  await openDB();
  if (memoryFallback || !db) return null;
  try {
    const stored = await db.get(SESSION_STORE_NAME, [ownerKey, id]) as StoredSession | undefined;
    return stored ? normalizeSession(stored) : null;
  } catch {
    return null;
  }
}

export async function readSetting(key: string): Promise<string | null> {
  await openDB();
  if (memoryFallback || !db) return null;
  try {
    const setting = await db.get(SETTINGS_STORE_NAME, key) as StoredSetting | undefined;
    return setting?.value ?? null;
  } catch {
    return null;
  }
}

export async function writeSetting(key: string, value: string): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  try {
    await db.put(SETTINGS_STORE_NAME, { key, value } satisfies StoredSetting);
  } catch (err) {
    console.warn('[session-storage] writeSetting failed', err);
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

/**
 * Move a legacy guest session to its UUID key immediately before account
 * import. The write, current-session pointer update, and old-key deletion are
 * one IndexedDB transaction so a retry sees the same normalized UUID source.
 */
async function moveLegacyGuestSessionToUuid(session: Session): Promise<Session> {
  const normalized = { ...session, id: randomUuid() };
  await openDB();
  if (memoryFallback || !db) return normalized;

  const tx = db.transaction([SESSION_STORE_NAME, SETTINGS_STORE_NAME], 'readwrite');
  const sessions = tx.objectStore(SESSION_STORE_NAME);
  const settings = tx.objectStore(SETTINGS_STORE_NAME);
  const current = await settings.get(currentSessionSettingKey(GUEST_OWNER_KEY)) as StoredSetting | undefined;
  await sessions.put(withOwner(normalized, GUEST_OWNER_KEY));
  if (current?.value === session.id) {
    await settings.put({
      key: currentSessionSettingKey(GUEST_OWNER_KEY),
      value: normalized.id,
    } satisfies StoredSetting);
  }
  await sessions.delete([GUEST_OWNER_KEY, session.id]);
  await tx.done;
  return normalized;
}

export function normalizeGuestSessionForImport(session: Session): Promise<Session> {
  if (isUuid(session.id)) return Promise.resolve(session);

  const existing = guestNormalizationInFlight.get(session.id);
  if (existing) return existing;

  const pendingRef: { promise?: Promise<Session> } = {};
  const pending = moveLegacyGuestSessionToUuid(session).finally(() => {
    if (guestNormalizationInFlight.get(session.id) === pendingRef.promise) {
      guestNormalizationInFlight.delete(session.id);
    }
  });
  pendingRef.promise = pending;
  guestNormalizationInFlight.set(session.id, pending);
  return pending;
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
  try {
    await deleteSessionStrict(id, ownerKey);
  } catch (err) {
    console.warn('[session-storage] deleteSession failed', err);
  }
}

export async function deleteSessionStrict(
  id: string,
  ownerKey = GUEST_OWNER_KEY,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) return;
  await db.delete(SESSION_STORE_NAME, [ownerKey, id]);
}
