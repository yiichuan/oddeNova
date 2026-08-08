import { describe, expect, it } from 'vitest';
import { isStepwiseChoice, parseNextSteps, stripNextSteps } from '../suggestions';

describe('next-step helpers', () => {
  it('recognizes Chinese stepwise choice mode from consecutive numbered options', () => {
    expect(isStepwiseChoice([
      '先写了一小段夏日旋律。这个方向对吗？',
      '',
      '1. 配上鼓和贝斯继续',
      '2. 换个方向重新来',
      '3. 按这个方向直接写完',
      '',
      '回复序号，或者直接说说你的想法。',
    ].join('\n'))).toBe(true);
  });

  it('recognizes English stepwise choice mode from consecutive numbered options', () => {
    expect(isStepwiseChoice([
      'I sketched a summer melody. Does this direction feel right?',
      '',
      '1. Add drums and bass',
      '2. Try another direction',
      '3. Finish it this way',
      '',
      'Reply with a number or describe your idea.',
    ].join('\n'))).toBe(true);
  });

  it('does not mistake final next-step suggestions for choice mode', () => {
    expect(isStepwiseChoice('完成了整首作品。\n\n接下来可以：\n- 加快速度\n- 减少鼓点')).toBe(false);
  });

  it('does not mistake an ordinary numbered change summary for choice mode', () => {
    expect(isStepwiseChoice([
      '我做了三处调整：',
      '1. 收紧底鼓',
      '2. 降低贝斯',
      '3. 简化旋律',
      '整体现在更清楚。',
    ].join('\n'))).toBe(false);
  });

  it('strips Chinese next-step suggestions from commit explanations', () => {
    expect(stripNextSteps('我铺了一层鼓。\n\n接下来可以：\n- 加贝斯\n- 加旋律')).toBe('我铺了一层鼓。');
  });

  it('strips English next-step suggestions from commit explanations', () => {
    expect(stripNextSteps('I added a warm bass line.\n\nNext steps:\n- Add brushed drums\n- Widen the pad')).toBe('I added a warm bass line.');
  });

  it('strips the next-step section even when glued onto the summary paragraph', () => {
    expect(stripNextSteps('鼓和贝斯都已沉寂，只有冷 pad 悬在那里。接下来可以：\n- 给冷 pad 加淡出\n- 把共振调高')).toBe(
      '鼓和贝斯都已沉寂，只有冷 pad 悬在那里。',
    );
    expect(stripNextSteps('Only the cold pad remains. Next steps:\n- Fade out the pad\n- Raise the resonance')).toBe(
      'Only the cold pad remains.',
    );
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
