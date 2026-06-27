import { describe, expect, it, vi } from 'vitest';
import { buildSuggestions, parseNextSteps, stripNextSteps } from '../suggestions';
import { chatOnce } from '../llm';

vi.mock('../llm', () => ({
  chatOnce: vi.fn(),
}));

describe('next-step helpers', () => {
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
