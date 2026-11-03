import {
  getStorageDb,
  HUMMING_ASSET_STORE_NAME,
  HUMMING_DRAFT_STORE_NAME,
  isSessionStoragePersistent,
  openDB,
  SESSION_STORE_NAME,
} from './session-storage';
import type { Session } from '../hooks/useSessions';
import type { LocalHummingAsset, LocalHummingDraft } from '../types/humming';

interface StoredHummingDraft {
  ownerKey: string;
  sessionId: string;
  id: string;
  durationSeconds: number;
  createdAt: number;
}

const memoryAssets = new Map<string, LocalHummingAsset>();
const memoryDrafts = new Map<string, StoredHummingDraft>();
const assetKey = (ownerKey: string, id: string) => ownerKey + '\u0000' + id;
const draftKey = (ownerKey: string, sessionId: string) => ownerKey + '\u0000' + sessionId;

export interface SaveHummingDraftResult {
  persistent: boolean;
}

export async function saveHummingDraft(
  draft: LocalHummingDraft,
): Promise<SaveHummingDraftResult> {
  await openDB();
  const db = getStorageDb();
  const reference: StoredHummingDraft = {
    ownerKey: draft.ownerKey,
    sessionId: draft.sessionId,
    id: draft.id,
    durationSeconds: draft.durationSeconds,
    createdAt: draft.createdAt,
  };

  if (!db) {
    memoryAssets.set(assetKey(draft.ownerKey, draft.id), draft);
    memoryDrafts.set(draftKey(draft.ownerKey, draft.sessionId), reference);
    return { persistent: false };
  }

  const transaction = db.transaction(
    [HUMMING_ASSET_STORE_NAME, HUMMING_DRAFT_STORE_NAME],
    'readwrite',
  );
  await Promise.all([
    transaction.objectStore(HUMMING_ASSET_STORE_NAME).put({
      ownerKey: draft.ownerKey,
      id: draft.id,
      sessionId: draft.sessionId,
      blob: draft.blob,
      mimeType: draft.mimeType,
      createdAt: draft.createdAt,
    }),
    transaction.objectStore(HUMMING_DRAFT_STORE_NAME).put(reference),
    transaction.done,
  ]);
  return { persistent: isSessionStoragePersistent() };
}

/**
 * Replace a draft only when the durable store is available. Re-recording must
 * never overwrite the old draft with a memory-only candidate: callers keep
 * that candidate in page state and can retry this operation later.
 */
export async function replaceHummingDraftIfPersistent(
  draft: LocalHummingDraft,
  signal?: AbortSignal,
): Promise<SaveHummingDraftResult> {
  await openDB();
  if (signal?.aborted) return { persistent: false };
  const db = getStorageDb();
  if (!db || !isSessionStoragePersistent()) return { persistent: false };

  const transaction = db.transaction(
    [HUMMING_ASSET_STORE_NAME, HUMMING_DRAFT_STORE_NAME, SESSION_STORE_NAME],
    'readwrite',
  );
  const abortTransaction = () => {
    try { transaction.abort(); } catch { /* It may already have committed. */ }
  };
  signal?.addEventListener('abort', abortTransaction, { once: true });
  const assets = transaction.objectStore(HUMMING_ASSET_STORE_NAME);
  const drafts = transaction.objectStore(HUMMING_DRAFT_STORE_NAME);
  try {
    if (signal?.aborted) abortTransaction();
    const [previous, storedDrafts, sessions] = await Promise.all([
      drafts.get([draft.ownerKey, draft.sessionId]) as Promise<StoredHummingDraft | undefined>,
      drafts.getAll() as Promise<StoredHummingDraft[]>,
      transaction.objectStore(SESSION_STORE_NAME).getAll() as Promise<(Session & { ownerKey: string })[]>,
    ]);

    const reference: StoredHummingDraft = {
      ownerKey: draft.ownerKey,
      sessionId: draft.sessionId,
      id: draft.id,
      durationSeconds: draft.durationSeconds,
      createdAt: draft.createdAt,
    };
    const writes: Promise<unknown>[] = [
      assets.put({
        ownerKey: draft.ownerKey,
        id: draft.id,
        sessionId: draft.sessionId,
        blob: draft.blob,
        mimeType: draft.mimeType,
        createdAt: draft.createdAt,
      }),
      drafts.put(reference),
    ];

    if (previous && previous.id !== draft.id) {
      const referencedByMessage = sessions.some((session) => (
        session.ownerKey === draft.ownerKey
        && session.messages.some((message) => message.humming?.id === previous.id)
      ));
      const referencedByAnotherDraft = storedDrafts.some((stored) => (
        stored.ownerKey === draft.ownerKey
        && stored.sessionId !== draft.sessionId
        && stored.id === previous.id
      ));
      if (!referencedByMessage && !referencedByAnotherDraft) {
        writes.push(assets.delete([draft.ownerKey, previous.id]));
      }
    }

    await Promise.all([...writes, transaction.done]);
    return signal?.aborted ? { persistent: false } : { persistent: true };
  } catch (error) {
    if (signal?.aborted) return { persistent: false };
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortTransaction);
  }
}

export async function getHummingDraft(
  ownerKey: string,
  sessionId: string,
): Promise<LocalHummingDraft | null> {
  await openDB();
  const db = getStorageDb();
  if (!db) {
    const reference = memoryDrafts.get(draftKey(ownerKey, sessionId));
    if (!reference) return null;
    const asset = memoryAssets.get(assetKey(ownerKey, reference.id));
    return asset ? { ...asset, sessionId, durationSeconds: reference.durationSeconds } : null;
  }

  const transaction = db.transaction(
    [HUMMING_ASSET_STORE_NAME, HUMMING_DRAFT_STORE_NAME],
    'readonly',
  );
  const reference = await transaction.objectStore(HUMMING_DRAFT_STORE_NAME).get([ownerKey, sessionId]) as
    | StoredHummingDraft
    | undefined;
  if (!reference) return null;
  const asset = await transaction.objectStore(HUMMING_ASSET_STORE_NAME).get([ownerKey, reference.id]) as
    | LocalHummingAsset
    | undefined;
  await transaction.done;
  return asset ? { ...asset, sessionId, durationSeconds: reference.durationSeconds } : null;
}

export async function getHummingAsset(
  ownerKey: string,
  id: string,
): Promise<LocalHummingAsset | null> {
  await openDB();
  const db = getStorageDb();
  if (!db) return memoryAssets.get(assetKey(ownerKey, id)) ?? null;
  return await db.get(HUMMING_ASSET_STORE_NAME, [ownerKey, id]) as LocalHummingAsset | undefined ?? null;
}

/** Find another conversation or draft that still owns a recording reference. */
function survivingReferences(
  sessions: readonly Session[],
  drafts: readonly StoredHummingDraft[],
  deletedSessionId: string,
): Map<string, string> {
  const references = new Map<string, string>();
  for (const session of sessions) {
    if (session.id === deletedSessionId) continue;
    for (const message of session.messages) {
      if (message.humming) references.set(message.humming.id, session.id);
    }
  }
  for (const draft of drafts) {
    if (draft.sessionId !== deletedSessionId) references.set(draft.id, draft.sessionId);
  }
  return references;
}

/** Delete only recordings that no surviving conversation or draft references. */
export async function deleteHummingDataForSession(
  ownerKey: string,
  sessionId: string,
  survivingSessions: readonly Session[] = [],
): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) {
    const reference = memoryDrafts.get(draftKey(ownerKey, sessionId));
    const retained = survivingReferences(
      survivingSessions,
      [...memoryDrafts.values()].filter((draft) => draft.ownerKey === ownerKey),
      sessionId,
    );
    memoryDrafts.delete(draftKey(ownerKey, sessionId));
    for (const [key, asset] of memoryAssets) {
      if (asset.ownerKey !== ownerKey || (asset.sessionId !== sessionId && asset.id !== reference?.id)) continue;
      const nextSessionId = retained.get(asset.id);
      if (nextSessionId) memoryAssets.set(key, { ...asset, sessionId: nextSessionId });
      else memoryAssets.delete(key);
    }
    return;
  }

  // Include sessions in the transaction so another tab's branch and this
  // cleanup cannot interleave their persisted reference updates.
  const transaction = db.transaction(
    [HUMMING_ASSET_STORE_NAME, HUMMING_DRAFT_STORE_NAME, SESSION_STORE_NAME],
    'readwrite',
  );
  const assets = transaction.objectStore(HUMMING_ASSET_STORE_NAME);
  const drafts = transaction.objectStore(HUMMING_DRAFT_STORE_NAME);
  const [storedSessions, storedDrafts, ownedAssets] = await Promise.all([
    transaction.objectStore(SESSION_STORE_NAME).getAll() as Promise<(Session & { ownerKey: string })[]>,
    drafts.getAll() as Promise<StoredHummingDraft[]>,
    assets.index('by-owner-session').getAll(IDBKeyRange.only([ownerKey, sessionId])) as Promise<LocalHummingAsset[]>,
  ]);
  const ownedDrafts = storedDrafts.filter((draft) => draft.ownerKey === ownerKey);
  const retained = survivingReferences(
    [...storedSessions.filter((session) => session.ownerKey === ownerKey), ...survivingSessions],
    ownedDrafts,
    sessionId,
  );
  const reference = ownedDrafts.find((draft) => draft.sessionId === sessionId);
  if (reference && !ownedAssets.some((asset) => asset.id === reference.id)) {
    const asset = await assets.get([ownerKey, reference.id]) as LocalHummingAsset | undefined;
    if (asset) ownedAssets.push(asset);
  }
  await Promise.all([
    ...ownedAssets.map((asset) => {
      const nextSessionId = retained.get(asset.id);
      return nextSessionId
        ? assets.put({ ...asset, sessionId: nextSessionId })
        : assets.delete([ownerKey, asset.id]);
    }),
    drafts.delete([ownerKey, sessionId]),
    transaction.done,
  ]);
}

/** Remove the unsent reference after a user message is durably accepted. */
export async function clearHummingDraft(ownerKey: string, sessionId: string): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) {
    memoryDrafts.delete(draftKey(ownerKey, sessionId));
    return;
  }
  await db.delete(HUMMING_DRAFT_STORE_NAME, [ownerKey, sessionId]);
}

/** Discard an unsent draft without deleting a recording still used by history. */
export async function discardHummingDraft(ownerKey: string, sessionId: string): Promise<void> {
  await openDB();
  const db = getStorageDb();
  if (!db) {
    const key = draftKey(ownerKey, sessionId);
    const reference = memoryDrafts.get(key);
    memoryDrafts.delete(key);
    if (reference) {
      const retained = survivingReferences(
        [], [...memoryDrafts.values()].filter((draft) => draft.ownerKey === ownerKey), '',
      );
      const asset = memoryAssets.get(assetKey(ownerKey, reference.id));
      const nextSessionId = retained.get(reference.id);
      if (asset && nextSessionId) memoryAssets.set(assetKey(ownerKey, reference.id), { ...asset, sessionId: nextSessionId });
      else memoryAssets.delete(assetKey(ownerKey, reference.id));
    }
    return;
  }

  const transaction = db.transaction(
    [HUMMING_ASSET_STORE_NAME, HUMMING_DRAFT_STORE_NAME, SESSION_STORE_NAME],
    'readwrite',
  );
  const drafts = transaction.objectStore(HUMMING_DRAFT_STORE_NAME);
  const assets = transaction.objectStore(HUMMING_ASSET_STORE_NAME);
  const reference = await drafts.get([ownerKey, sessionId]) as StoredHummingDraft | undefined;
  if (reference) {
    const [sessions, storedDrafts, asset] = await Promise.all([
      transaction.objectStore(SESSION_STORE_NAME).getAll() as Promise<(Session & { ownerKey: string })[]>,
      drafts.getAll() as Promise<StoredHummingDraft[]>,
      assets.get([ownerKey, reference.id]) as Promise<LocalHummingAsset | undefined>,
    ]);
    const retained = survivingReferences(
      sessions.filter((session) => session.ownerKey === ownerKey),
      storedDrafts.filter((draft) => draft.ownerKey === ownerKey && draft.sessionId !== sessionId),
      '',
    );
    const nextSessionId = retained.get(reference.id);
    await Promise.all([
      drafts.delete([ownerKey, sessionId]),
      asset && nextSessionId
        ? assets.put({ ...asset, sessionId: nextSessionId })
        : assets.delete([ownerKey, reference.id]),
    ]);
  }
  await transaction.done;
}
