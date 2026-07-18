import { describe, it, expect, vi } from 'vitest';

vi.mock('../system-prompt', () => ({
  AGENT_SYSTEM_PROMPT_OPENAI: vi.fn((personaBlock: string, personaName: string) =>
    `ZH_BASE\n${personaBlock}\nvoice:${personaName}`
  ),
  AGENT_SYSTEM_PROMPT_EN: vi.fn((personaBlock: string, personaName: string) =>
    `EN_BASE\n${personaBlock}\nvoice:${personaName}`
  ),
}));

vi.mock('../../persona/oddenova', () => ({
  buildPersonaBlock: vi.fn((lang: 'zh' | 'en') => `BUILTIN_${lang}`),
}));

vi.mock('../../lib/persona-storage', () => ({
  BUILTIN_PERSONA_ID: 'oddenova',
  getPersonaPrompt: vi.fn((id: string) => (id === 'custom-1' ? 'CUSTOM_PROMPT' : undefined)),
}));

import { buildPersonaBlock } from '../../persona/oddenova';
import { getPersonaPrompt } from '../../lib/persona-storage';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../system-prompt';
import { buildSystemPrompt } from '../build-system-prompt';

describe('buildSystemPrompt', () => {
  it('uses the built-in Chinese persona block for oddeNova and CJK instructions', () => {
    expect(buildSystemPrompt({
      instruction: '加个鼓',
      persona: { id: 'oddenova', name: 'oddeNova' },
    })).toBe('ZH_BASE\nBUILTIN_zh\nvoice:oddeNova');

    expect(buildPersonaBlock).toHaveBeenCalledWith('zh');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toHaveBeenCalledWith('BUILTIN_zh', 'oddeNova');
  });

  it('uses the built-in English persona block for oddeNova and non-CJK instructions', () => {
    expect(buildSystemPrompt({
      instruction: 'add a drum',
      persona: { id: 'oddenova', name: 'oddeNova' },
    })).toBe('EN_BASE\nBUILTIN_en\nvoice:oddeNova');

    expect(buildPersonaBlock).toHaveBeenCalledWith('en');
    expect(AGENT_SYSTEM_PROMPT_EN).toHaveBeenCalledWith('BUILTIN_en', 'oddeNova');
  });

  it('uses custom persona prompt verbatim regardless of instruction language', () => {
    expect(buildSystemPrompt({
      instruction: '加个鼓',
      persona: { id: 'custom-1', name: 'Nocturne' },
    })).toBe('ZH_BASE\nCUSTOM_PROMPT\nvoice:Nocturne');

    expect(getPersonaPrompt).toHaveBeenCalledWith('custom-1');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toHaveBeenCalledWith('CUSTOM_PROMPT', 'Nocturne');
  });

  it('falls back to built-in persona block when a custom id is stale', () => {
    expect(buildSystemPrompt({
      instruction: 'add a drum',
      persona: { id: 'missing', name: 'Missing' },
    })).toBe('EN_BASE\nBUILTIN_en\nvoice:oddeNova');
  });

  it('appends mood context after a blank line', () => {
    expect(buildSystemPrompt({
      instruction: 'add a drum',
      moodContext: 'MOOD',
      persona: { id: 'custom-1', name: 'Nocturne' },
    })).toBe('EN_BASE\nCUSTOM_PROMPT\nvoice:Nocturne\n\nMOOD');
  });

  it('defaults to built-in oddeNova when persona is omitted for backward compatibility', () => {
    expect(buildSystemPrompt({ instruction: 'add a drum' })).toBe('EN_BASE\nBUILTIN_en\nvoice:oddeNova');
  });
});

describe('active system prompt export contract', () => {
  it('exports callable factories that inject persona block and name', async () => {
    const actual = await vi.importActual<typeof import('../system-prompt')>('../system-prompt');

    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI).toEqual(expect.any(Function));
    expect(actual.AGENT_SYSTEM_PROMPT_EN).toEqual(expect.any(Function));

    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('ZH_PERSONA_BLOCK');
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('你是 Nocturne');
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('必须先得到用户的明确确认');
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('补充感受');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('EN_PERSONA_BLOCK');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('You are Nocturne');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('must first receive explicit confirmation');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('adding feelings');
  });
});
