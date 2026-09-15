import { describe, expect, it } from 'vitest';
import { fullSessionTitle } from '../full-session-title';
import { SESSION_TITLE_LIMIT, sessionTitleLength } from '../session-title';
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

  it('holds a recovered message to the title limit rather than showing all of it', () => {
    const essay = '字'.repeat(300);
    const recovered = fullSessionTitle(`${essay.slice(0, 20)}…`, [
      { id: 'u', role: 'user', content: essay, timestamp: 1 },
    ]);
    expect(recovered).toBe(`${'字'.repeat(59)}…`);
    expect(sessionTitleLength(recovered)).toBe(SESSION_TITLE_LIMIT);
  });

  it('straightens a recovered message onto one line', () => {
    const opening = '开头一句\n然后是第二句，比二十个字长得多，长到旧规则要把它截断';
    expect(fullSessionTitle(`${opening.slice(0, 20)}…`, [
      { id: 'u', role: 'user', content: opening, timestamp: 1 },
    ])).toBe(opening.replace(/\s+/g, ' '));
  });
});
