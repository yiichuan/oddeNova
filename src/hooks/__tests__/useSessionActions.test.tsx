// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionActions } from '../useSessionActions';
import { useSessions, type Session } from '../useSessions';
import { useCloudSessionLibrary } from '../useCloudSessionLibrary';
import { getStorageDb, openDB, putSession, getSession } from '../../lib/session-storage';
import { readPendingSessionOperations } from '../../lib/session-sync-storage';

const remote = vi.hoisted(() => ({
  listCloudSessionSummaries: vi.fn(), getCloudSession: vi.fn(),
  deleteCloudSession: vi.fn(), saveCloudSession: vi.fn(),
  listCloudFavoriteSummaries: vi.fn(),
}));
vi.mock('../../services/cloud-session-repository', () => remote);
vi.mock('../../services/favorite-repository', () => ({
  listCloudFavoriteSummaries: remote.listCloudFavoriteSummaries,
  favoriteCloudSession: vi.fn(), unfavoriteCloudSession: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const row: Session = {
  id: '11111111-1111-4111-8111-111111111111', title: 'original',
  code: 's("bd")', messages: [], createdAt: 1, updatedAt: 1,
};
const repository = { saveSession: remote.saveCloudSession, deleteSession: remote.deleteCloudSession };
let serverRows: Session[];
let root: Root;
let current: {
  actions: ReturnType<typeof useSessionActions>;
  sessions: ReturnType<typeof useSessions>;
  library: ReturnType<typeof useCloudSessionLibrary>;
};
let errors: unknown[];
const reportError = (error: unknown) => { errors.push(error); };

function Probe({ ownerId }: { ownerId?: string }) {
  const sessions = useSessions({ ownerKey: ownerId ? `user:${ownerId}` : 'guest', syncEnabled: !!ownerId, cloud: repository });
  const library = useCloudSessionLibrary({ enabled: !!ownerId && !sessions.isLoading, ownerId, acceptCloudDetail: sessions.acceptCloudDetail });
  const actions = useSessionActions({ ownerId, sessions, library, onError: reportError });
  useEffect(() => { current = { actions, sessions, library }; });
  return null;
}
async function until(check: () => void) {
  const deadline = Date.now() + 2500;
  for (;;) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
  }
}
async function mount(ownerId: string | null = 'owner-a') {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<Probe ownerId={ownerId ?? undefined} />); });
  await until(() => expect(current.sessions.isLoading).toBe(false));
  if (ownerId) await until(() => expect(current.library.history.initialStatus).toBe('ready'));
}
async function search() {
  act(() => { current.library.historySearch.setQuery('original'); });
  await until(() => expect(current.library.historySearch.collection.items).toHaveLength(1));
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  errors = [];
  serverRows = [{ ...row }];
  vi.clearAllMocks();
  await openDB();
  const db = getStorageDb()!;
  for (const name of db.objectStoreNames) await db.clear(name);
  remote.listCloudSessionSummaries.mockImplementation(async ({ q }: { q?: string }) => ({
    items: serverRows.filter((session) => !q || session.title.includes(q)).map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
    nextCursor: null,
  }));
  remote.listCloudFavoriteSummaries.mockResolvedValue({ items: [], nextCursor: null });
  remote.getCloudSession.mockImplementation(async () => ({ ...serverRows[0] }));
  remote.saveCloudSession.mockImplementation(async (session: Session) => { serverRows = [{ ...session }]; });
  remote.deleteCloudSession.mockImplementation(async () => { serverRows = []; });
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Session actions with real Session, sync and library modules', () => {
  it('removes a loaded Session immediately but refreshes search only after cloud deletion', async () => {
    await putSession(row, 'user:owner-a');
    await mount();
    await search();
    const gate = deferred();
    remote.deleteCloudSession.mockImplementationOnce(async () => { await gate.promise; serverRows = []; });
    act(() => { current.actions.deleteSession(row.id); });
    expect(current.sessions.sessions.some((session) => session.id === row.id)).toBe(false);
    expect(current.library.history.items).toHaveLength(0);
    expect(current.library.historySearch.collection.items).toHaveLength(1);
    await act(async () => { gate.resolve(); });
    await until(() => expect(current.library.historySearch.collection.items).toHaveLength(0));
    expect(await getSession(row.id, 'user:owner-a')).toBeNull();
    expect(remote.deleteCloudSession).toHaveBeenCalledWith(row.id, 'owner-a');
  });

  it('retains an unloaded summary until remote completion', async () => {
    await mount();
    await search();
    const gate = deferred();
    remote.deleteCloudSession.mockImplementationOnce(async () => { await gate.promise; serverRows = []; });
    act(() => { current.actions.deleteSession(row.id); });
    expect(current.library.history.items).toHaveLength(1);
    await act(async () => { gate.resolve(); });
    await until(() => expect(current.library.historySearch.collection.items).toHaveLength(0));
    expect(current.library.history.items).toHaveLength(0);
  });

  it('retains an unloaded summary and reports remote failure', async () => {
    await mount();
    const error = new Error('offline');
    remote.deleteCloudSession.mockRejectedValueOnce(error);
    await act(async () => { current.actions.deleteSession(row.id); });
    expect(current.library.history.items).toHaveLength(1);
    expect(errors).toEqual([error]);
  });

  it('keeps the durable loaded-delete retry and refreshes search when online retry succeeds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await putSession(row, 'user:owner-a');
    await mount();
    await search();
    remote.deleteCloudSession.mockRejectedValueOnce(new Error('offline'));
    act(() => { current.actions.deleteSession(row.id); });
    await until(() => expect(remote.deleteCloudSession).toHaveBeenCalledTimes(1));
    await act(async () => {
      expect((await readPendingSessionOperations('user:owner-a')).deleteIds.has(row.id)).toBe(true);
    });
    expect(current.library.historySearch.collection.items).toHaveLength(1);
    act(() => { window.dispatchEvent(new Event('online')); });
    await until(() => expect(current.library.historySearch.collection.items).toHaveLength(0));
    expect(errors).toEqual([]);
    await act(async () => {
      expect((await readPendingSessionOperations('user:owner-a')).deleteIds.size).toBe(0);
    });
  });

  it('renames the working Session and summary before refreshing title search after persistence', async () => {
    await mount();
    await search();
    const gate = deferred();
    remote.saveCloudSession.mockImplementation(async (session: Session) => { await gate.promise; serverRows = [{ ...session }]; });
    let finished = false;
    act(() => { void current.actions.renameSession(row.id, 'renamed').then(() => { finished = true; }); });
    await until(() => expect(current.sessions.sessions.find((session) => session.id === row.id)?.title).toBe('renamed'));
    expect(current.library.history.items[0].title).toBe('renamed');
    expect(finished).toBe(false);
    expect(current.library.historySearch.collection.items).toHaveLength(1);
    await act(async () => { gate.resolve(); });
    await until(() => expect(current.library.historySearch.collection.items).toHaveLength(0));
    expect(finished).toBe(true);
    await act(async () => {
      expect((await getSession(row.id, 'user:owner-a'))?.title).toBe('renamed');
    });
    expect(serverRows[0].title).toBe('renamed');
  });

  it.each([false, true])('discards completion from a previous account scope (loaded=%s)', async (loaded) => {
    if (loaded) await putSession(row, 'user:owner-a');
    await mount();
    const gate = deferred();
    remote.deleteCloudSession.mockImplementationOnce(() => gate.promise);
    act(() => { current.actions.deleteSession(row.id); });
    await act(async () => { root.render(<Probe ownerId="owner-b" />); });
    // Returning to A with a loaded delete legitimately resumes its durable
    // tombstone. Check A -> B -> A only for the direct (unloaded) path.
    if (!loaded) await act(async () => { root.render(<Probe ownerId="owner-a" />); });
    await until(() => expect(current.library.history.items).toHaveLength(1));
    await act(async () => { gate.resolve(); });
    expect(current.library.history.items).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('keeps a failed rename locally without refreshing the saved search result', async () => {
    await mount();
    await search();
    const error = new Error('cloud unavailable');
    remote.saveCloudSession.mockRejectedValue(error);
    act(() => { void current.actions.renameSession(row.id, 'renamed'); });
    await until(() => expect(errors).toEqual([error]));
    expect(current.library.history.items[0].title).toBe('renamed');
    expect(current.library.historySearch.collection.items[0].title).toBe('original');
    await act(async () => {
      expect((await getSession(row.id, 'user:owner-a'))?.title).toBe('renamed');
    });
  });

  it('keeps guest deletion and rename local', async () => {
    await putSession(row, 'guest');
    await mount(null);
    act(() => { void current.actions.renameSession(row.id, 'guest title'); });
    await until(() => expect(current.sessions.sessions.find((session) => session.id === row.id)?.title).toBe('guest title'));
    act(() => { current.actions.deleteSession(row.id); });
    await until(() => expect(current.sessions.sessions.some((session) => session.id === row.id)).toBe(false));
    expect(remote.saveCloudSession).not.toHaveBeenCalled();
    expect(remote.deleteCloudSession).not.toHaveBeenCalled();
    expect(remote.listCloudSessionSummaries).not.toHaveBeenCalled();
  });

  it('does not report a remote failure after unmount', async () => {
    await mount();
    const gate = deferred();
    remote.deleteCloudSession.mockImplementationOnce(() => gate.promise);
    act(() => { current.actions.deleteSession(row.id); });
    await act(async () => { root.unmount(); });
    await act(async () => { gate.reject(new Error('late failure')); });
    expect(errors).toEqual([]);
  });
});
