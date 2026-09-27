import { describe, expect, it } from 'vitest';

import {
  normalizeOddeNovaBridgeBaseUrl,
  type OddeNovaBridgeSnapshotV3,
  type StoredOddeNovaBridgeConnection,
} from '../oddenova-bridge';
import {
  bridgePageMatchesSnapshot,
  makeOddeNovaBridgePageChange,
  resolveBridgeBinding,
  type BridgeSessionCandidate,
} from '../oddenova-bridge-state';

const baseUrl = normalizeOddeNovaBridgeBaseUrl('https://oddenova.example/studio/?view=bridge#current');

function connection(overrides: Partial<StoredOddeNovaBridgeConnection> = {}): StoredOddeNovaBridgeConnection {
  return {
    ownerKey: 'user:user-1',
    projectId: 'project-a',
    baseUrl,
    serviceOrigin: 'http://127.0.0.1:43210',
    pageToken: 'secret',
    clientId: 'client-a',
    lastRevision: 99,
    lastSkillRevision: 99,
    bindingId: 'binding-a',
    ...overrides,
  };
}

function candidate(
  id: string,
  overrides: Partial<BridgeSessionCandidate['externalSource']> = {},
): BridgeSessionCandidate {
  return {
    id,
    title: id,
    code: 'note("a")',
    messages: [],
    externalSource: {
      type: 'oddenova-strudel-skill',
      protocolVersion: 3,
      projectId: 'project-a',
      baseUrl,
      revision: 4,
      bindingId: 'binding-a',
      bridgeContentHash: 'hash-4',
      ...overrides,
    },
  };
}

describe('oddenova bridge binding state', () => {
  it('resolves the matching project instead of the first bridge session', () => {
    const result = resolveBridgeBinding([
      candidate('project-b', { projectId: 'project-b' }),
      candidate('project-a'),
    ], connection({ sessionId: undefined }));

    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.session.id).toBe('project-a');
  });

  it('reports ambiguity instead of choosing one unbound candidate', () => {
    const result = resolveBridgeBinding([
      candidate('a'),
      candidate('b'),
    ], connection({ sessionId: undefined }));

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') expect(result.candidates.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('treats a stored session id as an invariant and never falls back after deletion', () => {
    const result = resolveBridgeBinding([candidate('replacement')], connection({ sessionId: 'deleted-session' }));

    expect(result).toMatchObject({ status: 'missing' });
  });

  it('does not cross project identities that only share a project id', () => {
    const result = resolveBridgeBinding([
      candidate('other-origin', { baseUrl: 'https://other.example/studio' }),
    ], connection({ sessionId: undefined }));

    expect(result).toMatchObject({ status: 'missing' });
  });

  it('uses the persisted baseline versions, not sessionStorage display versions, for page changes', () => {
    const baseline: OddeNovaBridgeSnapshotV3 = {
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId: 'project-a',
      baseUrl,
      bindingId: 'binding-a',
      revision: 4,
      skillRevision: 11,
      title: 'before',
      code: 'note("before")',
      messages: [{ id: 'm-1', role: 'user', content: 'before', createdAt: 1, order: 1, updatedRevision: 4 }],
      contentHash: 'hash-4',
    };
    const result = makeOddeNovaBridgePageChange({
      connection: connection({ lastRevision: 900, lastSkillRevision: 901 }),
      baseline,
      page: {
        sessionId: 'session-a',
        projectId: 'project-a',
        baseUrl,
        revision: 4,
        title: 'after',
        code: 'note("after")',
        messages: [
          { id: 'm-1', role: 'user', content: 'before', timestamp: 1 },
          { id: 'm-2', role: 'assistant', content: 'new', timestamp: 2 },
        ],
      },
      changeId: 'change-1',
    });

    expect(result).toMatchObject({
      baseRevision: 4,
      baseSkillRevision: 11,
      title: 'after',
      code: 'note("after")',
      changeId: 'change-1',
    });
    expect(result?.upsertMessages).toEqual([{ id: 'm-2', role: 'assistant', content: 'new', createdAt: 2 }]);
  });

  it('allows a v2 session to establish a v3 baseline only when its creative content is identical', () => {
    const snapshot: OddeNovaBridgeSnapshotV3 = {
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId: 'project-a',
      baseUrl,
      bindingId: 'binding-a',
      revision: 4,
      skillRevision: 11,
      title: 'before',
      code: 'note("before")',
      messages: [{ id: 'm-1', role: 'user', content: 'before', createdAt: 1, order: 1, updatedRevision: 4 }],
      contentHash: 'v3-hash',
    };
    const page = {
      sessionId: 'session-a', projectId: 'project-a', baseUrl, revision: 4,
      title: 'before', code: 'note("before")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'before', timestamp: 1 }],
      bridgeContentHash: 'v2-hash', bridgeProtocolVersion: 2 as const,
    };
    expect(bridgePageMatchesSnapshot(page, snapshot)).toBe(true);
    expect(bridgePageMatchesSnapshot({ ...page, code: 'local edit' }, snapshot)).toBe(false);
    expect(bridgePageMatchesSnapshot({ ...page, bridgeProtocolVersion: 3 }, snapshot)).toBe(false);
  });
});
