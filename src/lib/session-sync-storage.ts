import {
  getStorageDb,
  openDB,
  SETTINGS_STORE_NAME,
} from './session-storage';

export interface PendingSessionOperations {
  syncIds: Set<string>;
  deleteIds: Set<string>;
}

type StoredSetting = {
  key: string;
  value: string;
};

const SYNC_PREFIX = 'sessionCloudSync:pending-sync:';
const DELETE_PREFIX = 'sessionCloudSync:pending-delete:';

function ownerPrefix(prefix: string, ownerKey: string): string {
  return `${prefix}${encodeURIComponent(ownerKey)}:`;
}

function markerKey(prefix: string, ownerKey: string, sessionId: string): string {
  return `${ownerPrefix(prefix, ownerKey)}${encodeURIComponent(sessionId)}`;
}

function decodeSessionId(key: string, prefix: string): string | null {
  if (!key.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(key.slice(prefix.length));
  } catch {
    return null;
  }
}

async function putMarker(prefix: string, ownerKey: string, sessionId: string): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) return;
  await db.put(SETTINGS_STORE_NAME, {
    key: markerKey(prefix, ownerKey, sessionId),
    value: '1',
  } satisfies StoredSetting);
}

async function clearMarker(prefix: string, ownerKey: string, sessionId: string): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) return;
  await db.delete(SETTINGS_STORE_NAME, markerKey(prefix, ownerKey, sessionId));
}

export async function readPendingSessionOperations(
  ownerKey: string,
): Promise<PendingSessionOperations> {
  await openDB();
  const db = getStorageDb();
  if (!db) return { syncIds: new Set(), deleteIds: new Set() };

  const settings = await db.getAll(SETTINGS_STORE_NAME) as StoredSetting[];
  const syncPrefix = ownerPrefix(SYNC_PREFIX, ownerKey);
  const deletePrefix = ownerPrefix(DELETE_PREFIX, ownerKey);
  const syncIds = new Set<string>();
  const deleteIds = new Set<string>();

  for (const setting of settings) {
    const syncId = decodeSessionId(setting.key, syncPrefix);
    if (syncId !== null) {
      syncIds.add(syncId);
      continue;
    }
    const deleteId = decodeSessionId(setting.key, deletePrefix);
    if (deleteId !== null) deleteIds.add(deleteId);
  }

  return { syncIds, deleteIds };
}

export function markPendingSessionSync(ownerKey: string, sessionId: string): Promise<void> {
  return putMarker(SYNC_PREFIX, ownerKey, sessionId);
}

export function clearPendingSessionSync(ownerKey: string, sessionId: string): Promise<void> {
  return clearMarker(SYNC_PREFIX, ownerKey, sessionId);
}

export function markPendingSessionDelete(ownerKey: string, sessionId: string): Promise<void> {
  return putMarker(DELETE_PREFIX, ownerKey, sessionId);
}

export function clearPendingSessionDelete(ownerKey: string, sessionId: string): Promise<void> {
  return clearMarker(DELETE_PREFIX, ownerKey, sessionId);
}
