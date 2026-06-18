import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../v18';

describe('v18 unified agent prompt', () => {
  it('tells the Chinese agent to choose chat or composition per message', () => {
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('你是 oddeNova');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('每条用户消息都自行判断意图');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('想聊天就自然回复，不调用工具');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('想要音乐或想修改当前曲子，就调用工具');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('不要使用 `[[谱曲:]]` 或 `[[compose:]]` 标记');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).not.toContain('你现在处于创作模式');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).not.toContain('必须将其解读为音乐创作请求');
  });

  it('tells the English agent to choose chat or composition per message', () => {
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('You are oddeNova');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('Decide the intent for each user message');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('If the user wants to chat, reply naturally without calling tools');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('If the user wants music or wants to change the current song, call tools');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('Do not use `[[谱曲:]]` or `[[compose:]]` markers');
    expect(AGENT_SYSTEM_PROMPT_EN).not.toContain('You are now in create mode');
    expect(AGENT_SYSTEM_PROMPT_EN).not.toContain('always interpret it as a music-creation request');
  });
});
