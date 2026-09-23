import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../hooks/useChat';
import {
  diffCreativeMessages,
  mergeBridgeMessages,
  projectCreativeMessages,
  type PendingBridgeMessageDelta,
} from '../oddenova-bridge-messages';

describe('oddenova bridge message synchronization', () => {
  it('projects only completed creative messages', () => {
    expect(projectCreativeMessages([
      { id: 'g', role: 'assistant', content: 'hello', timestamp: 0, isGreeting: true },
      { id: 'u', role: 'user', content: 'make it', timestamp: 1 },
      { id: 'stream', role: 'assistant', content: 'partial', timestamp: 2, agentAttemptId: 'a' },
      { id: 'p', role: 'progress', content: 'thinking', timestamp: 3, progressKind: 'thinking' },
      { id: 'a', role: 'assistant', content: 'done', timestamp: 4 },
    ])).toEqual([
      { id: 'u', role: 'user', content: 'make it', createdAt: 1 },
      { id: 'a', role: 'assistant', content: 'done', createdAt: 4 },
    ]);
  });

  it('uses stable ids for edits and explicit deletions', () => {
    const baseline = [
      { id: 'u', role: 'user' as const, content: 'old', createdAt: 1, order: 1, updatedRevision: 1 },
      { id: 'a', role: 'assistant' as const, content: 'done', createdAt: 2, order: 2, updatedRevision: 1 },
    ];
    expect(diffCreativeMessages(baseline, [
      { id: 'u', role: 'user', content: 'edited', createdAt: 1 },
      { id: 'n', role: 'user', content: 'new', createdAt: 3 },
    ])).toEqual({
      upsertMessages: [
        { id: 'u', role: 'user', content: 'edited', createdAt: 1 },
        { id: 'n', role: 'user', content: 'new', createdAt: 3 },
      ],
      deleteMessageIds: ['a'],
    });
  });

  it('preserves rich fields and anchored progress for unchanged messages', () => {
    const local = [
      { id: 'u', role: 'user' as const, content: 'make it', timestamp: 1 },
      { id: 'p', role: 'progress' as const, content: 'committed', timestamp: 2, progressKind: 'commit' as const },
      { id: 'a', role: 'assistant' as const, content: 'done', timestamp: 3, code: 'stack()', revisionId: 'r1' },
    ];
    const canonical = [
      { id: 'u', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 },
      { id: 'a', role: 'assistant' as const, content: 'done', createdAt: 3, order: 2, updatedRevision: 1 },
    ];
    const merged = mergeBridgeMessages(local, canonical);
    expect(merged.messages.map(({ id }) => id)).toEqual(['u', 'p', 'a']);
    expect(merged.messages.at(-1)).toMatchObject({ code: 'stack()', revisionId: 'r1' });
    expect(merged.hasPendingLocalMessages).toBe(false);
  });

  it('keeps a pending local message that the canonical snapshot does not contain', () => {
    const localNew: ChatMessage = {
      id: 'local-new', role: 'assistant', content: 'fresh answer', timestamp: 9,
      code: 'note("fresh")', revisionId: 'r9', inputMode: 'normal',
    };
    const local = [
      { id: 'm1', role: 'user' as const, content: 'make it', timestamp: 1 },
      localNew,
    ];
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 3,
      upsertMessages: [{ id: 'local-new', role: 'assistant', content: 'fresh answer', createdAt: 9 }],
      deleteMessageIds: [],
    };
    const merged = mergeBridgeMessages(local, canonical, delta);
    expect(merged.hasPendingLocalMessages).toBe(true);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m1', 'local-new']);
    expect(merged.messages.at(-1)).toMatchObject({ content: 'fresh answer', code: localNew.code, revisionId: localNew.revisionId, inputMode: localNew.inputMode });
  });

  it('prefers the page-change projection when no local object exists for a pending upsert', () => {
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 4,
      upsertMessages: [{ id: 'page-new', role: 'user', content: 'typed after flush', createdAt: 20 }],
      deleteMessageIds: [],
    };
    const merged = mergeBridgeMessages([], canonical, delta);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m1', 'page-new']);
    expect(merged.messages.at(-1)).toEqual({ id: 'page-new', role: 'user', content: 'typed after flush', timestamp: 20 });
  });

  it('lets a pending edit temporarily win over older canonical text', () => {
    const local = [
      { id: 'm1', role: 'user' as const, content: 'edited text', timestamp: 1 },
    ];
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'old text', createdAt: 1, order: 1, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 5,
      upsertMessages: [{ id: 'm1', role: 'user', content: 'edited text', createdAt: 1 }],
      deleteMessageIds: [],
    };
    const merged = mergeBridgeMessages(local, canonical, delta);
    expect(merged.messages).toHaveLength(1);
    expect(merged.messages[0]).toMatchObject({ content: 'edited text' });
    expect(merged.hasPendingLocalMessages).toBe(true);
  });

  it('removes a message and its anchored progress for a pending delete', () => {
    const local = [
      { id: 'm1', role: 'user' as const, content: 'old', timestamp: 1 },
      { id: 'p', role: 'progress' as const, content: 'committed', timestamp: 2, progressKind: 'commit' as const },
      { id: 'm2', role: 'assistant' as const, content: 'answer', timestamp: 3, code: 'note("a")', revisionId: 'r2' },
    ];
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'old', createdAt: 1, order: 1, updatedRevision: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'answer', createdAt: 3, order: 2, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 6,
      upsertMessages: [],
      deleteMessageIds: ['m1'],
    };
    const merged = mergeBridgeMessages(local, canonical, delta);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m2']);
    expect(merged.hasPendingLocalMessages).toBe(true);
  });

  it('does not resurrect a canonical tombstone without a pending delta', () => {
    const local = [
      { id: 'm1', role: 'user' as const, content: 'old', timestamp: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'answer', timestamp: 3 },
    ];
    const canonical = [
      { id: 'm2', role: 'assistant' as const, content: 'answer', createdAt: 3, order: 1, updatedRevision: 2 },
    ];
    const merged = mergeBridgeMessages(local, canonical);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m2']);
    expect(merged.hasPendingLocalMessages).toBe(false);
  });

  it('does not keep a pending flag when the canonical snapshot already includes the operation', () => {
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'new text', createdAt: 1, order: 1, updatedRevision: 2 },
    ];
    const merged = mergeBridgeMessages([
      { id: 'm1', role: 'user', content: 'new text', timestamp: 1 },
    ], canonical, {
      capturedLocalSequence: 2,
      upsertMessages: [{ id: 'm1', role: 'user', content: 'new text', createdAt: 1 }],
      deleteMessageIds: ['m2'],
    });
    expect(merged.messages.map(({ id }) => id)).toEqual(['m1']);
    expect(merged.hasPendingLocalMessages).toBe(false);
  });

  it('keeps the local relative order of two pending messages between canonical anchors', () => {
    const local = [
      { id: 'm1', role: 'user' as const, content: 'make it', timestamp: 1 },
      { id: 'n1', role: 'user' as const, content: 'first new', timestamp: 2 },
      { id: 'n2', role: 'assistant' as const, content: 'second new', timestamp: 3 },
      { id: 'm2', role: 'assistant' as const, content: 'done', timestamp: 4 },
    ];
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 },
      { id: 'm2', role: 'assistant' as const, content: 'done', createdAt: 4, order: 2, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 7,
      upsertMessages: [
        { id: 'n2', role: 'assistant', content: 'second new', createdAt: 3 },
        { id: 'n1', role: 'user', content: 'first new', createdAt: 2 },
      ],
      deleteMessageIds: [],
    };
    const merged = mergeBridgeMessages(local, canonical, delta);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m1', 'n1', 'n2', 'm2']);
  });

  it('drops progress whose anchor was removed by a canonical tombstone', () => {
    const local = [
      { id: 'm1', role: 'user' as const, content: 'old', timestamp: 1 },
      { id: 'p', role: 'progress' as const, content: 'thinking', timestamp: 2, progressKind: 'thinking' as const },
      { id: 'm2', role: 'assistant' as const, content: 'answer', timestamp: 3 },
    ];
    const canonical = [
      { id: 'm2', role: 'assistant' as const, content: 'answer', createdAt: 3, order: 1, updatedRevision: 2 },
    ];
    const merged = mergeBridgeMessages(local, canonical);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m2']);
  });

  it('keeps progress anchored to a pending upsert message', () => {
    const local = [
      { id: 'm1', role: 'user' as const, content: 'make it', timestamp: 1 },
      { id: 'n1', role: 'assistant' as const, content: 'new answer', timestamp: 2, code: 'note("n")' },
      { id: 'p', role: 'progress' as const, content: 'committed', timestamp: 3, progressKind: 'commit' as const },
    ];
    const canonical = [
      { id: 'm1', role: 'user' as const, content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 8,
      upsertMessages: [{ id: 'n1', role: 'assistant', content: 'new answer', createdAt: 2 }],
      deleteMessageIds: [],
    };
    const merged = mergeBridgeMessages(local, canonical, delta);
    expect(merged.messages.map(({ id }) => id)).toEqual(['m1', 'n1', 'p']);
  });

  it('excludes greetings, attempts, and empty assistant messages from a pending delta projection', () => {
    const local = [
      { id: 'g', role: 'assistant' as const, content: 'hi', timestamp: 0, isGreeting: true },
      { id: 'attempt', role: 'assistant' as const, content: 'streaming', timestamp: 1, agentAttemptId: 'a1' },
      { id: 'think', role: 'progress' as const, content: 'thinking', timestamp: 2, progressKind: 'thinking' as const },
      { id: 'empty', role: 'assistant' as const, content: '', timestamp: 3 },
    ];
    const canonical = [
      { id: 'empty', role: 'assistant' as const, content: 'filled later', createdAt: 3, order: 1, updatedRevision: 1 },
    ];
    const delta: PendingBridgeMessageDelta = {
      capturedLocalSequence: 9,
      upsertMessages: [],
      deleteMessageIds: [],
    };
    const merged = mergeBridgeMessages(local, canonical, delta);
    // The thinking line is a web-local message and stays anchored; greeting,
    // attempt, and empty assistant messages never enter the creative list.
    expect(merged.messages.map(({ id }) => id)).toEqual(['think', 'empty']);
    expect(merged.hasPendingLocalMessages).toBe(false);
  });
});
