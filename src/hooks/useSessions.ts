import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, InputMode, ProgressKind } from './useChat';
import {
  openDB,
  getAllSessions,
  getCurrentSessionId,
  putSession as dbPutSession,
  putCurrentSessionId as dbPutCurrentSessionId,
  putImportedSession as dbPutImportedSession,
  putImportedSessionBranch as dbPutImportedSessionBranch,
  deleteSession as dbDeleteSession,
  deleteSessionStrict as dbDeleteSessionStrict,
  isSessionStoragePersistent,
  commitBridgeSessionState as dbCommitBridgeSessionState,
  rebindBridgeSessionState as dbRebindBridgeSessionState,
  type StoredBridgeCheckpoint,
} from '../lib/session-storage';
import { t } from '../lib/i18n';
import { deriveSessionTitle, normalizeSessionTitle, titleWithSuffix } from '../lib/session-title';
import { pickGreeting } from '../lib/greetings';
import {
  hasSeededThemeSong,
  markThemeSongSeeded,
  themeSongCode,
} from '../lib/theme-song';
import { hashImportedContent, type OddeNovaImportPayload } from '../lib/oddenova-import';
import {
  digestOddeNovaBridgeMessage,
  normalizeOddeNovaBridgeBaseUrl,
  type AnyOddeNovaBridgeSnapshot,
} from '../lib/oddenova-bridge';
import { mergeBridgeMessages, type PendingBridgeMessageDelta } from '../lib/oddenova-bridge-messages';
import {
  createSessionCloudSync,
  type SessionSyncStatus,
} from '../lib/session-cloud-sync';
import {
  readPendingSessionOperations,
  type PendingSessionOperations,
} from '../lib/session-sync-storage';
import { createSessionWriteThrottle } from '../lib/session-write-throttle';

export interface ExternalSessionSource {
  type: 'oddenova-strudel-skill';
  projectId: string;
  /** v3 identity; v1/v2 records intentionally remain compatible without it. */
  baseUrl?: string;
  importedContentHash: string;
  protocolVersion?: 2 | 3;
  revision?: number;
  skillRevision?: number;
  bindingId?: string;
  bridgeContentHash?: string;
  importedMessageDigests?: string[];
}

export type OddeNovaImportOutcome = 'created' | 'updated' | 'branched';
export interface OddeNovaBridgeImportResult {
  outcome: OddeNovaImportOutcome | 'unchanged';
  sessionId: string;
  codeChanged?: boolean;
  skillRevision?: number;
  /**
   * Read by the bridge hook only: the import window still held local message
   * operations that are not represented by the imported canonical snapshot,
   * so they must be queued for the helper again after the import settles.
   */
  hasPendingLocalMessages?: boolean;
}

export interface OddeNovaBridgeImportBinding {
  ownerKey: string;
  projectId: string;
  baseUrl: string;
  bindingId?: string;
  sessionId?: string;
  clientId?: string;
}

export interface OddeNovaBridgeImportContext {
  checkpoint?: StoredBridgeCheckpoint;
  deleteOutboxChangeIds?: string[];
  /**
   * Local message operations captured from a fresh page read just before the
   * import. Applied on top of the canonical snapshot so messages completed
   * inside the import window survive; a delta is never a user deletion on its
   * own — canonical tombstones without a pending delete stay deleted.
   */
  pendingMessageDelta?: PendingBridgeMessageDelta;
  /**
   * Whether the committed checkpoint replaces an expected existing row
   * (`update`) or creates the first one for this binding (`initial`). A
   * missing checkpoint must fail an update instead of silently recreating a
   * binding generation that an atomic rebind already moved away.
   */
  checkpointExpectation?: 'initial' | 'update';
}

export interface OddeNovaBridgeRebindInput {
  ownerKey: string;
  projectKey: string;
  previousBindingId: string;
  bindingId: string;
  clientId: string;
}

export interface OddeNovaBridgeRebindResult {
  sessionId: string;
  previousBindingId: string;
  bindingId: string;
}

export type PlaybackStatus = 'played' | 'failed' | 'not_attempted';

export interface CodeRevision {
  id: string;
  beforeCode: string;
  afterCode: string;
  playbackStatus: PlaybackStatus;
  createdAt: number;
}

export type CodeRevisionDraft = Omit<CodeRevision, 'id' | 'createdAt'>;

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  code: string;
  /** Input behavior established by the latest successful Agent turn. */
  inputMode?: InputMode;
  externalSource?: ExternalSessionSource;
  /** Optional for backward compatibility with sessions saved before revisions existed. */
  revisions?: CodeRevision[];
  /**
   * Next-step suggestion chips, bound to the code they were generated for.
   * Persisted so a page refresh can restore them without regenerating.
   * `forCode` guards against the commit→async-persist window: if it no longer
   * matches the session's code, the stored chips are stale and get discarded.
   */
  suggestions?: { forCode: string; items: string[] };
  /** When set, this session is kept in the Favorites collection. */
  favoritedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CloudSessionRepository {
  saveSession: (session: Session, expectedUserId?: string) => Promise<void>;
  deleteSession: (id: string, expectedUserId?: string) => Promise<void>;
}

export interface UseSessionsOptions {
  ownerKey?: string;
  syncEnabled?: boolean;
  cloud?: CloudSessionRepository;
  startNewSessionToken?: number;
}

/**
 * `streaming` is the one that is not about the cloud: it marks a mutation that
 * arrives once per streamed token, so the local store rate-limits it (see
 * `createSessionWriteThrottle`). It reaches the cloud exactly as `deferred`
 * does — a dirty mark, nothing more.
 */
type CloudIntent = 'streaming' | 'deferred' | 'debounced' | 'checkpoint';

interface ManualSyncPresentation {
  markPending: (sessionId: string) => void;
  clear: (sessionId: string) => void;
  handleStatus: (sessionId: string, status: SessionSyncStatus | undefined) => void;
  dispose: () => void;
}

/**
 * How long the local store is held shut after a streamed write. Long enough
 * that a burst of tokens costs one write instead of hundreds, short enough
 * that a reload mid-answer loses at most a line of it.
 */
const LOCAL_WRITE_THROTTLE_MS = 1000;

function createManualSyncPresentation(options: {
  onStatus: (sessionId: string, status: SessionSyncStatus | undefined) => void;
}): ManualSyncPresentation {
  const pending = new Set<string>();
  const active = new Set<string>();
  const syncedTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clear = (sessionId: string): void => {
    pending.delete(sessionId);
    active.delete(sessionId);
    const timer = syncedTimers.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      syncedTimers.delete(sessionId);
    }
    options.onStatus(sessionId, undefined);
  };

  const markPending = (sessionId: string): void => {
    clear(sessionId);
    pending.add(sessionId);
  };

  const handleStatus = (
    sessionId: string,
    status: SessionSyncStatus | undefined,
  ): void => {
    if (status === undefined) {
      clear(sessionId);
      return;
    }

    const isActive = active.has(sessionId);
    if (status === 'saving' && pending.has(sessionId)) {
      active.add(sessionId);
    } else if (status === 'dirty' && isActive) {
      active.delete(sessionId);
      options.onStatus(sessionId, undefined);
      return;
    } else if (!isActive) {
      return;
    }

    options.onStatus(sessionId, status);
    if (status !== 'synced') return;

    pending.delete(sessionId);
    active.delete(sessionId);
    const previousTimer = syncedTimers.get(sessionId);
    if (previousTimer !== undefined) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      syncedTimers.delete(sessionId);
      options.onStatus(sessionId, undefined);
    }, 2000);
    syncedTimers.set(sessionId, timer);
  };

  return {
    markPending,
    clear,
    handleStatus,
    dispose: () => {
      for (const timer of syncedTimers.values()) clearTimeout(timer);
      syncedTimers.clear();
      pending.clear();
      active.clear();
    },
  };
}

let messageId = 0;

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID is unavailable');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function bridgeSourceMatchesSnapshot(
  session: Session,
  snapshot: AnyOddeNovaBridgeSnapshot,
  binding?: OddeNovaBridgeImportBinding,
): boolean {
  const source = session.externalSource;
  if (
    source?.type !== 'oddenova-strudel-skill'
    || source.projectId !== snapshot.projectId
  ) return false;
  if (snapshot.protocolVersion !== 3 || source.baseUrl === undefined) return true;
  try {
    return normalizeOddeNovaBridgeBaseUrl(source.baseUrl) === normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl)
      && (!binding?.baseUrl || normalizeOddeNovaBridgeBaseUrl(binding.baseUrl) === normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl))
      && (!snapshot.bindingId || source.bindingId === snapshot.bindingId)
      && (!binding?.bindingId || source.bindingId === binding.bindingId);
  } catch {
    return false;
  }
}

export type SessionImportPayload = Pick<Session, 'title' | 'code' | 'messages'> &
  Partial<Pick<Session, 'id' | 'inputMode' | 'revisions' | 'suggestions' | 'externalSource' | 'favoritedAt' | 'createdAt' | 'updatedAt'>>;

/**
 * Exported so the few callers that hand a ready-made message to
 * `importSession` mint ids the same way the rest of the session store does,
 * rather than growing a second id convention.
 */
export function newMessageId(): string {
  return `msg-${Date.now()}-${++messageId}`;
}

/**
 * The opening line a session starts on. Exported for the callers that build a
 * session to hand to `importSession` and want the studio's own opening rather
 * than a line of their own — see `handleOpenFavoriteInStudio`.
 */
export function makeGreetingMessage(): ChatMessage {
  return {
    id: newMessageId(),
    role: 'assistant',
    content: pickGreeting(),
    timestamp: Date.now(),
    isGreeting: true,
  };
}

function isEffectivelyEmpty(s: Session): boolean {
  return !s.code && s.messages.every((m) => m.isGreeting === true);
}

function newRevisionId(): string {
  return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function revisionsReferencedBy(messages: ChatMessage[], revisions?: CodeRevision[]): CodeRevision[] | undefined {
  if (!revisions) return undefined;
  const referenced = new Set(messages.flatMap((message) => message.revisionId ? [message.revisionId] : []));
  return revisions.filter((revision) => referenced.has(revision.id));
}

function importedRevisions(messages: ChatMessage[], revisions?: CodeRevision[]): CodeRevision[] | undefined {
  if (revisions !== undefined) return revisionsReferencedBy(messages, revisions);

  let beforeCode = '';
  const reconstructed: CodeRevision[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || message.code === undefined) continue;
    if (message.revisionId && !seen.has(message.revisionId)) {
      reconstructed.push({
        id: message.revisionId,
        beforeCode,
        afterCode: message.code,
        playbackStatus: 'not_attempted',
        createdAt: message.timestamp,
      });
      seen.add(message.revisionId);
    }
    beforeCode = message.code;
  }

  return reconstructed.length > 0 ? reconstructed : undefined;
}

function inputModeReferencedBy(messages: ChatMessage[]): InputMode {
  return [...messages].reverse().find(
    (message) => message.role === 'assistant' && message.inputMode !== undefined,
  )?.inputMode ?? 'normal';
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return t('newSessionTitle');
  const text = firstUser.content.trim();
  return deriveSessionTitle(text, t('newSessionTitle'));
}

function makeEmptySession(): Session {
  return {
    id: newSessionId(),
    title: t('newSessionTitle'),
    messages: [makeGreetingMessage()],
    code: '',
    inputMode: 'normal',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * The session a first-time visitor lands in: oddeNova's own theme song, already
 * written into the code panel.
 *
 * An empty editor is the hardest thing to answer — the app can do a great deal
 * and the blank page says none of it. A finished piece says it in one press of
 * play, and it is a real session from the first moment: playable, editable, and
 * the visitor's to take apart.
 *
 * It carries code, so `isEffectivelyEmpty` never matches it and "New session"
 * leaves it standing in the history rather than recycling it.
 */
function makeThemeSongSession(): Session {
  return {
    id: newSessionId(),
    title: t('themeSongTitle'),
    // An opening line rather than a random greeting, and `isGreeting` — which
    // is what keeps it out of the LLM history and out of retry/branch.
    messages: [{
      id: newMessageId(),
      role: 'assistant',
      content: t('themeSongIntro'),
      timestamp: Date.now(),
      isGreeting: true,
    }],
    code: themeSongCode(),
    inputMode: 'normal',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function applyTruncateAndEdit(s: Session, targetMessageId: string, newContent: string): Session {
  const index = s.messages.findIndex((m) => m.id === targetMessageId);
  if (index === -1) return s;
  const before = s.messages.slice(0, index);
  // Keep the original message's id: the retried/edited bubble is conceptually
  // the same message, and reusing its id keeps React's reconciliation on the
  // same DOM node instead of unmount+remount, which would replay the
  // fade-in-up mount animation and flash the bubble on every retry.
  const newMsg = {
    ...s.messages[index],
    role: 'user' as const,
    content: newContent,
  };
  const messages = [...before, newMsg];
  const shouldDeriveTitle = !before.some((m) => m.role === 'user') && s.title === t('newSessionTitle');
  const title = shouldDeriveTitle ? deriveTitle(messages) : s.title;
  return {
    ...s,
    messages,
    revisions: revisionsReferencedBy(messages, s.revisions),
    inputMode: inputModeReferencedBy(messages),
    title,
  };
}

export function applyTruncate(s: Session, targetMessageId: string): Session {
  const index = s.messages.findIndex((m) => m.id === targetMessageId);
  if (index === -1) return s;
  const messages = s.messages.slice(0, index);
  return {
    ...s,
    messages,
    revisions: revisionsReferencedBy(messages, s.revisions),
    inputMode: inputModeReferencedBy(messages),
  };
}

export function applyRefreshEmptySessionForReuse(s: Session, now: number): Session {
  return {
    ...s,
    title: t('newSessionTitle'),
    messages: [makeGreetingMessage()],
    inputMode: 'normal',
    suggestions: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyAppendAssistantDelta(
  s: Session,
  delta: string,
  agentAttemptId?: string,
): Session {
  const messages = [...s.messages];
  const last = messages[messages.length - 1];
  if (
    last?.role === 'assistant'
    && !last.code
    && last.agentAttemptId === agentAttemptId
  ) {
    messages[messages.length - 1] = { ...last, content: last.content + delta };
    return { ...s, messages };
  }
  return {
    ...s,
    messages: [
      ...messages,
      {
        id: newMessageId(),
        role: 'assistant' as const,
        content: delta,
        timestamp: Date.now(),
        agentAttemptId,
      },
    ],
  };
}

export function applyAppendProgressDelta(
  s: Session,
  delta: string,
  kind: 'thinking' | 'reasoning',
  agentAttemptId?: string,
): Session {
  const messages = [...s.messages];
  const last = messages[messages.length - 1];
  if (
    last?.role === 'progress'
    && last.progressKind === kind
    && last.agentAttemptId === agentAttemptId
  ) {
    messages[messages.length - 1] = { ...last, content: last.content + delta };
    return { ...s, messages };
  }
  return {
    ...s,
    messages: [
      ...messages,
      {
        id: newMessageId(),
        role: 'progress' as const,
        content: delta,
        timestamp: Date.now(),
        progressKind: kind,
        agentAttemptId,
      },
    ],
  };
}

export function applyDiscardAgentAttempt(s: Session, attemptId: string): Session {
  return {
    ...s,
    messages: s.messages.filter((message) => message.agentAttemptId !== attemptId),
  };
}

export function applyFinalizeAgentAttempt(s: Session, attemptId: string): Session {
  return {
    ...s,
    messages: s.messages.map((message) => {
      if (message.agentAttemptId !== attemptId) return message;
      const finalized = { ...message };
      delete finalized.agentAttemptId;
      return finalized;
    }),
  };
}

export function applyFinalizeLastAssistantMessage(
  s: Session,
  content: string,
): Session {
  const messages = [...s.messages];
  const last = messages[messages.length - 1];

  if (last?.role === 'assistant' && !last.code) {
    messages[messages.length - 1] = { ...last, content };
    return { ...s, messages };
  }

  return {
    ...s,
    messages: [
      ...messages,
      {
        id: newMessageId(),
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
      },
    ],
  };
}

export function useSessions(options: UseSessionsOptions = {}) {
  const ownerKey = options.ownerKey ?? 'guest';
  const syncEnabled = options.syncEnabled ?? false;
  const cloud = options.cloud;
  const startNewSessionToken = options.startNewSessionToken ?? 0;
  const cloudOwnerId = ownerKey.startsWith('user:') ? ownerKey.slice('user:'.length) : undefined;
  const isAccountOwner = ownerKey.startsWith('user:');
  const [sessions, setSessions] = useState<Session[]>([]);
  // Read by callbacks that must see the current list without taking it as a
  // dependency — an identity that changed on every session write would ripple
  // through the cloud library and out to every consumer of a switch handler.
  const sessionsRef = useRef<Session[]>(sessions);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(currentId);
  const ownerKeyRef = useRef(ownerKey);
  const [isLoading, setIsLoading] = useState(true);
  const [isPersistent, setIsPersistent] = useState(false);
  const [loadedOwnerKey, setLoadedOwnerKey] = useState(ownerKey);
  const [syncState, setSyncState] = useState<{
    ownerKey: string;
    statuses: Record<string, SessionSyncStatus>;
  }>({ ownerKey, statuses: {} });
  const [manualSyncState, setManualSyncState] = useState<{
    ownerKey: string;
    statuses: Record<string, SessionSyncStatus>;
  }>({ ownerKey, statuses: {} });
  const consumedStartNewSessionTokenRef = useRef(0);
  // Sessions created while a load is in flight. The load applies the list it
  // read when it started, so without this an import confirmed mid-load would
  // vanish from the UI until the next page load.
  const createdDuringLoadRef = useRef<{ ownerKey: string; ids: Set<string> }>({
    ownerKey,
    ids: new Set(),
  });
  // Account startup deliberately creates an in-memory session. Once a session
  // has meaningful content (or an explicit checkpoint) this set becomes the
  // small local working-copy index used by subsequent writes.
  const persistedSessionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);
  useEffect(() => {
    ownerKeyRef.current = ownerKey;
  }, [ownerKey]);

  const noteCreatedSession = useCallback((sessionId: string): void => {
    const tracked = createdDuringLoadRef.current;
    if (tracked.ownerKey === ownerKey) tracked.ids.add(sessionId);
  }, [ownerKey]);

  const manualSyncPresentation = useMemo(
    () => createManualSyncPresentation({
      onStatus: (sessionId, status) => {
        setManualSyncState((previousState) => {
          const previous = previousState.ownerKey === ownerKey
            ? previousState.statuses
            : {};
          if (status === undefined) {
            if (!(sessionId in previous)) {
              return previousState.ownerKey === ownerKey
                ? previousState
                : { ownerKey, statuses: {} };
            }
            const next = { ...previous };
            delete next[sessionId];
            return { ownerKey, statuses: next };
          }
          if (previous[sessionId] === status) return previousState;
          return {
            ownerKey,
            statuses: { ...previous, [sessionId]: status },
          };
        });
      },
    }),
    [ownerKey],
  );

  const sessionCloudSync = useMemo(
    () => syncEnabled && cloud && cloudOwnerId
      ? createSessionCloudSync({
          ownerKey,
          repository: cloud,
          onStatus: (sessionId, status) => {
            setSyncState((previousState) => {
              const previous = previousState.ownerKey === ownerKey
                ? previousState.statuses
                : {};
              if (status === undefined) {
                if (!(sessionId in previous)) {
                  return { ownerKey, statuses: previous };
                }
                const next = { ...previous };
                delete next[sessionId];
                return { ownerKey, statuses: next };
              }
              if (previous[sessionId] === status) {
                return { ownerKey, statuses: previous };
              }
              return {
                ownerKey,
                statuses: { ...previous, [sessionId]: status },
              };
            });
            manualSyncPresentation.handleStatus(sessionId, status);
          },
        })
      : null,
    [syncEnabled, cloud, cloudOwnerId, ownerKey, manualSyncPresentation],
  );

  useEffect(() => () => sessionCloudSync?.dispose(), [sessionCloudSync]);
  useEffect(
    () => () => manualSyncPresentation.dispose(),
    [manualSyncPresentation],
  );

  useEffect(() => {
    if (!sessionCloudSync) return;
    const notifyOnline = () => sessionCloudSync.notifyOnline();
    window.addEventListener('online', notifyOnline);
    return () => window.removeEventListener('online', notifyOnline);
  }, [sessionCloudSync]);

  // Initialize the local working copy. Guest history is still entirely
  // IndexedDB-backed. An account may read local rows for pending-write
  // recovery, but it never treats them as the online collection authority.
  useEffect(() => {
    let cancelled = false;
    createdDuringLoadRef.current = { ownerKey, ids: new Set() };
    persistedSessionIdsRef.current = new Set();
    // Apply a loaded list without dropping what was created since the load
    // started. Sessions that predate the load are not carried over: this local
    // working-copy load is the authority on those rows.
    const commitSessions = (next: Session[]): void => {
      const tracked = createdDuringLoadRef.current;
      const nextIds = new Set(next.map((session) => session.id));
      setSessions((previous) => {
        if (tracked.ownerKey !== ownerKey || tracked.ids.size === 0) return next;
        const created = previous.filter(
          (session) => tracked.ids.has(session.id) && !nextIds.has(session.id),
        );
        return created.length > 0 ? [...created, ...next] : next;
      });
    };
    (async () => {
      setIsLoading(true);
      await openDB();
      const persistent = isSessionStoragePersistent();
      let loaded = await getAllSessions(ownerKey);
      const storedCurrentId = isAccountOwner
        ? null
        : await getCurrentSessionId(ownerKey);
      let pending: PendingSessionOperations = {
        syncIds: new Set(),
        deleteIds: new Set(),
      };
      let pendingOperationsKnown = false;
      if (syncEnabled && cloud && sessionCloudSync) {
        try {
          pending = await readPendingSessionOperations(ownerKey);
          pendingOperationsKnown = true;
        } catch (err) {
          console.warn('[sessions] pending cloud operations could not be read.', err);
        }

        if (pendingOperationsKnown && pending.deleteIds.size > 0) {
          const tombstonedIds = pending.deleteIds;
          loaded = loaded.filter((session) => !tombstonedIds.has(session.id));
          const purgeResults = await Promise.allSettled(
            [...tombstonedIds].map((id) => sessionCloudSync.deleteSession(
              id,
              () => dbDeleteSessionStrict(id, ownerKey),
            )),
          );
          pending = {
            ...pending,
            deleteIds: new Set(
              [...tombstonedIds].filter((_, index) => purgeResults[index].status === 'rejected'),
            ),
          };
        }

      }
      // The theme song goes in on the browser's first sight of it, and the
      // judge of that is the flag alone — not an empty history. Keying it to an
      // empty history was the bug: everyone already using the app has rows
      // here, so nobody but a brand new visitor would ever have been given it.
      //
      // Guest rows only. The account pass treats the cloud as authoritative, so
      // a row written there would either need to be uploaded — one copy per
      // browser, since the flag is local and the account is not — or sit
      // unsynced. Instead this lands in the guest namespace, and the existing
      // The automatic guest-history import carries it up on sign-in: it holds
      // code, which is what `collectImportableGuestSessions` looks for.
      //
      // The mark goes down before the first await, so a double-invoked effect
      // cannot seed twice.
      if (!isAccountOwner && !hasSeededThemeSong()) {
        markThemeSongSeeded();
        // Nothing stored yet means a genuinely new visitor: they open on the
        // theme song. Anyone else opens where they left off and finds it at the
        // top of the history instead — arriving to a piece you did not write,
        // in place of the work you left, reads as having lost the work.
        const isFirstEntry = loaded.length === 0;
        const themeSession = makeThemeSongSession();
        await Promise.all([
          dbPutSession(themeSession, ownerKey),
          ...(isFirstEntry ? [dbPutCurrentSessionId(themeSession.id, ownerKey)] : []),
        ]);
        loaded = [themeSession, ...loaded];
      }

      if (cancelled) return;
      const tracked = createdDuringLoadRef.current;
      persistedSessionIdsRef.current = new Set([
        ...loaded.map((session) => session.id),
        ...(tracked.ownerKey === ownerKey ? tracked.ids : []),
      ]);
      if (pendingOperationsKnown) {
        // There is intentionally no remote-id set here. The account's local
        // rows are working copies only; a cloud summary/detail request is the
        // sole authority for what is online.
        sessionCloudSync?.hydrate(loaded, pending.syncIds, pending.deleteIds);
      }

      const shouldStartNewSession = startNewSessionToken > consumedStartNewSessionTokenRef.current;

      if (isAccountOwner) {
        if (shouldStartNewSession) {
          consumedStartNewSessionTokenRef.current = startNewSessionToken;
        }
        const fresh = makeEmptySession();
        commitSessions([fresh, ...loaded.filter((session) => session.id !== fresh.id)]);
        setCurrentId(fresh.id);
        setIsPersistent(persistent);
        setLoadedOwnerKey(ownerKey);
        setIsLoading(false);
        return;
      }

      if (shouldStartNewSession) {
        consumedStartNewSessionTokenRef.current = startNewSessionToken;
        // Reuse an untouched session the same way newSession() does. Without
        // this every sign-in leaves another "New session" behind, since an
        // empty session never reaches the cloud and never gets cleaned up.
        const reusable = loaded.find(isEffectivelyEmpty);
        const fresh = reusable
          ? applyRefreshEmptySessionForReuse(reusable, Date.now())
          : makeEmptySession();
        const rest = loaded.filter((session) => !isEffectivelyEmpty(session));
        // Anything untouched beyond the one being reused is debris from an
        // earlier sign-in that stacked them up. It holds no code and no
        // messages, so drop it instead of letting it pile up forever.
        const leftovers = loaded.filter(
          (session) => isEffectivelyEmpty(session) && session.id !== reusable?.id,
        );
        await Promise.all([
          dbPutSession(fresh, ownerKey),
          dbPutCurrentSessionId(fresh.id, ownerKey),
          ...leftovers.map((session) => sessionCloudSync
            ? sessionCloudSync.deleteSession(
              session.id,
              () => dbDeleteSessionStrict(session.id, ownerKey),
            )
            : dbDeleteSession(session.id, ownerKey)),
        ]);
        if (cancelled) return;
        persistedSessionIdsRef.current.add(fresh.id);
        commitSessions([fresh, ...rest]);
        setCurrentId(fresh.id);
        setIsPersistent(persistent);
        setLoadedOwnerKey(ownerKey);
        setIsLoading(false);
        return;
      }

      if (loaded.length > 0) {
        const current = loaded.find((s) => s.id === storedCurrentId) || loaded[0];
        commitSessions(loaded);
        setCurrentId(current.id);
        setIsPersistent(persistent);
        setLoadedOwnerKey(ownerKey);
        setIsLoading(false);
        return;
      }

      // Reached only once the theme song has been seeded already: the seed
      // above puts a session into `loaded`, so an empty history here means this
      // browser has had its turn.
      const fresh = makeEmptySession();
      await Promise.all([
        dbPutSession(fresh, ownerKey),
        dbPutCurrentSessionId(fresh.id, ownerKey),
      ]);
      persistedSessionIdsRef.current.add(fresh.id);
      commitSessions([fresh]);
      setCurrentId(fresh.id);
      setIsPersistent(persistent);
      setLoadedOwnerKey(ownerKey);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [
    ownerKey,
    isAccountOwner,
    syncEnabled,
    cloud,
    cloudOwnerId,
    startNewSessionToken,
    sessionCloudSync,
  ]);

  // False between an owner key change (sign-in / sign-out) and the new owner's
  // sessions finishing loading: the sessions held in memory still belong to the
  // previous owner.
  const ownerLoaded = loadedOwnerKey === ownerKey;
  const sessionsForOwner = ownerLoaded ? sessions : [];
  const currentIdForOwner = ownerLoaded ? currentId : null;
  const currentSession =
    sessionsForOwner.find((s) => s.id === currentIdForOwner) || sessionsForOwner[0] || null;

  // One rate limiter per owner: the store is keyed by owner, so a sign-in must
  // not let a write scheduled for the previous account land under the new one.
  const localWrites = useMemo(
    () => createSessionWriteThrottle<Session>(
      (session) => dbPutSession(session, ownerKey),
      LOCAL_WRITE_THROTTLE_MS,
    ),
    [ownerKey],
  );

  const flushLocalWrites = useCallback(async (sessionId?: string): Promise<void> => {
    await localWrites.flush(sessionId);
  }, [localWrites]);

  const rebindOddeNovaBridgeSession = useCallback(async (
    input: OddeNovaBridgeRebindInput,
  ): Promise<OddeNovaBridgeRebindResult> => {
    const ownerAtStart = ownerKey;
    if (
      input.ownerKey !== ownerAtStart
      || ownerKeyRef.current !== ownerAtStart
      || loadedOwnerKey !== ownerAtStart
    ) {
      throw new Error('Bridge rebind started for an inactive session owner');
    }
    const rebound = await dbRebindBridgeSessionState(input);
    if (ownerKeyRef.current !== ownerAtStart || loadedOwnerKey !== ownerAtStart) {
      throw new Error('Bridge rebind completed after the session owner changed');
    }
    if (!sessionsRef.current.some((session) => session.id === rebound.session.id)) {
      throw new Error('Bridge rebind returned a session that is not loaded for this owner');
    }

    // Publish only after the storage transaction has committed. Updating the
    // ref first lets the bridge resolver see the new binding before React's
    // next render; the visible session, order, draft, and current id remain
    // unchanged.
    sessionsRef.current = sessionsRef.current.map((session) => (
      session.id === rebound.session.id ? rebound.session : session
    ));
    setSessions((previous) => previous.map((session) => (
      session.id === rebound.session.id ? rebound.session : session
    )));
    persistedSessionIdsRef.current.add(rebound.session.id);
    if (sessionCloudSync) {
      void sessionCloudSync.checkpoint(rebound.session).catch(() => undefined);
    }
    return {
      sessionId: rebound.session.id,
      previousBindingId: input.previousBindingId,
      bindingId: input.bindingId,
    };
  }, [loadedOwnerKey, ownerKey, sessionCloudSync]);

  // Whatever a turn streamed since its last write is still only scheduled.
  // Unmounting or switching owners has to put it down before the limiter that
  // holds it is replaced, or the tail of the answer is lost.
  useEffect(() => () => { void localWrites.flush(); }, [localWrites]);

  // Same tail, lost a different way: a phone discards a backgrounded tab
  // without unmounting anything, so put the scheduled write down on the way
  // out rather than on the way back.
  useEffect(() => {
    const flush = (): void => { void localWrites.flush(); };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [localWrites]);

  const persistLocalSession = useCallback(
    (session: Session, options: { force?: boolean; streaming?: boolean } = {}) => {
      // A late writer (suggestion chips, a finishing agent turn) can fire during
      // that window. Persisting then would file the previous owner's session
      // under the new owner — leaking account history into the guest list.
      if (!ownerLoaded) return;
      if (
        isAccountOwner
        && !options.force
        && !persistedSessionIdsRef.current.has(session.id)
        && isEffectivelyEmpty(session)
      ) {
        return;
      }
      persistedSessionIdsRef.current.add(session.id);
      if (options.streaming) localWrites.schedule(session);
      else void localWrites.writeNow(session);
    },
    [isAccountOwner, ownerLoaded, localWrites],
  );

  const persistSession = useCallback(
    (session: Session, intent: CloudIntent = 'deferred') => {
      if (!ownerLoaded) return;
      const isNewEmptyAccountSession =
        isAccountOwner
        && !persistedSessionIdsRef.current.has(session.id)
        && isEffectivelyEmpty(session);
      if (isNewEmptyAccountSession && intent !== 'checkpoint') return;
      persistLocalSession(session, {
        force: intent === 'checkpoint',
        streaming: intent === 'streaming',
      });
      if (!sessionCloudSync) return;
      if (intent === 'checkpoint') {
        manualSyncPresentation.clear(session.id);
        void sessionCloudSync.checkpoint(session).catch(() => undefined);
      } else if (intent === 'debounced') {
        sessionCloudSync.debounce(session);
      } else {
        manualSyncPresentation.clear(session.id);
        sessionCloudSync.noteLocal(session);
      }
    },
    [
      isAccountOwner,
      ownerLoaded,
      persistLocalSession,
      sessionCloudSync,
      manualSyncPresentation,
    ],
  );

  const flushCloudSaves = useCallback(async (sessionId?: string): Promise<void> => {
    await sessionCloudSync?.flush(sessionId);
  }, [sessionCloudSync]);

  /**
   * Open a session on a cloud read. The read is authoritative only where the
   * working copy has nothing the cloud is missing: a copy carrying its own
   * later writes — a turn still being answered, an edit still on its way up —
   * stays as it is, and the session is opened on that instead. Registering the
   * accepted read as a synced cloud copy before changing React state keeps the
   * first subsequent editor mutation the only operation that can enqueue a
   * save.
   */
  const acceptCloudDetail = useCallback(async (session: Session, options: { activate?: boolean } = {}): Promise<Session | undefined> => {
    if (!ownerLoaded) return;
    const workingCopy = sessionsRef.current.find((existing) => existing.id === session.id);
    const workingCopyIsAhead = workingCopy !== undefined
      && workingCopy.updatedAt > session.updatedAt;
    const adopted = !workingCopyIsAhead
      && (sessionCloudSync?.acceptCloudSession(session) ?? true);
    if (adopted) {
      await localWrites.writeNow(session);
      persistedSessionIdsRef.current.add(session.id);
      setSessions((previous) => [
        session,
        ...previous.filter((existing) => existing.id !== session.id),
      ]);
    } else if (!workingCopy) {
      // Refused with nothing local to fall back on cannot happen — the sync
      // record that refused is the working copy's own — but opening a session
      // that is not in the list would strand the studio on an empty current id.
      return;
    }
    if (options.activate ?? true) {
      setCurrentId(session.id);
      await dbPutCurrentSessionId(session.id, ownerKey);
    }
    return adopted ? session : workingCopy;
  }, [localWrites, ownerKey, ownerLoaded, sessionCloudSync]);

  const updateCurrent = useCallback(
    (mut: (s: Session) => Session, intent: CloudIntent = 'deferred') => {
      setSessions((prev) => {
        const id = currentId || prev[0]?.id;
        if (!id) return prev;
        return prev.map((s) => {
          if (s.id !== id) return s;
          const mutated = mut(s);
          if (mutated === s) return s;
          const updated = { ...mutated, updatedAt: Date.now() };
          persistSession(updated, intent);
          return updated;
        });
      });
    },
    [currentId, persistSession]
  );

  const updateSession = useCallback(
    (
      sessionId: string,
      mut: (s: Session) => Session,
      intent: CloudIntent = 'deferred',
    ) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const mutated = mut(s);
          if (mutated === s) return s;
          const updated = { ...mutated, updatedAt: Date.now() };
          persistSession(updated, intent);
          return updated;
        })
      );
    },
    [persistSession]
  );

  // Pick the mutator for a given session: a specific one by id, or the current
  // session when no id is passed. Centralizes the branch reused by every writer.
  const getApply = useCallback(
    (
      sessionId?: string,
      intent: CloudIntent = 'deferred',
    ): ((fn: (s: Session) => Session) => void) =>
      sessionId
        ? (fn) => updateSession(sessionId, fn, intent)
        : (fn) => updateCurrent(fn, intent),
    [updateCurrent, updateSession]
  );

  const addUserMessage = useCallback(
    (content: string, sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => {
        const messages = [
          ...s.messages,
          {
            id: newMessageId(),
            role: 'user' as const,
            content,
            timestamp: Date.now(),
          },
        ];
        // Auto-rename on first user message.
        const shouldDeriveTitle = !s.messages.some((m) => m.role === 'user') && s.title === t('newSessionTitle');
        const title = shouldDeriveTitle ? deriveTitle(messages) : s.title;
        return { ...s, messages, title };
      });
    },
    [getApply]
  );

  const truncateAndEdit = useCallback(
    (targetMessageId: string, newContent: string): void => {
      updateCurrent((s) => applyTruncateAndEdit(s, targetMessageId, newContent));
    },
    [updateCurrent]
  );

  const truncate = useCallback(
    (targetMessageId: string): void => {
      updateCurrent((s) => applyTruncate(s, targetMessageId));
    },
    [updateCurrent]
  );

  const addAssistantMessage = useCallback(
    (
      content: string,
      code?: string,
      sessionId?: string,
      revisionDraft?: CodeRevisionDraft,
      inputMode?: InputMode,
    ): void => {
      const apply = getApply(sessionId);
      apply((s) => {
        const now = Date.now();
        const revision: CodeRevision | undefined = revisionDraft
          ? { ...revisionDraft, id: newRevisionId(), createdAt: now }
          : undefined;
        return {
          ...s,
          inputMode: inputMode ?? s.inputMode,
          revisions: revision ? [...(s.revisions ?? []), revision] : s.revisions,
          messages: [
            ...s.messages,
            {
              id: newMessageId(),
              role: 'assistant' as const,
              content,
              code,
              revisionId: revision?.id,
              inputMode,
              timestamp: now,
            },
          ],
        };
      });
    },
    [getApply]
  );

  const addProgress = useCallback(
    (kind: ProgressKind, content: string, opts?: { toolName?: string; ok?: boolean; sessionId?: string }): void => {
      const apply = getApply(opts?.sessionId);
      apply((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id: newMessageId(),
            role: 'progress' as const,
            content,
            timestamp: Date.now(),
            progressKind: kind,
            toolName: opts?.toolName,
            ok: opts?.ok,
          },
        ],
      }));
    },
    [getApply]
  );

  // Stream-append progress text: if the last message is already the same progress kind, append in-place; otherwise create a new one
  const appendToLastProgress = useCallback(
    (
      delta: string,
      kind: 'thinking' | 'reasoning',
      sessionId?: string,
      agentAttemptId?: string,
    ): void => {
      const apply = getApply(sessionId, 'streaming');
      apply((s) => applyAppendProgressDelta(s, delta, kind, agentAttemptId));
    },
    [getApply]
  );

  const appendToLastThinking = useCallback(
    (delta: string, sessionId?: string, agentAttemptId?: string): void =>
      appendToLastProgress(delta, 'thinking', sessionId, agentAttemptId),
    [appendToLastProgress]
  );

  const appendToLastReasoning = useCallback(
    (delta: string, sessionId?: string, agentAttemptId?: string): void =>
      appendToLastProgress(delta, 'reasoning', sessionId, agentAttemptId),
    [appendToLastProgress]
  );

  const appendToLastAssistant = useCallback(
    (delta: string, sessionId?: string, agentAttemptId?: string): void => {
      const apply = getApply(sessionId, 'streaming');
      apply((s) => applyAppendAssistantDelta(s, delta, agentAttemptId));
    },
    [getApply]
  );

  const discardAgentAttempt = useCallback(
    (attemptId: string, sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => applyDiscardAgentAttempt(s, attemptId));
    },
    [getApply]
  );

  const finalizeAgentAttempt = useCallback(
    (attemptId: string, sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => applyFinalizeAgentAttempt(s, attemptId));
    },
    [getApply]
  );

  const finalizeLastAssistantMessage = useCallback(
    (content: string, sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => applyFinalizeLastAssistantMessage(s, content));
    },
    [getApply]
  );

  const setCurrentCode = useCallback(
    (code: string, sessionId?: string) => {
      const apply = getApply(sessionId);
      apply((s) => ({ ...s, code }));
    },
    [getApply]
  );

  const setManualCode = useCallback(
    (code: string, sessionId?: string): Promise<void> =>
      new Promise((resolve) => {
        setSessions((previous) => {
          const id = sessionId ?? currentId ?? previous[0]?.id;
          if (!id) {
            resolve();
            return previous;
          }
          return previous.map((session) => {
            if (session.id !== id) return session;
            if (session.code === code) {
              resolve();
              return session;
            }
            const updated = { ...session, code, updatedAt: Date.now() };
            if (sessionCloudSync) manualSyncPresentation.markPending(id);
            persistSession(updated, 'debounced');
            resolve();
            return updated;
          });
        });
      }),
    [currentId, sessionCloudSync, manualSyncPresentation, persistSession],
  );

  const checkpointSession = useCallback(
    (sessionId: string): Promise<void> =>
      new Promise((resolve) => {
        if (!sessionCloudSync) {
          resolve();
          return;
        }
        setSessions((previous) => {
          const snapshot = previous.find((session) => session.id === sessionId);
          if (!snapshot) {
            resolve();
            return previous;
          }
          void sessionCloudSync.checkpoint(snapshot).then(resolve, resolve);
          return previous;
        });
      }),
    [sessionCloudSync],
  );

  const activateSession = useCallback((id: string): void => {
    setCurrentId(id);
    if (!isAccountOwner || persistedSessionIdsRef.current.has(id)) {
      void dbPutCurrentSessionId(id, ownerKey);
    }
  }, [isAccountOwner, ownerKey]);

  const newSession = useCallback(() => {
    setSessions((prev) => {
      const id = currentId || prev[0]?.id;
      const cur = prev.find((s) => s.id === id);
      // If the current session is already empty, reuse it instead of stacking
      // up another untouched "New Session".
      if (cur && isEffectivelyEmpty(cur)) {
        if (id) {
          if (currentId !== id) activateSession(id);
        }
        const refreshed = applyRefreshEmptySessionForReuse(cur, Date.now());
        persistLocalSession(refreshed);
        return prev.map((s) => s.id === cur.id ? refreshed : s);
      }
      // If there's already an empty session in the list, switch to it instead
      // of creating a duplicate. This handles the case where the user starts
      // with a new session, switches to an old one, then clicks "New Session".
      const existingEmpty = prev.find((s) => isEffectivelyEmpty(s));
      if (existingEmpty) {
        activateSession(existingEmpty.id);
        // Refresh createdAt so the reused empty session sorts to the top.
        const refreshed = applyRefreshEmptySessionForReuse(existingEmpty, Date.now());
        persistLocalSession(refreshed);
        return prev.map((s) => s.id === existingEmpty.id ? refreshed : s);
      }
      const fresh = makeEmptySession();
      noteCreatedSession(fresh.id);
      activateSession(fresh.id);
      persistLocalSession(fresh);
      return [fresh, ...prev];
    });
  }, [activateSession, currentId, noteCreatedSession, persistLocalSession]);

  const switchTo = useCallback((id: string) => {
    activateSession(id);
  }, [activateSession]);

  // Resolve only after the local mutation has registered its checkpoint. A
  // caller can then flush it without racing React's deferred state updater.
  const renameSession = useCallback(
    (sessionId: string, title: string): Promise<void> => {
      const nextTitle = title.trim();
      if (!nextTitle) return Promise.resolve();
      return new Promise((resolve) => {
        setSessions((previous) => {
          const next = previous.map((session) => {
            if (session.id !== sessionId) return session;
            const nextName = normalizeSessionTitle(nextTitle, session.title);
            const updated = { ...session, title: nextName, updatedAt: Date.now() };
            persistSession(updated, 'checkpoint');
            return updated;
          });
          resolve();
          return next;
        });
      });
    },
    [persistSession],
  );

  /**
   * Keep the conversation, or let it go — `favoritedAt` for the first, `null`
   * for the second. The moment is the caller's to pass so that undoing a
   * release puts the entry back where it stood in the list rather than at the
   * top of it, which is the whole difference between an undo and a re-do.
   */
  const setSessionFavorite = useCallback(
    (sessionId: string, favoritedAt: number | null): void => {
      updateSession(
        sessionId,
        (s) => {
          const next = favoritedAt ?? undefined;
          return s.favoritedAt === next ? s : { ...s, favoritedAt: next };
        },
        'checkpoint',
      );
    },
    [updateSession],
  );

  const deleteSession = useCallback(
    (id: string, onCloudDeleted?: () => void) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        const wasPersisted = persistedSessionIdsRef.current.has(id);
        persistedSessionIdsRef.current.delete(id);
        // Drop anything still scheduled for this id: a trailing streamed write
        // landing after the delete would put the row back.
        localWrites.discard(id);
        if (sessionCloudSync && (wasPersisted || !isAccountOwner)) {
          void sessionCloudSync.deleteSession(
            id,
            () => dbDeleteSessionStrict(id, ownerKey),
            onCloudDeleted,
          ).catch((err) => {
            console.warn('[sessions] cloud session delete failed.', err);
          });
        } else if (wasPersisted || !isAccountOwner) {
          void dbDeleteSession(id, ownerKey);
        }
        /* Where the studio goes when the conversation it is in is deleted.
           Not simply the next session on the list: a favorite is a session
           too, and it is kept on the Favorites page rather than in history —
           so falling onto one hands the user a conversation the panel they
           just deleted from does not even list, arriving out of nowhere.
           History's own next entry, which is what the panel shows and
           `historyItems` in App.tsx filters the same way.

           Only ever consulted for the session being left. Deleting some other
           conversation while sitting in a favorite is not a reason to be moved
           out of it. */
        const leavingCurrent = id === currentId;
        const successor = leavingCurrent
          ? next.find((session) => session.favoritedAt === undefined)
          : undefined;
        /* A fresh session when there is nowhere in history to land: either
           nothing is left at all, or everything left is kept. The favorites
           stay in the list — they are still the collection, they are just not
           somewhere the studio can be put down. */
        if (next.length === 0 || (leavingCurrent && !successor)) {
          const fresh = makeEmptySession();
          noteCreatedSession(fresh.id);
          activateSession(fresh.id);
          persistLocalSession(fresh);
          return [fresh, ...next];
        }
        if (successor) {
          activateSession(successor.id);
        }
        return next;
      });
    },
    [
      activateSession,
      currentId,
      isAccountOwner,
      localWrites,
      noteCreatedSession,
      ownerKey,
      persistLocalSession,
      sessionCloudSync,
    ],
  );

  const importSession = useCallback(
    async (
      payload: SessionImportPayload,
      // Opening a shared link should land on what was imported; syncing guest
      // history in bulk should leave the user where they were.
      options: { activate?: boolean; awaitCloud?: boolean } = {},
    ): Promise<void> => {
      const id = payload.id && isUuid(payload.id) ? payload.id : newSessionId();
      const now = Date.now();
      const session: Session = {
        id,
        title: normalizeSessionTitle(`${payload.title}`, t('newSessionTitle')),
        messages: payload.messages,
        code: payload.code,
        inputMode: payload.inputMode ?? inputModeReferencedBy(payload.messages),
        revisions: importedRevisions(payload.messages, payload.revisions),
        suggestions: payload.suggestions,
        externalSource: payload.externalSource,
        favoritedAt: payload.favoritedAt,
        createdAt: payload.createdAt ?? now,
        updatedAt: payload.updatedAt ?? now,
      };
      await localWrites.writeNow(session);
      persistedSessionIdsRef.current.add(id);
      noteCreatedSession(id);
      setSessions((prev) => [session, ...prev.filter((existing) => existing.id !== id)]);
      if (options.activate ?? true) {
        setCurrentId(id);
        dbPutCurrentSessionId(id, ownerKey);
      }
      if (options.awaitCloud) {
        if (!sessionCloudSync) {
          throw new Error('Session cloud sync is unavailable');
        }
        await sessionCloudSync.checkpoint(session);
        await sessionCloudSync.flush(id);
      } else {
        await sessionCloudSync?.checkpoint(session);
      }
    },
    [localWrites, noteCreatedSession, ownerKey, sessionCloudSync],
  );

  const importOddeNovaSession = useCallback(async (
    payload: OddeNovaImportPayload,
  ): Promise<OddeNovaImportOutcome> => {
    const now = Date.now();
    const messages: ChatMessage[] = payload.messages.map((message, index) => ({
      id: newMessageId(),
      role: message.role,
      content: message.content,
      timestamp: now + index,
    }));
    /* Hashed over the title as it will be *stored*, not as it arrived. The
       comparison below reads the stored title back, so hashing the raw one would
       make every long imported name mismatch itself on the next identical
       import — read as an edit the user never made, and branched. */
    const importedTitle = normalizeSessionTitle(payload.title, t('newSessionTitle'));
    const incomingHash = hashImportedContent({ ...payload, title: importedTitle });
    const source: ExternalSessionSource = {
      type: 'oddenova-strudel-skill',
      projectId: payload.projectId,
      importedContentHash: incomingHash,
    };
    const target = sessions.find((session) =>
      session.externalSource?.type === source.type &&
      session.externalSource.projectId === source.projectId
    );

    if (target?.externalSource?.protocolVersion === 2 || target?.externalSource?.protocolVersion === 3) {
      throw new Error('This project is managed by the local connection');
    }

    if (!target) {
      const created: Session = {
        id: newSessionId(),
        title: importedTitle,
        code: payload.code,
        messages,
        externalSource: source,
        createdAt: now,
        updatedAt: now,
      };
      await dbPutImportedSession(created, ownerKey);
      persistedSessionIdsRef.current.add(created.id);
      noteCreatedSession(created.id);
      setSessions((previous) => [created, ...previous]);
      setCurrentId(created.id);
      dbPutCurrentSessionId(created.id, ownerKey);
      await sessionCloudSync?.checkpoint(created);
      return 'created';
    }

    const currentHash = hashImportedContent({
      title: normalizeSessionTitle(target.title, t('newSessionTitle')),
      code: target.code,
      messages: target.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map(({ role, content }) => ({
          role: role as 'user' | 'assistant',
          content,
        })),
    });

    if (currentHash === target.externalSource?.importedContentHash) {
      const updated: Session = {
        ...target,
        title: importedTitle,
        code: payload.code,
        messages,
        externalSource: source,
        updatedAt: now,
      };
      await dbPutImportedSession(updated, ownerKey);
      persistedSessionIdsRef.current.add(updated.id);
      setSessions((previous) => previous.map((session) => session.id === target.id ? updated : session));
      setCurrentId(updated.id);
      dbPutCurrentSessionId(updated.id, ownerKey);
      await sessionCloudSync?.checkpoint(updated);
      return 'updated';
    }

    const detached: Session = { ...target, externalSource: undefined, updatedAt: now };
    /* The suffix is reserved out of the budget rather than appended past it, so
       a long imported name loses its own tail and still says which copy this
       is. The hash is taken over the same string that gets stored: hashing the
       untrimmed one would make the next identical import look edited and branch
       again. */
    const branchTitle = titleWithSuffix(importedTitle, t('branchSuffix'), t('newSessionTitle'));
    const branchSource: ExternalSessionSource = {
      ...source,
      importedContentHash: hashImportedContent({
        title: branchTitle,
        code: payload.code,
        messages: payload.messages,
      }),
    };
    const branch: Session = {
      id: newSessionId(),
      title: branchTitle,
      code: payload.code,
      messages,
      externalSource: branchSource,
      createdAt: now,
      updatedAt: now,
    };
    await dbPutImportedSessionBranch(detached, branch, ownerKey);
    persistedSessionIdsRef.current.add(detached.id);
    persistedSessionIdsRef.current.add(branch.id);
    noteCreatedSession(branch.id);
    setSessions((previous) => [
      branch,
      ...previous.map((session) => session.id === target.id ? detached : session),
    ]);
    setCurrentId(branch.id);
    dbPutCurrentSessionId(branch.id, ownerKey);

    await Promise.all([
      sessionCloudSync?.checkpoint(detached),
      sessionCloudSync?.checkpoint(branch),
    ]);
    return 'branched';
  }, [noteCreatedSession, ownerKey, sessions, sessionCloudSync]);

  const importOddeNovaBridgeSnapshot = useCallback(async (
    snapshot: AnyOddeNovaBridgeSnapshot,
    activeDraft?: { sessionId: string; code: string },
    binding?: OddeNovaBridgeImportBinding,
    context?: OddeNovaBridgeImportContext,
  ): Promise<OddeNovaBridgeImportResult> => {
    if (snapshot.protocolVersion === 3) {
      const persistBridgeSession = async (session: Session): Promise<void> => {
        if (binding?.bindingId) {
          const checkpoint: StoredBridgeCheckpoint = {
            ...(context?.checkpoint ?? {
              schemaVersion: 1,
              ownerKey,
              projectKey: `${normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl)}\0${snapshot.projectId}`,
              bindingId: binding.bindingId,
              sessionId: session.id,
              snapshot,
              updatedAt: Date.now(),
            }),
            ownerKey,
            bindingId: binding.bindingId,
            sessionId: session.id,
            projectKey: `${normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl)}\0${snapshot.projectId}`,
            snapshot: { ...snapshot, bindingId: snapshot.bindingId ?? binding.bindingId },
            updatedAt: Date.now(),
          };
          await dbCommitBridgeSessionState({
            ownerKey,
            session,
            checkpoint,
            deleteOutboxChangeIds: context?.deleteOutboxChangeIds,
            checkpointExpectation: context?.checkpointExpectation,
          });
          return;
        }
        await dbPutImportedSession(session, ownerKey);
      };
      const importedTitle = normalizeSessionTitle(snapshot.title, t('newSessionTitle'));
      const incomingHash = hashImportedContent({
        title: importedTitle,
        code: snapshot.code,
        messages: snapshot.messages.map(({ role, content }) => ({ role, content })),
      });
      const source: ExternalSessionSource = {
        type: 'oddenova-strudel-skill', projectId: snapshot.projectId,
        baseUrl: normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl),
        importedContentHash: incomingHash, protocolVersion: 3,
        revision: snapshot.revision, skillRevision: snapshot.skillRevision,
        bindingId: snapshot.bindingId ?? binding?.bindingId,
        bridgeContentHash: snapshot.contentHash,
      };
      const now = Date.now();
      const bridgeCandidates = sessionsRef.current.filter((session) => bridgeSourceMatchesSnapshot(session, snapshot, binding));
      const storedTarget = binding?.sessionId
        ? sessionsRef.current.find((session) => session.id === binding.sessionId)
        : bridgeCandidates.length === 1
          ? bridgeCandidates[0]
          : undefined;
      if (binding?.sessionId && (!storedTarget || !bridgeSourceMatchesSnapshot(storedTarget, snapshot, binding))) {
        throw new Error('The bound bridge session is missing or has a different project identity');
      }
      if (!binding?.sessionId && bridgeCandidates.length > 1) {
        throw new Error('The bridge binding is ambiguous; choose the explicitly paired session');
      }
      if (!storedTarget) {
        const created: Session = {
          id: newSessionId(), title: importedTitle, code: snapshot.code,
          messages: mergeBridgeMessages([], snapshot.messages).messages, externalSource: source,
          createdAt: now, updatedAt: now,
        };
        await persistBridgeSession(created);
        persistedSessionIdsRef.current.add(created.id);
        noteCreatedSession(created.id);
        setSessions((previous) => [created, ...previous]);
        setCurrentId(created.id);
        await dbPutCurrentSessionId(created.id, ownerKey);
        await sessionCloudSync?.checkpoint(created);
        return { outcome: 'created', sessionId: created.id, codeChanged: true, skillRevision: snapshot.skillRevision };
      }

      await localWrites.flush(storedTarget.id);
      const target = activeDraft?.sessionId === storedTarget.id ? { ...storedTarget, code: activeDraft.code } : storedTarget;
      const previousSource = target.externalSource;
      const previousRevision = previousSource?.revision ?? 0;
      if (previousSource?.protocolVersion === 2 && previousSource.revision === snapshot.revision) {
        const migrated = { ...target, externalSource: source, updatedAt: now };
        await persistBridgeSession(migrated);
        setSessions((previous) => previous.map((session) => session.id === migrated.id ? migrated : session));
        await sessionCloudSync?.checkpoint(migrated);
        return { outcome: 'unchanged', sessionId: migrated.id, codeChanged: false, skillRevision: snapshot.skillRevision };
      }
      if (
        snapshot.revision < previousRevision
        && snapshot.skillRevision <= (previousSource?.skillRevision ?? 0)
      ) return { outcome: 'unchanged', sessionId: target.id, codeChanged: false, skillRevision: previousSource?.skillRevision };
      if (snapshot.revision === previousRevision) {
        if (snapshot.skillRevision <= (previousSource?.skillRevision ?? 0)) {
          if (snapshot.contentHash !== previousSource?.bridgeContentHash) throw new Error('The same bridge revision arrived with different content');
          if (snapshot.bindingId && snapshot.bindingId !== previousSource?.bindingId) {
            const rebound = { ...target, externalSource: { ...source, bindingId: snapshot.bindingId } };
            await persistBridgeSession(rebound);
            setSessions((previous) => previous.map((session) => session.id === rebound.id ? rebound : session));
            await sessionCloudSync?.checkpoint(rebound);
            return { outcome: 'updated', sessionId: rebound.id, codeChanged: false, skillRevision: snapshot.skillRevision };
          }
          // A remounted page can have lost its in-memory baseline while the
          // session still records the exact helper revision/hash. Persist the
          // checkpoint without replacing the user's local working copy.
          await persistBridgeSession(target);
          return { outcome: 'unchanged', sessionId: target.id, codeChanged: false, skillRevision: snapshot.skillRevision };
        }
        if (snapshot.bindingId && snapshot.bindingId !== previousSource?.bindingId) {
          const rebound = { ...target, externalSource: { ...source, bindingId: snapshot.bindingId } };
          await persistBridgeSession(rebound);
          setSessions((previous) => previous.map((session) => session.id === rebound.id ? rebound : session));
          await sessionCloudSync?.checkpoint(rebound);
          return { outcome: 'updated', sessionId: rebound.id, codeChanged: false, skillRevision: snapshot.skillRevision };
        }
      }
      const codeChanged = target.code !== snapshot.code;
      const merged = mergeBridgeMessages(target.messages, snapshot.messages, context?.pendingMessageDelta);
      const updated: Session = {
        ...target,
        title: importedTitle,
        code: snapshot.code,
        messages: merged.messages,
        revisions: revisionsReferencedBy(merged.messages, target.revisions),
        suggestions: codeChanged ? undefined : target.suggestions,
        externalSource: source,
        updatedAt: now,
      };
      await persistBridgeSession(updated);
      persistedSessionIdsRef.current.add(updated.id);
      setSessions((previous) => previous.map((session) => session.id === updated.id ? updated : session));
      if (currentIdRef.current === updated.id) {
        setCurrentId(updated.id);
        await dbPutCurrentSessionId(updated.id, ownerKey);
      }
      await sessionCloudSync?.checkpoint(updated);
      return {
        outcome: 'updated', sessionId: updated.id, codeChanged, skillRevision: snapshot.skillRevision,
        ...(merged.hasPendingLocalMessages ? { hasPendingLocalMessages: true } : {}),
      };
    }
    const incomingDigests = await Promise.all(snapshot.messages.map(digestOddeNovaBridgeMessage));
    const importedTitle = normalizeSessionTitle(snapshot.title, t('newSessionTitle'));
    const incomingHash = hashImportedContent({
      title: importedTitle,
      code: snapshot.code,
      messages: snapshot.messages.map(({ role, content }) => ({ role, content })),
    });
    const source: ExternalSessionSource = {
      type: 'oddenova-strudel-skill',
      projectId: snapshot.projectId,
      importedContentHash: incomingHash,
      protocolVersion: 2,
      revision: snapshot.revision,
      bridgeContentHash: snapshot.contentHash,
      importedMessageDigests: incomingDigests,
    };
    const now = Date.now();
    const messages: ChatMessage[] = snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.receivedAt,
    }));
    const bridgeCandidates = sessionsRef.current.filter((session) => bridgeSourceMatchesSnapshot(session, snapshot, binding));
    const storedTarget = binding?.sessionId
      ? sessionsRef.current.find((session) => session.id === binding.sessionId)
      : bridgeCandidates.length === 1
        ? bridgeCandidates[0]
        : undefined;
    if (binding?.sessionId && (!storedTarget || !bridgeSourceMatchesSnapshot(storedTarget, snapshot, binding))) {
      throw new Error('The bound bridge session is missing or has a different project identity');
    }
    if (!binding?.sessionId && bridgeCandidates.length > 1) {
      throw new Error('The bridge binding is ambiguous; choose the explicitly paired session');
    }
    if (!storedTarget) {
      const created: Session = {
        id: newSessionId(),
        title: importedTitle,
        code: snapshot.code,
        messages,
        externalSource: source,
        createdAt: now,
        updatedAt: now,
      };
      await dbPutImportedSession(created, ownerKey);
      persistedSessionIdsRef.current.add(created.id);
      noteCreatedSession(created.id);
      setSessions((previous) => [created, ...previous]);
      setCurrentId(created.id);
      await dbPutCurrentSessionId(created.id, ownerKey);
      await sessionCloudSync?.checkpoint(created);
      return { outcome: 'created', sessionId: created.id };
    }

    await localWrites.flush(storedTarget.id);
    const target = activeDraft?.sessionId === storedTarget.id
      ? { ...storedTarget, code: activeDraft.code }
      : storedTarget;
    const previousSource = target.externalSource;
    if (previousSource?.protocolVersion === 2) {
      const previousRevision = previousSource.revision ?? 0;
      if (snapshot.revision < previousRevision) return { outcome: 'unchanged', sessionId: target.id };
      if (snapshot.revision === previousRevision) {
        if (snapshot.contentHash !== previousSource.bridgeContentHash) {
          throw new Error('The same bridge revision arrived with different content');
        }
        return { outcome: 'unchanged', sessionId: target.id };
      }
      const previousDigests = previousSource.importedMessageDigests ?? [];
      if (
        previousDigests.length > incomingDigests.length
        || previousDigests.some((digest, index) => digest !== incomingDigests[index])
      ) throw new Error('The incoming bridge snapshot shortens or changes imported history');
    } else {
      const previousCreative = target.messages.filter((message) => message.role === 'user' || message.role === 'assistant');
      if (
        previousCreative.length > snapshot.messages.length
        || previousCreative.some((message, index) => {
          const incoming = snapshot.messages[index];
          return !incoming || message.role !== incoming.role || message.content !== incoming.content;
        })
      ) throw new Error('The v2 snapshot does not contain the existing v1 history prefix');
    }

    const currentHash = hashImportedContent({
      title: normalizeSessionTitle(target.title, t('newSessionTitle')),
      code: target.code,
      messages: target.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map(({ role, content }) => ({ role: role as 'user' | 'assistant', content })),
    });
    if (currentHash === previousSource?.importedContentHash) {
      const updated: Session = {
        ...target,
        title: importedTitle,
        code: snapshot.code,
        messages,
        externalSource: source,
        updatedAt: now,
      };
      await dbPutImportedSession(updated, ownerKey);
      persistedSessionIdsRef.current.add(updated.id);
      setSessions((previous) => previous.map((session) => session.id === target.id ? updated : session));
      setCurrentId(updated.id);
      await dbPutCurrentSessionId(updated.id, ownerKey);
      await sessionCloudSync?.checkpoint(updated);
      return { outcome: 'updated', sessionId: updated.id };
    }

    const detached: Session = { ...target, externalSource: undefined, updatedAt: now };
    const branchTitle = titleWithSuffix(importedTitle, t('branchSuffix'), t('newSessionTitle'));
    const branchSource: ExternalSessionSource = {
      ...source,
      importedContentHash: hashImportedContent({
        title: branchTitle,
        code: snapshot.code,
        messages: snapshot.messages.map(({ role, content }) => ({ role, content })),
      }),
    };
    const branch: Session = {
      id: newSessionId(),
      title: branchTitle,
      code: snapshot.code,
      messages,
      externalSource: branchSource,
      createdAt: now,
      updatedAt: now,
    };
    await dbPutImportedSessionBranch(detached, branch, ownerKey);
    persistedSessionIdsRef.current.add(detached.id);
    persistedSessionIdsRef.current.add(branch.id);
    noteCreatedSession(branch.id);
    setSessions((previous) => [
      branch,
      ...previous.map((session) => session.id === target.id ? detached : session),
    ]);
    setCurrentId(branch.id);
    await dbPutCurrentSessionId(branch.id, ownerKey);
    await Promise.all([
      sessionCloudSync?.checkpoint(detached),
      sessionCloudSync?.checkpoint(branch),
    ]);
    return { outcome: 'branched', sessionId: branch.id };
  }, [localWrites, noteCreatedSession, ownerKey, sessionCloudSync]);

  const branchFromMessage = useCallback(
    (targetMessageId: string): void => {
      const session = sessions.find((s) => s.id === currentId) || sessions[0];
      if (!session) return;
      const index = session.messages.findIndex((m) => m.id === targetMessageId);
      if (index === -1) return;
      const sliced = session.messages.slice(0, index + 1);
      // Use the code from the target assistant message if available
      const targetMsg = session.messages[index];
      const code = (targetMsg.role === 'assistant' && targetMsg.code) ? targetMsg.code : session.code;
      const id = newSessionId();
      const now = Date.now();
      const branched: Session = {
        id,
        title: titleWithSuffix(session.title, t('branchSuffix'), t('newSessionTitle')),
        messages: sliced,
        code,
        inputMode: inputModeReferencedBy(sliced),
        revisions: revisionsReferencedBy(sliced, session.revisions),
        createdAt: now,
        updatedAt: now,
      };
      // Optimistic update: UI reflects immediately; DB write is fire-and-forget.
      // If dbPutSession fails, the session exists in memory for the current page
      // load but won't persist on refresh.
      noteCreatedSession(id);
      setSessions((prev) => [branched, ...prev]);
      setCurrentId(id);
      dbPutCurrentSessionId(id, ownerKey);
      persistSession(branched, 'checkpoint');
    },
    [sessions, currentId, noteCreatedSession, ownerKey, persistSession]
  );

  const setSuggestions = useCallback(
    (items: string[], forCode: string, sessionId?: string) => {
      const apply = getApply(sessionId);
      apply((s) => {
        const current = s.suggestions;
        if (
          current?.forCode === forCode
          && current.items.length === items.length
          && current.items.every((item, index) => item === items[index])
        ) {
          return s;
        }
        return { ...s, suggestions: { forCode, items } };
      });
    },
    [getApply]
  );

  const clearSuggestions = useCallback((sessionId?: string): void => {
    const apply = getApply(sessionId);
    apply((session) => session.suggestions === undefined
      ? session
      : { ...session, suggestions: undefined });
  }, [getApply]);

  return {
    sessions: sessionsForOwner,
    currentSession,
    currentSyncStatus: currentSession
      ? (
          syncState.ownerKey === ownerKey
            ? syncState.statuses[currentSession.id]
            : undefined
        ) ?? sessionCloudSync?.getStatus(currentSession.id)
      : undefined,
    currentManualSyncStatus: currentSession && manualSyncState.ownerKey === ownerKey
      ? manualSyncState.statuses[currentSession.id]
      : undefined,
    currentId: currentIdForOwner,
    isLoading,
    isPersistent,
    addUserMessage,
    truncateAndEdit,
    truncate,
    addAssistantMessage,
    addProgress,
    appendToLastThinking,
    appendToLastReasoning,
    appendToLastAssistant,
    discardAgentAttempt,
    finalizeAgentAttempt,
    finalizeLastAssistantMessage,
    setCurrentCode,
    setManualCode,
    checkpointSession,
    acceptCloudDetail,
    newSession,
    switchTo,
    renameSession,
    setSessionFavorite,
    deleteSession,
    importSession,
    importOddeNovaSession,
    importOddeNovaBridgeSnapshot,
    branchFromMessage,
    setSuggestions,
    clearSuggestions,
    flushLocalWrites,
    rebindOddeNovaBridgeSession,
    flushCloudSaves,
  };
}
