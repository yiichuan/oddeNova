import { describe, expect, it } from 'vitest';
import { GREETINGS_EN, GREETINGS_ZH, pickGreeting } from '../greetings';

describe('pickGreeting', () => {
  it('always returns a non-empty string from one of the known pools', () => {
    const allKnown = new Set([...GREETINGS_ZH, ...GREETINGS_EN]);
    for (let i = 0; i < 50; i++) {
      const result = pickGreeting();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(allKnown.has(result)).toBe(true);
    }
  });

  it('has at least 6 candidates in each language pool', () => {
    expect(GREETINGS_ZH.length).toBeGreaterThanOrEqual(6);
    expect(GREETINGS_EN.length).toBeGreaterThanOrEqual(6);
  });

  it('preserves the intentional spacing in Chinese greetings', () => {
    expect(GREETINGS_ZH).toEqual([
      '即刻开始 vibe一首。你自己的单曲',
      '听听你的 声音。此刻在想什么？',
      '随时在场 保持好奇。',
      '识别，无秩序的 节拍 即将抵达。',
      '新的声部 候场加入。你想说明 来意 吗？',
      '临时插播：一段未经许可的旋律。正在经过本频道',
      '信号亮起。今天听什么？',
      '你来得正好。',
      '"先选出一条 正在靠近 的。"',
      '是你吗 ？',
    ]);
  });
});
