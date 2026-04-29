import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, ProgressKind } from './useChat';
import {
  openDB,
  getAllSessions,
  putSession as dbPutSession,
  deleteSession as dbDeleteSession,
} from '../lib/session-storage';

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  code: string;
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
  if (!firstUser) return '新会话';
  const text = firstUser.content.trim();
  if (text.length <= 20) return text;
  return text.slice(0, 20) + '…';
}

function makeEmptySession(): Session {
  return {
    id: newSessionId(),
    title: '新会话',
    messages: [],
    code: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
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

      // 每次启动/刷新都创建新会话
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

  const addUserMessage = useCallback(
    (content: string, sessionId?: string): void => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
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
        const title = s.messages.some((m) => m.role === 'user') ? s.title : deriveTitle(messages);
        return { ...s, messages, title };
      });
    },
    [updateCurrent, updateSession]
  );

  const addAssistantMessage = useCallback(
    (content: string, code?: string, sessionId?: string): void => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
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
    [updateCurrent, updateSession]
  );

  const addProgress = useCallback(
    (kind: ProgressKind, content: string, opts?: { toolName?: string; ok?: boolean; sessionId?: string }): void => {
      const apply = opts?.sessionId
        ? (fn: (s: Session) => Session) => updateSession(opts.sessionId!, fn)
        : updateCurrent;
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
    [updateCurrent, updateSession]
  );

  // 流式追加思考文字：若最后一条消息是 thinking，则原地拼接；否则新建一条
  const appendToLastThinking = useCallback(
    (delta: string, sessionId?: string): void => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
      apply((s) => {
        const messages = [...s.messages];
        const last = messages[messages.length - 1];
        if (last?.role === 'progress' && last.progressKind === 'thinking') {
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
              progressKind: 'thinking' as const,
            },
          ],
        };
      });
    },
    [updateCurrent, updateSession]
  );

  const setCurrentCode = useCallback(
    (code: string, sessionId?: string) => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
      apply((s) => ({ ...s, code }));
    },
    [updateCurrent, updateSession]
  );

  const newSession = useCallback(() => {
    setSessions((prev) => {
      const id = currentId || prev[0]?.id;
      const cur = prev.find((s) => s.id === id);
      // If the current session is already empty, reuse it instead of stacking
      // up another untouched "新会话".
      if (cur && cur.messages.length === 0 && !cur.code) {
        if (id && currentId !== id) setCurrentId(id);
        return prev;
      }
      // If there's already an empty session in the list, switch to it instead
      // of creating a duplicate. This handles the case where the user starts
      // with a new session, switches to an old one, then clicks "New Session".
      const existingEmpty = prev.find((s) => s.messages.length === 0 && !s.code);
      if (existingEmpty) {
        setCurrentId(existingEmpty.id);
        // Refresh createdAt so the reused empty session sorts to the top.
        const refreshed = { ...existingEmpty, createdAt: Date.now(), updatedAt: Date.now() };
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

  return {
    sessions,
    currentSession,
    currentId,
    isLoading,
    addUserMessage,
    addAssistantMessage,
    addProgress,
    appendToLastThinking,
    setCurrentCode,
    newSession,
    switchTo,
    deleteSession,
  };
}
