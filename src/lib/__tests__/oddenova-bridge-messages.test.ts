import { describe, expect, it } from 'vitest';

import { diffCreativeMessages, mergeBridgeMessages, projectCreativeMessages } from '../oddenova-bridge-messages';

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
    expect(merged.map(({ id }) => id)).toEqual(['u', 'p', 'a']);
    expect(merged.at(-1)).toMatchObject({ code: 'stack()', revisionId: 'r1' });
  });
});
