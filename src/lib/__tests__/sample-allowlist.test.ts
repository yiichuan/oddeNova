import { describe, it, expect } from 'vitest';
import { findUnknownSamples } from '../sample-allowlist';

describe('findUnknownSamples', () => {
  it('合法 sample 不报错', () => {
    expect(findUnknownSamples('s("bd ~ sd ~")')).toEqual([]);
  });

  it('非法 sample 返回未知名称', () => {
    const result = findUnknownSamples('s("superpad violin")');
    expect(result).toContain('superpad');
    expect(result).toContain('violin');
  });

  it('GM soundfont 名合法', () => {
    expect(findUnknownSamples('s("gm_acoustic_grand_piano")')).toEqual([]);
  });

  it('合法 GM soundfont 混合非法 sample', () => {
    const result = findUnknownSamples('s("gm_acoustic_grand_piano rhodes")');
    expect(result).toContain('rhodes');
    expect(result).not.toContain('gm_acoustic_grand_piano');
  });

  it('内置合成器（sawtooth、sine 等）合法', () => {
    expect(findUnknownSamples('s("sawtooth")')).toEqual([]);
    expect(findUnknownSamples('s("sine")')).toEqual([]);
  });

  it('~ 静音符号不视为 sample', () => {
    expect(findUnknownSamples('s("bd ~ ~ sd")')).toEqual([]);
  });

  it('mini-notation 括号内的 token 正确解析', () => {
    // 仅使用确认存在于 DIRT_SAMPLES 的 token：bd、sd、hh、hh27
    const result = findUnknownSamples('s("[bd sd] ~ [hh <hh27 hh>]")');
    expect(result).toEqual([]);
  });

  it('不含 s() 调用的代码返回空数组', () => {
    expect(findUnknownSamples('note("c4 e4").gain(0.5)')).toEqual([]);
  });

  it('sound() 别名等同于 s()', () => {
    const result = findUnknownSamples('sound("fakesample")');
    expect(result).toContain('fakesample');
  });
});
