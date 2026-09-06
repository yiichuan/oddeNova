import {
  getStorageDb,
  openDB,
  SETTINGS_STORE_NAME,
} from './session-storage';
import {
  decodePendingSessionId,
  pendingSessionMarkerKey,
} from './session-sync-keys';

export interface PendingSessionOperations {
  syncIds: Set<string>;
  deleteIds: Set<string>;
}

type StoredSetting = {
  key: string;
  value: string;
};

async function putMarker(
  operation: 'sync' | 'delete',
  ownerKey: string,
  sessionId: string,
): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) return;
  await db.put(SETTINGS_STORE_NAME, {
    key: pendingSessionMarkerKey(operation, ownerKey, sessionId),
    value: '1',
  } satisfies StoredSetting);
}

async function clearMarker(
  operation: 'sync' | 'delete',
  ownerKey: string,
  sessionId: string,
): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) return;
  await db.delete(SETTINGS_STORE_NAME, pendingSessionMarkerKey(operation, ownerKey, sessionId));
}

export async function readPendingSessionOperations(
  ownerKey: string,
): Promise<PendingSessionOperations> {
  await openDB();
  const db = getStorageDb();
  if (!db) return { syncIds: new Set(), deleteIds: new Set() };

  const settings = await db.getAll(SETTINGS_STORE_NAME) as StoredSetting[];
  const syncIds = new Set<string>();
  const deleteIds = new Set<string>();

  for (const setting of settings) {
    const syncId = decodePendingSessionId(setting.key, 'sync', ownerKey);
    if (syncId !== null) {
      syncIds.add(syncId);
      continue;
    }
    const deleteId = decodePendingSessionId(setting.key, 'delete', ownerKey);
    if (deleteId !== null) deleteIds.add(deleteId);
  }

  return { syncIds, deleteIds };
}

export function markPendingSessionSync(ownerKey: string, sessionId: string): Promise<void> {
  return putMarker('sync', ownerKey, sessionId);
}

export function clearPendingSessionSync(ownerKey: string, sessionId: string): Promise<void> {
  return clearMarker('sync', ownerKey, sessionId);
}

export function markPendingSessionDelete(ownerKey: string, sessionId: string): Promise<void> {
  return putMarker('delete', ownerKey, sessionId);
}

export function clearPendingSessionDelete(ownerKey: string, sessionId: string): Promise<void> {
  return clearMarker('delete', ownerKey, sessionId);
}
