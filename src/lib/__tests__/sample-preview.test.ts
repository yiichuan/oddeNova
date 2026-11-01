import { describe, expect, it } from 'vitest';
import { AUDITION_CUT_GROUP, buildPreviewEvent, describeRegisteredSound } from '../sample-preview';

describe('describeRegisteredSound', () => {
  it('采样文件夹：按文件数计版本', () => {
    expect(describeRegisteredSound({ type: 'sample', samples: ['a.wav', 'b.wav', 'c.wav'] }))
      .toEqual({ kind: 'sample', variants: 3 });
  });

  it('按音高录制的采样：需要音符', () => {
    expect(describeRegisteredSound({ type: 'sample', samples: { C4: 'c4.mp3', A4: 'a4.mp3' } }))
      .toEqual({ kind: 'pitched', variants: 1 });
  });

  it('音色库与合成器：需要音符', () => {
    expect(describeRegisteredSound({ type: 'soundfont' })).toEqual({ kind: 'pitched', variants: 1 });
    expect(describeRegisteredSound({ type: 'synth' })).toEqual({ kind: 'pitched', variants: 1 });
  });

  it('未注册的名字返回 null', () => {
    expect(describeRegisteredSound(undefined)).toBeNull();
  });
});

describe('buildPreviewEvent', () => {
  it('采样：带版本号，并截断在固定时长内', () => {
    const { value, duration } = buildPreviewEvent('bd', { kind: 'sample', variants: 4 }, { variant: 2 });
    expect(value).toMatchObject({ s: 'bd', n: 2, clip: 1, cut: AUDITION_CUT_GROUP });
    expect(value).not.toHaveProperty('note');
    expect(duration).toBeGreaterThan(0);
  });

  it('采样：版本号超出范围时回绕', () => {
    expect(buildPreviewEvent('bd', { kind: 'sample', variants: 4 }, { variant: 5 }).value.n).toBe(1);
  });

  it('有音高的声音：带音符，默认 c4', () => {
    expect(buildPreviewEvent('gm_piano', { kind: 'pitched', variants: 1 }).value)
      .toMatchObject({ s: 'gm_piano', note: 'c4' });
    expect(buildPreviewEvent('gm_acoustic_bass', { kind: 'pitched', variants: 1 }, { note: 'c2' }).value.note)
      .toBe('c2');
  });

  it('每次返回新对象（superdough 会写入 value）', () => {
    const info = { kind: 'sample' as const, variants: 1 };
    expect(buildPreviewEvent('bd', info).value).not.toBe(buildPreviewEvent('bd', info).value);
  });
});
