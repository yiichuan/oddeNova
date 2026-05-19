// src/agent/__tests__/eval-evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { scoreRules } from '../../../scripts/eval/evaluator.js';

const VALID_4_LAYER = `setcps(0.5)
stack(
  /* @layer drums */ s("bd ~ sd ~").gain(0.8),
  /* @layer hh */ s("hh*8").gain(0.4),
  /* @layer bass */ note("c2 eb2").s("sawtooth").lpf(400).gain(0.7),
  /* @layer pad */ n("0 2 4").scale("C4:minor").s("sine").room(1.5).gain(0.4).sometimes(fast(2))
)`;

const SYNTAX_ERROR_CODE = 'setcps(0.5\nstack(';

const NO_BPM_CODE = 'stack(\n  /* @layer drums */ s("bd sd")\n)';

describe('scoreRules', () => {
  it('满分代码应得到高分', () => {
    const result = scoreRules(VALID_4_LAYER);
    expect(result.total).toBeGreaterThanOrEqual(80);
    expect(result.breakdown['syntax'].pass).toBe(true);
    expect(result.breakdown['hasMusic'].pass).toBe(true);
    expect(result.breakdown['hasBpm'].pass).toBe(true);
    expect(result.breakdown['layerCount'].pass).toBe(true);
    expect(result.breakdown['breathingSpace'].pass).toBe(true);
  });

  it('语法错误代码语法检查应失败', () => {
    const result = scoreRules(SYNTAX_ERROR_CODE);
    expect(result.breakdown['syntax'].pass).toBe(false);
    expect(result.total).toBeLessThan(30);
  });

  it('无 BPM 代码 hasBpm 应失败', () => {
    const result = scoreRules(NO_BPM_CODE);
    expect(result.breakdown['hasBpm'].pass).toBe(false);
  });

  it('bass 层有 lpf 应通过', () => {
    const result = scoreRules(VALID_4_LAYER);
    expect(result.breakdown['bassLpf'].pass).toBe(true);
  });

  it('pad 层有 room 应通过', () => {
    const result = scoreRules(VALID_4_LAYER);
    expect(result.breakdown['padRoom'].pass).toBe(true);
  });

  it('hh gain <= 0.5 应通过', () => {
    const result = scoreRules(VALID_4_LAYER);
    expect(result.breakdown['hhGain'].pass).toBe(true);
  });

  it('4 层代码有 sometimes 应通过呼吸空间检查', () => {
    const result = scoreRules(VALID_4_LAYER);
    expect(result.breakdown['breathingSpace'].pass).toBe(true);
  });

  it('包含 Tidal-only API 应失败', () => {
    const code = `setcps(0.5)\nstack(\n  /* @layer drums */ s("bd sd").sometimesBy(0.5, fast(2))\n)`;
    const result = scoreRules(code);
    expect(result.breakdown['noTidalOnly'].pass).toBe(false);
  });

  it('silence 代码 hasMusic 应失败，total 应为 20', () => {
    const result = scoreRules('setcps(0.375)\nsilence');
    expect(result.breakdown['hasMusic'].pass).toBe(false);
    expect(result.breakdown['hasBpm'].pass).toBe(false);
    expect(result.breakdown['hhGain'].pass).toBe(false);
    expect(result.breakdown['breathingSpace'].pass).toBe(false);
    expect(result.total).toBe(20);
  });

  it('仅 silence（无 setcps）hasMusic 失败，total 应为 20（语法通过）', () => {
    const result = scoreRules('silence');
    expect(result.breakdown['hasMusic'].pass).toBe(false);
    expect(result.total).toBe(20);
  });
});
