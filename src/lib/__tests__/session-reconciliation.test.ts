import { describe, expect, it } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { reconcileSessions } from '../session-reconciliation';

function session(id: string, updatedAt: number, title: string): Session {
  return {
    id,
    title,
    messages: [],
    code: '',
    createdAt: 1,
    updatedAt,
  };
}

describe('reconcileSessions', () => {
  it('keeps a pending local snapshot even when the cloud copy has a newer timestamp', () => {
    const result = reconcileSessions(
      [session('s-1', 20, 'local dirty')],
      [session('s-1', 30, 'remote newer')],
      { syncIds: new Set(['s-1']), deleteIds: new Set() },
    );

    expect(result.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 's-1', title: 'local dirty' },
    ]);
  });

  it('chooses the newer clean snapshot and retains local-only and remote-only sessions', () => {
    const result = reconcileSessions(
      [
        session('shared', 20, 'local older'),
        session('local-only', 40, 'empty local draft'),
      ],
      [
        session('shared', 30, 'remote newer'),
        session('remote-only', 35, 'remote only'),
      ],
      { syncIds: new Set(), deleteIds: new Set() },
    );

    expect(result.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'local-only', title: 'empty local draft' },
      { id: 'remote-only', title: 'remote only' },
      { id: 'shared', title: 'remote newer' },
    ]);
  });

  it('lets a pending delete tombstone suppress both local and remote copies', () => {
    const result = reconcileSessions(
      [session('deleted', 20, 'local')],
      [session('deleted', 30, 'remote')],
      { syncIds: new Set(['deleted']), deleteIds: new Set(['deleted']) },
    );

    expect(result).toEqual([]);
  });
});
