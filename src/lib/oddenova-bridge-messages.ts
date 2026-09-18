import type { ChatMessage } from '../hooks/useChat';
import type { OddeNovaBridgeMessageV3 } from './oddenova-bridge';

export interface PageCreativeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export function projectCreativeMessages(messages: ChatMessage[]): PageCreativeMessage[] {
  return messages.flatMap((message) => {
    if (
      (message.role !== 'user' && message.role !== 'assistant')
      || message.isGreeting
      || message.agentAttemptId
      || (message.role === 'assistant' && !message.content)
    ) return [];
    return [{ id: message.id, role: message.role, content: message.content, createdAt: message.timestamp }];
  });
}

export function diffCreativeMessages(
  baseline: readonly OddeNovaBridgeMessageV3[],
  current: readonly PageCreativeMessage[],
): { upsertMessages: PageCreativeMessage[]; deleteMessageIds: string[] } {
  const baselineById = new Map(baseline.map((message) => [message.id, message]));
  const currentById = new Map(current.map((message) => [message.id, message]));
  return {
    upsertMessages: current.filter((message) => {
      const previous = baselineById.get(message.id);
      return !previous || previous.role !== message.role || previous.content !== message.content;
    }),
    deleteMessageIds: baseline.filter((message) => !currentById.has(message.id)).map((message) => message.id),
  };
}

export function mergeBridgeMessages(
  localMessages: readonly ChatMessage[],
  canonicalMessages: readonly OddeNovaBridgeMessageV3[],
): ChatMessage[] {
  const localById = new Map(localMessages.map((message) => [message.id, message]));
  const canonicalIds = new Set(canonicalMessages.map((message) => message.id));
  const progressAfter = new Map<string | undefined, ChatMessage[]>();
  let anchor: string | undefined;
  for (const message of localMessages) {
    if (message.role === 'user' || message.role === 'assistant') {
      if (canonicalIds.has(message.id)) anchor = message.id;
      continue;
    }
    if (message.role === 'progress' && (anchor === undefined || canonicalIds.has(anchor))) {
      const bucket = progressAfter.get(anchor) ?? [];
      bucket.push(message);
      progressAfter.set(anchor, bucket);
    }
  }

  const merged: ChatMessage[] = [...(progressAfter.get(undefined) ?? [])];
  for (const message of [...canonicalMessages].sort((left, right) => left.order - right.order)) {
    const local = localById.get(message.id);
    merged.push(local && local.role === message.role && local.content === message.content
      ? { ...local, timestamp: message.createdAt }
      : { id: message.id, role: message.role, content: message.content, timestamp: message.createdAt });
    merged.push(...(progressAfter.get(message.id) ?? []));
  }
  return merged;
}
