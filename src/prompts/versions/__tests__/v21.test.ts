import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../v21';

describe('v21 prompt', () => {
  it('keeps runtime persona injection and compose-confirmation behavior in Chinese', () => {
    const prompt = AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne');

    expect(prompt).toContain('ZH_PERSONA_BLOCK');
    expect(prompt).toContain('你是 Nocturne');
    expect(prompt).toContain('每条用户消息都自行判断意图');
    expect(prompt).toContain('想聊天就自然回复，不调用工具');
    expect(prompt).toContain('纯聊天时不要调用 `setCode`、`validate` 或 `commit`');
  });

  it('merges the latest v17 arrangement and layer-generation guidance in Chinese', () => {
    const prompt = AGENT_SYSTEM_PROMPT_OPENAI('ZH_PERSONA_BLOCK', 'Nocturne');

    expect(prompt).toContain('## 提交前自检（以音乐家的耳朵聆听）');
    expect(prompt).toContain('## 音层代码生成');
    expect(prompt).toContain('## 曲子编排（在"完整曲子"或明确编排意图下启用）');
    expect(prompt).toContain('让一条线演化、不逐 cycle 重复');
    expect(prompt).toContain('低频可听性与感知补偿原则');
    expect(prompt).toContain('避免同时性浑浊');
  });

  it('keeps runtime persona injection and merged v17 guidance in English', () => {
    const prompt = AGENT_SYSTEM_PROMPT_EN('EN_PERSONA_BLOCK', 'Nocturne');

    expect(prompt).toContain('EN_PERSONA_BLOCK');
    expect(prompt).toContain('You are Nocturne');
    expect(prompt).toContain('Decide the intent for each user message');
    expect(prompt).toContain('For pure chat, do not call `setCode`, `validate`, or `commit`');
    expect(prompt).toContain("## Pre-commit self-check (listen with a musician's ear)");
    expect(prompt).toContain('## Layer code generation');
    expect(prompt).toContain('## Song arrangement (enabled under a "complete song" or an explicit arrangement intent)');
    expect(prompt).toContain('Make a line evolve instead of repeating every cycle');
    expect(prompt).toContain('Low-frequency audibility & comments');
    expect(prompt).toContain('Avoid simultaneity mud');
  });
});
