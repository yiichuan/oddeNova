// @vitest-environment happy-dom

// src/hooks/__tests__/useSessions.test.ts
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { t } from '../../lib/i18n';
import type { OddeNovaImportPayload } from '../../lib/oddenova-import';
import { applyTruncate, applyTruncateAndEdit, useSessions } from '../useSessions';
import type { Session } from '../useSessions';

const storageMocks = vi.hoisted(() => ({
  openDB: vi.fn(async () => undefined),
  getAllSessions: vi.fn(async () => []),
  putSession: vi.fn(async (_session: unknown) => undefined),
  putImportedSession: vi.fn(async (_session: unknown) => undefined),
  putImportedSessionBranch: vi.fn(async (_detached: unknown, _branch: unknown) => undefined),
  deleteSession: vi.fn(async () => undefined),
  isSessionStoragePersistent: vi.fn(() => true),
}));

vi.mock('../../lib/session-storage', () => ({
  openDB: storageMocks.openDB,
  getAllSessions: storageMocks.getAllSessions,
  putSession: storageMocks.putSession,
  putImportedSession: storageMocks.putImportedSession,
  putImportedSessionBranch: storageMocks.putImportedSessionBranch,
  deleteSession: storageMocks.deleteSession,
  isSessionStoragePersistent: storageMocks.isSessionStoragePersistent,
}));

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

async function renderUseSessions(): Promise<{ root: Root; getHook: () => ReturnType<typeof useSessions> }> {
  let hook: ReturnType<typeof useSessions> | undefined;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe({ onValue }: { onValue: (value: ReturnType<typeof useSessions>) => void }) {
    const value = useSessions();
    useEffect(() => {
      onValue(value);
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe, { onValue: (value) => { hook = value; } }));
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
  };
}

describe('useSessions', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    storageMocks.openDB.mockResolvedValue(undefined);
    storageMocks.getAllSessions.mockResolvedValue([]);
    storageMocks.putSession.mockResolvedValue(undefined);
    storageMocks.putImportedSession.mockResolvedValue(undefined);
    storageMocks.putImportedSessionBranch.mockResolvedValue(undefined);
    storageMocks.deleteSession.mockResolvedValue(undefined);
    storageMocks.isSessionStoragePersistent.mockReturnValue(true);
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
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
    expect(getHook().currentSession?.messages[0].content).toBe('全新内容');
  });

  it('default title derives on first addUserMessage', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().addUserMessage('全新内容');
    });

    expect(getHook().currentSession?.title).toBe('全新内容');
  });

  it('newSession resets the title when reusing an empty current session', async () => {
    const { root, getHook } = await renderUseSessions();
    roots.push(root);

    act(() => {
      getHook().addUserMessage('来段普通的鼓点');
    });
    const firstMessageId = getHook().currentSession?.messages[0].id;
    expect(firstMessageId).toBeTruthy();

    act(() => {
      getHook().truncate(firstMessageId!);
    });
    expect(getHook().currentSession?.messages).toHaveLength(0);
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

    expect(getHook().currentSession?.suggestions).toEqual({
      forCode: 'stack(s("bd"))',
      items: ['加入贝斯', '让鼓点更密'],
    });
    expect(storageMocks.putSession).toHaveBeenCalledTimes(1);
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
});
