import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, ProgressKind } from './useChat';
import {
  openDB,
  getAllSessions,
  getCurrentSessionId,
  putSession as dbPutSession,
  putCurrentSessionId as dbPutCurrentSessionId,
  putImportedSession as dbPutImportedSession,
  putImportedSessionBranch as dbPutImportedSessionBranch,
  deleteSession as dbDeleteSession,
  isSessionStoragePersistent,
} from '../lib/session-storage';
import { t } from '../lib/i18n';
import { pickGreeting } from '../lib/greetings';
import { hashImportedContent, type OddeNovaImportPayload } from '../lib/oddenova-import';

export interface TokenStats {
  promptTokens: number;
  systemEstimate: number;
  modelId: string;
}

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
  externalSource?: ExternalSessionSource;
  /** Optional for backward compatibility with sessions saved before revisions existed. */
  revisions?: CodeRevision[];
  tokenStats?: TokenStats;
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

let messageId = 0;

function newSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newMessageId(): string {
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
  return { ...s, messages, revisions: revisionsReferencedBy(messages, s.revisions), title };
}

export function applyTruncate(s: Session, targetMessageId: string): Session {
  const index = s.messages.findIndex((m) => m.id === targetMessageId);
  if (index === -1) return s;
  const messages = s.messages.slice(0, index);
  return { ...s, messages, revisions: revisionsReferencedBy(messages, s.revisions) };
}

export function applyRefreshEmptySessionForReuse(s: Session, now: number): Session {
  return {
    ...s,
    title: t('newSessionTitle'),
    messages: [makeGreetingMessage()],
    createdAt: now,
    updatedAt: now,
  };
}

export function applyAppendAssistantDelta(s: Session, delta: string): Session {
  const messages = [...s.messages];
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant' && !last.code) {
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
      },
    ],
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

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPersistent, setIsPersistent] = useState(false);

  // Initialize: open DB (+ migrate) then load all sessions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openDB();
      const persistent = isSessionStoragePersistent();
      const [loaded, storedCurrentId] = await Promise.all([
        getAllSessions(),
        getCurrentSessionId(),
      ]);
      if (cancelled) return;

      if (loaded.length > 0) {
        const current = loaded.find((s) => s.id === storedCurrentId) || loaded[0];
        setSessions(loaded);
        setCurrentId(current.id);
        setIsPersistent(persistent);
        setIsLoading(false);
        return;
      }

      const fresh = makeEmptySession();
      await Promise.all([
        dbPutSession(fresh),
        dbPutCurrentSessionId(fresh.id),
      ]);
      setSessions([fresh]);
      setCurrentId(fresh.id);
      setIsPersistent(persistent);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const currentSession =
    sessions.find((s) => s.id === currentId) || sessions[0] || null;

  const updateCurrent = useCallback(
    (mut: (s: Session) => Session) => {
      setSessions((prev) => {
        const id = currentId || prev[0]?.id;
        if (!id) return prev;
        return prev.map((s) => {
          if (s.id !== id) return s;
          const updated = { ...mut(s), updatedAt: Date.now() };
          dbPutSession(updated);
          return updated;
        });
      });
    },
    [currentId]
  );

  const updateSession = useCallback(
    (sessionId: string, mut: (s: Session) => Session) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const updated = { ...mut(s), updatedAt: Date.now() };
          dbPutSession(updated);
          return updated;
        })
      );
    },
    []
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
    (content: string, code?: string, sessionId?: string, revisionDraft?: CodeRevisionDraft): void => {
      const apply = getApply(sessionId);
      apply((s) => {
        const now = Date.now();
        const revision: CodeRevision | undefined = revisionDraft
          ? { ...revisionDraft, id: newRevisionId(), createdAt: now }
          : undefined;
        return {
          ...s,
          revisions: revision ? [...(s.revisions ?? []), revision] : s.revisions,
          messages: [
            ...s.messages,
            {
              id: newMessageId(),
              role: 'assistant' as const,
              content,
              code,
              revisionId: revision?.id,
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
    (delta: string, kind: 'thinking' | 'reasoning', sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => {
        const messages = [...s.messages];
        const last = messages[messages.length - 1];
        if (last?.role === 'progress' && last.progressKind === kind) {
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
            },
          ],
        };
      });
    },
    [getApply]
  );

  const appendToLastThinking = useCallback(
    (delta: string, sessionId?: string): void => appendToLastProgress(delta, 'thinking', sessionId),
    [appendToLastProgress]
  );

  const appendToLastReasoning = useCallback(
    (delta: string, sessionId?: string): void => appendToLastProgress(delta, 'reasoning', sessionId),
    [appendToLastProgress]
  );

  const appendToLastAssistant = useCallback(
    (delta: string, sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => applyAppendAssistantDelta(s, delta));
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

  const newSession = useCallback(() => {
    setSessions((prev) => {
      const id = currentId || prev[0]?.id;
      const cur = prev.find((s) => s.id === id);
      // If the current session is already empty, reuse it instead of stacking
      // up another untouched "New Session".
      if (cur && isEffectivelyEmpty(cur)) {
        if (id) {
          if (currentId !== id) setCurrentId(id);
          dbPutCurrentSessionId(id);
        }
        const refreshed = applyRefreshEmptySessionForReuse(cur, Date.now());
        dbPutSession(refreshed);
        return prev.map((s) => s.id === cur.id ? refreshed : s);
      }
      // If there's already an empty session in the list, switch to it instead
      // of creating a duplicate. This handles the case where the user starts
      // with a new session, switches to an old one, then clicks "New Session".
      const existingEmpty = prev.find((s) => isEffectivelyEmpty(s));
      if (existingEmpty) {
        setCurrentId(existingEmpty.id);
        dbPutCurrentSessionId(existingEmpty.id);
        // Refresh createdAt so the reused empty session sorts to the top.
        const refreshed = applyRefreshEmptySessionForReuse(existingEmpty, Date.now());
        dbPutSession(refreshed);
        return prev.map((s) => s.id === existingEmpty.id ? refreshed : s);
      }
      const fresh = makeEmptySession();
      setCurrentId(fresh.id);
      dbPutCurrentSessionId(fresh.id);
      dbPutSession(fresh);
      return [fresh, ...prev];
    });
  }, [currentId]);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
    dbPutCurrentSessionId(id);
  }, []);

  const renameSession = useCallback(
    (sessionId: string, title: string): void => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      updateSession(sessionId, (s) => ({ ...s, title: nextTitle.slice(0, 60) }));
    },
    [updateSession]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        dbDeleteSession(id);
        if (next.length === 0) {
          const fresh = makeEmptySession();
          setCurrentId(fresh.id);
          dbPutCurrentSessionId(fresh.id);
          dbPutSession(fresh);
          return [fresh];
        }
        if (id === currentId) {
          setCurrentId(next[0].id);
          dbPutCurrentSessionId(next[0].id);
        }
        return next;
      });
    },
    [currentId]
  );

  const importSession = useCallback(
    async (payload: { title: string; code: string; messages: ChatMessage[] }): Promise<void> => {
      const id = newSessionId();
      const now = Date.now();
      const session: Session = {
        id,
        title: `${payload.title}`,
        messages: payload.messages,
        code: payload.code,
        createdAt: now,
        updatedAt: now,
      };
      await dbPutSession(session);
      setSessions((prev) => [session, ...prev]);
      setCurrentId(id);
      dbPutCurrentSessionId(id);
    },
    []
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
      await dbPutImportedSession(created);
      setSessions((previous) => [created, ...previous]);
      setCurrentId(created.id);
      dbPutCurrentSessionId(created.id);
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
      await dbPutImportedSession(updated);
      setSessions((previous) => previous.map((session) => session.id === target.id ? updated : session));
      setCurrentId(updated.id);
      dbPutCurrentSessionId(updated.id);
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
    await dbPutImportedSessionBranch(detached, branch);
    setSessions((previous) => [
      branch,
      ...previous.map((session) => session.id === target.id ? detached : session),
    ]);
    setCurrentId(branch.id);
    dbPutCurrentSessionId(branch.id);
    return 'branched';
  }, [sessions]);

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
        revisions: revisionsReferencedBy(sliced, session.revisions),
        createdAt: now,
        updatedAt: now,
      };
      // Optimistic update: UI reflects immediately; DB write is fire-and-forget.
      // If dbPutSession fails, the session exists in memory for the current page
      // load but won't persist on refresh.
      setSessions((prev) => [branched, ...prev]);
      setCurrentId(id);
      dbPutCurrentSessionId(id);
      dbPutSession(branched).catch(console.error);
    },
    [sessions, currentId]
  );

  const updateTokenStats = useCallback(
    (stats: TokenStats, sessionId?: string) => {
      const apply = getApply(sessionId);
      apply((s) => ({ ...s, tokenStats: stats }));
    },
    [getApply]
  );

  const setSuggestions = useCallback(
    (items: string[], forCode: string, sessionId?: string) => {
      const apply = getApply(sessionId);
      apply((s) => ({ ...s, suggestions: { forCode, items } }));
    },
    [getApply]
  );

  return {
    sessions,
    currentSession,
    currentId,
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
    finalizeLastAssistantMessage,
    setCurrentCode,
    newSession,
    switchTo,
    renameSession,
    deleteSession,
    importSession,
    importOddeNovaSession,
    branchFromMessage,
    updateTokenStats,
    setSuggestions,
  };
}
