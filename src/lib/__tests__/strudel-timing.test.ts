import { describe, expect, it } from 'vitest';
import {
  formatPlaybackTime,
  getStrudelLoopCycles,
  getStrudelLoopDurationSeconds,
} from '../strudel-timing';

describe('Strudel playback timing', () => {
  it('reports zero duration when there is no playable code', () => {
    expect(getStrudelLoopDurationSeconds('')).toBe(0);
    expect(getStrudelLoopDurationSeconds('   ')).toBe(0);
  });

  it('uses one cycle and Strudel default 0.5 cps when no long structure is present', () => {
    expect(getStrudelLoopCycles('s("bd sd")')).toBe(1);
    expect(getStrudelLoopDurationSeconds('s("bd sd")')).toBe(2);
  });

  it('finds the complete shared loop across explicit arrangement windows', () => {
    const code = `setcps(0.5)
stack(
  s("bd").mask("<1 0>/16"),
  chord("<C^7 Am7 Dm7 G7>/24")
)`;

    expect(getStrudelLoopCycles(code)).toBe(48);
    expect(getStrudelLoopDurationSeconds(code)).toBe(96);
  });

  it('supports weighted and bare alternations while ignoring examples in comments', () => {
    const code = `
// s("<a b c d e>/64")
note("<c3 e3 g3>").mask("<0@2 1@4 0@2>")
`;

    expect(getStrudelLoopCycles(code)).toBe(24);
  });

  it('formats playback time as zero-padded minutes and seconds', () => {
    expect(formatPlaybackTime(0)).toBe('00:00');
    expect(formatPlaybackTime(96.9)).toBe('01:36');
  });
});
