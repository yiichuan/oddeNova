import { useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  code?: string;
  timestamp: number;
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

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    setIsLoading,
    addUserMessage,
    addAssistantMessage,
    clearMessages,
  };
}
