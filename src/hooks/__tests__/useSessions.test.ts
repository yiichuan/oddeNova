// src/hooks/__tests__/useSessions.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'zh-CN' },
    configurable: true,
  });
});

import { applyTruncate, applyTruncateAndEdit } from '../useSessions';
import type { Session } from '../useSessions';

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
      title: '新会话',
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
