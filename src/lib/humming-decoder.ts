import { noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import { HUMMING_MAX_NOTES, type HummingMelodyResult } from '../types/humming';

export function decodeHummingMelody(frames: number[][], onsets: number[][]): HummingMelodyResult {
  if (frames.length === 0) throw new Error('no_melody_detected');

  // Use the SDK's note extraction defaults as the comparison baseline.
  const notes = noteFramesToTime(outputToNotesPoly(frames, onsets))
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  if (notes.length === 0) throw new Error('no_melody_detected');
  if (notes.length > HUMMING_MAX_NOTES) throw new Error('too_many_notes');

  // The attachment stores relative times, while playback and MIDI use the original timeline.
  const trimStartSeconds = notes[0].startTimeSeconds;
  return {
    trimStartSeconds,
    melodyDurationSeconds: Math.max(...notes.map(note => note.startTimeSeconds + note.durationSeconds)) - trimStartSeconds,
    notes: notes.map(note => ({
      pitchMidi: note.pitchMidi,
      startSeconds: note.startTimeSeconds - trimStartSeconds,
      durationSeconds: note.durationSeconds,
    })),
    warnings: [],
  };
}
