import { describe, it, expect, vi } from 'vitest';

// Stub the version shim so these tests assert assembly, not prompt content.
vi.mock('../system-prompt', () => ({
  AGENT_SYSTEM_PROMPT_OPENAI: 'ZH_BASE',
  AGENT_SYSTEM_PROMPT_EN: 'EN_BASE',
}));

import { buildSystemPrompt } from '../build-system-prompt';

describe('buildSystemPrompt', () => {
  it('picks the zh base for an instruction containing CJK', () => {
    expect(buildSystemPrompt({ instruction: '加个鼓' })).toBe('ZH_BASE');
  });

  it('picks the en base for a non-CJK instruction', () => {
    expect(buildSystemPrompt({ instruction: 'add a drum' })).toBe('EN_BASE');
  });

  it('appends mood context after a blank line', () => {
    expect(buildSystemPrompt({ instruction: 'add a drum', moodContext: 'MOOD' })).toBe('EN_BASE\n\nMOOD');
  });

  it('returns the base unchanged when there is no mood context', () => {
    expect(buildSystemPrompt({ instruction: 'add a drum' })).toBe('EN_BASE');
  });

  it('treats empty mood context as no mood', () => {
    expect(buildSystemPrompt({ instruction: 'add a drum', moodContext: '' })).toBe('EN_BASE');
  });
});
