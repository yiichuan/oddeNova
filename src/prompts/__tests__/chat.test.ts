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

    expect(prompt).toContain('你是 oddeNova');
    expect(prompt).toContain('不要生成 Strudel 代码');
    expect(prompt).toContain('[[谱曲: ');
    expect(prompt).toContain('跟随用户输入的语言');
  });

  it('builds English chat instructions with the compose marker contract', () => {
    const prompt = buildChatSystemPrompt('tell me about yourself');

    expect(prompt).toContain('You are oddeNova');
    expect(prompt).toContain('Do not generate Strudel code');
    expect(prompt).toContain('[[compose: ');
    expect(prompt).toContain('Follow the language of the user');
  });
});
