export type PendingSessionOperation = 'sync' | 'delete';

const PREFIXES: Record<PendingSessionOperation, string> = {
  sync: 'sessionCloudSync:pending-sync:',
  delete: 'sessionCloudSync:pending-delete:',
};

export function pendingSessionOwnerPrefix(
  operation: PendingSessionOperation,
  ownerKey: string,
): string {
  return `${PREFIXES[operation]}${encodeURIComponent(ownerKey)}:`;
}

export function pendingSessionMarkerKey(
  operation: PendingSessionOperation,
  ownerKey: string,
  sessionId: string,
): string {
  return `${pendingSessionOwnerPrefix(operation, ownerKey)}${encodeURIComponent(sessionId)}`;
}

export function decodePendingSessionId(
  key: string,
  operation: PendingSessionOperation,
  ownerKey: string,
): string | null {
  const prefix = pendingSessionOwnerPrefix(operation, ownerKey);
  if (!key.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(key.slice(prefix.length));
  } catch {
    return null;
  }
}
