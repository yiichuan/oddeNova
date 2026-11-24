import { describe, expect, it, vi } from 'vitest';
import { withSessionTurnLock } from '../session-turn-lock';
import { t } from '../i18n';
import type { Session } from '../../hooks/useSessions';

const session: Session = {
  id: 'one', code: 's("bd")', messages: [], title: 'Song', createdAt: 1, updatedAt: 1,
};

function mockLocks(): Pick<LockManager, 'request'> {
  const active = new Set<string>();
  return {
    request: async (name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => {
      if (active.has(name)) return callback(null);
      active.add(name);
      try {
        return await callback({ name, mode: 'exclusive' });
      } finally {
        active.delete(name);
      }
    },
  } as Pick<LockManager, 'request'>;
}

describe('routed session turn lock', () => {
  it('rejects a simultaneous send from another tab before running or saving it', async () => {
    const locks = mockLocks();
    let finish!: () => void;
    const running = new Promise<void>(resolve => { finish = resolve; });
    const read = async () => session;
    const first = withSessionTurnLock('guest', session, read, () => running, locks);
    const sendFromOtherTab = vi.fn(async () => undefined);
    await expect(withSessionTurnLock('guest', session, read, sendFromOtherTab, locks))
      .rejects.toThrow(t('agentTurnBusyInAnotherTab'));
    expect(sendFromOtherTab).not.toHaveBeenCalled();
    finish();
    await first;
    await withSessionTurnLock('guest', session, read, sendFromOtherTab, locks);
    expect(sendFromOtherTab).toHaveBeenCalledOnce();
  });

  it('rejects a stale tab after a different tab finishes', async () => {
    const latest = { ...session, code: 's("hh")' };
    const submit = vi.fn(async () => undefined);
    await expect(withSessionTurnLock('guest', session, async () => latest, submit, mockLocks()))
      .rejects.toThrow(t('agentTurnChangedInAnotherTab'));
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps separate session ids independent', async () => {
    const locks = mockLocks();
    let finish!: () => void;
    const running = new Promise<void>(resolve => { finish = resolve; });
    const first = withSessionTurnLock('guest', session, async () => session, () => running, locks);
    await expect(withSessionTurnLock('guest', { ...session, id: 'two' }, async () => null, async () => 'ready', locks))
      .resolves.toBe('ready');
    finish();
    await first;
  });
});
