import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, ProgressKind } from './useChat';
import {
  openDB,
  getAllSessions,
  putSession as dbPutSession,
  deleteSession as dbDeleteSession,
} from '../lib/session-storage';
import { t } from '../lib/i18n';

export interface TokenStats {
  promptTokens: number;
  systemEstimate: number;
  modelId: string;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  code: string;
  tokenStats?: TokenStats;
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
    messages: [],
    code: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function applyTruncateAndEdit(s: Session, targetMessageId: string, newContent: string): Session {
  const index = s.messages.findIndex((m) => m.id === targetMessageId);
  if (index === -1) return s;
  const before = s.messages.slice(0, index);
  const newMsg = {
    id: newMessageId(),
    role: 'user' as const,
    content: newContent,
    timestamp: Date.now(),
  };
  const messages = [...before, newMsg];
  const shouldDeriveTitle = !before.some((m) => m.role === 'user') && s.title === t('newSessionTitle');
  const title = shouldDeriveTitle ? deriveTitle(messages) : s.title;
  return { ...s, messages, title };
}

export function applyTruncate(s: Session, targetMessageId: string): Session {
  const index = s.messages.findIndex((m) => m.id === targetMessageId);
  if (index === -1) return s;
  return { ...s, messages: s.messages.slice(0, index) };
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize: open DB (+ migrate) then load all sessions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openDB();
      const loaded = await getAllSessions();
      if (cancelled) return;

      // Create a new session on every startup/refresh
      const fresh = makeEmptySession();
      await dbPutSession(fresh);
      setSessions([fresh, ...loaded]);
      setCurrentId(fresh.id);
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
    (content: string, code?: string, sessionId?: string): void => {
      const apply = getApply(sessionId);
      apply((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id: newMessageId(),
            role: 'assistant' as const,
            content,
            code,
            timestamp: Date.now(),
          },
        ],
      }));
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
      if (cur && cur.messages.length === 0 && !cur.code) {
        if (id && currentId !== id) setCurrentId(id);
        const refreshed = { ...cur, title: t('newSessionTitle'), updatedAt: Date.now() };
        dbPutSession(refreshed);
        return prev.map((s) => s.id === cur.id ? refreshed : s);
      }
      // If there's already an empty session in the list, switch to it instead
      // of creating a duplicate. This handles the case where the user starts
      // with a new session, switches to an old one, then clicks "New Session".
      const existingEmpty = prev.find((s) => s.messages.length === 0 && !s.code);
      if (existingEmpty) {
        setCurrentId(existingEmpty.id);
        // Refresh createdAt so the reused empty session sorts to the top.
        const refreshed = { ...existingEmpty, title: t('newSessionTitle'), createdAt: Date.now(), updatedAt: Date.now() };
        dbPutSession(refreshed);
        return prev.map((s) => s.id === existingEmpty.id ? refreshed : s);
      }
      const fresh = makeEmptySession();
      setCurrentId(fresh.id);
      dbPutSession(fresh);
      return [fresh, ...prev];
    });
  }, [currentId]);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
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
          dbPutSession(fresh);
          return [fresh];
        }
        if (id === currentId) setCurrentId(next[0].id);
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
    },
    []
  );

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
        createdAt: now,
        updatedAt: now,
      };
      // Optimistic update: UI reflects immediately; DB write is fire-and-forget.
      // If dbPutSession fails, the session exists in memory for the current page
      // load but won't persist on refresh.
      setSessions((prev) => [branched, ...prev]);
      setCurrentId(id);
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

  return {
    sessions,
    currentSession,
    currentId,
    isLoading,
    addUserMessage,
    truncateAndEdit,
    truncate,
    addAssistantMessage,
    addProgress,
    appendToLastThinking,
    appendToLastReasoning,
    setCurrentCode,
    newSession,
    switchTo,
    renameSession,
    deleteSession,
    importSession,
    branchFromMessage,
    updateTokenStats,
  };
}
