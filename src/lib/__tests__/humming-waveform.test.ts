import { describe, expect, it } from 'vitest';
import { analyzeHummingWaveform, HUMMING_WAVEFORM_SAMPLE_RATE } from '../humming-waveform';
import { estimateHummingRhythm } from '../humming-rhythm';

interface Tone {
  start: number;
  end: number;
  from: number;
  to?: number;
}

function hum(tones: Tone[], seconds: number): Float32Array {
  const rate = HUMMING_WAVEFORM_SAMPLE_RATE;
  const samples = new Float32Array(rate * seconds);
  for (const { start, end, from, to = from } of tones) {
    let phase = 0;
    for (let index = Math.round(start * rate); index < Math.round(end * rate); index += 1) {
      const elapsed = index / rate - start;
      const progress = Math.max(0, Math.min(1, elapsed / (end - start)));
      const hz = 440 * Math.pow(2, (from + (to - from) * progress - 69) / 12);
      phase += 2 * Math.PI * hz / rate;
      const level = Math.min(1, elapsed / 0.025, (end - index / rate) / 0.025);
      samples[index] = Math.max(0, level) * (0.035 * Math.sin(phase) + 0.014 * Math.sin(phase * 2));
    }
  }
  return samples;
}

describe('monophonic waveform analysis', () => {
  it('preserves a slide and detects a new attack into the same pitch after a brief gap', () => {
    const result = analyzeHummingWaveform(hum([
      { start: 0.48, end: 0.96, from: 49, to: 50.2 },
      { start: 1.03, end: 1.25, from: 50 },
      { start: 1.32, end: 1.86, from: 52 },
    ], 2.4));

    expect(result.notes.map(note => note.pitchMidi)).toEqual([50, 50, 52]);
    expect(result.trimStartSeconds).toBeCloseTo(0.48, 1);
    expect(result.trimStartSeconds + result.notes[1].startSeconds).toBeCloseTo(1.03, 1);
    expect(result.notes[1].durationSeconds).toBeCloseTo(0.22, 1);
    expect(result.trimStartSeconds + result.melodyDurationSeconds).toBeCloseTo(1.86, 1);
    expect(result.notes[0].pitchBendsCents!.at(-1)!).toBeGreaterThan(result.notes[0].pitchBendsCents![0] + 80);
  });

  it('rejects silence and holds one stable note through a long take', () => {
    expect(() => analyzeHummingWaveform(new Float32Array(12000))).toThrow('no_melody_detected');
    const result = analyzeHummingWaveform(hum([{ start: 0.25, end: 2.25, from: 72 }], 2.5));
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].pitchMidi).toBe(72);
    expect(result.notes[0].durationSeconds).toBeCloseTo(2, 1);
    expect(estimateHummingRhythm(result.notes, result.trimStartSeconds)).toEqual({ tempo: null, meter: null });
  });

  it('estimates meter only when multiple bars support a recurring downbeat', () => {
    const notes = Array.from({ length: 12 }, (_, index) => ({
      pitchMidi: 60, startSeconds: index * 0.5, durationSeconds: 0.3, levelDb: index % 3 === 0 ? 0 : -9,
    }));
    const rhythm = estimateHummingRhythm(notes, 0.4);
    expect(rhythm.tempo).toMatchObject({ bpm: 120, beat_seconds: 0.5 });
    expect(rhythm.meter).toMatchObject({ time_signature: '3/4', first_supported_downbeat_seconds: 0.4 });
    expect(estimateHummingRhythm(notes.map(note => ({ ...note, levelDb: 0 })), 0.4).meter).toBeNull();
  });
});
