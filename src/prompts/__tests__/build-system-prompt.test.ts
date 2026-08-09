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

vi.mock('../../lib/i18n', () => ({
  isZh: vi.fn(() => false),
}));

vi.mock('../../lib/persona-storage', () => ({
  BUILTIN_PERSONA_ID: 'oddenova',
  getPersonaPrompt: vi.fn((id: string) => (id === 'custom-1' ? 'CUSTOM_PROMPT' : undefined)),
}));

import { buildPersonaBlock } from '../../persona/oddenova';
import { getPersonaPrompt } from '../../lib/persona-storage';
import { isZh } from '../../lib/i18n';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../system-prompt';
import { buildSystemPrompt } from '../build-system-prompt';

describe('buildSystemPrompt', () => {
  it('uses the built-in Chinese persona block when the browser language is zh', () => {
    vi.mocked(isZh).mockReturnValue(true);

    expect(buildSystemPrompt({
      persona: { id: 'oddenova', name: 'oddeNova' },
    })).toBe('ZH_BASE\nBUILTIN_zh\nvoice:oddeNova');

    expect(buildPersonaBlock).toHaveBeenCalledWith('zh');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toHaveBeenCalledWith('BUILTIN_zh', 'oddeNova');
  });

  it('uses the built-in English persona block when the browser language is not zh', () => {
    vi.mocked(isZh).mockReturnValue(false);

    expect(buildSystemPrompt({
      persona: { id: 'oddenova', name: 'oddeNova' },
    })).toBe('EN_BASE\nBUILTIN_en\nvoice:oddeNova');

    expect(buildPersonaBlock).toHaveBeenCalledWith('en');
    expect(AGENT_SYSTEM_PROMPT_EN).toHaveBeenCalledWith('BUILTIN_en', 'oddeNova');
  });

  it('uses custom persona prompt verbatim regardless of instruction language', () => {
    vi.mocked(isZh).mockReturnValue(true);

    expect(buildSystemPrompt({
      persona: { id: 'custom-1', name: 'Nocturne' },
    })).toBe('ZH_BASE\nCUSTOM_PROMPT\nvoice:Nocturne');

    expect(getPersonaPrompt).toHaveBeenCalledWith('custom-1');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toHaveBeenCalledWith('CUSTOM_PROMPT', 'Nocturne');
  });

  it('falls back to built-in persona block when a custom id is stale', () => {
    vi.mocked(isZh).mockReturnValue(false);

    expect(buildSystemPrompt({
      persona: { id: 'missing', name: 'Missing' },
    })).toBe('EN_BASE\nBUILTIN_en\nvoice:oddeNova');
  });

  it('appends mood context after a blank line', () => {
    vi.mocked(isZh).mockReturnValue(false);

    expect(buildSystemPrompt({
      moodContext: 'MOOD',
      persona: { id: 'custom-1', name: 'Nocturne' },
    })).toBe('EN_BASE\nCUSTOM_PROMPT\nvoice:Nocturne\n\nMOOD');
  });

  it('defaults to built-in oddeNova when persona is omitted for backward compatibility', () => {
    vi.mocked(isZh).mockReturnValue(false);

    expect(buildSystemPrompt({})).toBe('EN_BASE\nBUILTIN_en\nvoice:oddeNova');
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
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('分步创作');
    const zhPrompt = actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne');
    expect(zhPrompt).toContain('通常提供 2–4 个');
    expect(zhPrompt).toContain('连续的数字序号');
    expect(zhPrompt).toContain('不要在连续检查点重复同一句或相同句式');
    expect(zhPrompt).toContain('自然语言回复');
    expect(zhPrompt).not.toContain('你想怎么继续？可以回复 1、2、3，或直接说你的想法');
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('根据我的心情生成音乐');
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('检查点格式');
    expect(actual.AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne')).toContain('收尾格式');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('EN_PERSONA_BLOCK');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('You are Nocturne');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('must first receive explicit confirmation');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('adding feelings');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('Stepwise composition');
    const enPrompt = actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne');
    expect(enPrompt).toContain('usually 2–4');
    expect(enPrompt).toContain('consecutive numeric labels');
    expect(enPrompt).toContain('Do not repeat the same sentence or sentence structure');
    expect(enPrompt).toContain('Natural language replies');
    expect(enPrompt).not.toContain('How do you want to continue? You can reply 1, 2, or 3');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('根据我的心情生成音乐');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('Checkpoint format');
    expect(actual.AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne')).toContain('Final format');
  });
});
