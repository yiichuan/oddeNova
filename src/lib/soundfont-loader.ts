/**
 * GM Soundfont loader for Strudel.
 * Ported from strudel's packages/soundfonts/fontloader.mjs (codeberg.org/uzu/strudel).
 *
 * Fetches webaudiofontdata JS files from felixroos.github.io and registers each
 * GM instrument via superdough's registerSound(), making gm_* names available
 * in s("...") / .s("...") patterns.
 *
 * Call registerSoundfonts() once in the prebake function.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — gm-fonts.js is a plain JS ESM file with no type declarations
import gm from './gm-fonts.js';
import { noteToMidi, freqToMidi, getSoundIndex } from '@strudel/core';
import {
  getAudioContext,
  onceEnded,
  releaseAudioNode,
} from '@strudel/webaudio';
import {
  registerSound,
  getParamADSR,
  getADSRValues,
  getPitchEnvelope,
  getVibratoOscillator,
} from 'superdough';

const SOUNDFONT_CDN = 'https://felixroos.github.io/webaudiofontdata/sound';

// --------------------------------------------------------------------------
// Font loading — lazy, cached
// --------------------------------------------------------------------------

type FontZone = {
  keyRangeLow: number;
  keyRangeHigh: number;
  originalPitch: number;
  coarseTune: number;
  fineTune: number;
  sampleRate: number;
  loopStart: number;
  loopEnd: number;
  file?: string;
  sample?: string;
  buffer?: AudioBuffer;
};

const loadCache: Record<string, Promise<FontZone[]>> = {};

async function loadFont(name: string): Promise<FontZone[]> {
  if (loadCache[name]) return loadCache[name];
  const load = async (): Promise<FontZone[]> => {
    const url = `${SOUNDFONT_CDN}/${name}.js`;
    const text = await fetch(url).then((r) => r.text());
    const [, data] = text.split('={');
    // eslint-disable-next-line no-eval
    return eval('{' + data) as FontZone[];
  };
  loadCache[name] = load();
  return loadCache[name];
}

function findZone(preset: FontZone[], pitch: number): FontZone | undefined {
  return preset.find((z) => z.keyRangeLow <= pitch && z.keyRangeHigh + 1 >= pitch);
}

async function getBuffer(zone: FontZone, ac: AudioContext): Promise<AudioBuffer | undefined> {
  if (zone.buffer) return zone.buffer;
  if (zone.file) {
    const datalen = zone.file.length;
    const arraybuffer = new ArrayBuffer(datalen);
    const view = new Uint8Array(arraybuffer);
    const decoded = atob(zone.file);
    for (let i = 0; i < decoded.length; i++) view[i] = decoded.charCodeAt(i);
    return new Promise<AudioBuffer>((resolve) => ac.decodeAudioData(arraybuffer, resolve));
  }
  if (zone.sample) {
    const decoded = atob(zone.sample);
    const buf = ac.createBuffer(1, decoded.length / 2, zone.sampleRate);
    const f32 = buf.getChannelData(0);
    for (let i = 0; i < decoded.length / 2; i++) {
      let b1 = decoded.charCodeAt(i * 2);
      let b2 = decoded.charCodeAt(i * 2 + 1);
      if (b1 < 0) b1 += 256;
      if (b2 < 0) b2 += 256;
      let n = b2 * 256 + b1;
      if (n >= 32768) n -= 65536;
      f32[i] = n / 65536;
    }
    zone.buffer = buf;
    return buf;
  }
  return undefined;
}

const pitchCache: Record<string, Promise<{ buffer: AudioBuffer; zone: FontZone }>> = {};

async function getFontPitch(
  name: string,
  pitch: number,
  ac: AudioContext,
): Promise<{ buffer: AudioBuffer; zone: FontZone }> {
  const key = `${name}:::${pitch}`;
  if (pitchCache[key]) return pitchCache[key];
  const load = async () => {
    const preset = await loadFont(name);
    const zone = findZone(preset, pitch);
    if (!zone) throw new Error(`No soundfont zone for ${name} pitch ${pitch}`);
    const buffer = await getBuffer(zone, ac);
    if (!buffer) throw new Error(`No soundfont buffer for ${name} pitch ${pitch}`);
    return { buffer, zone };
  };
  pitchCache[key] = load();
  return pitchCache[key];
}

async function getFontBufferSource(
  name: string,
  value: Record<string, unknown>,
  ac: AudioContext,
): Promise<AudioBufferSourceNode> {
  const note = (value.note as string | number) ?? 'c3';
  const freq = value.freq as number | undefined;
  let midi: number;
  if (freq) {
    midi = freqToMidi(freq);
  } else if (typeof note === 'string') {
    midi = noteToMidi(note);
  } else {
    midi = note as number;
  }
  const { buffer, zone } = await getFontPitch(name, midi, ac);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
  src.playbackRate.value = Math.pow(2, (100.0 * midi - baseDetune) / 1200.0);
  const loop = zone.loopStart > 1 && zone.loopStart < zone.loopEnd;
  if (loop) {
    src.loop = true;
    src.loopStart = zone.loopStart / zone.sampleRate;
    src.loopEnd = zone.loopEnd / zone.sampleRate;
  }
  return src;
}

// --------------------------------------------------------------------------
// Register all GM instruments
// --------------------------------------------------------------------------

export function registerSoundfonts(): void {
  const entries = Object.entries(gm as Record<string, string[]>);
  for (const [name, fonts] of entries) {
    registerSound(
      name,
      async (
        time: number,
        value: Record<string, unknown>,
        onended: () => void,
      ) => {
        const [attack, decay, sustain, release] = getADSRValues([
          value.attack,
          value.decay,
          value.sustain,
          value.release,
        ]);
        const { duration } = value as { duration: number };
        const n = getSoundIndex(value.n, fonts.length);
        const font = fonts[n];
        const ctx = getAudioContext() as AudioContext;
        const bufferSource = await getFontBufferSource(font, value, ctx);
        bufferSource.start(time);
        const envGain = ctx.createGain();
        const node = bufferSource.connect(envGain);
        const holdEnd = time + duration;
        getParamADSR(node.gain, attack, decay, sustain, release, 0, 0.3, time, holdEnd, 'linear');
        const envEnd = holdEnd + release + 0.01;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vibratoHandle = getVibratoOscillator(bufferSource.detune, value as any, time);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPitchEnvelope(bufferSource.detune, value as any, time, holdEnd);
        bufferSource.stop(envEnd);
        onceEnded(bufferSource, () => {
          releaseAudioNode(bufferSource);
          vibratoHandle?.stop?.();
          onended();
        });
        return {
          node,
          stop: (_releaseTime: number) => {},
          nodes: { source: [bufferSource], ...vibratoHandle?.nodes },
        };
      },
      { type: 'soundfont', prebake: true, fonts },
    );
  }

  // MIDI-standard name aliases → strudel canonical names.
  // The LLM tends to generate these from training data; register them so
  // they work at runtime (allowlist also includes them).
  const gmMap = gm as Record<string, string[]>;
  const ALIASES: Record<string, string> = {
    // Piano
    gm_acoustic_grand_piano: 'gm_piano',
    gm_bright_acoustic_piano: 'gm_piano',
    gm_electric_grand_piano: 'gm_piano',
    gm_honky_tonk_piano: 'gm_piano',
    gm_honky_tonk: 'gm_piano',
    // Electric pianos
    gm_electric_piano_1: 'gm_epiano1',
    gm_electric_piano_2: 'gm_epiano2',
    // Pads (MIDI uses numbered names; strudel drops the number)
    gm_pad_1_new_age: 'gm_pad_new_age',
    gm_pad_2_warm: 'gm_pad_warm',
    gm_pad_3_polysynth: 'gm_pad_poly',
    gm_pad_4_choir: 'gm_pad_choir',
    gm_pad_5_bowed: 'gm_pad_bowed',
    gm_pad_6_metallic: 'gm_pad_metallic',
    gm_pad_7_halo: 'gm_pad_halo',
    gm_pad_8_sweep: 'gm_pad_sweep',
    // Leads (MIDI uses numbered names)
    gm_lead_square: 'gm_lead_1_square',
    gm_lead_sawtooth: 'gm_lead_2_sawtooth',
    gm_lead_calliope: 'gm_lead_3_calliope',
    gm_lead_chiff: 'gm_lead_4_chiff',
    gm_lead_charang: 'gm_lead_5_charang',
    gm_lead_voice: 'gm_lead_6_voice',
    gm_lead_fifths: 'gm_lead_7_fifths',
    gm_lead_bass_lead: 'gm_lead_8_bass_lead',
  };

  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const fonts = gmMap[canonical];
    if (!fonts) continue;
    registerSound(
      alias,
      async (
        time: number,
        value: Record<string, unknown>,
        onended: () => void,
      ) => {
        const [attack, decay, sustain, release] = getADSRValues([
          value.attack,
          value.decay,
          value.sustain,
          value.release,
        ]);
        const { duration } = value as { duration: number };
        const n = getSoundIndex(value.n, fonts.length);
        const font = fonts[n];
        const ctx = getAudioContext() as AudioContext;
        const bufferSource = await getFontBufferSource(font, value, ctx);
        bufferSource.start(time);
        const envGain = ctx.createGain();
        const node = bufferSource.connect(envGain);
        const holdEnd = time + duration;
        getParamADSR(node.gain, attack, decay, sustain, release, 0, 0.3, time, holdEnd, 'linear');
        const envEnd = holdEnd + release + 0.01;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vibratoHandle = getVibratoOscillator(bufferSource.detune, value as any, time);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPitchEnvelope(bufferSource.detune, value as any, time, holdEnd);
        bufferSource.stop(envEnd);
        onceEnded(bufferSource, () => {
          releaseAudioNode(bufferSource);
          vibratoHandle?.stop?.();
          onended();
        });
        return {
          node,
          stop: (_releaseTime: number) => {},
          nodes: { source: [bufferSource], ...vibratoHandle?.nodes },
        };
      },
      { type: 'soundfont', prebake: true, fonts },
    );
  }
}
