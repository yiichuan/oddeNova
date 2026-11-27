import { describe, expect, it } from 'vitest';
import { isStepwiseChoice, parseNextSteps, parseStepwiseChoice, stripNextSteps } from '../suggestions';

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

  it('recognizes numbered choices when the question follows the options without blank lines', () => {
    expect(isStepwiseChoice([
      '配上轻快鼓组和律动贝斯，阳光感的骨架已经立起来了。',
      '1. 加一层清爽的和声背景，让中频更饱满',
      '2. 给旋律加一段呼应的过门，让它有起伏',
      '3. 就按现在这个完整度直接写完收尾',
      '想继续往饱满里走，还是就在这里收个尾？',
    ].join('\n'))).toBe(true);
  });

  it('extracts option copy while preserving the assistant message around the list', () => {
    expect(parseStepwiseChoice([
      '加了一层轻轻的合唱，压迫里透出一点悲悯。',
      '',
      '1. 加定音鼓，让低音处出现心跳一样的心跳',
      '2. 让合唱在最后两个和弦处稍微走近、变亮一点',
      '',
      '想让我先往哪个方向推，还是你心里已经有画面了？',
    ].join('\n'))).toEqual({
      content: '加了一层轻轻的合唱，压迫里透出一点悲悯。\n\n想让我先往哪个方向推，还是你心里已经有画面了？',
      options: [
        '加定音鼓，让低音处出现心跳一样的心跳',
        '让合唱在最后两个和弦处稍微走近、变亮一点',
      ],
    });
  });

  it('returns null for ordinary numbered content and final suggestions', () => {
    expect(parseStepwiseChoice('第一点\n\n1. 收紧底鼓\n2. 降低贝斯\n整体现在更清楚。')).toBeNull();
    expect(parseStepwiseChoice('完成了整首作品。\n\n接下来可以：\n- 加快速度\n- 减少鼓点')).toBeNull();
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

  it('recognizes an explicit invitation to choose even when the reply has no question mark', () => {
    const explanation = [
      '现在鼓是两层。你说“换一种鼓”，我想知道换的是哪一层、换成什么气质：',
      '',
      '1. 两层都换成 808 音色',
      '2. 保持 909，把节奏切得更碎',
      '3. 只换踩镲',
      '4. 整体换成更轻的 breakbeat 采样',
      '',
      '你选一个，我再往下走。',
    ].join('\n');
    expect(parseStepwiseChoice(explanation)).toEqual({
      content: '现在鼓是两层。你说“换一种鼓”，我想知道换的是哪一层、换成什么气质：\n\n你选一个，我再往下走。',
      options: ['两层都换成 808 音色', '保持 909，把节奏切得更碎', '只换踩镲', '整体换成更轻的 breakbeat 采样'],
    });
  });

  it('supports a direct selection question before options separated by blank lines', () => {
    expect(parseStepwiseChoice('你想先听哪一种？\n\n1、暖电钢琴\n\n2、原声钢琴')?.options).toEqual(['暖电钢琴', '原声钢琴']);
  });

  it('does not turn a change summary followed by a feedback question into choices', () => {
    expect(parseStepwiseChoice('我改了两处：\n\n1. 收紧底鼓\n2. 降低贝斯\n\n你觉得这版怎么样？')).toBeNull();
    expect(parseStepwiseChoice('Changes made:\n\n1. Shortened the kick\n2. Lowered the bass\n\nHow does it sound?')).toBeNull();
  });

  it('does not mistake a question-led numbered change summary for choice mode', () => {
    expect(isStepwiseChoice([
      '我调整了哪些地方？',
      '1. 收紧底鼓',
      '2. 降低贝斯',
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
