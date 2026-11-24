import { HUMMING_MAX_NOTES, type HummingMelodyResult, type HummingNote } from '../types/humming';

export const HUMMING_WAVEFORM_SAMPLE_RATE = 12_000;
export const HUMMING_FRAME_SECONDS = 0.01;
const MIN_NOTE_FRAMES = 7;
const MIN_RESTART_FRAMES = 9;

interface Frame {
  time: number;
  level: number;
  treble: number;
  pitch: number | null;
}

function quantile(values: number[], q: number): number {
  const sorted = values.sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function db(energy: number, length: number): number {
  return 10 * Math.log10(Math.max(1e-12, energy / length));
}

function estimatePitch(samples: Float32Array, center: number, halfWindow: number, scores: Float64Array): number | null {
  const rate = HUMMING_WAVEFORM_SAMPLE_RATE;
  // Correlate sample pairs symmetrically around the frame time. Choose the
  // shortest strong period to avoid mistaking multiples for lower octaves.
  for (let lag = 12; lag < scores.length; lag += 1) {
    let a = 0;
    let b = 0;
    let cross = 0;
    const start = center - halfWindow - Math.floor(lag / 2);
    for (let i = start; i < start + halfWindow * 2; i += 1) {
      const left = samples[i] ?? 0;
      const right = samples[i + lag] ?? 0;
      a += left * left;
      b += right * right;
      cross += left * right;
    }
    scores[lag] = cross / (Math.sqrt(a * b) || 1);
  }

  let strongest = 0;
  for (let lag = 13; lag < scores.length - 1; lag += 1) {
    if (scores[lag] > scores[lag - 1] && scores[lag] >= scores[lag + 1]) {
      strongest = Math.max(strongest, scores[lag]);
    }
  }
  const threshold = Math.max(0.7, strongest * 0.92);
  for (let lag = 13; lag < scores.length - 1; lag += 1) {
    const [left, middle, right] = [scores[lag - 1], scores[lag], scores[lag + 1]];
    if (middle >= threshold && middle > left && middle >= right) {
      const period = lag + 0.5 * (left - right) / (left - 2 * middle + right);
      return 69 + 12 * Math.log2(rate / period / 440);
    }
  }
  return null;
}

export function measureHummingFrames(samples: Float32Array): { frames: Frame[]; floor: number } {
  const hop = Math.round(HUMMING_WAVEFORM_SAMPLE_RATE * HUMMING_FRAME_SECONDS);
  const frames: Frame[] = [];
  for (let center = 0; center < samples.length; center += hop) {
    let power = 0;
    let highPower = 0;
    for (let index = center - hop / 2; index < center + hop / 2; index += 1) {
      const sample = samples[index] ?? 0;
      power += sample * sample;
      const difference = sample - (samples[index - 1] ?? 0);
      highPower += difference * difference;
    }
    frames.push({
      time: center / HUMMING_WAVEFORM_SAMPLE_RATE,
      level: db(power, hop),
      treble: db(highPower, hop),
      pitch: null,
    });
  }

  const levels = frames.map(frame => frame.level);
  const peak = quantile([...levels], 0.95);
  const floor = Math.max(-78, peak - 30, Math.min(peak - 17, quantile(levels, 0.2) + 8));
  const scores = new Float64Array(202);
  for (const [index, frame] of frames.entries()) {
    if (frame.level < floor) continue;
    const center = index * hop;
    const longer = estimatePitch(samples, center, 300, scores);
    const shorter = estimatePitch(samples, center, 180, scores);
    frame.pitch = shorter !== null && longer !== null && Math.abs(shorter - longer) < 0.8
      ? (shorter + longer) / 2
      : longer ?? shorter;
  }
  return { frames, floor };
}

function pitchValues(frames: Frame[]): number[] {
  return frames.flatMap(frame => frame.pitch === null ? [] : [frame.pitch]);
}

function findRestart(frames: Frame[], index: number, start: number): boolean {
  if (index - start < MIN_RESTART_FRAMES || index + MIN_NOTE_FRAMES > frames.length) return false;
  const before = frames.slice(index - 7, index - 1);
  const attack = frames.slice(index, index + 4);
  const after = frames.slice(index + 3, index + 8);
  const precedingLevel = Math.max(...before.map(frame => frame.level));
  const valley = Math.min(...frames.slice(index - 3, index + 1).map(frame => frame.level));
  const trebleRise = Math.max(...attack.map(frame => frame.treble)) - quantile(before.map(frame => frame.treble), 0.5);
  // A new vocal attack can precede reliable pitch by several frames.
  return pitchValues(after).length >= 3
    && trebleRise >= 11
    && precedingLevel - valley >= 5
    && quantile(after.map(frame => frame.level), 0.5) - valley >= 8;
}

function findsPitchStep(frames: Frame[], index: number, start: number): boolean {
  if (index - start < MIN_NOTE_FRAMES + 2 || index + MIN_NOTE_FRAMES + 2 > frames.length) return false;
  const before = pitchValues(frames.slice(index - 8, index - 1));
  const after = pitchValues(frames.slice(index + 2, index + 9));
  if (before.length < 5 || after.length < 5) return false;
  const jump = Math.abs(quantile(before, 0.5) - quantile(after, 0.5));
  const changeAtBoundary = Math.abs((frames[index - 2].pitch ?? quantile(before, 0.5))
    - (frames[index + 2].pitch ?? quantile(after, 0.5)));
  const spread = (pitches: number[]) => quantile(pitches, 0.85) - quantile(pitches, 0.15);
  return jump >= 0.85 && changeAtBoundary >= jump * 0.8 && spread(before) < 0.5 && spread(after) < 0.5;
}

/** Transcribe the main periodic voice in a solo humming take from 12 kHz mono PCM. */
export function analyzeHummingWaveform(
  samples: Float32Array,
  onProgress?: (progress: number) => void,
): HummingMelodyResult {
  if (!samples.length) throw new Error('no_melody_detected');

  const { frames, floor } = measureHummingFrames(samples);
  onProgress?.(0.85);
  const notes: (HummingNote & { levelDb: number })[] = [];
  let start = -1;
  let lastVoiced = -1;

  function closeAt(endIndex: number): void {
    const segment = frames.slice(start, endIndex);
    const pitches = pitchValues(segment);
    if (pitches.length < MIN_NOTE_FRAMES - 1) return;
    const representative = quantile(pitches, 0.5);
    const pitchMidi = Math.round(representative);
    const end = Math.min(endIndex * HUMMING_FRAME_SECONDS, samples.length / HUMMING_WAVEFORM_SAMPLE_RATE);
    const durationSeconds = end - frames[start].time;
    if (pitchMidi < 21 || pitchMidi > 108 || durationSeconds < 0.06) return;
    const stablePitches = pitches.length >= 12 ? pitches.slice(2, -2) : pitches;
    // Sample the contour after the attack and before the decaying tail.
    const pitchBendsCents = Array.from({ length: 5 }, (_, index) => {
      const pitch = stablePitches[Math.round((stablePitches.length - 1) * index / 4)];
      return Math.max(-1200, Math.min(1200, Math.round((pitch - pitchMidi) * 100)));
    });
    notes.push({
      pitchMidi,
      startSeconds: frames[start].time,
      durationSeconds,
      pitchBendsCents,
      levelDb: quantile(segment.map(frame => frame.level), 0.8),
      ...(Math.abs(representative - pitchMidi) >= 0.35 ? { uncertain: true } : {}),
    });
  }

  for (const [index, frame] of frames.entries()) {
    if (start >= 0 && index - lastVoiced > 4) {
      closeAt(lastVoiced + 1);
      start = -1;
    }
    if (start < 0 && frame.pitch !== null) {
      // Recover the attack just before the periodic part of the voice.
      start = index;
      while (start > Math.max(lastVoiced + 1, index - 3) && frames[start - 1].level >= floor + 3) start -= 1;
    } else if (start >= 0 && (findRestart(frames, index, start) || findsPitchStep(frames, index, start))) {
      closeAt(Math.min(index, lastVoiced + 1));
      start = index;
    }
    if (frame.pitch !== null) lastVoiced = index;
  }
  if (start >= 0) closeAt(lastVoiced + 1);
  if (!notes.length) throw new Error('no_melody_detected');
  if (notes.length > HUMMING_MAX_NOTES) throw new Error('too_many_notes');

  const trimStartSeconds = notes[0].startSeconds;
  const last = notes[notes.length - 1];
  const peak = Math.max(...notes.map(note => note.levelDb));
  return {
    trimStartSeconds,
    melodyDurationSeconds: last.startSeconds + last.durationSeconds - trimStartSeconds,
    notes: notes.map(note => ({
      ...note,
      startSeconds: note.startSeconds - trimStartSeconds,
      levelDb: Math.max(-120, Math.round(note.levelDb - peak)),
    })),
    warnings: notes.some(note => note.uncertain) ? ['ambiguous_melody'] : [],
  };
}
