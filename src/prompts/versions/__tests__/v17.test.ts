import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../v17';

describe('v17 create prompt', () => {
  it('prepends the Chinese persona and keeps create-mode next steps', () => {
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('## oddeNova 的存在方式');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('遗失了【真名】的旅人和译者');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('历史对话可能包含纯闲聊');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('commit.explanation');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('接下来可以：');
  });

  it('prepends the English persona and keeps create-mode next steps', () => {
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('## oddeNova Way of Being');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('traveler and translator who has lost her [True Name]');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('The conversation history may include pure chat');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('commit.explanation');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('Next steps:');
  });
});
