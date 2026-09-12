import { describe, expect, it } from 'vitest';
import { fullSessionTitle } from '../full-session-title';
import type { ChatMessage } from '../../hooks/useChat';

describe('full mobile favorite titles', () => {
  const content = '就如同一个声音，在说你已经走了很远很远，不需要再回头';
  const messages: ChatMessage[] = [{ id: 'u', role: 'user', content, timestamp: 1 }];
  it('recovers a legacy auto-title from the complete first message', () => {
    expect(fullSessionTitle(`${content.slice(0, 20)}…`, messages)).toBe(content);
  });
  it('preserves renamed titles, including intentional ellipses', () => {
    expect(fullSessionTitle('一个声音…', messages)).toBe('一个声音…');
    expect(fullSessionTitle('My song', messages)).toBe('My song');
    expect(fullSessionTitle('旧标题…', [])).toBe('旧标题…');
  });
});
