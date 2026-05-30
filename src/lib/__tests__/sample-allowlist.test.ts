import { describe, it, expect } from 'vitest';
import { findUnknownSamples } from '../sample-allowlist';

describe('findUnknownSamples', () => {
  it('合法 sample 不报错', () => {
    expect(findUnknownSamples('s("bd ~ sd ~")')).toEqual([]);
  });

  it('非法 sample 返回未知名称', () => {
    const result = findUnknownSamples('s("superpad violin")');
    expect(result).toEqual(['superpad', 'violin']);
  });

  it('GM soundfont 名合法', () => {
    expect(findUnknownSamples('s("gm_acoustic_grand_piano")')).toEqual([]);
  });

  it('合法 GM soundfont 混合非法 sample', () => {
    const result = findUnknownSamples('s("gm_acoustic_grand_piano rhodes")');
    expect(result).toEqual(['rhodes']);
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
    expect(result).toEqual(['fakesample']);
  });

  it('.bank() 合法组合不报错', () => {
    // bd 是 VALID_BANK_SUFFIXES 中的合法 suffix，RolandTR808_bd 存在于 allowlist
    expect(findUnknownSamples('s("bd").bank("RolandTR808")')).toEqual([]);
  });

  it('.bank() 非法组合返回 bank_suffix 形式的未知 token', () => {
    // arp 在 SAMPLE_ALLOWLIST 中（DIRT_SAMPLES），但不是 VALID_BANK_SUFFIXES，
    // 且 RolandTR808_arp 不存在于 allowlist
    expect(findUnknownSamples('s("arp").bank("RolandTR808")')).toEqual(['RolandTR808_arp']);
  });

  it('逗号分隔的多轨 mini-notation 不误报', () => {
    // s("bd*4, ~ sd ~ sd, hh*8") — 逗号是多轨分隔符，不是 sample 名的一部分
    expect(findUnknownSamples('s("bd*4, ~ sd ~ sd, hh*8")')).toEqual([]);
  });
});
