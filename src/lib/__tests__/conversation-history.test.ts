import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import {
  conversationHistoryBefore,
  conversationHistoryFromMessages,
} from '../conversation-history';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-default',
    role: 'user',
    content: '',
    timestamp: 0,
    ...overrides,
  };
}

describe('conversation history helpers', () => {
  it('keeps only user and assistant text in session order', () => {
    const messages: ChatMessage[] = [
      msg({ id: 'u1', role: 'user', content: '钢琴层不对' }),
      msg({ id: 'p1', role: 'progress', content: 'thinking', progressKind: 'thinking' }),
      msg({ id: 'a1', role: 'assistant', content: '我把旋律改成弧线。', code: 's("bd")' }),
      msg({ id: 'p2', role: 'progress', content: 'validate ok', progressKind: 'tool_result' }),
      msg({ id: 'u2', role: 'user', content: '还是不对' }),
    ];

    expect(conversationHistoryFromMessages(messages)).toEqual([
      { role: 'user', content: '钢琴层不对' },
      { role: 'assistant', content: '我把旋律改成弧线。' },
      { role: 'user', content: '还是不对' },
    ]);
  });

  it('returns only messages before the edited resend target', () => {
    const messages: ChatMessage[] = [
      msg({ id: 'u1', role: 'user', content: '第一版' }),
      msg({ id: 'a1', role: 'assistant', content: '第一版回复' }),
      msg({ id: 'u2', role: 'user', content: '还是不对' }),
      msg({ id: 'a2', role: 'assistant', content: '第二版回复' }),
    ];

    expect(conversationHistoryBefore(messages, 'u2')).toEqual([
      { role: 'user', content: '第一版' },
      { role: 'assistant', content: '第一版回复' },
    ]);
  });

  it('returns an empty history when the resend target is missing', () => {
    const messages: ChatMessage[] = [
      msg({ id: 'u1', role: 'user', content: '第一版' }),
      msg({ id: 'a1', role: 'assistant', content: '第一版回复' }),
    ];

    expect(conversationHistoryBefore(messages, 'missing')).toEqual([]);
  });

  it('excludes greeting messages from history', () => {
    const messages: ChatMessage[] = [
      msg({ id: 'g1', role: 'assistant', content: '嗨，我在这儿。', isGreeting: true }),
      msg({ id: 'u1', role: 'user', content: '来段鼓点' }),
      msg({ id: 'a1', role: 'assistant', content: '已经加上了。' }),
    ];

    expect(conversationHistoryFromMessages(messages)).toEqual([
      { role: 'user', content: '来段鼓点' },
      { role: 'assistant', content: '已经加上了。' },
    ]);
  });
});
