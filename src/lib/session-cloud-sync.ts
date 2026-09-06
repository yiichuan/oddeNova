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
  deleteSession: (
    sessionId: string,
    deleteLocal?: () => Promise<void>,
  ) => Promise<void>;
  /**
   * Take a cloud read as the synced truth for one session. Refused — `false`,
   * with nothing changed — while the working copy holds writes the cloud has
   * not got yet: a background revalidation must never overwrite those.
   */
  acceptCloudSession: (session: Session) => boolean;
  hydrate: (
    sessions: Session[],
    pendingSyncIds: Set<string>,
    pendingDeleteIds: Set<string>,
    cloudSessionIds?: Set<string>,
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
  markerRetryTimer?: ReturnType<typeof setTimeout>;
  retryIndex: number;
  markerRetryIndex: number;
  hasCloudCopy: boolean;
  saveRequested: boolean;
}

interface SaveEnvelope {
  id: string;
  version: number;
  session: Session;
}

interface DeleteRecord {
  retryIndex: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  deleteLocal?: () => Promise<void>;
  markerWritten: boolean;
  syncDiscarded: boolean;
  localDeleted: boolean;
}

interface CheckpointRun {
  version: number;
  promise: Promise<void>;
  token: symbol;
}

const MANUAL_DEBOUNCE_MS = 2000;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

function isEffectivelyEmpty(session: Session): boolean {
  return !session.code && session.messages.every((message) => message.isGreeting === true);
}

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
    key: 'debounceTimer' | 'retryTimer' | 'markerRetryTimer',
  ): void => {
    const timer = record[key];
    if (timer !== undefined) clearTimer(timer);
    delete record[key];
  };

  const ensureDirtyMarker = (id: string, record: SyncRecord): Promise<void> => {
    if (!record.markerWrite) {
      const markerWrite = markPendingSessionSync(ownerKey, id);
      record.markerWrite = markerWrite;
      void markerWrite.catch(() => {
        if (record.markerWrite === markerWrite) record.markerWrite = undefined;
      });
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
      markerRetryIndex: 0,
      hasCloudCopy: false,
      saveRequested: false,
    };
    record.version += 1;
    record.latest = session;
    record.saveRequested = false;
    clearRecordTimer(record, 'retryTimer');
    records.set(session.id, record);
    void ensureDirtyMarker(session.id, record)
      .then(() => {
        record.markerRetryIndex = 0;
        clearRecordTimer(record, 'markerRetryTimer');
      })
      .catch(() => {
        if (disposed || records.get(session.id) !== record) return;
        emitStatus(session.id, record, isOnline() ? 'retrying' : 'offline');
        scheduleMarkerRetry(session.id);
      });
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
    if (!record || !record.saveRequested || record.retryTimer !== undefined) return;
    if (!isOnline()) {
      emitStatus(id, record, 'offline');
      return;
    }
    const delay = immediate ? 0 : retryDelay(record.retryIndex++);
    const requestedVersion = record.version;
    record.retryTimer = setTimer(() => {
      delete record.retryTimer;
      if (!record.saveRequested || record.version !== requestedVersion) return;
      void checkpoint(record.latest).catch(() => undefined);
    }, delay);
  };

  const scheduleMarkerRetry = (id: string, immediate = false): void => {
    if (disposed) return;
    const record = records.get(id);
    if (!record || record.markerRetryTimer !== undefined) return;
    if (!isOnline()) {
      emitStatus(id, record, 'offline');
      return;
    }
    const delay = immediate ? 0 : retryDelay(record.markerRetryIndex++);
    record.markerRetryTimer = setTimer(() => {
      delete record.markerRetryTimer;
      void ensureDirtyMarker(id, record)
        .then(() => {
          record.markerRetryIndex = 0;
          emitStatus(id, record, record.saveRequested ? 'retrying' : 'dirty');
          if (record.saveRequested) scheduleSaveRetry(id, true);
        })
        .catch(() => {
          emitStatus(id, record, isOnline() ? 'retrying' : 'offline');
          scheduleMarkerRetry(id);
        });
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
    record.markerRetryIndex = 0;
    record.hasCloudCopy = true;
    clearRecordTimer(record, 'retryTimer');
    clearRecordTimer(record, 'markerRetryTimer');
    if (record.version !== envelope.version) {
      record.saveRequested = false;
      emitStatus(envelope.id, record, isOnline() ? 'dirty' : 'offline');
      return;
    }

    await record.markerWrite;
    await clearPendingSessionSync(ownerKey, envelope.id);

    if (record.version === envelope.version) {
      record.markerWrite = undefined;
      record.saveRequested = false;
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
    if (record.saveRequested) scheduleSaveRetry(envelope.id);
  });

  const checkpoint = (session: Session): Promise<void> => {
    if (disposed) return Promise.reject(new Error('Session cloud sync is disposed'));
    let record = records.get(session.id);
    if (isEffectivelyEmpty(session) && (!record || (!record.hasCloudCopy && record.version === 0))) {
      return Promise.resolve();
    }
    if (!record || record.latest !== session) record = markDirty(session);
    record.saveRequested = true;
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
        // Marker failures happen before the queue callback. Treat them like
        // save failures so a transient IndexedDB error cannot permanently
        // strand the session.
        if (record.saveRequested && record.version === version) {
          emitStatus(session.id, record, isOnline() ? 'retrying' : 'offline');
          clearRecordTimer(record, 'markerRetryTimer');
          scheduleSaveRetry(session.id);
        } else {
          emitStatus(session.id, record, isOnline() ? 'dirty' : 'offline');
        }
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
      void checkpoint(record.latest).catch(() => undefined);
    }, MANUAL_DEBOUNCE_MS);
  };

  const noteLocal = (session: Session): void => {
    if (disposed) return;
    markDirty(session);
  };

  const flushOne = async (id: string): Promise<void> => {
    let record = records.get(id);
    if (!record) throw new Error('Session cloud sync has no pending save');
    if (record.status === 'synced') return;
    if (isEffectivelyEmpty(record.latest) && !record.hasCloudCopy && record.version === 0) return;

    const activeCheckpoint = checkpointRuns.get(id);
    if (activeCheckpoint?.version === record.version) {
      await activeCheckpoint.promise;
      record = records.get(id);
      if (!record || record.status === 'synced') return;
    }

    clearRecordTimer(record, 'debounceTimer');
    clearRecordTimer(record, 'retryTimer');
    record.saveRequested = true;
    if (!isOnline()) {
      emitStatus(id, record, 'offline');
      throw new Error('Session cloud sync is offline');
    }
    try {
      await ensureDirtyMarker(id, record);
      const run = queue.enqueue({
        id,
        version: record.version,
        session: record.latest,
      });
      await run;
      await queue.flush(id);
    } catch (error) {
      emitStatus(id, record, isOnline() ? 'retrying' : 'offline');
      scheduleSaveRetry(id);
      throw error;
    }
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
    if (!record || record.retryTimer !== undefined) return;
    const delay = immediate ? 0 : retryDelay(record.retryIndex++);
    record.retryTimer = setTimer(() => {
      delete record.retryTimer;
      void attemptDelete(id);
    }, delay);
  };

  const attemptDelete = async (id: string, surfaceError = false): Promise<void> => {
    const record = deletes.get(id);
    if (!record || disposed) return;
    try {
      if (!record.markerWritten) {
        await markPendingSessionDelete(ownerKey, id);
        record.markerWritten = true;
      }
      if (!record.syncDiscarded) {
        await clearPendingSessionSync(ownerKey, id);
        await queue.discard(id);
        record.syncDiscarded = true;
      }
      if (!record.localDeleted) {
        await record.deleteLocal?.();
        record.localDeleted = true;
      }
      if (!isOnline()) return;
      await repository.deleteSession(id, expectedUserId);
      clearDeleteTimer(record);
      await clearPendingSessionDelete(ownerKey, id);
      deletes.delete(id);
    } catch (error) {
      scheduleDeleteRetry(id);
      if (surfaceError) throw error;
    }
  };

  const deleteSession = async (
    id: string,
    deleteLocal?: () => Promise<void>,
  ): Promise<void> => {
    if (disposed) return;
    const deleteRecord = deletes.get(id) ?? {
      retryIndex: 0,
      deleteLocal,
      markerWritten: false,
      syncDiscarded: false,
      localDeleted: deleteLocal === undefined,
    };
    if (!deleteRecord.localDeleted && deleteLocal) {
      deleteRecord.deleteLocal = deleteLocal;
    }
    deletes.set(id, deleteRecord);

    const record = records.get(id);
    if (record) {
      clearRecordTimer(record, 'debounceTimer');
      clearRecordTimer(record, 'retryTimer');
      clearRecordTimer(record, 'markerRetryTimer');
    }
    records.delete(id);
    onStatus(id, undefined);
    await attemptDelete(id, true);
  };

  const hydrate = (
    sessions: Session[],
    pendingSyncIds: Set<string>,
    pendingDeleteIds: Set<string>,
    cloudSessionIds = new Set<string>(),
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
        markerRetryIndex: 0,
        hasCloudCopy: cloudSessionIds.has(session.id),
        saveRequested: pending,
      };
      records.set(session.id, record);
      onStatus(session.id, record.status);
      if (pending && isOnline()) scheduleSaveRetry(session.id, true);
    }
    for (const id of pendingDeleteIds) {
      if (!deletes.has(id)) {
        deletes.set(id, {
          retryIndex: 0,
          markerWritten: true,
          syncDiscarded: false,
          localDeleted: true,
        });
      }
      if (isOnline()) scheduleDeleteRetry(id, true);
    }
  };

  const acceptCloudSession = (session: Session): boolean => {
    if (disposed) return false;
    const existing = records.get(session.id);
    if (existing && (
      existing.saveRequested
      || existing.status === 'dirty'
      || existing.status === 'saving'
      || existing.status === 'offline'
      || existing.status === 'retrying'
    )) {
      /* The working copy is ahead of the cloud and on its way up. Refusing is
         the whole answer: the caller keeps what it has, the pending save still
         stands, and the next read after it lands will agree with both. */
      return false;
    }
    if (existing) {
      clearRecordTimer(existing, 'debounceTimer');
      clearRecordTimer(existing, 'retryTimer');
      clearRecordTimer(existing, 'markerRetryTimer');
    }
    const record: SyncRecord = {
      version: 0,
      latest: session,
      status: 'synced',
      retryIndex: 0,
      markerRetryIndex: 0,
      hasCloudCopy: true,
      saveRequested: false,
    };
    records.set(session.id, record);
    onStatus(session.id, 'synced');
    return true;
  };

  const notifyOnline = (): void => {
    if (disposed || !isOnline()) return;
    for (const [id, record] of records) {
      if (record.status === 'dirty' || record.status === 'offline' || record.status === 'retrying') {
        if (record.saveRequested) scheduleSaveRetry(id, true);
        else scheduleMarkerRetry(id, true);
      }
    }
    for (const id of deletes.keys()) scheduleDeleteRetry(id, true);
  };

  const dispose = (): void => {
    disposed = true;
    for (const record of records.values()) {
      clearRecordTimer(record, 'debounceTimer');
      clearRecordTimer(record, 'retryTimer');
      clearRecordTimer(record, 'markerRetryTimer');
    }
    for (const record of deletes.values()) clearDeleteTimer(record);
  };

  return {
    noteLocal,
    debounce,
    checkpoint,
    flush,
    deleteSession,
    acceptCloudSession,
    hydrate,
    notifyOnline,
    getStatus: (id) => records.get(id)?.status,
    dispose,
  };
}
