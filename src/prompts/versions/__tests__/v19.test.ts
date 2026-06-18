import { describe, expect, it } from 'vitest';
import { AGENT_SYSTEM_PROMPT_EN, AGENT_SYSTEM_PROMPT_OPENAI } from '../v19';

describe('v19 compose-confirmation prompt', () => {
  it('tells the Chinese agent to confirm a creative direction before composing on ambiguous mood/scene messages', () => {
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('每条用户消息都自行判断意图');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('想聊天就自然回复，不调用工具');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('不要使用 `[[谱曲:]]` 或 `[[compose:]]` 标记');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('不要调用任何工具——用一两句话提出一个具体的');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('再问用户要不要现在写出来');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).toContain('则视为已确认，按该方向调用工具执行下面的步骤');
    expect(AGENT_SYSTEM_PROMPT_OPENAI).not.toContain('意图模糊时按你的最佳判断处理，不要每次都反问');
  });

  it('tells the English agent to confirm a creative direction before composing on ambiguous mood/scene messages', () => {
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('Decide the intent for each user message');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('If the user wants to chat, reply naturally without calling tools');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('Do not use `[[谱曲:]]` or `[[compose:]]` markers');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('do not call any tool — in one or two sentences propose a concrete creative or edit direction');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('and ask whether to write it now');
    expect(AGENT_SYSTEM_PROMPT_EN).toContain('treat it as confirmed and call tools per that direction following the steps below');
    expect(AGENT_SYSTEM_PROMPT_EN).not.toContain('When intent is ambiguous, use your best judgment instead of asking for clarification every time.');
  });
});
