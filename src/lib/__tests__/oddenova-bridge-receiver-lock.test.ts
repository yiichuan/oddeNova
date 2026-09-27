import { describe, expect, it, vi } from 'vitest';

import {
  oddeNovaBridgeReceiverLockName,
  runWithOddeNovaBridgeReceiverLock,
  type OddeNovaBridgeLockManager,
} from '../oddenova-bridge-receiver-lock';

function createLockManager(): OddeNovaBridgeLockManager {
  const held = new Set<string>();
  return {
    request: async (name, _options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

describe('oddeNova Bridge receiver lock', () => {
  it('uses the binding generation to isolate receiver ownership', () => {
    const base = {
      projectId: 'project-1',
      baseUrl: 'https://odd.example/studio/',
    };

    expect(oddeNovaBridgeReceiverLockName({ ...base, bindingId: 'binding-1' }))
      .toBe(oddeNovaBridgeReceiverLockName({ ...base, bindingId: 'binding-1' }));
    expect(oddeNovaBridgeReceiverLockName({ ...base, bindingId: 'binding-1' }))
      .not.toBe(oddeNovaBridgeReceiverLockName({ ...base, bindingId: 'binding-2' }));
  });

  it('allows only one copied receiver to run for the same binding', async () => {
    const lockManager = createLockManager();
    let releaseFirst!: () => void;
    const firstTask = vi.fn(() => new Promise<void>((resolve) => { releaseFirst = resolve; }));
    const copiedTask = vi.fn(async () => undefined);

    const first = runWithOddeNovaBridgeReceiverLock('receiver', firstTask, lockManager);
    await vi.waitFor(() => expect(firstTask).toHaveBeenCalledTimes(1));

    await expect(runWithOddeNovaBridgeReceiverLock('receiver', copiedTask, lockManager))
      .resolves.toBe('occupied');
    expect(copiedTask).not.toHaveBeenCalled();

    releaseFirst();
    await expect(first).resolves.toBe('completed');
    await expect(runWithOddeNovaBridgeReceiverLock('receiver', copiedTask, lockManager))
      .resolves.toBe('completed');
  });

  it('fails closed when the browser cannot provide a cross-tab lock', async () => {
    const task = vi.fn(async () => undefined);

    await expect(runWithOddeNovaBridgeReceiverLock('receiver', task, null))
      .resolves.toBe('unsupported');
    expect(task).not.toHaveBeenCalled();
  });
});
