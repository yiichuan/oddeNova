import type { ConversationTurn } from '../agent/loop';
import type { ChatMessage } from '../hooks/useChat';

type ConversationMessage = ChatMessage & { role: 'user' | 'assistant' };

function isConversationMessage(message: ChatMessage): message is ConversationMessage {
  return message.role === 'user' || message.role === 'assistant';
}

export function conversationHistoryFromMessages(messages: ChatMessage[]): ConversationTurn[] {
  return messages
    .filter(isConversationMessage)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function conversationHistoryBefore(messages: ChatMessage[], messageId: string): ConversationTurn[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return [];
  return conversationHistoryFromMessages(messages.slice(0, index));
}
