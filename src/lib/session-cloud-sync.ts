import type { CloudSessionRepository, Session } from '../hooks/useSessions';
import { createLatestSaveQueue } from './latest-save-queue';
import {
  clearPendingSessionDelete,
  clearPendingSessionSync,
  markPendingSessionDelete,
  markPendingSessionSync,
} from './session-sync-storage';

export type SessionSyncStatus = 'synced' | 'dirty' | 'saving' | 'offline' | 'retrying';

export interface SessionCloudSync {
  noteLocal: (session: Session) => void;
  debounce: (session: Session) => void;
  checkpoint: (session: Session) => Promise<void>;
  flush: (sessionId?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  hydrate: (
    sessions: Session[],
    pendingSyncIds: Set<string>,
    pendingDeleteIds: Set<string>,
  ) => void;
  notifyOnline: () => void;
  getStatus: (sessionId: string) => SessionSyncStatus | undefined;
  dispose: () => void;
}

interface SyncRecord {
  version: number;
  latest: Session;
  status: SessionSyncStatus;
  markerWrite?: Promise<void>;
  debounceTimer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
  retryIndex: number;
}

interface SaveEnvelope {
  id: string;
  version: number;
  session: Session;
}

interface DeleteRecord {
  retryIndex: number;
  retryTimer?: ReturnType<typeof setTimeout>;
}

interface CheckpointRun {
  version: number;
  promise: Promise<void>;
  token: symbol;
}

const MANUAL_DEBOUNCE_MS = 2000;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export function createSessionCloudSync(options: {
  ownerKey: string;
  repository: CloudSessionRepository;
  onStatus: (sessionId: string, status: SessionSyncStatus | undefined) => void;
  isOnline?: () => boolean;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): SessionCloudSync {
  const {
    ownerKey,
    repository,
    onStatus,
    isOnline = () => typeof navigator === 'undefined' || navigator.onLine,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = options;
  const expectedUserId = ownerKey.startsWith('user:')
    ? ownerKey.slice('user:'.length)
    : undefined;
  const records = new Map<string, SyncRecord>();
  const deletes = new Map<string, DeleteRecord>();
  const checkpointRuns = new Map<string, CheckpointRun>();
  let disposed = false;

  const emitStatus = (id: string, record: SyncRecord, status: SessionSyncStatus): void => {
    if (record.status === status) return;
    record.status = status;
    onStatus(id, status);
  };

  const clearRecordTimer = (
    record: SyncRecord,
    key: 'debounceTimer' | 'retryTimer',
  ): void => {
    const timer = record[key];
    if (timer !== undefined) clearTimer(timer);
    delete record[key];
  };

  const ensureDirtyMarker = (id: string, record: SyncRecord): Promise<void> => {
    if (!record.markerWrite) {
      record.markerWrite = markPendingSessionSync(ownerKey, id);
    }
    return record.markerWrite;
  };

  const markDirty = (session: Session): SyncRecord => {
    const existing = records.get(session.id);
    const record: SyncRecord = existing ?? {
      version: 0,
      latest: session,
      status: isOnline() ? 'dirty' : 'offline',
      retryIndex: 0,
    };
    record.version += 1;
    record.latest = session;
    records.set(session.id, record);
    void ensureDirtyMarker(session.id, record);
    const status = isOnline() ? 'dirty' : 'offline';
    if (existing) emitStatus(session.id, record, status);
    else onStatus(session.id, status);
    return record;
  };

  const retryDelay = (index: number): number =>
    RETRY_DELAYS_MS[Math.min(index, RETRY_DELAYS_MS.length - 1)];

  const scheduleSaveRetry = (id: string, immediate = false): void => {
    if (disposed) return;
    const record = records.get(id);
    if (!record || record.retryTimer !== undefined) return;
    if (!isOnline()) {
      emitStatus(id, record, 'offline');
      return;
    }
    const delay = immediate ? 0 : retryDelay(record.retryIndex++);
    record.retryTimer = setTimer(() => {
      delete record.retryTimer;
      void checkpoint(record.latest);
    }, delay);
  };

  const saveEnvelope = async (envelope: SaveEnvelope): Promise<void> => {
    const beforeSave = records.get(envelope.id);
    if (beforeSave?.version === envelope.version) {
      emitStatus(envelope.id, beforeSave, 'saving');
    }

    await repository.saveSession(envelope.session, expectedUserId);

    const record = records.get(envelope.id);
    if (!record) return;
    record.retryIndex = 0;
    clearRecordTimer(record, 'retryTimer');
    if (record.version !== envelope.version) {
      emitStatus(envelope.id, record, isOnline() ? 'dirty' : 'offline');
      return;
    }

    await record.markerWrite;
    await clearPendingSessionSync(ownerKey, envelope.id);

    if (record.version === envelope.version) {
      record.markerWrite = undefined;
      emitStatus(envelope.id, record, 'synced');
      return;
    }

    record.markerWrite = markPendingSessionSync(ownerKey, envelope.id);
    emitStatus(envelope.id, record, isOnline() ? 'dirty' : 'offline');
  };

  const queue = createLatestSaveQueue(saveEnvelope, (_error, envelope) => {
    const record = records.get(envelope.id);
    if (!record) return;
    emitStatus(envelope.id, record, isOnline() ? 'retrying' : 'offline');
    scheduleSaveRetry(envelope.id);
  });

  const checkpoint = (session: Session): Promise<void> => {
    if (disposed) return Promise.resolve();
    let record = records.get(session.id);
    if (!record || record.latest !== session) record = markDirty(session);
    clearRecordTimer(record, 'debounceTimer');
    clearRecordTimer(record, 'retryTimer');
    if (!isOnline()) {
      emitStatus(session.id, record, 'offline');
      return Promise.resolve();
    }

    const existingRun = checkpointRuns.get(session.id);
    if (existingRun?.version === record.version) return existingRun.promise;

    const version = record.version;
    const token = Symbol('checkpoint');
    const promise = (async () => {
      try {
        await ensureDirtyMarker(session.id, record);
        await queue.enqueue({
          id: session.id,
          version,
          session: record.latest,
        });
      } catch {
        // The queue callback records retry/offline state. Creative flows keep
        // their local result; explicit flush() is the strict error surface.
      } finally {
        if (checkpointRuns.get(session.id)?.token === token) {
          checkpointRuns.delete(session.id);
        }
      }
    })();
    checkpointRuns.set(session.id, { version, promise, token });
    return promise;
  };

  const debounce = (session: Session): void => {
    if (disposed) return;
    const record = markDirty(session);
    clearRecordTimer(record, 'debounceTimer');
    record.debounceTimer = setTimer(() => {
      delete record.debounceTimer;
      void checkpoint(record.latest);
    }, MANUAL_DEBOUNCE_MS);
  };

  const noteLocal = (session: Session): void => {
    if (disposed) return;
    markDirty(session);
  };

  const flushOne = async (id: string): Promise<void> => {
    const record = records.get(id);
    if (!record || record.status === 'synced') return;
    clearRecordTimer(record, 'debounceTimer');
    clearRecordTimer(record, 'retryTimer');
    if (!isOnline()) {
      emitStatus(id, record, 'offline');
      throw new Error('Session cloud sync is offline');
    }
    await ensureDirtyMarker(id, record);
    const run = queue.enqueue({
      id,
      version: record.version,
      session: record.latest,
    });
    await run;
    await queue.flush(id);
  };

  const flush = async (sessionId?: string): Promise<void> => {
    const ids = sessionId
      ? [sessionId]
      : [...records.entries()]
        .filter(([, record]) => record.status !== 'synced')
        .map(([id]) => id);
    const results = await Promise.allSettled(ids.map(flushOne));
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  };

  const clearDeleteTimer = (record: DeleteRecord): void => {
    if (record.retryTimer !== undefined) clearTimer(record.retryTimer);
    delete record.retryTimer;
  };

  const scheduleDeleteRetry = (id: string, immediate = false): void => {
    if (disposed) return;
    const record = deletes.get(id);
    if (!record || record.retryTimer !== undefined || !isOnline()) return;
    const delay = immediate ? 0 : retryDelay(record.retryIndex++);
    record.retryTimer = setTimer(() => {
      delete record.retryTimer;
      void attemptDelete(id);
    }, delay);
  };

  const attemptDelete = async (id: string): Promise<void> => {
    const record = deletes.get(id);
    if (!record || disposed) return;
    if (!isOnline()) return;
    try {
      await repository.deleteSession(id, expectedUserId);
      clearDeleteTimer(record);
      await clearPendingSessionDelete(ownerKey, id);
      deletes.delete(id);
    } catch {
      scheduleDeleteRetry(id);
    }
  };

  const deleteSession = async (id: string): Promise<void> => {
    if (disposed) return;
    await markPendingSessionDelete(ownerKey, id);
    const deleteRecord = deletes.get(id) ?? { retryIndex: 0 };
    deletes.set(id, deleteRecord);

    const record = records.get(id);
    if (record) {
      clearRecordTimer(record, 'debounceTimer');
      clearRecordTimer(record, 'retryTimer');
    }
    records.delete(id);
    onStatus(id, undefined);
    await clearPendingSessionSync(ownerKey, id);
    await queue.discard(id);
    await attemptDelete(id);
  };

  const hydrate = (
    sessions: Session[],
    pendingSyncIds: Set<string>,
    pendingDeleteIds: Set<string>,
  ): void => {
    if (disposed) return;
    for (const session of sessions) {
      const pending = pendingSyncIds.has(session.id);
      const record: SyncRecord = {
        version: pending ? 1 : 0,
        latest: session,
        status: pending ? (isOnline() ? 'dirty' : 'offline') : 'synced',
        markerWrite: pending ? Promise.resolve() : undefined,
        retryIndex: 0,
      };
      records.set(session.id, record);
      onStatus(session.id, record.status);
      if (pending && isOnline()) scheduleSaveRetry(session.id, true);
    }
    for (const id of pendingDeleteIds) {
      deletes.set(id, { retryIndex: 0 });
      if (isOnline()) scheduleDeleteRetry(id, true);
    }
  };

  const notifyOnline = (): void => {
    if (disposed || !isOnline()) return;
    for (const [id, record] of records) {
      if (record.status === 'dirty' || record.status === 'offline' || record.status === 'retrying') {
        scheduleSaveRetry(id, true);
      }
    }
    for (const id of deletes.keys()) scheduleDeleteRetry(id, true);
  };

  const dispose = (): void => {
    disposed = true;
    for (const record of records.values()) {
      clearRecordTimer(record, 'debounceTimer');
      clearRecordTimer(record, 'retryTimer');
    }
    for (const record of deletes.values()) clearDeleteTimer(record);
  };

  return {
    noteLocal,
    debounce,
    checkpoint,
    flush,
    deleteSession,
    hydrate,
    notifyOnline,
    getStatus: (id) => records.get(id)?.status,
    dispose,
  };
}
