import type { HummingNote } from '../types/humming';

interface Pulse {
  seconds: number;
  phase: number;
  fit: number;
  score: number;
}

function percentile(values: number[], fraction: number): number {
  const ordered = values.sort((a, b) => a - b);
  return ordered[Math.floor((ordered.length - 1) * fraction)];
}

function fitPulse(notes: HummingNote[], seconds: number, phase: number): Pulse {
  const tolerance = Math.min(0.085, seconds * 0.15);
  let matched = 0;
  let onBeat = 0;
  let adjacentBeats = 0;
  let previousBeat = -Infinity;
  let error = 0;
  for (const note of notes) {
    const beat = (note.startSeconds - phase) / seconds;
    const slot = Math.round(beat * 2);
    const residual = Math.abs(beat - slot / 2) * seconds;
    if (residual > tolerance) continue;
    matched += 1;
    error += residual / tolerance;
    if (slot % 2 === 0) {
      onBeat += 1;
      if (slot / 2 - previousBeat === 1) adjacentBeats += 1;
      previousBeat = slot / 2;
    }
  }
  const fit = matched / notes.length;
  const score = fit + (0.14 * onBeat + 0.26 * adjacentBeats - 0.24 * error) / notes.length;
  return { seconds, phase, fit, score: adjacentBeats >= 3 ? score : 0 };
}

function estimateMeter(notes: HummingNote[], pulse: Pulse, trimStartSeconds: number) {
  const beats = new Map<number, number>();
  for (const note of notes) {
    const position = (note.startSeconds - pulse.phase) / pulse.seconds;
    const beat = Math.round(position);
    if (note.levelDb === undefined || Math.abs(position - beat) > 0.15) continue;
    beats.set(beat, Math.max(beats.get(beat) ?? -Infinity, note.levelDb));
  }

  // Demand recurring downbeat accents across three complete bars. Sparse
  // melodies and consistent volume rarely carry enough evidence for meter.
  const orderedBeats = [...beats.keys()].sort((a, b) => a - b);
  const candidates = [3, 4].flatMap(length => Array.from({ length }, (_, offset) => {
    const advantages: number[] = [];
    let firstBeat: number | undefined;
    for (const beat of orderedBeats) {
      if ((beat - offset) % length !== 0) continue;
      const bar = Array.from({ length }, (_, index) => beats.get(beat + index) ?? -Infinity);
      if (!bar.every(Number.isFinite)) continue;
      firstBeat ??= beat;
      advantages.push(bar[0] - Math.max(...bar.slice(1)));
    }
    const strength = advantages.length >= 3 ? percentile(advantages, 0.25) : -Infinity;
    return { length, strength, firstBeat };
  })).sort((a, b) => b.strength - a.strength);

  const best = candidates[0];
  const second = candidates[1];
  if (best.firstBeat === undefined || best.strength < 3 || best.strength - second.strength < 2) return null;
  return {
    time_signature: `${best.length}/4`,
    first_supported_downbeat_seconds: round(trimStartSeconds + pulse.phase + best.firstBeat * pulse.seconds),
    basis: 'repeated accents on the estimated pulse',
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function estimateHummingRhythm(notes: HummingNote[], trimStartSeconds: number) {
  if (notes.length < 5 || notes[notes.length - 1].startSeconds - notes[0].startSeconds < 1.5) {
    return { tempo: null, meter: null };
  }
  const pulses: Pulse[] = [];
  // Search plausible quarter-note pulses, allowing eighth-note subdivisions.
  for (let ms = 300; ms <= 1200; ms += 5) {
    const seconds = ms / 1000;
    for (let phaseMs = 0; phaseMs < ms; phaseMs += 15) {
      const candidate = fitPulse(notes, seconds, phaseMs / 1000);
      if (candidate.fit >= 0.82 && candidate.score >= 1) pulses.push(candidate);
    }
  }
  pulses.sort((a, b) => b.score - a.score);
  const pulse = pulses[0];
  if (!pulse) return { tempo: null, meter: null };

  const alternative = pulses.find(candidate => Math.abs(candidate.seconds / pulse.seconds - 1) > 0.15
    && candidate.score >= pulse.score - 0.09);

  return {
    tempo: {
      bpm: Math.round(60 / pulse.seconds),
      beat_seconds: round(pulse.seconds),
      pulse_anchor_seconds: round(trimStartSeconds + pulse.phase),
      aligned_onsets_ratio: round(pulse.fit),
      alternative_bpm: alternative ? Math.round(60 / alternative.seconds) : null,
    },
    meter: estimateMeter(notes, pulse, trimStartSeconds),
  };
}
