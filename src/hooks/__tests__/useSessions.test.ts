// @vitest-environment happy-dom

// src/hooks/__tests__/useSessions.test.ts
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { t } from '../../lib/i18n';
import type { OddeNovaImportPayload } from '../../lib/oddenova-import';
import {
  applyAppendAssistantDelta,
  applyFinalizeLastAssistantMessage,
  applyRefreshEmptySessionForReuse,
  applyTruncate,
  applyTruncateAndEdit,
  useSessions,
} from '../useSessions';
import type { Session } from '../useSessions';

const storageMocks = vi.hoisted(() => ({
  openDB: vi.fn(async () => undefined),
  getAllSessions: vi.fn(async () => [] as Session[]),
  getCurrentSessionId: vi.fn(async () => null as string | null),
  putSession: vi.fn(async () => undefined),
  putCurrentSessionId: vi.fn(async () => undefined),
  putImportedSession: vi.fn(async (_session: unknown) => undefined),
  putImportedSessionBranch: vi.fn(async (_detached: unknown, _branch: unknown) => undefined),
  deleteSession: vi.fn(async () => undefined),
  deleteSessionStrict: vi.fn(async () => undefined),
  isSessionStoragePersistent: vi.fn(() => true),
}));

const syncStorageMocks = vi.hoisted(() => ({
  readPendingSessionOperations: vi.fn(async () => ({
    syncIds: new Set<string>(),
    deleteIds: new Set<string>(),
  })),
  markPendingSessionSync: vi.fn(async () => undefined),
  clearPendingSessionSync: vi.fn(async () => undefined),
  markPendingSessionDelete: vi.fn(async () => undefined),
  clearPendingSessionDelete: vi.fn(async () => undefined),
}));

vi.mock('../../lib/session-storage', () => ({
  openDB: storageMocks.openDB,
  getAllSessions: storageMocks.getAllSessions,
  getCurrentSessionId: storageMocks.getCurrentSessionId,
  putSession: storageMocks.putSession,
  putCurrentSessionId: storageMocks.putCurrentSessionId,
  putImportedSession: storageMocks.putImportedSession,
  putImportedSessionBranch: storageMocks.putImportedSessionBranch,
  deleteSession: storageMocks.deleteSession,
  deleteSessionStrict: storageMocks.deleteSessionStrict,
  isSessionStoragePersistent: storageMocks.isSessionStoragePersistent,
}));

vi.mock('../../lib/session-sync-storage', () => syncStorageMocks);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: '新会话',
    messages: [],
    code: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

async function renderUseSessions(options?: Parameters<typeof useSessions>[0]): Promise<{
  root: Root;
  getHook: () => ReturnType<typeof useSessions>;
  rerender: (nextOptions?: Parameters<typeof useSessions>[0]) => Promise<void>;
}> {
  let hook: ReturnType<typeof useSessions> | undefined;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe({
    onValue,
    options: probeOptions,
  }: {
    onValue: (value: ReturnType<typeof useSessions>) => void;
    options?: Parameters<typeof useSessions>[0];
  }) {
    const value = useSessions(probeOptions);
    useEffect(() => {
      onValue(value);
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe, { onValue: (value) => { hook = value; }, options }));
  });
  await act(async () => {
    await Promise.resolve();
  });

  return {
    root,
    getHook: () => {
      if (!hook) throw new Error('useSessions hook was not rendered');
      return hook;
    },
    rerender: async (nextOptions) => {
      await act(async () => {
        root.render(createElement(Probe, { onValue: (value) => { hook = value; }, options: nextOptions }));
      });
    },
  };
}

describe('useSessions', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    storageMocks.openDB.mockResolvedValue(undefined);
    storageMocks.getAllSessions.mockResolvedValue([]);
    storageMocks.getCurrentSessionId.mockResolvedValue(null);
    storageMocks.putSession.mockResolvedValue(undefined);
    storageMocks.putCurrentSessionId.mockResolvedValue(undefined);
    storageMocks.putImportedSession.mockResolvedValue(undefined);
    storageMocks.putImportedSessionBranch.mockResolvedValue(undefined);
    storageMocks.deleteSession.mockResolvedValue(undefined);
    storageMocks.deleteSessionStrict.mockResolvedValue(undefined);
    storageMocks.isSessionStoragePersistent.mockReturnValue(true);
    syncStorageMocks.readPendingSessionOperations.mockResolvedValue({
      syncIds: new Set(),
      deleteIds: new Set(),
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('custom title survives first addUserMessage', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().renameSession(getHook().currentId!, '周末广告配乐');
    });
    act(() => {
      getHook().addUserMessage('全新内容');
    });

    expect(getHook().currentSession?.title).toBe('周末广告配乐');
    expect(getHook().currentSession?.messages.at(-1)?.content).toBe('全新内容');
  });

  it('default title derives on first addUserMessage', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().addUserMessage('全新内容');
    });

    expect(getHook().currentSession?.title).toBe('全新内容');
  });

  it('loads and writes sessions under the requested owner key', async () => {
    storageMocks.getAllSessions.mockResolvedValueOnce([
      makeSession({ id: 'account-session', title: 'Account', messages: [{ id: 'm', role: 'user', content: 'hi', timestamp: 1 }] }),
    ] as Session[]);
    const { root, getHook } = await renderUseSessions({ ownerKey: 'user:u-1' });
    roots.push(root);

    expect(storageMocks.getAllSessions).toHaveBeenCalledWith('user:u-1');

    act(() => {
      getHook().renameSession('account-session', 'Cloud Title');
    });

    expect(storageMocks.putSession).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'account-session',
      title: 'Cloud Title',
    }), 'user:u-1');
  });

  it('does not expose guest sessions while an account owner is loading', async () => {
    const guestSession = makeSession({ id: 'guest-session' });
    let resolveAccountSessions!: (sessions: Session[]) => void;
    storageMocks.getAllSessions
      .mockResolvedValueOnce([guestSession])
      .mockImplementationOnce(() => new Promise<Session[]>((resolve) => {
        resolveAccountSessions = resolve;
      }));
    const { root, getHook, rerender } = await renderUseSessions({ ownerKey: 'guest' });
    roots.push(root);

    expect(getHook().sessions).toEqual([guestSession]);

    await rerender({ ownerKey: 'user:u-1' });

    expect(getHook().sessions).toEqual([]);
    expect(getHook().currentSession).toBeNull();

    await act(async () => {
      resolveAccountSessions([]);
    });
  });

  it('does not copy the previous owner\'s session into the new owner while it loads', async () => {
    const accountSession = makeSession({
      id: 'account-session',
      title: '来个简单的贝斯',
      messages: [{ id: 'm-1', role: 'user', content: '来个简单的贝斯', timestamp: 1 }],
      code: 's("bd")',
    });
    let resolveGuestSessions!: (sessions: Session[]) => void;
    storageMocks.getAllSessions
      .mockResolvedValueOnce([accountSession])
      .mockImplementationOnce(() => new Promise<Session[]>((resolve) => {
        resolveGuestSessions = resolve;
      }));
    const { root, getHook, rerender } = await renderUseSessions({ ownerKey: 'user:u-1' });
    roots.push(root);

    // Signing out flips the owner key while the account session is still the
    // one held in memory; a late writer must not persist it as a guest session.
    await rerender({ ownerKey: 'guest' });
    storageMocks.putSession.mockClear();

    act(() => {
      getHook().setSuggestions(['换个音色'], 's("bd")');
    });

    expect(storageMocks.putSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'account-session' }),
      'guest',
    );

    await act(async () => {
      resolveGuestSessions([]);
    });
  });

  it('opens a fresh session after a guest user signs in instead of selecting the latest account history', async () => {
    const accountSession = makeSession({
      id: 'latest-account-session',
      title: 'Latest account history',
      messages: [{ id: 'm-1', role: 'user', content: '已有聊天', timestamp: 1 }],
    });
    const cloud = {
      listSessions: vi.fn(async () => [accountSession]),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      syncEnabled: true,
      cloud,
      startNewSessionToken: 1,
    });
    roots.push(root);

    expect(getHook().currentId).not.toBe('latest-account-session');
    expect(getHook().currentSession?.messages).toEqual([
      expect.objectContaining({ isGreeting: true }),
    ]);
    expect(getHook().sessions).toContainEqual(accountSession);
  });

  it('reuses an untouched session on sign-in instead of stacking up another new session', async () => {
    const untouched = makeSession({
      id: 'untouched-session',
      title: t('newSessionTitle'),
      messages: [{ id: 'g-1', role: 'assistant', content: '你好', timestamp: 1, isGreeting: true }],
      updatedAt: 10,
    });
    const cloud = {
      listSessions: vi.fn(async () => [untouched]),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    storageMocks.getAllSessions.mockResolvedValue([untouched]);
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      syncEnabled: true,
      cloud,
      startNewSessionToken: 1,
    });
    roots.push(root);

    expect(getHook().sessions).toHaveLength(1);
    expect(getHook().currentId).toBe('untouched-session');
    expect(getHook().currentSession?.messages).toEqual([
      expect.objectContaining({ isGreeting: true }),
    ]);
  });

  it('clears leftover untouched sessions on sign-in', async () => {
    const greeting = { id: 'g-1', role: 'assistant' as const, content: '你好', timestamp: 1, isGreeting: true };
    const untouched = makeSession({
      id: 'untouched-session',
      title: t('newSessionTitle'),
      messages: [greeting],
      updatedAt: 30,
    });
    const leftover = makeSession({
      id: 'leftover-session',
      title: t('newSessionTitle'),
      messages: [greeting],
      updatedAt: 20,
    });
    const history = makeSession({
      id: 'history-session',
      title: '来个简单的鼓点',
      messages: [{ id: 'm-1', role: 'user', content: '来个简单的鼓点', timestamp: 1 }],
      code: 's("bd")',
      updatedAt: 10,
    });
    const cloud = {
      listSessions: vi.fn(async () => [history]),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    storageMocks.getAllSessions.mockResolvedValue([untouched, leftover, history]);
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      syncEnabled: true,
      cloud,
      startNewSessionToken: 1,
    });
    roots.push(root);

    expect(getHook().sessions.map((session) => session.id))
      .toEqual(['untouched-session', 'history-session']);
    expect(storageMocks.deleteSessionStrict).toHaveBeenCalledWith('leftover-session', 'user:u-1');
    expect(cloud.deleteSession).toHaveBeenCalledWith('leftover-session', 'u-1');
  });

  it('keeps streamed changes local until a terminal checkpoint saves one latest snapshot', async () => {
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    act(() => {
      getHook().addUserMessage('同步这段旋律');
      getHook().appendToLastReasoning('先保留完整推理。');
      getHook().addAssistantMessage('完成', 's("bd")');
    });

    expect(cloud.saveSession).not.toHaveBeenCalled();

    let checkpoint!: Promise<void>;
    act(() => {
      checkpoint = getHook().checkpointSession(getHook().currentId!);
    });
    await act(async () => {
      await checkpoint;
    });

    expect(cloud.saveSession).toHaveBeenCalledTimes(1);
    expect(cloud.saveSession).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: '同步这段旋律' }),
        expect.objectContaining({ content: '先保留完整推理。' }),
        expect.objectContaining({ content: '完成' }),
      ]),
    }), 'u-1');
  });

  it('debounces manual code edits for two seconds before saving the latest code', async () => {
    vi.useFakeTimers();
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = getHook().setManualCode('s("bd")');
      second = getHook().setManualCode('s("bd sd")');
    });
    await act(async () => {
      await Promise.all([first, second]);
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(cloud.saveSession).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(cloud.saveSession).toHaveBeenCalledTimes(1);
    expect(cloud.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ code: 's("bd sd")' }),
      'u-1',
    );
    vi.useRealTimers();
  });

  it('surfaces manual save status only when the cloud request starts and clears success after two seconds', async () => {
    vi.useFakeTimers();
    let resolveSave!: () => void;
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(() => new Promise<void>((resolve) => {
        resolveSave = resolve;
      })),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    let manualSave!: Promise<void>;
    act(() => {
      manualSave = getHook().setManualCode('s("bd")');
    });
    await act(async () => {
      await manualSave;
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(getHook().currentManualSyncStatus).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getHook().currentManualSyncStatus).toBe('saving');

    await act(async () => {
      resolveSave();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getHook().currentManualSyncStatus).toBe('synced');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(getHook().currentManualSyncStatus).toBe('synced');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getHook().currentManualSyncStatus).toBeUndefined();
    vi.useRealTimers();
  });

  it('keeps a failed manual cloud request visible for retry', async () => {
    vi.useFakeTimers();
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => {
        throw new Error('Cloud save failed');
      }),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    let manualSave!: Promise<void>;
    act(() => {
      manualSave = getHook().setManualCode('s("bd")');
    });
    await act(async () => {
      await manualSave;
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
    });

    expect(getHook().currentManualSyncStatus).toBe('retrying');
    vi.useRealTimers();
  });

  it('does not surface a later Agent checkpoint as a manual save', async () => {
    vi.useFakeTimers();
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    let manualSave!: Promise<void>;
    await act(async () => {
      manualSave = getHook().setManualCode('s("bd")');
    });
    await act(async () => {
      await manualSave;
    });
    act(() => {
      getHook().addUserMessage('继续调整');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(cloud.saveSession).toHaveBeenCalledTimes(1);
    expect(getHook().currentManualSyncStatus).toBeUndefined();
    vi.useRealTimers();
  });

  it('keeps a pending local snapshot over a newer cloud row during startup reconciliation', async () => {
    const local = makeSession({ id: 'shared', code: 'local dirty', updatedAt: 10 });
    const remote = makeSession({ id: 'shared', code: 'remote newer', updatedAt: 20 });
    storageMocks.getAllSessions.mockResolvedValueOnce([local]);
    syncStorageMocks.readPendingSessionOperations.mockResolvedValueOnce({
      syncIds: new Set(['shared']),
      deleteIds: new Set(),
    });
    const cloud = {
      listSessions: vi.fn(async () => [remote]),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };

    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    expect(getHook().currentSession?.code).toBe('local dirty');
    expect(storageMocks.putSession).toHaveBeenCalledWith(local, 'user:u-1');
  });

  it('keeps the local cache untouched when pending operation markers cannot be read', async () => {
    const local = makeSession({
      id: 'local-unknown',
      code: 'local possibly dirty',
      messages: [{ id: 'user', role: 'user', content: '保留我', timestamp: 1 }],
    });
    storageMocks.getAllSessions.mockResolvedValueOnce([local]);
    syncStorageMocks.readPendingSessionOperations.mockRejectedValueOnce(
      new Error('settings store unavailable'),
    );
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };

    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    expect(getHook().sessions).toEqual([local]);
    expect(cloud.listSessions).not.toHaveBeenCalled();
    expect(storageMocks.deleteSessionStrict).not.toHaveBeenCalled();
  });

  it('purges a tombstoned local row even when the cloud cannot be listed', async () => {
    const deleted = makeSession({
      id: 'deleted',
      messages: [{ id: 'user', role: 'user', content: '删除我', timestamp: 1 }],
    });
    storageMocks.getAllSessions.mockResolvedValueOnce([deleted]);
    syncStorageMocks.readPendingSessionOperations.mockResolvedValueOnce({
      syncIds: new Set(),
      deleteIds: new Set(['deleted']),
    });
    const cloud = {
      listSessions: vi.fn(async () => { throw new Error('offline'); }),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };

    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    expect(storageMocks.deleteSessionStrict).toHaveBeenCalledWith('deleted', 'user:u-1');
    expect(getHook().sessions.some((item) => item.id === 'deleted')).toBe(false);
  });

  it('does not upload a greeting-only session', async () => {
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    act(() => getHook().newSession());
    await Promise.resolve();

    expect(getHook().currentSession?.messages).toEqual([
      expect.objectContaining({ isGreeting: true }),
    ]);
    expect(cloud.saveSession).not.toHaveBeenCalled();
  });

  it('does not upload a greeting-only session after it is renamed', async () => {
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    act(() => {
      getHook().renameSession(getHook().currentId!, '只有标题');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(cloud.saveSession).not.toHaveBeenCalled();
    expect(syncStorageMocks.markPendingSessionSync).not.toHaveBeenCalled();
  });

  it('checkpoints the latest complete turn without uploading an earlier reasoning snapshot', async () => {
    let releaseFirstSave!: () => void;
    const saveSession = vi.fn<(session: Session) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseFirstSave = resolve;
      }))
      .mockResolvedValue(undefined);
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession,
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);
    const sessionId = getHook().currentId!;

    act(() => {
      getHook().addUserMessage('来个简单的鼓点', sessionId);
    });
    act(() => {
      getHook().appendToLastReasoning('先构思四四拍鼓点。', sessionId);
      getHook().addProgress('tool_call', '编排段落…', {
        toolName: 'setCode',
        sessionId,
      });
      getHook().addAssistantMessage(
        '一个简单干净的四四拍鼓点。',
        's("bd sd")',
        sessionId,
        {
          beforeCode: '',
          afterCode: 's("bd sd")',
          playbackStatus: 'played',
        },
      );
    });

    expect(saveSession).not.toHaveBeenCalled();
    let checkpoint!: Promise<void>;
    act(() => {
      checkpoint = getHook().checkpointSession(sessionId);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSession).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseFirstSave();
      await checkpoint;
    });

    const finalSnapshot = saveSession.mock.calls.at(-1)?.[0];
    const finalMessage = finalSnapshot?.messages.at(-1);
    expect(finalMessage).toMatchObject({
      role: 'assistant',
      content: '一个简单干净的四四拍鼓点。',
      code: 's("bd sd")',
    });
    expect(finalSnapshot?.revisions).toHaveLength(1);
    expect(finalMessage?.revisionId).toBe(finalSnapshot?.revisions?.[0].id);
  });

  it('does not retry one account owner cloud failure after switching to another owner', async () => {
    const saveSession = vi.fn()
      .mockRejectedValueOnce(new Error('account A save failed'))
      .mockResolvedValue(undefined);
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession,
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook, rerender } = await renderUseSessions({
      ownerKey: 'user:account-a',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    act(() => {
      getHook().addUserMessage('A 的私密会话');
    });
    await act(async () => {
      await expect(getHook().flushCloudSaves()).rejects.toThrow('account A save failed');
    });

    await rerender({ ownerKey: 'guest', cloud, syncEnabled: false });
    await rerender({ ownerKey: 'user:account-b', cloud, syncEnabled: true });
    await act(async () => {
      await getHook().flushCloudSaves();
    });

    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ messages: expect.arrayContaining([
        expect.objectContaining({ content: 'A 的私密会话' }),
      ]) }),
      'account-a',
    );
  });

  it('does not resurrect a failed cloud snapshot after deleting its session', async () => {
    const saveSession = vi.fn()
      .mockRejectedValueOnce(new Error('save failed before delete'))
      .mockResolvedValue(undefined);
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession,
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);
    const deletedId = getHook().currentId!;

    act(() => {
      getHook().addUserMessage('删除这段会话');
    });
    await act(async () => {
      await expect(getHook().flushCloudSaves()).rejects.toThrow('save failed before delete');
    });

    act(() => {
      getHook().deleteSession(deletedId);
    });
    await vi.waitFor(() => {
      expect(cloud.deleteSession).toHaveBeenCalledWith(deletedId, 'u-1');
    });
    await act(async () => {
      await getHook().flushCloudSaves();
    });

    expect(saveSession.mock.calls.filter(([session]) => session.id === deletedId)).toHaveLength(1);
  });

  it('keeps the delete tombstone when strict local deletion fails', async () => {
    storageMocks.deleteSessionStrict.mockRejectedValueOnce(new Error('IDB delete failed'));
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);
    const deletedId = getHook().currentId!;

    act(() => {
      getHook().deleteSession(deletedId);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncStorageMocks.markPendingSessionDelete).toHaveBeenCalledWith(
      'user:u-1',
      deletedId,
    );
    expect(cloud.deleteSession).not.toHaveBeenCalled();
    expect(syncStorageMocks.clearPendingSessionDelete).not.toHaveBeenCalled();
  });

  it('waits for imported sessions to be saved to the cloud when sync is enabled', async () => {
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    await act(async () => {
      await getHook().importSession({
        title: '本机历史',
        code: 's("bd")',
        messages: [{ id: 'msg-1', role: 'user', content: '本地聊天', timestamp: 1 }],
      });
    });

    expect(cloud.saveSession).toHaveBeenCalledWith(expect.objectContaining({
      title: '本机历史',
      messages: [expect.objectContaining({ content: '本地聊天' })],
    }), 'u-1');
  });

  it('keeps an imported session locally and retries when the cloud save fails', async () => {
    const cloudError = new Error('Cloud save failed');
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => { throw cloudError; }),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    await act(async () => {
      await expect(getHook().importSession({
        title: '本机历史',
        code: 's("bd")',
        messages: [{ id: 'msg-1', role: 'user', content: '本地聊天', timestamp: 1 }],
      })).resolves.toBeUndefined();
    });

    expect(getHook().currentSession).toMatchObject({
      title: '本机历史',
      code: 's("bd")',
    });
    expect(getHook().currentSyncStatus).toBe('retrying');
  });

  it('newSession resets the title when reusing an empty current session', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().addUserMessage('来段普通的鼓点');
    });
    const firstMessageId = getHook().currentSession?.messages.find((m) => m.role === 'user')?.id;
    expect(firstMessageId).toBeTruthy();

    act(() => {
      getHook().truncate(firstMessageId!);
    });
    expect(getHook().currentSession?.messages).toHaveLength(1);
    expect(getHook().currentSession?.title).toBe('来段普通的鼓点');

    act(() => {
      getHook().newSession();
    });

    expect(getHook().currentSession?.title).toBe(t('newSessionTitle'));
  });

  it('renameSession trims, ignores blank strings, and slices to 60 chars', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);
    const sessionId = getHook().currentId!;
    const longTitle = '一'.repeat(61);

    act(() => {
      getHook().renameSession(sessionId, '  周末广告配乐  ');
    });
    expect(getHook().currentSession?.title).toBe('周末广告配乐');

    act(() => {
      getHook().renameSession(sessionId, '   ');
    });
    expect(getHook().currentSession?.title).toBe('周末广告配乐');

    act(() => {
      getHook().renameSession(sessionId, longTitle);
    });
    expect(getHook().currentSession?.title).toBe(longTitle.slice(0, 60));
  });

  it('seeds a fresh session with exactly one greeting message', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    const messages = getHook().currentSession?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].isGreeting).toBe(true);
    expect(storageMocks.putSession).toHaveBeenCalledTimes(1);
  });

  it('restores the latest stored session on startup instead of creating a new one', async () => {
    const stored = makeSession({
      id: 'stored-latest',
      title: '今天心情有点好',
      messages: [{ id: 'msg-1', role: 'user', content: '今天心情有点好', timestamp: 1 }],
      code: 'stack(s("bd"))',
      createdAt: 1,
      updatedAt: 10,
    });
    storageMocks.getAllSessions.mockResolvedValue([stored]);

    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    expect(getHook().currentId).toBe('stored-latest');
    expect(getHook().sessions).toEqual([stored]);
    expect(storageMocks.putSession).not.toHaveBeenCalled();
  });

  it('restores the persisted current session on startup even when it is not the newest session', async () => {
    const emptyNewer = makeSession({
      id: 'stored-empty-newer',
      messages: [{ id: 'greeting-1', role: 'assistant', content: '你好', timestamp: 2, isGreeting: true }],
      createdAt: 2,
      updatedAt: 20,
    });
    const selectedOlder = makeSession({
      id: 'selected-older',
      title: '今天心情有点好',
      messages: [{ id: 'msg-1', role: 'user', content: '今天心情有点好', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 10,
    });
    storageMocks.getAllSessions.mockResolvedValue([emptyNewer, selectedOlder]);
    storageMocks.getCurrentSessionId.mockResolvedValue('selected-older');

    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    expect(getHook().currentId).toBe('selected-older');
    expect(getHook().currentSession).toEqual(selectedOlder);
  });

  it('reuses a stored greeting-only session on startup instead of stacking another empty one', async () => {
    const storedEmpty = makeSession({
      id: 'stored-empty',
      messages: [{ id: 'greeting-1', role: 'assistant', content: '你好', timestamp: 1, isGreeting: true }],
      createdAt: 1,
      updatedAt: 10,
    });
    storageMocks.getAllSessions.mockResolvedValue([storedEmpty]);

    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    expect(getHook().currentId).toBe('stored-empty');
    expect(getHook().sessions).toHaveLength(1);
    expect(getHook().currentSession).toEqual(storedEmpty);
    expect(storageMocks.putSession).not.toHaveBeenCalled();
  });

  it('newSession reuses a session that only contains a greeting, instead of stacking a new one', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    const initialId = getHook().currentId;
    const initialCount = getHook().sessions.length;

    act(() => {
      getHook().newSession();
    });

    expect(getHook().sessions.length).toBe(initialCount);
    expect(getHook().currentId).toBe(initialId);
  });

  it('setSuggestions stores items with the code they were generated for and persists', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().setCurrentCode('stack(s("bd"))');
    });
    storageMocks.putSession.mockClear();

    act(() => {
      getHook().setSuggestions(['加入贝斯', '让鼓点更密'], 'stack(s("bd"))');
    });
    act(() => {
      getHook().setSuggestions(['加入贝斯', '让鼓点更密'], 'stack(s("bd"))');
    });

    expect(getHook().currentSession?.suggestions).toEqual({
      forCode: 'stack(s("bd"))',
      items: ['加入贝斯', '让鼓点更密'],
    });
    expect(storageMocks.putSession).toHaveBeenCalledTimes(1);
  });

  it('persists the selected session id when switching sessions', async () => {
    const emptyNewer = makeSession({
      id: 'stored-empty-newer',
      messages: [{ id: 'greeting-1', role: 'assistant', content: '你好', timestamp: 2, isGreeting: true }],
      createdAt: 2,
      updatedAt: 20,
    });
    const target = makeSession({
      id: 'target-session',
      title: '今天心情有点好',
      messages: [{ id: 'msg-1', role: 'user', content: '今天心情有点好', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 10,
    });
    storageMocks.getAllSessions.mockResolvedValue([emptyNewer, target]);

    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().switchTo('target-session');
    });

    expect(getHook().currentId).toBe('target-session');
    expect(storageMocks.putCurrentSessionId).toHaveBeenCalledWith('target-session', 'guest');
  });

  it('exposes whether session storage is persistent after opening the database', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    expect(storageMocks.isSessionStoragePersistent).toHaveBeenCalledTimes(1);
    expect(getHook().isPersistent).toBe(true);
  });

  it('creates, updates, and conflict-branches imported oddeNova skill sessions', async () => {
    const payload: OddeNovaImportPayload = {
      protocolVersion: 1,
      source: 'oddenova-strudel-skill',
      projectId: 'project-1',
      title: 'Imported beat',
      code: 'setcps(0.4)\nstack(s("bd"))',
      messages: [
        { role: 'user', content: 'Make a beat' },
        { role: 'assistant', content: 'Here is a beat' },
      ],
    };
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await getHook().importOddeNovaSession(payload);
    });
    expect(outcome).toBe('created');
    expect(getHook().currentSession?.externalSource).toMatchObject({
      type: 'oddenova-strudel-skill', projectId: 'project-1',
    });
    expect(getHook().currentSession?.messages.map(({ role, content }) => ({ role, content }))).toEqual(payload.messages);

    await act(async () => {
      outcome = await getHook().importOddeNovaSession({
        ...payload,
        code: 'setcps(0.5)\nstack(s("bd"))',
      });
    });
    expect(outcome).toBe('updated');
    expect(getHook().sessions.filter((session) => session.externalSource?.projectId === 'project-1'))
      .toHaveLength(1);

    act(() => getHook().setCurrentCode('website edit'));
    storageMocks.putImportedSessionBranch.mockClear();
    await act(async () => {
      outcome = await getHook().importOddeNovaSession({ ...payload, code: 'codex update' });
    });
    expect(outcome).toBe('branched');
    expect(getHook().sessions).toHaveLength(3);
    expect(getHook().sessions.filter((session) => session.externalSource?.projectId === 'project-1'))
      .toHaveLength(1);

    expect(storageMocks.putImportedSessionBranch).toHaveBeenCalledTimes(1);
    const [detached, persistedBranch] = storageMocks.putImportedSessionBranch.mock.calls[0] as [Session, Session];
    expect(detached).toMatchObject({ code: 'website edit', externalSource: undefined });
    expect(persistedBranch).toMatchObject({ code: 'codex update' });
    expect(persistedBranch.externalSource).toMatchObject({
      type: 'oddenova-strudel-skill', projectId: 'project-1',
    });

    const branchId = getHook().currentSession?.id;
    const sessionCount = getHook().sessions.length;
    await act(async () => {
      outcome = await getHook().importOddeNovaSession({ ...payload, code: 'codex update' });
    });
    expect(outcome).toBe('updated');
    expect(getHook().currentSession?.id).toBe(branchId);
    expect(getHook().sessions).toHaveLength(sessionCount);
  });

  it('cloud-saves oddeNova skill creates, updates, and both sides of a conflict branch', async () => {
    const payload: OddeNovaImportPayload = {
      protocolVersion: 1,
      source: 'oddenova-strudel-skill',
      projectId: 'cloud-project',
      title: 'Cloud imported beat',
      code: 'stack(s("bd"))',
      messages: [{ role: 'user', content: 'Make a cloud beat' }],
    };
    const cloud = {
      listSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
    };
    const { root, getHook } = await renderUseSessions({
      ownerKey: 'user:u-1',
      cloud,
      syncEnabled: true,
    });
    roots.push(root);

    await act(async () => {
      await getHook().importOddeNovaSession(payload);
    });
    const importedId = getHook().currentId!;
    expect(cloud.saveSession).toHaveBeenLastCalledWith(expect.objectContaining({
      id: importedId,
      code: payload.code,
      externalSource: expect.objectContaining({ projectId: 'cloud-project' }),
    }), 'u-1');

    await act(async () => {
      await getHook().importOddeNovaSession({ ...payload, code: 'stack(s("sd"))' });
    });
    expect(cloud.saveSession).toHaveBeenLastCalledWith(expect.objectContaining({
      id: importedId,
      code: 'stack(s("sd"))',
      externalSource: expect.objectContaining({ projectId: 'cloud-project' }),
    }), 'u-1');

    act(() => getHook().setCurrentCode('website edit'));
    cloud.saveSession.mockClear();
    await act(async () => {
      await getHook().importOddeNovaSession({ ...payload, code: 'stack(s("hh"))' });
    });

    expect(cloud.saveSession).toHaveBeenCalledTimes(2);
    expect(cloud.saveSession).toHaveBeenCalledWith(expect.objectContaining({
      id: importedId,
      code: 'website edit',
      externalSource: undefined,
    }), 'u-1');
    expect(cloud.saveSession).toHaveBeenCalledWith(expect.objectContaining({
      code: 'stack(s("hh"))',
      externalSource: expect.objectContaining({ projectId: 'cloud-project' }),
    }), 'u-1');
  });

  it.each(['detached', 'branch'] as const)(
    'keeps local branch state and schedules retry when the %s cloud save fails',
    async (failedSide) => {
      const payload: OddeNovaImportPayload = {
        protocolVersion: 1,
        source: 'oddenova-strudel-skill',
        projectId: `partial-${failedSide}`,
        title: 'Partial cloud branch',
        code: 'stack(s("bd"))',
        messages: [{ role: 'user', content: 'Make a beat' }],
      };
      const cloud = {
        listSessions: vi.fn(async () => []),
        saveSession: vi.fn<(_session: Session, _expectedUserId?: string) => Promise<void>>(
          async () => undefined,
        ),
        deleteSession: vi.fn(async () => undefined),
      };
      const { root, getHook } = await renderUseSessions({
        ownerKey: 'user:u-1',
        cloud,
        syncEnabled: true,
      });
      roots.push(root);

      await act(async () => {
        await getHook().importOddeNovaSession(payload);
      });
      act(() => getHook().setCurrentCode('website edit'));
      await act(async () => {
        await getHook().flushCloudSaves();
      });

      let releaseOther!: () => void;
      cloud.saveSession.mockImplementation((session) => {
        const side = session.externalSource ? 'branch' : 'detached';
        if (side === failedSide) {
          return Promise.reject(new Error(`${failedSide} cloud save failed`));
        }
        return new Promise<void>((resolve) => {
          releaseOther = resolve;
        });
      });
      cloud.saveSession.mockClear();

      let settled = false;
      let importPromise!: Promise<string>;
      await act(async () => {
        importPromise = getHook().importOddeNovaSession({
          ...payload,
          code: 'stack(s("hh"))',
        });
        void importPromise.then(
          () => { settled = true; },
          () => { settled = true; },
        );
        await Promise.resolve();
      });

      expect(cloud.saveSession).toHaveBeenCalledTimes(2);
      expect(settled).toBe(false);
      expect(getHook().currentSession).toMatchObject({
        code: 'stack(s("hh"))',
        externalSource: expect.objectContaining({ projectId: payload.projectId }),
      });

      await act(async () => {
        releaseOther();
        await expect(importPromise).resolves.toBe('branched');
      });
      expect(getHook().sessions).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'website edit', externalSource: undefined }),
        expect.objectContaining({
          code: 'stack(s("hh"))',
          externalSource: expect.objectContaining({ projectId: payload.projectId }),
        }),
      ]));
    },
  );

  it('rejects a failed imported-session create without changing React state', async () => {
    const payload: OddeNovaImportPayload = {
      protocolVersion: 1,
      source: 'oddenova-strudel-skill',
      projectId: 'create-failure',
      title: 'Imported beat',
      code: 'stack(s("bd"))',
      messages: [{ role: 'user', content: 'Make a beat' }],
    };
    const { root, getHook } = await renderUseSessions();
    roots.push(root);
    const previousSessions = getHook().sessions;
    const previousCurrentId = getHook().currentId;
    storageMocks.putImportedSession.mockRejectedValueOnce(new Error('create failed'));

    await act(async () => {
      await expect(getHook().importOddeNovaSession(payload)).rejects.toThrow('create failed');
    });

    expect(getHook().sessions).toBe(previousSessions);
    expect(getHook().currentId).toBe(previousCurrentId);
  });

  it('rejects a failed imported-session update without changing React state', async () => {
    const payload: OddeNovaImportPayload = {
      protocolVersion: 1,
      source: 'oddenova-strudel-skill',
      projectId: 'update-failure',
      title: 'Imported beat',
      code: 'stack(s("bd"))',
      messages: [{ role: 'user', content: 'Make a beat' }],
    };
    const { root, getHook } = await renderUseSessions();
    roots.push(root);
    await act(async () => {
      await getHook().importOddeNovaSession(payload);
    });
    const previousSessions = getHook().sessions;
    const previousCurrentId = getHook().currentId;
    storageMocks.putImportedSession.mockRejectedValueOnce(new Error('update failed'));

    await act(async () => {
      await expect(getHook().importOddeNovaSession({ ...payload, code: 'stack(s("sd"))' }))
        .rejects.toThrow('update failed');
    });

    expect(getHook().sessions).toBe(previousSessions);
    expect(getHook().currentId).toBe(previousCurrentId);
    expect(getHook().currentSession?.code).toBe(payload.code);
  });

  it('rejects a failed atomic conflict branch without detaching or adding sessions', async () => {
    const payload: OddeNovaImportPayload = {
      protocolVersion: 1,
      source: 'oddenova-strudel-skill',
      projectId: 'branch-failure',
      title: 'Imported beat',
      code: 'stack(s("bd"))',
      messages: [{ role: 'user', content: 'Make a beat' }],
    };
    const { root, getHook } = await renderUseSessions();
    roots.push(root);
    await act(async () => {
      await getHook().importOddeNovaSession(payload);
    });
    act(() => getHook().setCurrentCode('website edit'));
    const previousSessions = getHook().sessions;
    const previousCurrentId = getHook().currentId;
    storageMocks.putImportedSessionBranch.mockRejectedValueOnce(new Error('branch failed'));

    await act(async () => {
      await expect(getHook().importOddeNovaSession({ ...payload, code: 'codex update' }))
        .rejects.toThrow('branch failed');
    });

    expect(getHook().sessions).toBe(previousSessions);
    expect(getHook().currentId).toBe(previousCurrentId);
    expect(getHook().sessions).toHaveLength(2);
    expect(getHook().currentSession).toMatchObject({
      id: previousCurrentId,
      code: 'website edit',
      externalSource: {
        type: 'oddenova-strudel-skill',
        projectId: 'branch-failure',
      },
    });
  });

  it('atomically stores a code revision and links it from the assistant message', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().addAssistantMessage('完成', 's("sd")', getHook().currentId!, {
        beforeCode: 's("bd")',
        afterCode: 's("sd")',
        playbackStatus: 'played',
      });
    });

    const session = getHook().currentSession!;
    expect(session.revisions).toHaveLength(1);
    expect(session.revisions?.[0]).toMatchObject({
      beforeCode: 's("bd")',
      afterCode: 's("sd")',
      playbackStatus: 'played',
    });
    expect(session.messages.at(-1)?.revisionId).toBe(session.revisions?.[0].id);
  });

  it('keeps ordinary assistant messages revision-free', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().addAssistantMessage('没有代码', undefined, getHook().currentId!);
    });

    expect(getHook().currentSession?.revisions).toBeUndefined();
    expect(getHook().currentSession?.messages.at(-1)?.revisionId).toBeUndefined();
  });
});

describe('applyTruncateAndEdit', () => {
  it('targetMessageId 不存在时返回同一个 session 对象不变', () => {
    const s = makeSession();
    const result = applyTruncateAndEdit(s, 'nonexistent', '新内容');
    expect(result).toBe(s);
  });

  it('截断目标消息及其后续，并用新内容替换', () => {
    const s = makeSession({
      messages: [
        { id: 'msg-1', role: 'user', content: '旧内容', timestamp: 0 },
        { id: 'msg-2', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncateAndEdit(s, 'msg-1', '新内容');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('新内容');
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].id).toMatch(/^msg-/);
  });

  it('截断到首条用户消息且标题仍是新会话时重新派生 title', () => {
    const s = makeSession({
      title: t('newSessionTitle'),
      messages: [
        { id: 'msg-1', role: 'user', content: '旧内容', timestamp: 0 },
        { id: 'msg-2', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncateAndEdit(s, 'msg-1', '全新内容');
    expect(result.title).toBe('全新内容');
  });

  it('截断到首条用户消息但标题已自定义时不覆盖 title', () => {
    const s = makeSession({
      title: '周末广告配乐',
      messages: [
        { id: 'msg-1', role: 'user', content: '旧内容', timestamp: 0 },
        { id: 'msg-2', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncateAndEdit(s, 'msg-1', '全新内容');
    expect(result.title).toBe('周末广告配乐');
  });

  it('目标消息前已有用户消息时保留原 title', () => {
    const s = makeSession({
      title: '原标题',
      messages: [
        { id: 'msg-0', role: 'user', content: '第一条', timestamp: 0 },
        { id: 'msg-1', role: 'user', content: '旧内容', timestamp: 0 },
        { id: 'msg-2', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncateAndEdit(s, 'msg-1', '新内容');
    expect(result.title).toBe('原标题');
    // before = [msg-0]，result = [msg-0, new message]
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe('msg-0');
    expect(result.messages[1].content).toBe('新内容');
  });
});

describe('empty session reuse helpers', () => {
  it('refreshes reused empty sessions and re-rolls the greeting', () => {
    const s = makeSession({
      createdAt: 1,
      updatedAt: 1,
      messages: [{ id: 'old-greeting', role: 'assistant', content: '旧招呼', timestamp: 1, isGreeting: true }],
    });

    const result = applyRefreshEmptySessionForReuse(s, 2);

    expect(result.title).toBe(t('newSessionTitle'));
    expect(result.createdAt).toBe(2);
    expect(result.updatedAt).toBe(2);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].isGreeting).toBe(true);
    expect(result.messages[0].id).not.toBe('old-greeting');
  });
});

describe('assistant streaming helpers', () => {
  it('creates and appends to one assistant message while chat text streams', () => {
    const s = makeSession({
      messages: [{ id: 'u1', role: 'user', content: '你是谁', timestamp: 0 }],
    });

    const first = applyAppendAssistantDelta(s, '我是 ');
    const second = applyAppendAssistantDelta(first, 'Nova');

    expect(second.messages).toHaveLength(2);
    expect(second.messages[1]).toMatchObject({
      role: 'assistant',
      content: '我是 Nova',
    });
  });

  it('finalizes the last streamed assistant message with final content', () => {
    const s = makeSession({
      messages: [
        { id: 'u1', role: 'user', content: '聊聊今晚', timestamp: 0 },
        { id: 'a1', role: 'assistant', content: '今晚像一片蓝色湖面。', timestamp: 1 },
      ],
    });

    const result = applyFinalizeLastAssistantMessage(s, '今晚像一片安静的蓝色湖面。');

    expect(result.messages[1]).toMatchObject({
      role: 'assistant',
      content: '今晚像一片安静的蓝色湖面。',
    });
  });

  it('appends instead of clobbering when the last assistant message carries composed code', () => {
    const s = makeSession({
      messages: [
        { id: 'u1', role: 'user', content: '写一首歌', timestamp: 0 },
        { id: 'a1', role: 'assistant', content: '写好了', code: 'setcps(0.5)', timestamp: 1 },
      ],
    });

    const result = applyFinalizeLastAssistantMessage(s, '喜欢吗？');

    // The composed message must be preserved untouched.
    expect(result.messages).toHaveLength(3);
    expect(result.messages[1]).toMatchObject({ content: '写好了', code: 'setcps(0.5)' });
    expect(result.messages[2]).toMatchObject({ role: 'assistant', content: '喜欢吗？' });
    expect(result.messages[2].code).toBeUndefined();
  });

  it('appends a new delta message instead of mutating a code-carrying last message', () => {
    const s = makeSession({
      messages: [
        { id: 'u1', role: 'user', content: '写一首歌', timestamp: 0 },
        { id: 'a1', role: 'assistant', content: '写好了', code: 'setcps(0.5)', timestamp: 1 },
      ],
    });

    const result = applyAppendAssistantDelta(s, '你觉得');

    expect(result.messages).toHaveLength(3);
    expect(result.messages[1]).toMatchObject({ content: '写好了', code: 'setcps(0.5)' });
    expect(result.messages[2]).toMatchObject({ role: 'assistant', content: '你觉得' });
    expect(result.messages[2].code).toBeUndefined();
  });
});

describe('applyTruncate', () => {
  it('targetMessageId 不存在时返回同一个 session 对象不变', () => {
    const s = makeSession({
      messages: [{ id: 'msg-1', role: 'user', content: '内容', timestamp: 0 }],
    });
    const result = applyTruncate(s, 'nonexistent');
    expect(result).toBe(s);
  });

  it('截断目标消息及其后续消息，不追加新消息', () => {
    const s = makeSession({
      messages: [
        { id: 'msg-0', role: 'user', content: '第一条', timestamp: 0 },
        { id: 'msg-1', role: 'user', content: '旧内容', timestamp: 0 },
        { id: 'msg-2', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncate(s, 'msg-1');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe('msg-0');
  });

  it('截断到第一条消息时消息列表为空', () => {
    const s = makeSession({
      messages: [
        { id: 'msg-0', role: 'user', content: '第一条', timestamp: 0 },
        { id: 'msg-1', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncate(s, 'msg-0');
    expect(result.messages).toHaveLength(0);
  });

  it('保留原 title，不重新派生', () => {
    const s = makeSession({
      title: '原标题',
      messages: [
        { id: 'msg-0', role: 'user', content: '第一条', timestamp: 0 },
        { id: 'msg-1', role: 'assistant', content: '回复', timestamp: 0 },
      ],
    });
    const result = applyTruncate(s, 'msg-1');
    expect(result.title).toBe('原标题');
  });

  it('截断消息时移除不再被引用的 revisions', () => {
    const s = makeSession({
      messages: [
        { id: 'msg-0', role: 'user', content: '第一条', timestamp: 0 },
        { id: 'msg-1', role: 'assistant', content: '版本一', code: 's("bd")', revisionId: 'rev-1', timestamp: 1 },
        { id: 'msg-2', role: 'user', content: '第二条', timestamp: 2 },
        { id: 'msg-3', role: 'assistant', content: '版本二', code: 's("sd")', revisionId: 'rev-2', timestamp: 3 },
      ],
      revisions: [
        { id: 'rev-1', beforeCode: '', afterCode: 's("bd")', playbackStatus: 'played', createdAt: 1 },
        { id: 'rev-2', beforeCode: 's("bd")', afterCode: 's("sd")', playbackStatus: 'played', createdAt: 3 },
      ],
    });

    const result = applyTruncate(s, 'msg-2');

    expect(result.revisions?.map((revision) => revision.id)).toEqual(['rev-1']);
  });
});
