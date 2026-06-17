import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt, detectPromptLanguage } from '../chat';

describe('chat prompt language selection', () => {
  it('detects Chinese when the instruction contains CJK characters', () => {
    expect(detectPromptLanguage('今晚月亮好亮')).toBe('zh');
  });

  it('defaults to English when the instruction has no CJK characters', () => {
    expect(detectPromptLanguage('tell me about yourself')).toBe('en');
  });
});

describe('buildChatSystemPrompt', () => {
  it('builds Chinese chat instructions with the compose marker contract', () => {
    const prompt = buildChatSystemPrompt('今晚月亮好亮');

    expect(prompt).toContain('## oddeNova 的存在方式');
    expect(prompt).toContain('纯聊天时，你只陪伴、倾听、回应和提炼');
    expect(prompt).toContain('真正创作只在用户主动切到创作模式');
    expect(prompt).toContain('[[谱曲: ');
    expect(prompt).toContain('跟随用户输入的语言');
  });

  it('builds English chat instructions with the compose marker contract', () => {
    const prompt = buildChatSystemPrompt('tell me about yourself');

    expect(prompt).toContain('## oddeNova Way of Being');
    expect(prompt).toContain('In pure chat, only accompany, listen, respond, and distill');
    expect(prompt).toContain('Actual composition only happens after the user switches to create mode');
    expect(prompt).toContain('[[compose: ');
    expect(prompt).toContain('Follow the language of the user');
  });
});
