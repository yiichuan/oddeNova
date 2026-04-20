import { useState, useCallback } from 'react';

export type ChatRole = 'user' | 'assistant' | 'progress';

export type ProgressKind = 'tool_call' | 'tool_result' | 'commit' | 'warn' | 'iteration';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  code?: string;
  timestamp: number;
  // For role === 'progress':
  progressKind?: ProgressKind;
  toolName?: string;
  ok?: boolean;
}

let messageId = 0;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addUserMessage = useCallback((content: string): void => {
    const msg: ChatMessage = {
      id: `msg-${++messageId}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const addAssistantMessage = useCallback(
    (content: string, code?: string): void => {
      const msg: ChatMessage = {
        id: `msg-${++messageId}`,
        role: 'assistant',
        content,
        code,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

  const addProgress = useCallback(
    (kind: ProgressKind, content: string, opts?: { toolName?: string; ok?: boolean }): void => {
      const msg: ChatMessage = {
        id: `msg-${++messageId}`,
        role: 'progress',
        content,
        timestamp: Date.now(),
        progressKind: kind,
        toolName: opts?.toolName,
        ok: opts?.ok,
      };
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    setIsLoading,
    addUserMessage,
    addAssistantMessage,
    addProgress,
    clearMessages,
  };
}
