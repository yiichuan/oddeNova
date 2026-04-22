import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage, ProgressKind } from './useChat';

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  code: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'vibe-sessions-v1';
const STORAGE_CURRENT_KEY = 'vibe-sessions-current-v1';
const MAX_SESSIONS = 50;

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

function loadSessions(): { sessions: Session[]; currentId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cur = localStorage.getItem(STORAGE_CURRENT_KEY);
    if (!raw) return { sessions: [], currentId: null };
    const parsed = JSON.parse(raw) as Session[];
    if (!Array.isArray(parsed)) return { sessions: [], currentId: null };
    return { sessions: parsed, currentId: cur || parsed[0]?.id || null };
  } catch {
    return { sessions: [], currentId: null };
  }
}

function persistSessions(sessions: Session[], currentId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    if (currentId) localStorage.setItem(STORAGE_CURRENT_KEY, currentId);
  } catch {
    // localStorage may be full or unavailable; degrade silently.
  }
}

function getInitialSessionState(): { sessions: Session[]; currentId: string | null } {
  const { sessions: loaded, currentId: loadedId } = loadSessions();
  if (loaded.length === 0) {
    const fresh: Session = {
      id: newSessionId(),
      title: '新会话',
      messages: [],
      code: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persistSessions([fresh], fresh.id);
    return { sessions: [fresh], currentId: fresh.id };
  }
  const currentId = loadedId && loaded.some((s) => s.id === loadedId) ? loadedId : loaded[0].id;
  return { sessions: loaded, currentId };
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => getInitialSessionState().sessions);
  const [currentId, setCurrentId] = useState<string | null>(() => getInitialSessionState().currentId);

  // Load from storage on mount; create a fresh session if none exists.
  // (initialization is handled by useState lazy initializers above)

  // Persist on every change after initial load.
  useEffect(() => {
    if (sessions.length === 0) return;
    persistSessions(sessions, currentId);
  }, [sessions, currentId]);

  const currentSession =
    sessions.find((s) => s.id === currentId) || sessions[0] || null;

  const updateCurrent = useCallback(
    (mut: (s: Session) => Session) => {
      setSessions((prev) => {
        const id = currentId || prev[0]?.id;
        if (!id) return prev;
        return prev.map((s) => (s.id === id ? { ...mut(s), updatedAt: Date.now() } : s));
      });
    },
    [currentId]
  );

  const addUserMessage = useCallback(
    (content: string): void => {
      updateCurrent((s) => {
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
    [updateCurrent]
  );

  const addAssistantMessage = useCallback(
    (content: string, code?: string): void => {
      updateCurrent((s) => ({
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
    [updateCurrent]
  );

  const addProgress = useCallback(
    (kind: ProgressKind, content: string, opts?: { toolName?: string; ok?: boolean }): void => {
      updateCurrent((s) => ({
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
    [updateCurrent]
  );

  const setCurrentCode = useCallback(
    (code: string) => {
      updateCurrent((s) => ({ ...s, code }));
    },
    [updateCurrent]
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
      const fresh: Session = {
        id: newSessionId(),
        title: '新会话',
        messages: [],
        code: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setCurrentId(fresh.id);
      return [fresh, ...prev].slice(0, MAX_SESSIONS);
    });
  }, [currentId]);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const fresh: Session = {
            id: newSessionId(),
            title: '新会话',
            messages: [],
            code: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setCurrentId(fresh.id);
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
    addUserMessage,
    addAssistantMessage,
    addProgress,
    setCurrentCode,
    newSession,
    switchTo,
    deleteSession,
  };
}
