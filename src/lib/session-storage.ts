import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';
import { isStepwiseChoice } from '../services/suggestions';
import {
  decodePendingSessionId,
  pendingSessionMarkerKey,
} from './session-sync-keys';
import { normalizeSessionTitle } from './session-title';
import {
  isOddeNovaBridgeSnapshot,
  normalizeOddeNovaBridgeBaseUrl,
  verifyOddeNovaBridgeSnapshot,
  type OddeNovaBridgeSnapshotV3,
} from './oddenova-bridge';

export const DB_NAME = 'oddenova-db';
export const DB_VERSION = 7;
const LEGACY_SESSION_STORE_NAME = 'sessions';
const LEGACY_FAVORITE_STORE_NAME = 'favorites_by_owner';
export const SESSION_STORE_NAME = 'sessions_by_owner';
export const PERSONA_STORE_NAME = 'personas';
export const SETTINGS_STORE_NAME = 'settings';
export const BRIDGE_OUTBOX_STORE_NAME = 'oddenova_bridge_outbox';
export const BRIDGE_CHECKPOINT_STORE_NAME = 'oddenova_bridge_checkpoints';
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

export interface StoredBridgeOutboxEntry {
  ownerKey: string;
  projectKey: string;
  bindingId: string;
  changeId: string;
  payload: unknown;
  createdAt: number;
}

export interface StoredBridgeCheckpoint {
  schemaVersion: 1;
  ownerKey: string;
  projectKey: string;
  bindingId: string;
  sessionId: string;
  snapshot: OddeNovaBridgeSnapshotV3;
  /**
   * Canonical persistence and editor presentation are separate milestones.
   * Older checkpoints omit this field and are treated as already confirmed by
   * the bridge recovery code for backwards compatibility.
   */
  editorPresentation?: {
    revision: number;
    skillRevision: number;
    status: 'pending' | 'confirmed';
  };
  updatedAt: number;
}

export interface BridgeSessionStateCommit {
  ownerKey: string;
  session: Session;
  checkpoint: StoredBridgeCheckpoint;
  deleteOutboxChangeIds?: string[];
  /**
   * `update` requires the checkpoint row to exist before the commit: after an
   * atomic rebind moved (and deleted) an older generation, a stale page must
   * not be able to recreate it by writing a session back. `initial` creates
   * the first checkpoint for a binding and skips the existence check.
   */
  checkpointExpectation?: 'initial' | 'update';
}

export interface BridgeSessionRebindInput {
  ownerKey: string;
  projectKey: string;
  previousBindingId: string;
  bindingId: string;
  clientId: string;
}

export interface BridgeSessionRebindResult {
  session: Session;
  checkpoint: StoredBridgeCheckpoint;
}

export class BridgeSessionRebindError extends Error {
  readonly code: 'recovery-required' | 'conflict';

  constructor(message: string, code: 'recovery-required' | 'conflict' = 'recovery-required') {
    super(message);
    this.name = 'BridgeSessionRebindError';
    this.code = code;
  }
}

const memoryBridgeOutbox = new Map<string, StoredBridgeOutboxEntry>();
const memoryBridgeCheckpoints = new Map<string, StoredBridgeCheckpoint>();
const memoryBridgeSessions = new Map<string, Session>();
function bridgeOutboxKey(entry: Pick<StoredBridgeOutboxEntry, 'ownerKey' | 'projectKey' | 'bindingId' | 'changeId'>): string {
  return `${entry.ownerKey}\0${entry.projectKey}\0${entry.bindingId}\0${entry.changeId}`;
}

function bridgeCheckpointKey(checkpoint: Pick<StoredBridgeCheckpoint, 'ownerKey' | 'projectKey' | 'bindingId'>): string {
  return `${checkpoint.ownerKey}\0${checkpoint.projectKey}\0${checkpoint.bindingId}`;
}

function bridgeSessionKey(ownerKey: string, sessionId: string): string {
  return `${ownerKey}\0${sessionId}`;
}

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
  /* Titles written before the shared limit existed are held to it here, on the
     way out of storage, rather than by a pass over the database: a name is only
     ever read through this function, so one place is enough, and nothing about
     the row changes — no rewrite, no `updatedAt`, no re-sort, no save queued.
     The empty title stays empty; its stand-in is interface copy, and the call
     sites that draw a title already supply it in the reader's language. */
  const title = normalizeSessionTitle(normalized.title ?? '', '');
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
    ? { ...normalized, title }
    : { ...normalized, title, messages, inputMode: normalized.inputMode ?? inferredInputMode };
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
          if (!database.objectStoreNames.contains(BRIDGE_OUTBOX_STORE_NAME)) {
            database.createObjectStore(BRIDGE_OUTBOX_STORE_NAME, { keyPath: ['ownerKey', 'projectKey', 'bindingId', 'changeId'] });
          }
          if (!database.objectStoreNames.contains(BRIDGE_CHECKPOINT_STORE_NAME)) {
            database.createObjectStore(BRIDGE_CHECKPOINT_STORE_NAME, { keyPath: ['ownerKey', 'projectKey', 'bindingId'] });
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

const BRIDGE_OUTBOX_GENERATION_GUARD_MESSAGE = 'Bridge checkpoint generation is missing; refusing to queue an outbox entry for a moved binding';

/**
 * A checkpoint generation is live only while the checkpoint row itself and
 * both binding identities still agree with the generation being written.
 */
function isLiveBridgeGeneration(checkpoint: StoredBridgeCheckpoint | undefined, bindingId: string): boolean {
  return Boolean(
    checkpoint
    && checkpoint.bindingId === bindingId
    && checkpoint.snapshot.bindingId === bindingId,
  );
}

export async function putBridgeOutboxEntry(
  entry: StoredBridgeOutboxEntry,
  options: { generationGuard?: boolean } = {},
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) {
    if (options.generationGuard && !isLiveBridgeGeneration(memoryBridgeCheckpoints.get(bridgeCheckpointKey(entry)), entry.bindingId)) {
      throw new Error(BRIDGE_OUTBOX_GENERATION_GUARD_MESSAGE);
    }
    memoryBridgeOutbox.set(bridgeOutboxKey(entry), entry);
    return;
  }
  if (!options.generationGuard) {
    await db.put(BRIDGE_OUTBOX_STORE_NAME, entry);
    return;
  }
  // Checkpoint-guarded write: the generation the entry belongs to must still
  // exist, and the guard and the write share one transaction so a concurrent
  // rebind either migrates this entry or has already removed its checkpoint.
  const tx = db.transaction([BRIDGE_CHECKPOINT_STORE_NAME, BRIDGE_OUTBOX_STORE_NAME], 'readwrite');
  const checkpoints = tx.objectStore(BRIDGE_CHECKPOINT_STORE_NAME);
  const outbox = tx.objectStore(BRIDGE_OUTBOX_STORE_NAME);
  const checkpoint = await checkpoints.get([entry.ownerKey, entry.projectKey, entry.bindingId]) as StoredBridgeCheckpoint | undefined;
  if (!isLiveBridgeGeneration(checkpoint, entry.bindingId)) {
    try { tx.abort(); } catch { /* already finished */ }
    await tx.done.catch(() => undefined);
    throw new Error(BRIDGE_OUTBOX_GENERATION_GUARD_MESSAGE);
  }
  await outbox.put(entry);
  await tx.done;
}

export async function getBridgeCheckpoint(
  ownerKey: string,
  projectKey: string,
  bindingId: string,
): Promise<StoredBridgeCheckpoint | undefined> {
  await openDB();
  if (memoryFallback || !db) return memoryBridgeCheckpoints.get(bridgeCheckpointKey({ ownerKey, projectKey, bindingId }));
  return await db.get(BRIDGE_CHECKPOINT_STORE_NAME, [ownerKey, projectKey, bindingId]) as StoredBridgeCheckpoint | undefined;
}

/** Find a checkpoint from an older binding so an explicit re-pair can carry it forward. */
export async function getLatestBridgeCheckpoint(
  ownerKey: string,
  projectKey: string,
): Promise<StoredBridgeCheckpoint | undefined> {
  await openDB();
  const all = memoryFallback || !db
    ? [...memoryBridgeCheckpoints.values()]
    : await db.getAll(BRIDGE_CHECKPOINT_STORE_NAME) as StoredBridgeCheckpoint[];
  return all
    .filter((checkpoint) => checkpoint.ownerKey === ownerKey && checkpoint.projectKey === projectKey)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

export async function putBridgeCheckpoint(checkpoint: StoredBridgeCheckpoint): Promise<void> {
  await openDB();
  if (memoryFallback || !db) {
    memoryBridgeCheckpoints.set(bridgeCheckpointKey(checkpoint), checkpoint);
    return;
  }
  await db.put(BRIDGE_CHECKPOINT_STORE_NAME, checkpoint);
}

/**
 * Confirm the exact presentation that was persisted as pending. A stale
 * resolver from an older revision must never be able to confirm a newer
 * checkpoint, so every identity and both revision numbers are checked while
 * the checkpoint is still in storage.
 */
export async function confirmBridgeCheckpointPresentation({
  ownerKey,
  projectKey,
  bindingId,
  sessionId,
  revision,
  skillRevision,
}: {
  ownerKey: string;
  projectKey: string;
  bindingId: string;
  sessionId: string;
  revision: number;
  skillRevision: number;
}): Promise<boolean> {
  await openDB();
  const key = bridgeCheckpointKey({ ownerKey, projectKey, bindingId });
  if (memoryFallback || !db) {
    const current = memoryBridgeCheckpoints.get(key);
    if (
      !current
      || current.sessionId !== sessionId
      || current.snapshot.revision !== revision
      || current.snapshot.skillRevision !== skillRevision
      || current.editorPresentation?.status !== 'pending'
      || current.editorPresentation.revision !== revision
      || current.editorPresentation.skillRevision !== skillRevision
    ) return false;
    memoryBridgeCheckpoints.set(key, {
      ...current,
      editorPresentation: { revision, skillRevision, status: 'confirmed' },
      updatedAt: Date.now(),
    });
    return true;
  }

  const tx = db.transaction(BRIDGE_CHECKPOINT_STORE_NAME, 'readwrite');
  const store = tx.objectStore(BRIDGE_CHECKPOINT_STORE_NAME);
  const current = await store.get([ownerKey, projectKey, bindingId]) as StoredBridgeCheckpoint | undefined;
  if (
    !current
    || current.sessionId !== sessionId
    || current.snapshot.revision !== revision
    || current.snapshot.skillRevision !== skillRevision
    || current.editorPresentation?.status !== 'pending'
    || current.editorPresentation.revision !== revision
    || current.editorPresentation.skillRevision !== skillRevision
  ) {
    await tx.done;
    return false;
  }

  await store.put({
    ...current,
    editorPresentation: { revision, skillRevision, status: 'confirmed' },
    updatedAt: Date.now(),
  } satisfies StoredBridgeCheckpoint);
  await tx.done;
  return true;
}

export async function deleteBridgeCheckpoint(
  ownerKey: string,
  projectKey: string,
  bindingId: string,
): Promise<void> {
  await openDB();
  if (memoryFallback || !db) {
    memoryBridgeCheckpoints.delete(bridgeCheckpointKey({ ownerKey, projectKey, bindingId }));
    return;
  }
  await db.delete(BRIDGE_CHECKPOINT_STORE_NAME, [ownerKey, projectKey, bindingId]);
}

interface BridgeProjectIdentity {
  baseUrl: string;
  projectId: string;
}

interface PreparedBridgeSessionRebind {
  session: Session;
  checkpoint: StoredBridgeCheckpoint;
  previousCheckpoint?: StoredBridgeCheckpoint;
  previousSession?: Session;
  previousOutbox: StoredBridgeOutboxEntry[];
  reboundOutbox: StoredBridgeOutboxEntry[];
}

function bridgeRebindFailure(message: string, code: 'recovery-required' | 'conflict' = 'recovery-required'): BridgeSessionRebindError {
  return new BridgeSessionRebindError(message, code);
}

function parseBridgeProjectKey(projectKey: string): BridgeProjectIdentity {
  const separator = projectKey.indexOf('\0');
  if (separator <= 0 || separator === projectKey.length - 1) {
    throw bridgeRebindFailure('Bridge project identity is malformed');
  }
  const baseUrl = normalizeOddeNovaBridgeBaseUrl(projectKey.slice(0, separator));
  const projectId = projectKey.slice(separator + 1);
  if (`${baseUrl}\0${projectId}` !== projectKey) {
    throw bridgeRebindFailure('Bridge project identity is not normalized');
  }
  return { baseUrl, projectId };
}

function checkpointWithoutTimestamp(checkpoint: StoredBridgeCheckpoint): unknown {
  const { updatedAt: _updatedAt, ...content } = checkpoint;
  return content;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertRebindCheckpointShape(
  checkpoint: StoredBridgeCheckpoint,
  input: BridgeSessionRebindInput,
  identity: BridgeProjectIdentity,
  bindingId: string,
): void {
  const snapshot = checkpoint.snapshot;
  if (
    checkpoint.schemaVersion !== 1
    || checkpoint.ownerKey !== input.ownerKey
    || checkpoint.projectKey !== input.projectKey
    || checkpoint.bindingId !== bindingId
    || !checkpoint.sessionId
    || !isOddeNovaBridgeSnapshot(snapshot)
    || snapshot.protocolVersion !== 3
    || snapshot.projectId !== identity.projectId
    || normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl) !== identity.baseUrl
    || snapshot.bindingId !== bindingId
  ) {
    throw bridgeRebindFailure('Bridge checkpoint identity or snapshot is inconsistent');
  }
  const presentation = checkpoint.editorPresentation;
  if (
    presentation !== undefined
    && (
      (presentation.status !== 'pending' && presentation.status !== 'confirmed')
      || presentation.revision !== snapshot.revision
      || presentation.skillRevision !== snapshot.skillRevision
    )
  ) {
    throw bridgeRebindFailure('Bridge checkpoint presentation state is inconsistent');
  }
}

async function assertRebindCheckpoint(
  checkpoint: StoredBridgeCheckpoint,
  input: BridgeSessionRebindInput,
  identity: BridgeProjectIdentity,
  bindingId: string,
): Promise<void> {
  assertRebindCheckpointShape(checkpoint, input, identity, bindingId);
  if (!await verifyOddeNovaBridgeSnapshot(checkpoint.snapshot)) {
    throw bridgeRebindFailure('Bridge checkpoint content hash is invalid');
  }
}

function assertRebindSession(
  session: Session,
  identity: BridgeProjectIdentity,
  allowedBindingIds: readonly string[],
): void {
  const source = session.externalSource;
  let sourceBaseUrl: string;
  try {
    sourceBaseUrl = source?.baseUrl ? normalizeOddeNovaBridgeBaseUrl(source.baseUrl) : '';
  } catch {
    throw bridgeRebindFailure('Bound session base URL is invalid');
  }
  if (
    !source
    || source.type !== 'oddenova-strudel-skill'
    || source.protocolVersion !== 3
    || source.projectId !== identity.projectId
    || sourceBaseUrl !== identity.baseUrl
    || typeof source.bindingId !== 'string'
    || !allowedBindingIds.includes(source.bindingId)
  ) {
    throw bridgeRebindFailure('Bound session does not match the requested Bridge identity');
  }
}

function assertSessionMatchesCheckpoint(session: Session, checkpoint: StoredBridgeCheckpoint): void {
  const source = session.externalSource;
  if (!source) throw bridgeRebindFailure('Bound session source is missing');
  if (
    (source.revision !== undefined && source.revision !== checkpoint.snapshot.revision)
    || (source.skillRevision !== undefined && source.skillRevision !== checkpoint.snapshot.skillRevision)
    || (source.bridgeContentHash !== undefined && source.bridgeContentHash !== checkpoint.snapshot.contentHash)
  ) {
    throw bridgeRebindFailure('Bound session and Bridge checkpoint content are inconsistent');
  }
}

function reboundSession(session: Session, bindingId: string): Session {
  if (!session.externalSource) throw bridgeRebindFailure('Bound session source is missing');
  return {
    ...session,
    externalSource: {
      ...session.externalSource,
      bindingId,
    },
  };
}

function reboundOutboxEntry(
  entry: StoredBridgeOutboxEntry,
  input: BridgeSessionRebindInput,
): StoredBridgeOutboxEntry {
  if (!entry.payload || typeof entry.payload !== 'object' || Array.isArray(entry.payload)) {
    throw bridgeRebindFailure('Bridge outbox payload is malformed');
  }
  return {
    ...entry,
    bindingId: input.bindingId,
    payload: {
      ...(entry.payload as Record<string, unknown>),
      bindingId: input.bindingId,
      clientId: input.clientId,
    },
  };
}

interface BridgeRebindValues {
  previousCheckpoint?: StoredBridgeCheckpoint;
  targetCheckpoint?: StoredBridgeCheckpoint;
  previousSession?: Session;
  targetSession?: Session;
  previousOutbox: StoredBridgeOutboxEntry[];
  targetOutbox: StoredBridgeOutboxEntry[];
}

/**
 * Expensive rebind pre-validation, deliberately run outside any IndexedDB
 * transaction: the WebCrypto content hash must not be awaited inside one, and
 * a browser may auto-commit a transaction that waits on a non-IndexedDB
 * promise. The outcome is a validated candidate only — the authoritative
 * transaction re-reads every record and re-checks it exactly before writing.
 */
async function validateBridgeRebindCandidate(
  input: BridgeSessionRebindInput,
  candidates: Pick<BridgeRebindValues, 'previousCheckpoint' | 'targetCheckpoint'>,
): Promise<void> {
  const identity = parseBridgeProjectKey(input.projectKey);
  if (candidates.previousCheckpoint) {
    await assertRebindCheckpoint(candidates.previousCheckpoint, input, identity, input.previousBindingId);
  }
  if (candidates.targetCheckpoint) {
    await assertRebindCheckpoint(candidates.targetCheckpoint, input, identity, input.bindingId);
  }
}

function prepareBridgeSessionRebindSync(
  input: BridgeSessionRebindInput,
  values: BridgeRebindValues,
): PreparedBridgeSessionRebind {
  if (!input.ownerKey || !input.projectKey || !input.previousBindingId || !input.bindingId || !input.clientId) {
    throw bridgeRebindFailure('Bridge rebind identity is incomplete');
  }
  if (input.previousBindingId === input.bindingId) {
    throw bridgeRebindFailure('Bridge rebind source and target binding are identical');
  }
  const identity = parseBridgeProjectKey(input.projectKey);
  const previousCheckpoint = values.previousCheckpoint;
  const targetCheckpoint = values.targetCheckpoint;

  if (!previousCheckpoint && targetCheckpoint) {
    assertRebindCheckpointShape(targetCheckpoint, input, identity, input.bindingId);
    const targetSession = values.targetSession;
    if (!targetSession || targetCheckpoint.sessionId !== targetSession.id) {
      throw bridgeRebindFailure('Rebound Bridge checkpoint points to a missing session');
    }
    assertRebindSession(targetSession, identity, [input.bindingId]);
    if (values.previousOutbox.length > 0) {
      throw bridgeRebindFailure('Rebound Bridge state is partial and still has old outbox entries');
    }
    return {
      session: targetSession,
      checkpoint: targetCheckpoint,
      previousOutbox: [],
      reboundOutbox: values.targetOutbox,
    };
  }

  if (!previousCheckpoint) throw bridgeRebindFailure('The previous Bridge checkpoint is missing');
  assertRebindCheckpointShape(previousCheckpoint, input, identity, input.previousBindingId);
  const previousSession = values.previousSession;
  if (!previousSession || previousSession.id !== previousCheckpoint.sessionId) {
    throw bridgeRebindFailure('The previous Bridge session is missing');
  }
  assertRebindSession(previousSession, identity, [input.previousBindingId, input.bindingId]);
  assertSessionMatchesCheckpoint(previousSession, previousCheckpoint);

  const expectedCheckpoint: StoredBridgeCheckpoint = {
    ...previousCheckpoint,
    bindingId: input.bindingId,
    snapshot: { ...previousCheckpoint.snapshot, bindingId: input.bindingId },
    updatedAt: Date.now(),
  };
  assertRebindCheckpointShape(expectedCheckpoint, input, identity, input.bindingId);
  const updatedSession = reboundSession(previousSession, input.bindingId);
  if (targetCheckpoint) {
    assertRebindCheckpointShape(targetCheckpoint, input, identity, input.bindingId);
    if (
      targetCheckpoint.sessionId !== expectedCheckpoint.sessionId
      || !sameJson(checkpointWithoutTimestamp(targetCheckpoint), checkpointWithoutTimestamp(expectedCheckpoint))
    ) {
      throw bridgeRebindFailure('The rebound Bridge checkpoint conflicts with the previous session', 'conflict');
    }
  }
  if (values.targetSession && values.targetSession.id !== updatedSession.id) {
    throw bridgeRebindFailure('The rebound Bridge checkpoint points to another session', 'conflict');
  }
  if (values.targetSession) {
    assertRebindSession(values.targetSession, identity, [input.bindingId]);
    if (targetCheckpoint) assertSessionMatchesCheckpoint(values.targetSession, targetCheckpoint);
  }

  const existingTargetEntries = new Map(values.targetOutbox.map((entry) => [entry.changeId, entry]));
  const reboundOutbox: StoredBridgeOutboxEntry[] = [...values.targetOutbox];
  for (const entry of values.previousOutbox) {
    if (entry.ownerKey !== input.ownerKey || entry.projectKey !== input.projectKey || entry.bindingId !== input.previousBindingId) {
      throw bridgeRebindFailure('Bridge outbox identity is inconsistent');
    }
    const rebound = reboundOutboxEntry(entry, input);
    const existing = existingTargetEntries.get(rebound.changeId);
    if (existing) {
      if (!sameJson(existing, rebound)) {
        throw bridgeRebindFailure(`Bridge outbox change ${rebound.changeId} conflicts during rebind`, 'conflict');
      }
      continue;
    }
    existingTargetEntries.set(rebound.changeId, rebound);
    reboundOutbox.push(rebound);
  }
  reboundOutbox.sort((left, right) => left.createdAt - right.createdAt);

  return {
    // An interrupted retry may already have written the target session. Keep
    // that exact working copy (including a draft/suggestions) instead of
    // rebuilding it from the old binding and overwriting newer local fields.
    session: values.targetSession ?? updatedSession,
    checkpoint: targetCheckpoint ?? expectedCheckpoint,
    previousCheckpoint,
    previousSession,
    previousOutbox: values.previousOutbox,
    reboundOutbox,
  };
}

/** Exact content re-check of the authoritative records against validated candidates. */
function rebindRecordsMatch(
  candidates: Pick<BridgeRebindValues, 'previousCheckpoint' | 'targetCheckpoint'>,
  authoritative: Pick<BridgeRebindValues, 'previousCheckpoint' | 'targetCheckpoint'>,
): boolean {
  return sameJson(candidates.previousCheckpoint ?? null, authoritative.previousCheckpoint ?? null)
    && sameJson(candidates.targetCheckpoint ?? null, authoritative.targetCheckpoint ?? null);
}

function memoryRebindValues(input: BridgeSessionRebindInput): BridgeRebindValues {
  const previousCheckpoint = memoryBridgeCheckpoints.get(bridgeCheckpointKey({
    ownerKey: input.ownerKey,
    projectKey: input.projectKey,
    bindingId: input.previousBindingId,
  }));
  const targetCheckpoint = memoryBridgeCheckpoints.get(bridgeCheckpointKey({
    ownerKey: input.ownerKey,
    projectKey: input.projectKey,
    bindingId: input.bindingId,
  }));
  const previousSessionId = previousCheckpoint?.sessionId ?? targetCheckpoint?.sessionId;
  return {
    previousCheckpoint,
    targetCheckpoint,
    previousSession: previousSessionId ? memoryBridgeSessions.get(bridgeSessionKey(input.ownerKey, previousSessionId)) : undefined,
    targetSession: targetCheckpoint?.sessionId ? memoryBridgeSessions.get(bridgeSessionKey(input.ownerKey, targetCheckpoint.sessionId)) : undefined,
    previousOutbox: [...memoryBridgeOutbox.values()].filter((entry) => entry.ownerKey === input.ownerKey && entry.projectKey === input.projectKey && entry.bindingId === input.previousBindingId),
    targetOutbox: [...memoryBridgeOutbox.values()].filter((entry) => entry.ownerKey === input.ownerKey && entry.projectKey === input.projectKey && entry.bindingId === input.bindingId),
  };
}

/**
 * Rebind one exact Bridge generation to the same local session. The session,
 * checkpoint, and generation-scoped outbox move together in one readwrite
 * transaction; no caller may migrate a "latest" project candidate by
 * timestamp or list order.
 */
export async function rebindBridgeSessionState(
  input: BridgeSessionRebindInput,
): Promise<BridgeSessionRebindResult> {
  await openDB();
  if (memoryFallback || !db) {
    // The hash validation is async, so it may interleave with other callers.
    // Re-read the authoritative maps afterwards and run the prepare and the
    // writes with no await in between: within one event-loop turn this is an
    // undividable critical section.
    let attempt = 0;
    for (;;) {
      const candidates = memoryRebindValues(input);
      await validateBridgeRebindCandidate(input, candidates);
      const values = memoryRebindValues(input);
      if (!rebindRecordsMatch(candidates, values)) {
        attempt += 1;
        if (attempt > 1) {
          throw bridgeRebindFailure('Bridge rebind records changed between validation and the authoritative read');
        }
        continue;
      }
      const prepared = prepareBridgeSessionRebindSync(input, values);
      const sessionsBefore = new Map(memoryBridgeSessions);
      const checkpointsBefore = new Map(memoryBridgeCheckpoints);
      const outboxBefore = new Map(memoryBridgeOutbox);
      try {
        memoryBridgeSessions.set(bridgeSessionKey(input.ownerKey, prepared.session.id), prepared.session);
        memoryBridgeCheckpoints.set(bridgeCheckpointKey(prepared.checkpoint), prepared.checkpoint);
        for (const entry of prepared.reboundOutbox) memoryBridgeOutbox.set(bridgeOutboxKey(entry), entry);
        memoryBridgeCheckpoints.delete(bridgeCheckpointKey({ ownerKey: input.ownerKey, projectKey: input.projectKey, bindingId: input.previousBindingId }));
        for (const entry of prepared.previousOutbox) memoryBridgeOutbox.delete(bridgeOutboxKey(entry));
      } catch (error) {
        memoryBridgeSessions.clear();
        for (const [key, value] of sessionsBefore) memoryBridgeSessions.set(key, value);
        memoryBridgeCheckpoints.clear();
        for (const [key, value] of checkpointsBefore) memoryBridgeCheckpoints.set(key, value);
        memoryBridgeOutbox.clear();
        for (const [key, value] of outboxBefore) memoryBridgeOutbox.set(key, value);
        throw error;
      }
      return { session: prepared.session, checkpoint: prepared.checkpoint };
    }
  }

  // Two phases: validate the (expensive) hash checks outside the transaction,
  // then re-read every authoritative record inside one readwrite transaction
  // and re-check them exactly. Writes use only the in-transaction records, so
  // a write committed between the two phases is either migrated or aborts the
  // rebind — it can never be silently overwritten by a stale snapshot.
  let attempt = 0;
  for (;;) {
    const candidateValues: Pick<BridgeRebindValues, 'previousCheckpoint' | 'targetCheckpoint'> = {
      previousCheckpoint: await db.get(
        BRIDGE_CHECKPOINT_STORE_NAME,
        [input.ownerKey, input.projectKey, input.previousBindingId],
      ) as StoredBridgeCheckpoint | undefined,
      targetCheckpoint: await db.get(
        BRIDGE_CHECKPOINT_STORE_NAME,
        [input.ownerKey, input.projectKey, input.bindingId],
      ) as StoredBridgeCheckpoint | undefined,
    };
    await validateBridgeRebindCandidate(input, candidateValues);

    const tx = db.transaction(
      [SESSION_STORE_NAME, BRIDGE_CHECKPOINT_STORE_NAME, BRIDGE_OUTBOX_STORE_NAME],
      'readwrite',
    );
    try {
      const sessionsStore = tx.objectStore(SESSION_STORE_NAME);
      const checkpointsStore = tx.objectStore(BRIDGE_CHECKPOINT_STORE_NAME);
      const outboxStore = tx.objectStore(BRIDGE_OUTBOX_STORE_NAME);
      const previousCheckpoint = await checkpointsStore.get([input.ownerKey, input.projectKey, input.previousBindingId]) as StoredBridgeCheckpoint | undefined;
      const targetCheckpoint = await checkpointsStore.get([input.ownerKey, input.projectKey, input.bindingId]) as StoredBridgeCheckpoint | undefined;
      if (!rebindRecordsMatch(candidateValues, { previousCheckpoint, targetCheckpoint })) {
        tx.abort();
        await tx.done.catch(() => undefined);
        attempt += 1;
        if (attempt > 1) {
          throw bridgeRebindFailure('Bridge rebind records changed between validation and the authoritative transaction');
        }
        continue;
      }
      const allOutbox = await outboxStore.getAll() as StoredBridgeOutboxEntry[];
      const previousOutbox = allOutbox.filter((entry) => entry.ownerKey === input.ownerKey && entry.projectKey === input.projectKey && entry.bindingId === input.previousBindingId);
      const targetOutbox = allOutbox.filter((entry) => entry.ownerKey === input.ownerKey && entry.projectKey === input.projectKey && entry.bindingId === input.bindingId);
      const checkpointSessionId = previousCheckpoint?.sessionId ?? targetCheckpoint?.sessionId;
      const previousSession = checkpointSessionId
        ? await sessionsStore.get([input.ownerKey, checkpointSessionId]) as Session | undefined
        : undefined;
      const targetSession = targetCheckpoint?.sessionId
        ? await sessionsStore.get([input.ownerKey, targetCheckpoint.sessionId]) as Session | undefined
        : undefined;

      const prepared = prepareBridgeSessionRebindSync(input, {
        previousCheckpoint,
        targetCheckpoint,
        previousSession,
        targetSession,
        previousOutbox,
        targetOutbox,
      });

      await sessionsStore.put(withOwner(prepared.session, input.ownerKey));
      await checkpointsStore.put(prepared.checkpoint);
      for (const entry of prepared.reboundOutbox) await outboxStore.put(entry);
      await checkpointsStore.delete([input.ownerKey, input.projectKey, input.previousBindingId]);
      for (const entry of prepared.previousOutbox) {
        await outboxStore.delete([entry.ownerKey, entry.projectKey, entry.bindingId, entry.changeId]);
      }
      await tx.done;
      return { session: prepared.session, checkpoint: prepared.checkpoint };
    } catch (error) {
      try { tx.abort(); } catch { /* the transaction may already be finished */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }
}

export async function rebindBridgeCheckpoint(
  ownerKey: string,
  projectKey: string,
  bindingId: string,
): Promise<StoredBridgeCheckpoint | undefined> {
  const current = await getBridgeCheckpoint(ownerKey, projectKey, bindingId);
  if (current) return current;
  const previous = await getLatestBridgeCheckpoint(ownerKey, projectKey);
  if (!previous) return undefined;
  const rebound: StoredBridgeCheckpoint = {
    ...previous,
    bindingId,
    snapshot: { ...previous.snapshot, bindingId },
    updatedAt: Date.now(),
  };
  await putBridgeCheckpoint(rebound);
  if (previous.bindingId !== bindingId) {
    await deleteBridgeCheckpoint(ownerKey, projectKey, previous.bindingId);
  }
  return rebound;
}

/**
 * Commit a bridge-applied session, its canonical checkpoint, and processed
 * outbox entries in one IndexedDB transaction. Unlike the ordinary session
 * helpers, failures intentionally propagate so callers cannot send an ack for
 * state that was not durably recorded.
 */
export async function commitBridgeSessionState({
  ownerKey,
  session,
  checkpoint,
  deleteOutboxChangeIds = [],
  checkpointExpectation,
}: BridgeSessionStateCommit): Promise<void> {
  if (checkpoint.ownerKey !== ownerKey || checkpoint.sessionId !== session.id) {
    throw new Error('Bridge checkpoint does not belong to the committed session');
  }
  await openDB();
  const expectationMessage = 'Bridge checkpoint generation is missing; the binding was likely rebound or removed, refusing to recreate it';
  if (memoryFallback || !db) {
    const checkpointKey = bridgeCheckpointKey(checkpoint);
    const sessionKey = bridgeSessionKey(ownerKey, session.id);
    if (checkpointExpectation === 'update' && !memoryBridgeCheckpoints.has(checkpointKey)) {
      throw new Error(expectationMessage);
    }
    const previousSession = memoryBridgeSessions.get(sessionKey);
    const previous = memoryBridgeCheckpoints.get(checkpointKey);
    try {
      memoryBridgeSessions.set(sessionKey, session);
      memoryBridgeCheckpoints.set(checkpointKey, checkpoint);
      for (const changeId of deleteOutboxChangeIds) {
        memoryBridgeOutbox.delete(bridgeOutboxKey({
          ownerKey,
          projectKey: checkpoint.projectKey,
          bindingId: checkpoint.bindingId,
          changeId,
        }));
      }
    } catch (error) {
      if (previousSession) memoryBridgeSessions.set(sessionKey, previousSession);
      else memoryBridgeSessions.delete(sessionKey);
      if (previous) memoryBridgeCheckpoints.set(checkpointKey, previous);
      else memoryBridgeCheckpoints.delete(checkpointKey);
      throw error;
    }
    return;
  }

  const tx = db.transaction(
    [SESSION_STORE_NAME, BRIDGE_CHECKPOINT_STORE_NAME, BRIDGE_OUTBOX_STORE_NAME],
    'readwrite',
  );
  const checkpoints = tx.objectStore(BRIDGE_CHECKPOINT_STORE_NAME);
  if (checkpointExpectation === 'update') {
    const existing = await checkpoints.get([ownerKey, checkpoint.projectKey, checkpoint.bindingId]);
    if (!existing) {
      try { tx.abort(); } catch { /* already finished */ }
      await tx.done.catch(() => undefined);
      throw new Error(expectationMessage);
    }
  }
  await tx.objectStore(SESSION_STORE_NAME).put(withOwner(session, ownerKey));
  await checkpoints.put(checkpoint);
  for (const changeId of deleteOutboxChangeIds) {
    await tx.objectStore(BRIDGE_OUTBOX_STORE_NAME).delete([
      ownerKey,
      checkpoint.projectKey,
      checkpoint.bindingId,
      changeId,
    ]);
  }
  await tx.done;
}

export async function getBridgeOutboxEntries(ownerKey: string, projectKey: string, bindingId: string): Promise<StoredBridgeOutboxEntry[]> {
  await openDB();
  if (memoryFallback || !db) {
    return [...memoryBridgeOutbox.values()].filter((entry) => entry.ownerKey === ownerKey && entry.projectKey === projectKey && entry.bindingId === bindingId)
      .sort((left, right) => left.createdAt - right.createdAt);
  }
  const all = await db.getAll(BRIDGE_OUTBOX_STORE_NAME) as StoredBridgeOutboxEntry[];
  return all.filter((entry) => entry.ownerKey === ownerKey && entry.projectKey === projectKey && entry.bindingId === bindingId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function deleteBridgeOutboxEntry(entry: Pick<StoredBridgeOutboxEntry, 'ownerKey' | 'projectKey' | 'bindingId' | 'changeId'>): Promise<void> {
  await openDB();
  if (memoryFallback || !db) {
    memoryBridgeOutbox.delete(bridgeOutboxKey(entry));
    return;
  }
  await db.delete(BRIDGE_OUTBOX_STORE_NAME, [entry.ownerKey, entry.projectKey, entry.bindingId, entry.changeId]);
}

export async function rebindBridgeOutboxEntries(ownerKey: string, projectKey: string, bindingId: string, clientId: string): Promise<void> {
  await openDB();
  const all = memoryFallback || !db
    ? [...memoryBridgeOutbox.values()]
    : await db.getAll(BRIDGE_OUTBOX_STORE_NAME) as StoredBridgeOutboxEntry[];
  const matching = all.filter((entry) => entry.ownerKey === ownerKey && entry.projectKey === projectKey && entry.bindingId !== bindingId);
  for (const entry of matching) {
    await deleteBridgeOutboxEntry(entry);
    const payload = entry.payload && typeof entry.payload === 'object'
      ? { ...entry.payload, bindingId, clientId }
      : entry.payload;
    await putBridgeOutboxEntry({ ...entry, bindingId, payload });
  }
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
  if (memoryFallback || !db) {
    memoryBridgeSessions.delete(bridgeSessionKey(ownerKey, id));
    return;
  }
  await db.delete(SESSION_STORE_NAME, [ownerKey, id]);
}
