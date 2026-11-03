import type { ConversationTurn } from '../agent/loop';
import type { ChatMessage } from '../hooks/useChat';
import { formatHummingContext } from './humming-context';

type ConversationMessage = ChatMessage & { role: 'user' | 'assistant' };

function isConversationMessage(message: ChatMessage): message is ConversationMessage {
  return (message.role === 'user' || message.role === 'assistant') && !message.isGreeting;
}

export function conversationHistoryFromMessages(messages: ChatMessage[]): ConversationTurn[] {
  return messages
    .filter(isConversationMessage)
    .map((message) => ({
      role: message.role,
      content: formatHummingContext(message.content, message.humming),
    }));
}

export function conversationHistoryBefore(messages: ChatMessage[], messageId: string): ConversationTurn[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return [];
  return conversationHistoryFromMessages(messages.slice(0, index));
}
