import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { createSessionCloudSync } from '../session-cloud-sync';

const markerMocks = vi.hoisted(() => ({
  markPendingSessionSync: vi.fn(async () => undefined),
  clearPendingSessionSync: vi.fn(async () => undefined),
  markPendingSessionDelete: vi.fn(async () => undefined),
  clearPendingSessionDelete: vi.fn(async () => undefined),
}));

vi.mock('../session-sync-storage', () => markerMocks);

function session(code: string, updatedAt = 1): Session {
  return {
    id: 's-1',
    title: 'Session',
    messages: [],
    code,
    createdAt: 1,
    updatedAt,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(options: { online?: boolean } = {}) {
  let online = options.online ?? true;
  const repository = {
    listSessions: vi.fn<(_expectedUserId?: string) => Promise<Session[]>>(async () => []),
    saveSession: vi.fn<(_session: Session, _expectedUserId?: string) => Promise<void>>(async () => undefined),
    deleteSession: vi.fn<(_id: string, _expectedUserId?: string) => Promise<void>>(async () => undefined),
  };
  const statuses = new Map<string, string | undefined>();
  const onStatus = vi.fn((id: string, status: string | undefined) => {
    statuses.set(id, status);
  });
  const sync = createSessionCloudSync({
    ownerKey: 'user:user-1',
    repository,
    onStatus,
    isOnline: () => online,
  });
  return {
    repository,
    statuses,
    onStatus,
    sync,
    setOnline(value: boolean) {
      online = value;
    },
  };
}

describe('createSessionCloudSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps streamed local snapshots dirty without saving them to the cloud', async () => {
    const { repository, statuses, sync } = setup();

    sync.noteLocal(session('first', 1));
    sync.noteLocal(session('latest', 2));
    await Promise.resolve();

    expect(repository.saveSession).not.toHaveBeenCalled();
    expect(markerMocks.markPendingSessionSync).toHaveBeenCalledOnce();
    expect(statuses.get('s-1')).toBe('dirty');
  });

  it('coalesces a manual edit burst into one latest save after two seconds', async () => {
    const { repository, statuses, sync } = setup();

    sync.debounce(session('a', 1));
    sync.debounce(session('ab', 2));
    await vi.advanceTimersByTimeAsync(1999);
    expect(repository.saveSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(repository.saveSession).toHaveBeenCalledTimes(1);
    expect(repository.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ab' }),
      'user-1',
    );
    expect(markerMocks.clearPendingSessionSync).toHaveBeenCalledWith(
      'user:user-1',
      's-1',
    );
    expect(statuses.get('s-1')).toBe('synced');
  });

  it('does not mark a newer local version synced when an older request finishes', async () => {
    const firstSave = deferred();
    const { repository, statuses, sync } = setup();
    repository.saveSession.mockImplementationOnce(() => firstSave.promise);

    sync.noteLocal(session('old', 1));
    const checkpoint = sync.checkpoint(session('old', 1));
    await Promise.resolve();
    expect(statuses.get('s-1')).toBe('saving');

    sync.noteLocal(session('new', 2));
    firstSave.resolve();
    await checkpoint;

    expect(statuses.get('s-1')).toBe('dirty');
    expect(markerMocks.clearPendingSessionSync).not.toHaveBeenCalled();
  });

  it('coalesces duplicate checkpoints for the same local version', async () => {
    const activeSave = deferred();
    const { repository, sync } = setup();
    repository.saveSession.mockImplementationOnce(() => activeSave.promise);
    const snapshot = session('same version');

    sync.noteLocal(snapshot);
    const first = sync.checkpoint(snapshot);
    const duplicate = sync.checkpoint(snapshot);
    await Promise.resolve();

    activeSave.resolve();
    await Promise.all([first, duplicate]);

    expect(repository.saveSession).toHaveBeenCalledTimes(1);
  });

  it('lets flush reuse an in-flight checkpoint for the same local version', async () => {
    const activeSave = deferred();
    const { repository, sync } = setup();
    repository.saveSession.mockImplementationOnce(() => activeSave.promise);
    const snapshot = session('same terminal version');

    sync.noteLocal(snapshot);
    const checkpoint = sync.checkpoint(snapshot);
    await Promise.resolve();
    const flush = sync.flush('s-1');

    expect(repository.saveSession).toHaveBeenCalledTimes(1);
    activeSave.resolve();
    await Promise.all([checkpoint, flush]);

    expect(repository.saveSession).toHaveBeenCalledTimes(1);
  });

  it('keeps work offline and checkpoints it when connectivity returns', async () => {
    const { repository, statuses, sync, setOnline } = setup({ online: false });

    sync.debounce(session('offline'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(repository.saveSession).not.toHaveBeenCalled();
    expect(statuses.get('s-1')).toBe('offline');

    setOnline(true);
    sync.notifyOnline();
    await vi.runAllTimersAsync();

    expect(repository.saveSession).toHaveBeenCalledTimes(1);
    expect(statuses.get('s-1')).toBe('synced');
  });

  it('schedules retry without rejecting a creative checkpoint but lets flush surface failure', async () => {
    const error = new Error('temporary outage');
    const { repository, statuses, sync } = setup();
    repository.saveSession.mockRejectedValue(error);

    sync.noteLocal(session('latest'));
    await expect(sync.checkpoint(session('latest'))).resolves.toBeUndefined();

    expect(statuses.get('s-1')).toBe('retrying');
    await expect(sync.flush('s-1')).rejects.toBe(error);
  });

  it('rejects a checkpoint after disposal without creating an unhandled retry', async () => {
    const { sync } = setup();
    sync.dispose();

    await expect(sync.checkpoint(session('disposed')))
      .rejects.toThrow('disposed');
  });

  it('cancels an old terminal save retry when a newer streamed version arrives', async () => {
    const { repository, sync } = setup();
    repository.saveSession
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValue(undefined);

    const completedTurn = session('completed turn', 1);
    sync.noteLocal(completedTurn);
    await sync.checkpoint(completedTurn);
    expect(repository.saveSession).toHaveBeenCalledTimes(1);

    sync.noteLocal(session('next turn partial reasoning', 2));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(repository.saveSession).toHaveBeenCalledTimes(1);
  });

  it('retries a failed durable marker write before saving the snapshot', async () => {
    const markerError = new Error('IndexedDB quota');
    markerMocks.markPendingSessionSync
      .mockRejectedValueOnce(markerError)
      .mockResolvedValue(undefined);
    const { repository, statuses, sync } = setup();
    const snapshot = session('latest');

    sync.noteLocal(snapshot);
    await expect(sync.checkpoint(snapshot)).resolves.toBeUndefined();

    expect(repository.saveSession).not.toHaveBeenCalled();
    expect(statuses.get('s-1')).toBe('retrying');

    await vi.advanceTimersByTimeAsync(1000);

    expect(markerMocks.markPendingSessionSync).toHaveBeenCalledTimes(2);
    expect(repository.saveSession).toHaveBeenCalledWith(snapshot, 'user-1');
    expect(statuses.get('s-1')).toBe('synced');
  });

  it('retries a streamed snapshot marker without turning it into a cloud checkpoint', async () => {
    markerMocks.markPendingSessionSync
      .mockRejectedValueOnce(new Error('IndexedDB busy'))
      .mockResolvedValue(undefined);
    const { repository, statuses, sync } = setup();

    sync.noteLocal(session('partial reasoning'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(markerMocks.markPendingSessionSync).toHaveBeenCalledTimes(2);
    expect(repository.saveSession).not.toHaveBeenCalled();
    expect(statuses.get('s-1')).toBe('dirty');
  });

  it('persists a delete tombstone before waiting for an active save and clears it only after delete succeeds', async () => {
    const activeSave = deferred();
    const { repository, sync } = setup();
    repository.saveSession.mockImplementationOnce(() => activeSave.promise);

    sync.noteLocal(session('old'));
    void sync.checkpoint(session('old'));
    await Promise.resolve();

    const deletion = sync.deleteSession('s-1');
    await Promise.resolve();

    expect(markerMocks.markPendingSessionDelete).toHaveBeenCalledWith(
      'user:user-1',
      's-1',
    );
    expect(repository.deleteSession).not.toHaveBeenCalled();

    activeSave.resolve();
    await deletion;

    expect(repository.deleteSession).toHaveBeenCalledWith('s-1', 'user-1');
    expect(markerMocks.clearPendingSessionDelete).toHaveBeenCalledWith(
      'user:user-1',
      's-1',
    );
  });

  it('deletes the local row after the tombstone and before clearing the remote delete', async () => {
    const { repository, sync } = setup();
    const deleteLocal = vi.fn(async () => undefined);

    await sync.deleteSession('s-1', deleteLocal);

    expect(markerMocks.markPendingSessionDelete.mock.invocationCallOrder[0])
      .toBeLessThan(deleteLocal.mock.invocationCallOrder[0]);
    expect(deleteLocal.mock.invocationCallOrder[0])
      .toBeLessThan(repository.deleteSession.mock.invocationCallOrder[0]);
    expect(repository.deleteSession.mock.invocationCallOrder[0])
      .toBeLessThan(markerMocks.clearPendingSessionDelete.mock.invocationCallOrder[0]);
  });

  it('retries strict local deletion before ever deleting the remote row', async () => {
    const { repository, sync } = setup();
    const deleteLocal = vi.fn(async () => {
      throw new Error('IndexedDB delete failed');
    });

    await expect(sync.deleteSession('s-1', deleteLocal)).rejects.toThrow(
      'IndexedDB delete failed',
    );
    sync.notifyOnline();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(deleteLocal.mock.calls.length).toBeGreaterThan(1);
    expect(repository.deleteSession).not.toHaveBeenCalled();
    expect(markerMocks.clearPendingSessionDelete).not.toHaveBeenCalled();
  });

  it('retries a failed delete marker before deleting local or remote state', async () => {
    markerMocks.markPendingSessionDelete
      .mockRejectedValueOnce(new Error('settings store busy'))
      .mockResolvedValue(undefined);
    const { repository, sync } = setup();
    const deleteLocal = vi.fn(async () => undefined);

    await expect(sync.deleteSession('s-1', deleteLocal)).rejects.toThrow(
      'settings store busy',
    );
    expect(deleteLocal).not.toHaveBeenCalled();
    expect(repository.deleteSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(markerMocks.markPendingSessionDelete).toHaveBeenCalledTimes(2);
    expect(deleteLocal).toHaveBeenCalledOnce();
    expect(repository.deleteSession).toHaveBeenCalledWith('s-1', 'user-1');
    expect(markerMocks.clearPendingSessionDelete).toHaveBeenCalledWith(
      'user:user-1',
      's-1',
    );
  });

  it('hydrates clean, dirty, and deleted sessions without leaking a deleted status', async () => {
    const { statuses, sync } = setup();

    sync.hydrate(
      [
        session('clean'),
        { ...session('dirty'), id: 's-2' },
      ],
      new Set(['s-2']),
      new Set(['s-3']),
    );
    await Promise.resolve();

    expect(statuses.get('s-1')).toBe('synced');
    expect(statuses.get('s-2')).toMatch(/dirty|saving|synced/);
    expect(statuses.has('s-3')).toBe(false);
  });
});
