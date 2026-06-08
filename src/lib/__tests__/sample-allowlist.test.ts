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
    // Only use tokens confirmed to exist in DIRT_SAMPLES: bd, sd, hh, hh27
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
    // bd is a valid suffix in VALID_BANK_SUFFIXES and RolandTR808_bd exists in the allowlist
    expect(findUnknownSamples('s("bd").bank("RolandTR808")')).toEqual([]);
  });

  it('.bank() 非法组合返回 bank_suffix 形式的未知 token', () => {
    // arp is in SAMPLE_ALLOWLIST (DIRT_SAMPLES) but is not in VALID_BANK_SUFFIXES,
    // and RolandTR808_arp does not exist in the allowlist
    expect(findUnknownSamples('s("arp").bank("RolandTR808")')).toEqual(['RolandTR808_arp']);
  });

  it('逗号分隔的多轨 mini-notation 不误报', () => {
    // s("bd*4, ~ sd ~ sd, hh*8") — commas are multi-track separators, not part of sample names
    expect(findUnknownSamples('s("bd*4, ~ sd ~ sd, hh*8")')).toEqual([]);
  });
});
