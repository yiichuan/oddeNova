import { describe, expect, it } from 'vitest';
import { parseNextSteps, stripNextSteps } from '../suggestions';

describe('next-step helpers', () => {
  it('strips Chinese next-step suggestions from commit explanations', () => {
    expect(stripNextSteps('我铺了一层鼓。\n\n接下来可以：\n- 加贝斯\n- 加旋律')).toBe('我铺了一层鼓。');
  });

  it('strips English next-step suggestions from commit explanations', () => {
    expect(stripNextSteps('I added a warm bass line.\n\nNext steps:\n- Add brushed drums\n- Widen the pad')).toBe('I added a warm bass line.');
  });

  it('parses Chinese next-step suggestions for chips', () => {
    expect(parseNextSteps('我铺了一层鼓。\n\n接下来可以：\n- 加入贝斯\n- 让鼓点更密')).toEqual([
      '加入贝斯',
      '让鼓点更密',
    ]);
  });

  it('parses English next-step suggestions for chips', () => {
    expect(parseNextSteps('I added a warm bass line.\n\nNext steps:\n- Add brushed drums\n- Widen the pad')).toEqual([
      'Add brushed drums',
      'Widen the pad',
    ]);
  });

  it('returns an empty array when there is no next-steps section', () => {
    expect(parseNextSteps('我铺了一层鼓。')).toEqual([]);
  });
});
