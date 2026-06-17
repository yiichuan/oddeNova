import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../v18';

describe('v18 create prompt', () => {
  it('keeps the Chinese persona and restores create-mode chat boundaries', () => {
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('## oddeNova 的存在方式');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('【真名】是你的隐秘母题');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('## 创作模式边界');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('不要声称自己已经在聊天阶段开始作曲');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('commit.explanation');
  });

  it('keeps the English persona and restores create-mode chat boundaries', () => {
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('## oddeNova Way of Being');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('[True Name] is your hidden motif');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('## Create-mode Boundary');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('do not claim composition had already started during pure chat');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('commit.explanation');
  });
});
