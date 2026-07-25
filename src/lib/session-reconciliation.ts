import type { Session } from '../hooks/useSessions';
import type { PendingSessionOperations } from './session-sync-storage';

export function reconcileSessions(
  local: Session[],
  remote: Session[],
  pending: PendingSessionOperations,
): Session[] {
  const localById = new Map(local.map((session) => [session.id, session]));
  const remoteById = new Map(remote.map((session) => [session.id, session]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  return [...ids]
    .flatMap((id) => {
      if (pending.deleteIds.has(id)) return [];

      const localSession = localById.get(id);
      const remoteSession = remoteById.get(id);

      if (pending.syncIds.has(id) && localSession) return [localSession];
      if (!localSession) return remoteSession ? [remoteSession] : [];
      if (!remoteSession) return [localSession];
      return [remoteSession.updatedAt > localSession.updatedAt ? remoteSession : localSession];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
