import type { ChatMessage } from '../hooks/useChat';
import type { OddeNovaBridgeMessageV3 } from './oddenova-bridge';

export interface PageCreativeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

/**
 * The local message operations that were already complete on the page but had
 * not entered the helper canonical snapshot an import is about to apply.
 * `capturedLocalSequence` records the local change generation at capture time
 * so the caller can tell later, fresher page reads apart from this snapshot.
 */
export interface PendingBridgeMessageDelta {
  capturedLocalSequence: number;
  upsertMessages: PageCreativeMessage[];
  deleteMessageIds: string[];
}

export interface MergeBridgeMessagesResult {
  messages: ChatMessage[];
  hasPendingLocalMessages: boolean;
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

function isProjectableCreative(message: ChatMessage): boolean {
  return (message.role === 'user' || message.role === 'assistant')
    && !message.isGreeting
    && !message.agentAttemptId
    && !(message.role === 'assistant' && !message.content);
}

export function mergeBridgeMessages(
  localMessages: readonly ChatMessage[],
  canonicalMessages: readonly OddeNovaBridgeMessageV3[],
  pendingDelta?: PendingBridgeMessageDelta,
): MergeBridgeMessagesResult {
  const localById = new Map(localMessages.map((message) => [message.id, message]));
  const canonicalSorted = [...canonicalMessages].sort((left, right) => left.order - right.order);
  const canonicalById = new Map(canonicalSorted.map((message) => [message.id, message]));
  const deletedIds = new Set(pendingDelta?.deleteMessageIds ?? []);
  const upsertById = new Map((pendingDelta?.upsertMessages ?? []).map((message) => [message.id, message]));
  const hasPendingLocalMessages = Boolean(
    pendingDelta
    && (pendingDelta.upsertMessages.length > 0 || pendingDelta.deleteMessageIds.length > 0),
  );

  // The canonical snapshot owns the skeleton: identity, order, role, and
  // content. Pending deletes remove entries; a pending upsert replaces the
  // projection of its id only.
  const placed: string[] = [];
  for (const message of canonicalSorted) {
    if (!deletedIds.has(message.id)) placed.push(message.id);
  }
  const placedIds = new Set(placed);

  // Pending messages the canonical snapshot has never seen are inserted at
  // their relative position in the local message list, so a page-local turn
  // stays between the canonical messages it was written between.
  const localCreativeIds = localMessages.filter(isProjectableCreative).map((message) => message.id);
  const localOrderIndex = new Map(localCreativeIds.map((id, index) => [id, index]));
  const newUpsertIds = (pendingDelta?.upsertMessages ?? [])
    .map((message) => message.id)
    .filter((id) => !canonicalById.has(id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort((left, right) => (localOrderIndex.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (localOrderIndex.get(right) ?? Number.MAX_SAFE_INTEGER));
  for (const id of newUpsertIds) {
    const ownIndex = localOrderIndex.get(id);
    let insertAt = -1;
    if (ownIndex !== undefined) {
      for (let index = ownIndex - 1; index >= 0; index -= 1) {
        const anchorIndex = placed.indexOf(localCreativeIds[index]);
        if (anchorIndex !== -1) {
          insertAt = anchorIndex + 1;
          break;
        }
      }
      if (insertAt === -1) {
        for (let index = ownIndex + 1; index < localCreativeIds.length; index += 1) {
          const anchorIndex = placed.indexOf(localCreativeIds[index]);
          if (anchorIndex !== -1) {
            insertAt = anchorIndex;
            break;
          }
        }
      }
    }
    if (insertAt === -1) placed.push(id);
    else placed.splice(insertAt, 0, id);
    placedIds.add(id);
  }

  // Web-local messages (progress) anchor to the most recent local creative
  // message. When that anchor is removed by a pending delete or a canonical
  // tombstone, the progress it belonged to is removed with it.
  const progressAfter = new Map<string | undefined, ChatMessage[]>();
  let anchor: string | undefined;
  for (const message of localMessages) {
    if (message.role === 'user' || message.role === 'assistant') {
      if (isProjectableCreative(message)) anchor = message.id;
      continue;
    }
    if (message.role === 'progress' && (anchor === undefined || placedIds.has(anchor))) {
      const bucket = progressAfter.get(anchor) ?? [];
      bucket.push(message);
      progressAfter.set(anchor, bucket);
    }
  }

  const messages: ChatMessage[] = [...(progressAfter.get(undefined) ?? [])];
  for (const id of placed) {
    const upsert = upsertById.get(id);
    const local = localById.get(id);
    const canonical = canonicalById.get(id);
    if (upsert) {
      // A pending upsert is the page's freshest version of this message. Reuse
      // the local full object when it exists (rich fields), and fall back to
      // the four-field page-change projection only when it does not.
      messages.push(local && local.role === upsert.role
        ? local
        : { id: upsert.id, role: upsert.role, content: upsert.content, timestamp: upsert.createdAt });
    } else if (local && canonical && local.role === canonical.role && local.content === canonical.content) {
      messages.push({ ...local, timestamp: canonical.createdAt });
    } else if (canonical) {
      messages.push({ id: canonical.id, role: canonical.role, content: canonical.content, timestamp: canonical.createdAt });
    }
    messages.push(...(progressAfter.get(id) ?? []));
  }
  return { messages, hasPendingLocalMessages };
}
