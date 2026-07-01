// @vitest-environment happy-dom

// src/hooks/__tests__/useSessions.test.ts
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { t } from '../../lib/i18n';
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
  deleteSession: vi.fn(async () => undefined),
}));

vi.mock('../../lib/session-storage', () => ({
  openDB: storageMocks.openDB,
  getAllSessions: storageMocks.getAllSessions,
  getCurrentSessionId: storageMocks.getCurrentSessionId,
  putSession: storageMocks.putSession,
  putCurrentSessionId: storageMocks.putCurrentSessionId,
  deleteSession: storageMocks.deleteSession,
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
    storageMocks.getCurrentSessionId.mockResolvedValue(null);
    storageMocks.putSession.mockResolvedValue(undefined);
    storageMocks.putCurrentSessionId.mockResolvedValue(undefined);
    storageMocks.deleteSession.mockResolvedValue(undefined);
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
    expect(storageMocks.putCurrentSessionId).toHaveBeenCalledWith('target-session');
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
