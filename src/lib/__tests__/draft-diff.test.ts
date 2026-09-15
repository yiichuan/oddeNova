import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../hooks/useChat';
import { DRAFT_SEGMENT_ID, draftBaseCode } from '../draft-diff';

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role'>): ChatMessage {
  return { id: Math.random().toString(36), content: '', timestamp: 0, ...partial };
}

describe('draftBaseCode', () => {
  it('takes the last assistant message that committed code', () => {
    expect(draftBaseCode([
      message({ role: 'user', content: 'a' }),
      message({ role: 'assistant', code: 's("bd")' }),
      message({ role: 'user', content: 'b' }),
      message({ role: 'assistant', code: 's("bd sd")' }),
    ])).toBe('s("bd sd")');
  });

  it('skips user and progress messages sitting after the last take', () => {
    expect(draftBaseCode([
      message({ role: 'assistant', code: 's("bd")' }),
      message({ role: 'user', content: 'louder' }),
      message({ role: 'progress', progressKind: 'tool_call', toolName: 'setCode' }),
    ])).toBe('s("bd")');
  });

  it('skips assistant messages that committed nothing, such as the greeting', () => {
    expect(draftBaseCode([
      message({ role: 'assistant', code: 's("bd")' }),
      message({ role: 'assistant', content: 'that did not run', isGreeting: true }),
    ])).toBe('s("bd")');
  });

  it('reports no baseline where the reading has committed no take', () => {
    expect(draftBaseCode([])).toBeNull();
    expect(draftBaseCode([message({ role: 'user', content: 'hello' })])).toBeNull();
  });

  /* The theme song seeds `session.code` under a greeting that carries none, and
     an import can do the same. There is no take in the reading to measure that
     script against, and calling it the typist's edit would be a lie the session
     tells the moment it opens. */
  it('reports none for a session opened holding a script nobody in it wrote', () => {
    expect(draftBaseCode([
      message({ role: 'assistant', content: '主题曲', isGreeting: true }),
    ])).toBeNull();
  });

  it('follows the stream back down when a rollback truncates it', () => {
    const messages = [
      message({ role: 'assistant', code: 's("bd")' }),
      message({ role: 'user', content: 'louder' }),
      message({ role: 'assistant', code: 's("bd sd")' }),
    ];
    expect(draftBaseCode(messages)).toBe('s("bd sd")');
    expect(draftBaseCode(messages.slice(0, 1))).toBe('s("bd")');
  });

  it('keeps the draft segment id out of the message id space', () => {
    expect(DRAFT_SEGMENT_ID).toBe('__draft__');
  });
});
