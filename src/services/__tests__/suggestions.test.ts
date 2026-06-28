import { describe, expect, it, vi } from 'vitest';
import { buildSuggestions, parseNextSteps, stripNextSteps } from '../suggestions';
import { chatOnce } from '../llm';

vi.mock('../llm', () => ({
  chatOnce: vi.fn(),
}));

describe('next-step helpers', () => {
  it('structures the Chinese suggestion prompt around goals, principles, knowledge, guidance, constraints, and review', async () => {
    vi.mocked(chatOnce).mockResolvedValue(JSON.stringify({
      suggestions: ['铺一层低音', '加入轻快鼓点'],
    }));

    await buildSuggestions('setcps(0.5)\nstack(s("bd sd hh"))', [
      { role: 'user', content: '来点电子感' },
    ]);

    const systemPrompt = vi.mocked(chatOnce).mock.calls.at(-1)?.[0] ?? '';
    expect(systemPrompt).toContain('目标');
    expect(systemPrompt).toContain('原则');
    expect(systemPrompt).toContain('状态知识');
    expect(systemPrompt).toContain('创作引导');
    expect(systemPrompt).toContain('硬约束');
    expect(systemPrompt).toContain('输出前自检');
    expect(systemPrompt).toContain('输出格式');
    expect(systemPrompt).not.toContain('规则：');
  });

  it('structures the English suggestion prompt around goals, principles, knowledge, guidance, constraints, and review', async () => {
    vi.mocked(chatOnce).mockResolvedValue(JSON.stringify({
      suggestions: ['Add a bass line', 'Tighten the drum groove'],
    }));

    await buildSuggestions('setcps(0.5)\nstack(s("bd sd hh"))', [
      { role: 'user', content: 'make this more electronic' },
    ]);

    const systemPrompt = vi.mocked(chatOnce).mock.calls.at(-1)?.[0] ?? '';
    expect(systemPrompt).toContain('Goal');
    expect(systemPrompt).toContain('Principles');
    expect(systemPrompt).toContain('State Knowledge');
    expect(systemPrompt).toContain('Creative Guidance');
    expect(systemPrompt).toContain('Hard Constraints');
    expect(systemPrompt).toContain('Self-Review');
    expect(systemPrompt).toContain('Output Format');
    expect(systemPrompt).not.toContain('Rules:');
  });

  it('strips Chinese next-step suggestions from commit explanations', () => {
    expect(stripNextSteps('我铺了一层鼓。\n\n接下来可以：\n- 加贝斯\n- 加旋律')).toBe('我铺了一层鼓。');
  });

  it('strips English next-step suggestions from commit explanations', () => {
    expect(stripNextSteps('I added a warm bass line.\n\nNext steps:\n- Add brushed drums\n- Widen the pad')).toBe('I added a warm bass line.');
  });

  it('keeps parsing English next-step suggestions for chips', () => {
    expect(parseNextSteps('I added a warm bass line.\n\nNext steps:\n- Add brushed drums\n- Widen the pad')).toEqual([
      'Add brushed drums',
      'Widen the pad',
    ]);
  });

  it('filters Chinese next-step suggestions that combine alternatives with 或', () => {
    expect(parseNextSteps([
      '搞定',
      '',
      '接下来可以：',
      '- 把 lead 吉他换成失真音色，或试试滑音',
      '- 加一层干净的节奏吉他',
    ].join('\n'))).toEqual(['加一层干净的节奏吉他']);
  });

  it('filters English next-step suggestions that combine alternatives with or/either', () => {
    expect(parseNextSteps([
      'Done',
      '',
      'Next steps:',
      '- Make the lead brighter or add delay',
      '- Either add drums or lower the bass',
      '- Tighten the groove',
    ].join('\n'))).toEqual(['Tighten the groove']);
  });

  it('falls back when generated Chinese suggestions are questions instead of executable options', async () => {
    vi.mocked(chatOnce).mockResolvedValue(JSON.stringify({
      suggestions: [
        '给这首曲子加一个标题，或者描述你听到的画面，我可以帮你调整氛围',
        '如果你想要更明显的段落起伏，可以告诉我',
      ],
    }));

    const suggestions = await buildSuggestions('setcps(0.5)\nstack(s("bd sd hh"))', [
      { role: 'user', content: '来点电子感' },
    ]);

    expect(suggestions).toHaveLength(2);
    expect(suggestions).not.toContain('给这首曲子加一个标题，或者描述你听到的画面，我可以帮你调整氛围');
    expect(suggestions).not.toContain('如果你想要更明显的段落起伏，可以告诉我');
  });
});
