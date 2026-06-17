// @vitest-environment happy-dom

// src/hooks/__tests__/useSessions.test.ts
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { t } from '../../lib/i18n';
import type { AgentMode } from '../useChat';
import {
  applyAppendAssistantDelta,
  applyFinalizeLastAssistantMessage,
  applyRefreshEmptySessionForReuse,
  applySetMode,
  applyTruncate,
  applyTruncateAndEdit,
  useSessions,
} from '../useSessions';
import type { Session } from '../useSessions';

const storageMocks = vi.hoisted(() => ({
  openDB: vi.fn(async () => undefined),
  getAllSessions: vi.fn(async () => []),
  putSession: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
}));

vi.mock('../../lib/session-storage', () => ({
  openDB: storageMocks.openDB,
  getAllSessions: storageMocks.getAllSessions,
  putSession: storageMocks.putSession,
  deleteSession: storageMocks.deleteSession,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: '新会话',
    mode: 'create',
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

describe('session mode helpers', () => {
  it('applySetMode changes only the mode field', () => {
    const mode: AgentMode = 'chat';
    const s = makeSession({ mode: 'create', title: '聊天' });
    expect(applySetMode(s, mode)).toEqual({ ...s, mode: 'chat' });
  });

  it('applySetMode returns the same object when the mode already matches', () => {
    const s = makeSession({ mode: 'chat' });
    expect(applySetMode(s, 'chat')).toBe(s);
  });

  it('resets reused empty chat sessions back to create mode', () => {
    const s = makeSession({ mode: 'chat', createdAt: 1, updatedAt: 1 });

    expect(applyRefreshEmptySessionForReuse(s, 2)).toEqual({
      ...s,
      mode: 'create',
      title: t('newSessionTitle'),
      createdAt: 2,
      updatedAt: 2,
    });
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

  it('finalizes the last chat assistant message with stripped content and a compose seed', () => {
    const s = makeSession({
      messages: [
        { id: 'u1', role: 'user', content: '聊聊今晚', timestamp: 0 },
        { id: 'a1', role: 'assistant', content: '今晚像一片蓝色湖面。[[谱曲: 蓝色湖面]]', timestamp: 1 },
      ],
    });

    const result = applyFinalizeLastAssistantMessage(s, '今晚像一片蓝色湖面。', {
      composeSeed: '蓝色湖面',
    });

    expect(result.messages[1]).toMatchObject({
      role: 'assistant',
      content: '今晚像一片蓝色湖面。',
      composeSeed: '蓝色湖面',
    });
  });

  it('removes a previous compose seed when finalizing without one', () => {
    const s = makeSession({
      messages: [
        { id: 'a1', role: 'assistant', content: '旧回复', composeSeed: '旧种子', timestamp: 0 },
      ],
    });

    const result = applyFinalizeLastAssistantMessage(s, '新回复');

    expect(result.messages[0]).toEqual({
      id: 'a1',
      role: 'assistant',
      content: '新回复',
      timestamp: 0,
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
