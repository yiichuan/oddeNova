import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { isAgentShaped, resolveVoiceLayers, soundLabel, voiceStem } from '../receipt-voices';

// A hand-written cover with nested sections, an outer arrange and REPL visuals.
const charli360 = readFileSync(new URL('./fixtures/charli-360.strudel.js', import.meta.url), 'utf8');

describe('isAgentShaped', () => {
  it('accepts an output stack of marked layers, after shared constants', () => {
    expect(isAgentShaped('setcps(0.5)\nconst chords = "<C^7 A-7>"\nstack(\n  /* @layer pad */ s("pad"),\n  /* @layer keys */ chord(chords).s("piano")\n).room(0.2)')).toBe(true);
  });
  it('rejects a stack that only builds a variable, or that has no layer markers', () => {
    expect(isAgentShaped(charli360)).toBe(false);
    expect(isAgentShaped('let drums = stack(s("bd"), s("cp"));\narrange([4, drums], [4, s("hh*8")])')).toBe(false);
    expect(isAgentShaped('stack(s("bd*4"), s("hh*8"))')).toBe(false);
  });
});

describe('voiceStem', () => {
  it('folds variants of one instrument together', () => {
    expect(voiceStem('bass_modified_2')).toBe('bass');
    expect(voiceStem('sub_bass_modified')).toBe('sub_bass');
    expect(voiceStem('vox_chop_6')).toBe('vox_chop');
    expect(voiceStem('lead_saw')).toBe('lead_saw');
    expect(voiceStem('v2')).toBe('v2');
  });
});

describe('soundLabel', () => {
  it('names sounds as the 试听 page does, keeping the raw name only for unknown samples', () => {
    expect(soundLabel('bd', 'RolandTR808')).toBe('TR-808 底鼓');
    // A bank's short name resolves to the same machine.
    expect(soundLabel('oh', 'tr808')).toBe('TR-808 开镲');
    expect(soundLabel('bd')).toBe('909 底鼓');
    expect(soundLabel('gm_synth_bass_2')).toBe('合成贝斯 2');
    expect(soundLabel('gm_ocarina')).toBe('陶笛');
    expect(soundLabel('sawtooth')).toBe('锯齿波');
    expect(soundLabel('steinway')).toBe('斯坦威钢琴');
    // A sample the piece loaded: a family its name points to, else its own name.
    expect(soundLabel('vox')).toBe('人声采样');
    expect(soundLabel('camera_flash')).toBe('采样 camera_flash');
    // The catalog's numbered folders have no real name to offer either.
    expect(soundLabel('ades2')).toBe('采样 ades2');
  });
});

describe('resolveVoiceLayers with the real Strudel engine', () => {
  beforeAll(async () => {
    const { evalScope } = await import('@strudel/core');
    await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'));
  });

  it('splits a nested arrangement into its instruments, in order of entrance', async () => {
    const rows = await resolveVoiceLayers(charli360, 'zh-CN');
    // Sections, groups and aliases are not instruments; variants share a row, and the
    // 808 kick, clap and hats are one kit.
    expect(rows?.map(row => row.name)).toEqual([
      'lead_synth', 'vocals', 'bass', 'sub_bass', 'TR-808 鼓组', 'lead_saw', 'camera_flash', 'vox_chop',
    ]);
    const byName = Object.fromEntries(rows!.map(row => [row.name, row]));
    // 120 BPM, 76 bars: the cover's vocals stop when the remix starts at 01:04.
    expect(byName.vocals.ranges).toEqual(['00:00 – 01:04']);
    expect(byName.bass.ranges).toEqual(['00:08 – 02:23']);
    expect(byName['TR-808 鼓组']).toEqual({ name: 'TR-808 鼓组', note: '底鼓、拍手、闭镲', ranges: ['00:08 – 02:23'] });
    // A section header or a long explanation is not a note; the sound's name stands in.
    expect(byName.vocals.note).toBe('人声采样');
    expect(byName.lead_synth.note).toBe('锯齿波');
    expect(byName.bass.note).toBe('合成贝斯 2');
    expect(byName.lead_saw.note).toBe('锯齿波主音');
    expect(byName.vox_chop.note).toBe('人声采样');
    expect(byName.camera_flash.note).toBe('采样 camera_flash');
  });

  it('prefers Chinese: a Chinese comment, then the sound, then an English comment', async () => {
    const rows = await resolveVoiceLayers(`// 温暖的主旋律
let keys = note("c3").s("piano");
// bumpin' that
let vox = s("vox");
// flash
let flash = s("camera_flash");
stack(keys, vox, flash)`, 'en');
    expect(rows?.map(row => row.note)).toEqual(['温暖的主旋律', '人声采样', 'flash']);
  });

  it('names inline sounds and groups drums by machine', async () => {
    const rows = await resolveVoiceLayers(
      'setcps(0.5)\nstack(s("bd*4, oh*2").bank("RolandTR808"), s("hh*8").bank("RolandTR808").mask("<0 1>"), s("sd*2").mask("<0 1>"), note("c3 e3"))',
      'en');
    expect(rows).toEqual([
      { name: 'triangle', note: '三角波', ranges: ['00:00 – 00:04'] },
      { name: 'TR-808 drums', note: '底鼓、开镲、闭镲', ranges: ['00:00 – 00:04'] },
      // Without a machine the kit names each piece as the 试听 page does.
      { name: 'drums', note: 'Analog Rytm 军鼓', ranges: ['00:02 – 00:04'] },
    ]);
  });

  it('prints every instrument however many there are', async () => {
    const names = Array.from({ length: 14 }, (_, i) => `v${String.fromCharCode(97 + i)}`);
    const code = `${names.map((name, i) => `let ${name} = note("c3").s("piano").late(${i});`).join('\n')}\narrange([14, stack(${names.join(', ')})])`;
    expect((await resolveVoiceLayers(code, 'zh-CN'))?.map(row => row.name)).toEqual(names);
  });

  it('returns null when there is no output or the engine cannot evaluate it', async () => {
    expect(await resolveVoiceLayers('', 'en')).toBeNull();
    expect(await resolveVoiceLayers('let a = s("bd")', 'en')).toBeNull();
    expect(await resolveVoiceLayers('notAFunction("c3")', 'en')).toBeNull();
  });
});
