import { describe, expect, it } from 'vitest';
import { SAMPLE_CATALOG, countSamples } from '../sample-catalog';
import {
  BUILTIN_SYNTHS,
  DIRT_SAMPLES,
  DRUM_MACHINE_SAMPLES,
  GM_INSTRUMENTS,
  MELODIC_SAMPLES,
  MRIDANGAM_SAMPLES,
  SAMPLE_ALLOWLIST,
  VCSL_SAMPLES,
} from '../sample-allowlist';

const catalogNames = SAMPLE_CATALOG.flatMap((category) =>
  category.groups.flatMap((group) => group.samples.map((sample) => sample.name)));

describe('SAMPLE_CATALOG', () => {
  it('每个可用采样都出现在试听页上', () => {
    const shown = new Set(catalogNames);
    const expected = [
      ...DIRT_SAMPLES,
      ...MELODIC_SAMPLES,
      ...VCSL_SAMPLES,
      ...MRIDANGAM_SAMPLES,
      ...DRUM_MACHINE_SAMPLES,
      ...GM_INSTRUMENTS,
    ];
    expect(expected.filter((name) => !shown.has(name))).toEqual([]);
  });

  it('每个音色都有中文名（试听页和分享小票都靠它认出音色）', () => {
    const unnamed = SAMPLE_CATALOG.flatMap((category) => category.groups.flatMap((group) =>
      group.samples.filter((sample) => !sample.label?.[0]).map((sample) => sample.name)));
    expect(unnamed).toEqual([]);
  });

  it('同一个名字只出现一次', () => {
    const seen = new Set<string>();
    const duplicates = catalogNames.filter((name) => {
      if (seen.has(name)) return true;
      seen.add(name);
      return false;
    });
    expect(duplicates).toEqual([]);
  });

  it('只列出 validate() 认可的名字', () => {
    const illegal = catalogNames.filter((name) => !SAMPLE_ALLOWLIST.has(name) && !BUILTIN_SYNTHS.has(name));
    expect(illegal).toEqual([]);
  });

  it('合成器只列规范名，不列 saw/sin 等简写', () => {
    const synths = SAMPLE_CATALOG.find((category) => category.id === 'synths');
    const names = synths?.groups.flatMap((group) => group.samples.map((sample) => sample.name));
    expect(names).toContain('sawtooth');
    expect(names).not.toContain('saw');
  });

  it('鼓机按机型分组，部件按鼓组顺序排列', () => {
    const machines = SAMPLE_CATALOG.find((category) => category.id === 'machines');
    const tr808 = machines?.groups.find((group) => group.id === 'machine-RolandTR808');
    expect(tr808?.subtitle).toBe('TR808');
    expect(tr808?.samples[0]).toEqual({ name: 'RolandTR808_bd', label: ['底鼓', 'Kick'] });
    expect(tr808?.samples[1].name).toBe('RolandTR808_sd');
  });

  it('GM 音色按十六个家族分组，每个家族不为空', () => {
    const gm = SAMPLE_CATALOG.find((category) => category.id === 'gm');
    expect(gm?.groups).toHaveLength(16);
    expect(gm?.groups[0].samples.map((sample) => sample.name)).toContain('gm_piano');
    expect(gm?.groups.find((group) => group.id === 'gm-bass')?.samples[0].name).toBe('gm_acoustic_bass');
    expect(gm?.groups.every((group) => group.samples.length > 0)).toBe(true);
  });

  it('没有空分类或空分组', () => {
    for (const category of SAMPLE_CATALOG) {
      expect(countSamples(category)).toBeGreaterThan(0);
      for (const group of category.groups) expect(group.samples.length).toBeGreaterThan(0);
    }
  });
});
