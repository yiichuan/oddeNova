import { Midi } from '@tonejs/midi';
import type { HummingAttachment } from '../types/humming';

export function encodeHummingMidi(analysis: HummingAttachment): Uint8Array<ArrayBuffer> {
  const midi = new Midi();
  // A fixed tempo gives DAWs a grid while keeping the detected times in seconds.
  midi.header.setTempo(120);
  const track = midi.addTrack();
  track.name = 'Humming';

  for (const note of analysis.transcription.notes) {
    const startSeconds = analysis.trimStartSeconds + note.startSeconds;
    const ticks = midi.header.secondsToTicks(startSeconds);
    const endTicks = midi.header.secondsToTicks(startSeconds + note.durationSeconds);
    track.addNote({
      midi: note.pitchMidi,
      velocity: 0.75,
      ticks,
      durationTicks: Math.max(1, endTicks - ticks),
    });
  }

  return new Uint8Array(midi.toArray());
}
