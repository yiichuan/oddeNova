import {
  HUMMING_MAX_NOTES,
  HUMMING_RECORDING_LIMIT_SECONDS,
  type HummingMelodyResult,
  type HummingNote,
  type HummingWarning,
} from '../types/humming';

export interface BasicPitchNote {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
  pitchBends?: number[];
  onsetStrength?: number;
  /** True when the recording falls quiet and rises again near this onset. */
  hasEnergyBreak?: boolean;
  /** True when this pitch dominates the model frames for a sustained run. */
  hasStablePitch?: boolean;
}

const MAX_RAW_CANDIDATES = 4096;
const MAX_PITCH_BEND_POINTS = 24;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function simplifyPitchBends(bends: number[] | undefined): number[] | undefined {
  if (!bends?.length) return undefined;
  const count = Math.min(bends.length, MAX_PITCH_BEND_POINTS);
  const sparse = Array.from({ length: count }, (_value, index) =>
    bends[Math.round(index * (bends.length - 1) / Math.max(1, count - 1))],
  );
  // Basic Pitch stores contour bins at one third of a semitone. Convert the
  // relative curve to cents so downstream context never has to know model units.
  const cents = sparse.map((bend) => Math.round(bend * (100 / 3) * 10) / 10);
  return cents.some((bend) => bend !== 0) ? cents : undefined;
}

function normalizeCandidates(
  candidates: BasicPitchNote[],
  recordingDurationSeconds: number,
): BasicPitchNote[] {
  if (candidates.length > MAX_RAW_CANDIDATES) {
    throw new Error('too_many_candidates');
  }

  return candidates
    .filter((note) =>
      isFiniteNumber(note.startTimeSeconds)
      && isFiniteNumber(note.durationSeconds)
      && isFiniteNumber(note.pitchMidi)
      && isFiniteNumber(note.amplitude)
      && note.durationSeconds > 0
      && note.pitchMidi >= 21
      && note.pitchMidi <= 108
      && note.startTimeSeconds < recordingDurationSeconds
    )
    .map((note) => ({
      ...note,
      startTimeSeconds: Math.max(0, note.startTimeSeconds),
      durationSeconds: Math.min(
        note.durationSeconds,
        recordingDurationSeconds - Math.max(0, note.startTimeSeconds),
      ),
    }))
    .filter((note) => note.durationSeconds > 0)
    .sort((left, right) =>
      left.startTimeSeconds - right.startTimeSeconds
      || right.durationSeconds - left.durationSeconds
    );
}

function candidateValue(note: BasicPitchNote): number {
  // Amplitude is only a model activation used to rank candidate tracks. It is
  // deliberately not exposed as a user-facing probability or accuracy score.
  return Math.log1p(Math.max(0, note.amplitude) * 4) + Math.log1p(note.durationSeconds * 5);
}

function chooseContinuousTrack(candidates: BasicPitchNote[]): BasicPitchNote[] {
  const scores: number[] = [];
  const previous: number[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const note = candidates[index];
    let bestScore = candidateValue(note);
    let bestPrevious = -1;

    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      const prior = candidates[earlier];
      const priorEnd = prior.startTimeSeconds + prior.durationSeconds;
      const gap = Math.max(0, note.startTimeSeconds - priorEnd);

      const overlap = Math.max(0, priorEnd - note.startTimeSeconds);
      const smallerDuration = Math.min(prior.durationSeconds, note.durationSeconds);
      if (overlap > smallerDuration * 0.65) continue;

      const pitchDistance = Math.abs(note.pitchMidi - prior.pitchMidi);
      // A rest must not disconnect two valid phrases. Cap its cost while
      // retaining pitch and overlap penalties for competing candidates.
      const transitionCost = Math.min(gap, 0.25) * 0.8 + pitchDistance * 0.16 + overlap * 2.4;
      const possible = scores[earlier] + candidateValue(note) - transitionCost;
      if (possible > bestScore) {
        bestScore = possible;
        bestPrevious = earlier;
      }
    }

    scores[index] = bestScore;
    previous[index] = bestPrevious;
  }

  let endIndex = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[endIndex]) endIndex = index;
  }

  const track: BasicPitchNote[] = [];
  for (let index = endIndex; index >= 0; index = previous[index]) {
    track.push(candidates[index]);
    if (previous[index] === -1) break;
  }
  return track.reverse();
}

const MAX_SUSTAIN_GAP_SECONDS = 0.04;
const MAX_PITCH_EXCURSION_SECONDS = 0.16;

function canJoinSustain(previous: BasicPitchNote, next: BasicPitchNote): boolean {
  const gap = next.startTimeSeconds - (previous.startTimeSeconds + previous.durationSeconds);
  return gap <= MAX_SUSTAIN_GAP_SECONDS
    && next.onsetStrength !== undefined
    && next.onsetStrength < 0.5
    && !next.hasEnergyBreak;
}

function extendSustain(previous: BasicPitchNote, next: BasicPitchNote): void {
  const end = Math.max(previous.startTimeSeconds + previous.durationSeconds, next.startTimeSeconds + next.durationSeconds);
  previous.durationSeconds = end - previous.startTimeSeconds;
}

function joinSustainedFragments(track: BasicPitchNote[]): BasicPitchNote[] {
  const joined: BasicPitchNote[] = [];
  for (let index = 0; index < track.length; index += 1) {
    const note = track[index];
    const previous = joined.at(-1);
    if (previous && canJoinSustain(previous, note)) {
      if (previous.pitchMidi === note.pitchMidi) {
        extendSustain(previous, note);
        if (previous.pitchBends && note.pitchBends) previous.pitchBends = [...previous.pitchBends, ...note.pitchBends];
        else if (note.pitchBends) previous.pitchBends = note.pitchBends;
        continue;
      }

      // A brief semitone excursion that returns to the held pitch can be drift
      // or vibrato. Keep stable plateaus, new attacks and one-way pitch changes.
      const next = track[index + 1];
      if (next?.pitchMidi === previous.pitchMidi
        && Math.abs(previous.pitchMidi - note.pitchMidi) === 1
        && note.durationSeconds <= MAX_PITCH_EXCURSION_SECONDS
        && note.hasStablePitch !== true
        && canJoinSustain(note, next)) {
        extendSustain(previous, note);
        extendSustain(previous, next);
        index += 1;
        continue;
      }
    }
    joined.push({ ...note });
  }
  return joined;
}

function isUncertain(
  note: BasicPitchNote,
  selected: BasicPitchNote[],
  candidates: BasicPitchNote[],
): boolean {
  const noteEnd = note.startTimeSeconds + note.durationSeconds;
  return candidates.some((candidate) => {
    if (selected.includes(candidate) || Math.abs(candidate.pitchMidi - note.pitchMidi) <= 1) {
      return false;
    }
    const candidateEnd = candidate.startTimeSeconds + candidate.durationSeconds;
    const overlap = Math.max(
      0,
      Math.min(noteEnd, candidateEnd) - Math.max(note.startTimeSeconds, candidate.startTimeSeconds),
    );
    const sameOnset = Math.abs(candidate.startTimeSeconds - note.startTimeSeconds) <= 0.12;
    return sameOnset && overlap >= 0.08 && candidate.amplitude >= note.amplitude * 0.7;
  });
}

export function selectHummingMelody(
  rawCandidates: BasicPitchNote[],
  recordingDurationSeconds: number,
): HummingMelodyResult {
  if (
    !isFiniteNumber(recordingDurationSeconds)
    || recordingDurationSeconds <= 0
    || recordingDurationSeconds > HUMMING_RECORDING_LIMIT_SECONDS
  ) {
    throw new Error('invalid_recording_duration');
  }

  const candidates = normalizeCandidates(rawCandidates, recordingDurationSeconds);
  const selected = chooseContinuousTrack(candidates);
  const joined = joinSustainedFragments(selected);
  if (selected.length === 0) throw new Error('no_melody_detected');
  if (joined.length > HUMMING_MAX_NOTES) throw new Error('too_many_notes');

  const trimStartSeconds = selected[0].startTimeSeconds;
  const melodyEndSeconds = Math.max(
    ...selected.map((note) => note.startTimeSeconds + note.durationSeconds),
  );
  const notes: HummingNote[] = joined.map((note) => {
    const pitchBendsCents = simplifyPitchBends(note.pitchBends);
    return {
      pitchMidi: Math.round(note.pitchMidi),
      startSeconds: Math.max(0, note.startTimeSeconds - trimStartSeconds),
      durationSeconds: note.durationSeconds,
      ...(pitchBendsCents ? { pitchBendsCents } : {}),
      ...(isUncertain(note, selected, candidates) ? { uncertain: true } : {}),
    };
  });

  const warnings = new Set<HummingWarning>();
  if (notes.some((note) => note.uncertain)) warnings.add('ambiguous_melody');
  if (notes.length <= 1) warnings.add('low_signal');

  return {
    trimStartSeconds,
    melodyDurationSeconds: Math.max(0, melodyEndSeconds - trimStartSeconds),
    notes,
    warnings: [...warnings],
  };
}
