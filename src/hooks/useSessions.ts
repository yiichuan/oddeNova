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
} from '../lib/session-storage';
import { t } from '../lib/i18n';
import { pickGreeting } from '../lib/greetings';
import { hashImportedContent, type OddeNovaImportPayload } from '../lib/oddenova-import';
import {
  createSessionCloudSync,
  type SessionSyncStatus,
} from '../lib/session-cloud-sync';
import { reconcileSessions } from '../lib/session-reconciliation';
import {
  readPendingSessionOperations,
  type PendingSessionOperations,
} from '../lib/session-sync-storage';

export interface ExternalSessionSource {
  type: 'oddenova-strudel-skill';
  projectId: string;
  importedContentHash: string;
}

export type OddeNovaImportOutcome = 'created' | 'updated' | 'branched';

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
  createdAt: number;
  updatedAt: number;
}

export interface CloudSessionRepository {
  listSessions: (expectedUserId?: string) => Promise<Session[]>;
  saveSession: (session: Session, expectedUserId?: string) => Promise<void>;
  deleteSession: (id: string, expectedUserId?: string) => Promise<void>;
}

export interface UseSessionsOptions {
  ownerKey?: string;
  syncEnabled?: boolean;
  cloud?: CloudSessionRepository;
  startNewSessionToken?: number;
}

type CloudIntent = 'deferred' | 'debounced' | 'checkpoint';

interface ManualSyncPresentation {
  markPending: (sessionId: string) => void;
  clear: (sessionId: string) => void;
  handleStatus: (sessionId: string, status: SessionSyncStatus | undefined) => void;
  dispose: () => void;
}

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

export type SessionImportPayload = Pick<Session, 'title' | 'code' | 'messages'> &
  Partial<Pick<Session, 'id' | 'inputMode' | 'revisions' | 'suggestions' | 'externalSource' | 'createdAt' | 'updatedAt'>>;

/**
 * Exported so the few callers that hand a ready-made message to
 * `importSession` mint ids the same way the rest of the session store does,
 * rather than growing a second id convention.
 */
export function newMessageId(): string {
  return `msg-${Date.now()}-${++messageId}`;
}

function makeGreetingMessage(): ChatMessage {
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
  if (text.length <= 20) return text;
  return text.slice(0, 20) + '…';
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
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

  // Initialize: open DB (+ migrate) then load all sessions
  useEffect(() => {
    let cancelled = false;
    createdDuringLoadRef.current = { ownerKey, ids: new Set() };
    // Apply a loaded list without dropping what was created since the load
    // started. Sessions that predate the load are not carried over: this load
    // is the authority on those, including the ones reconciliation deleted.
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
      const storedCurrentId = await getCurrentSessionId(ownerKey);
      let loaded = await getAllSessions(ownerKey);
      let pending: PendingSessionOperations = {
        syncIds: new Set(),
        deleteIds: new Set(),
      };
      let cloudSessionIds = new Set<string>();
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

        if (pendingOperationsKnown) {
          try {
            const remote = await cloud.listSessions(cloudOwnerId);
            cloudSessionIds = new Set(remote.map((session) => session.id));
            const localBeforeReconcile = loaded;
            loaded = reconcileSessions(loaded, remote, pending);
            const retainedIds = new Set(loaded.map((session) => session.id));
            const removedLocalSessions = localBeforeReconcile
              .filter((session) => !retainedIds.has(session.id));
            await Promise.all([
              ...loaded.map((session) => dbPutSession(session, ownerKey)),
              ...removedLocalSessions.map((session) => sessionCloudSync.deleteSession(
                session.id,
                () => dbDeleteSessionStrict(session.id, ownerKey),
              )),
            ]);
          } catch (err) {
            console.warn('[sessions] cloud session load failed; using local cache.', err);
          }
        }
      }
      if (cancelled) return;
      if (pendingOperationsKnown) {
        sessionCloudSync?.hydrate(loaded, pending.syncIds, pending.deleteIds, cloudSessionIds);
      }

      const shouldStartNewSession = startNewSessionToken > consumedStartNewSessionTokenRef.current;
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

      const fresh = makeEmptySession();
      await Promise.all([
        dbPutSession(fresh, ownerKey),
        dbPutCurrentSessionId(fresh.id, ownerKey),
      ]);
      commitSessions([fresh]);
      setCurrentId(fresh.id);
      setIsPersistent(persistent);
      setLoadedOwnerKey(ownerKey);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [
    ownerKey,
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

  const persistLocalSession = useCallback(
    (session: Session) => {
      // A late writer (suggestion chips, a finishing agent turn) can fire during
      // that window. Persisting then would file the previous owner's session
      // under the new owner — leaking account history into the guest list.
      if (!ownerLoaded) return;
      void dbPutSession(session, ownerKey);
    },
    [ownerLoaded, ownerKey],
  );

  const persistSession = useCallback(
    (session: Session, intent: CloudIntent = 'deferred') => {
      if (!ownerLoaded) return;
      persistLocalSession(session);
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
    [ownerLoaded, persistLocalSession, sessionCloudSync, manualSyncPresentation],
  );

  const flushCloudSaves = useCallback(async (sessionId?: string): Promise<void> => {
    await sessionCloudSync?.flush(sessionId);
  }, [sessionCloudSync]);

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
    (sessionId?: string): ((fn: (s: Session) => Session) => void) =>
      sessionId ? (fn) => updateSession(sessionId, fn) : updateCurrent,
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
      const apply = getApply(sessionId);
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
      const apply = getApply(sessionId);
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

  const newSession = useCallback(() => {
    setSessions((prev) => {
      const id = currentId || prev[0]?.id;
      const cur = prev.find((s) => s.id === id);
      // If the current session is already empty, reuse it instead of stacking
      // up another untouched "New Session".
      if (cur && isEffectivelyEmpty(cur)) {
        if (id) {
          if (currentId !== id) setCurrentId(id);
          dbPutCurrentSessionId(id, ownerKey);
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
        setCurrentId(existingEmpty.id);
        dbPutCurrentSessionId(existingEmpty.id, ownerKey);
        // Refresh createdAt so the reused empty session sorts to the top.
        const refreshed = applyRefreshEmptySessionForReuse(existingEmpty, Date.now());
        persistLocalSession(refreshed);
        return prev.map((s) => s.id === existingEmpty.id ? refreshed : s);
      }
      const fresh = makeEmptySession();
      noteCreatedSession(fresh.id);
      setCurrentId(fresh.id);
      dbPutCurrentSessionId(fresh.id, ownerKey);
      persistLocalSession(fresh);
      return [fresh, ...prev];
    });
  }, [currentId, ownerKey, noteCreatedSession, persistLocalSession]);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
    dbPutCurrentSessionId(id, ownerKey);
  }, [ownerKey]);

  const renameSession = useCallback(
    (sessionId: string, title: string): void => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      updateSession(
        sessionId,
        (s) => ({ ...s, title: nextTitle.slice(0, 60) }),
        'checkpoint',
      );
    },
    [updateSession]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (sessionCloudSync) {
          void sessionCloudSync.deleteSession(
            id,
            () => dbDeleteSessionStrict(id, ownerKey),
          ).catch((err) => {
            console.warn('[sessions] cloud session delete failed.', err);
          });
        } else {
          void dbDeleteSession(id, ownerKey);
        }
        if (next.length === 0) {
          const fresh = makeEmptySession();
          noteCreatedSession(fresh.id);
          setCurrentId(fresh.id);
          dbPutCurrentSessionId(fresh.id, ownerKey);
          persistLocalSession(fresh);
          return [fresh];
        }
        if (id === currentId) {
          setCurrentId(next[0].id);
          dbPutCurrentSessionId(next[0].id, ownerKey);
        }
        return next;
      });
    },
    [currentId, noteCreatedSession, ownerKey, persistLocalSession, sessionCloudSync],
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
        title: `${payload.title}`,
        messages: payload.messages,
        code: payload.code,
        inputMode: payload.inputMode ?? inputModeReferencedBy(payload.messages),
        revisions: importedRevisions(payload.messages, payload.revisions),
        suggestions: payload.suggestions,
        externalSource: payload.externalSource,
        createdAt: payload.createdAt ?? now,
        updatedAt: payload.updatedAt ?? now,
      };
      await dbPutSession(session, ownerKey);
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
    [noteCreatedSession, ownerKey, sessionCloudSync],
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
    const incomingHash = hashImportedContent(payload);
    const source: ExternalSessionSource = {
      type: 'oddenova-strudel-skill',
      projectId: payload.projectId,
      importedContentHash: incomingHash,
    };
    const target = sessions.find((session) =>
      session.externalSource?.type === source.type &&
      session.externalSource.projectId === source.projectId
    );

    if (!target) {
      const created: Session = {
        id: newSessionId(),
        title: payload.title,
        code: payload.code,
        messages,
        externalSource: source,
        createdAt: now,
        updatedAt: now,
      };
      await dbPutImportedSession(created, ownerKey);
      noteCreatedSession(created.id);
      setSessions((previous) => [created, ...previous]);
      setCurrentId(created.id);
      dbPutCurrentSessionId(created.id, ownerKey);
      await sessionCloudSync?.checkpoint(created);
      return 'created';
    }

    const currentHash = hashImportedContent({
      title: target.title,
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
        title: payload.title,
        code: payload.code,
        messages,
        externalSource: source,
        updatedAt: now,
      };
      await dbPutImportedSession(updated, ownerKey);
      setSessions((previous) => previous.map((session) => session.id === target.id ? updated : session));
      setCurrentId(updated.id);
      dbPutCurrentSessionId(updated.id, ownerKey);
      await sessionCloudSync?.checkpoint(updated);
      return 'updated';
    }

    const detached: Session = { ...target, externalSource: undefined, updatedAt: now };
    const branchTitle = `${payload.title}${t('branchSuffix')}`;
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
        title: `${session.title}${t('branchSuffix')}`,
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
    newSession,
    switchTo,
    renameSession,
    deleteSession,
    importSession,
    importOddeNovaSession,
    branchFromMessage,
    setSuggestions,
    flushCloudSaves,
  };
}
