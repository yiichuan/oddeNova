import { describe, expect, it } from 'vitest';
import { selectHummingMelody } from '../humming-notes';
import { formatHummingContext } from '../humming-context';
import { isSafeChatMessageTransfer, projectChatMessageForTransfer, projectHummingAttachment } from '../humming-transfer';
import { conversationHistoryFromMessages } from '../conversation-history';
import { hummingAttachment } from './fixtures/humming';

const note = (startTimeSeconds: number, pitchMidi = 60) => ({
  startTimeSeconds, durationSeconds: 0.5, pitchMidi, amplitude: 0.8,
});

describe('humming melody and transfer', () => {
  it.each([1, 24, 25, 48, 72, 120, 512])('keeps %i pitch bend frames within the transfer limit', (length) => {
    const result = selectHummingMelody([{ ...note(0), pitchBends: Array(length).fill(1) }], 5);
    const attachment = hummingAttachment();
    attachment.transcription.notes = result.notes;
    attachment.transcription.warnings = result.warnings;
    attachment.melodyDurationSeconds = result.melodyDurationSeconds;
    const bends = result.notes[0].pitchBendsCents!;
    expect(bends.length).toBeLessThanOrEqual(24);
    expect(bends.length).toBeGreaterThan(0);
    expect(projectHummingAttachment(attachment)).not.toBeNull();
    expect(formatHummingContext('', attachment)).toContain('"pitch":"C4"');
  });

  it('joins weak-onset fragments while preserving deliberate repeated notes', () => {
    const result = selectHummingMelody([
      { ...note(0), durationSeconds: 0.25, onsetStrength: 0.8 },
      { ...note(0.27), durationSeconds: 0.25, onsetStrength: 0.1 },
      { ...note(0.54), durationSeconds: 0.25, onsetStrength: 0.8 },
    ], 2);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].durationSeconds).toBeCloseTo(0.52);
    expect(result.notes[1].startSeconds).toBeCloseTo(0.54);
  });

  const heldNote = (start: number, pitch: number, duration: number, evidence: { hasStablePitch?: boolean; hasEnergyBreak?: boolean } = {}) => ({
    ...note(start, pitch), durationSeconds: duration, onsetStrength: 0.15, ...evidence,
  });

  it('combines a short semitone excursion within one held note without losing its span', () => {
    const result = selectHummingMelody([
      heldNote(0.2, 60, 0.4),
      heldNote(0.61, 61, 0.09),
      heldNote(0.71, 60, 0.4),
    ], 2);
    expect(result.trimStartSeconds).toBeCloseTo(0.2);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].pitchMidi).toBe(60);
    expect(result.notes[0].durationSeconds).toBeCloseTo(0.91);
  });

  it('preserves stable short notes and legato changes that settle on a new pitch', () => {
    const result = selectHummingMelody([
      heldNote(0, 60, 0.4),
      heldNote(0.4, 61, 0.12, { hasStablePitch: true }),
      heldNote(0.52, 60, 0.3),
      heldNote(0.82, 62, 0.4),
    ], 2);
    expect(result.notes.map(value => value.pitchMidi)).toEqual([60, 61, 60, 62]);
  });

  it('keeps weak same-pitch reattacks when the audio falls quiet between them', () => {
    const result = selectHummingMelody([
      heldNote(0, 60, 0.4),
      heldNote(0.42, 60, 0.4, { hasEnergyBreak: true }),
    ], 2);
    expect(result.notes).toHaveLength(2);
  });

  it('estimates the grid from repeated onsets when short articulation makes durations misleading', () => {
    const attachment = hummingAttachment();
    attachment.transcription.notes = [0, 0.4, 0.8].map(startSeconds => ({
      pitchMidi: 60, startSeconds, durationSeconds: 0.22,
    }));
    const context = formatHummingContext('', attachment);
    const data = JSON.parse(context.split('\n').find(line => line.startsWith('{'))!);
    expect(data.grid_seconds_estimate).toBe(0.2);
    expect(data.notes.map((value: { start_tick: number }) => value.start_tick)).toEqual([0, 2, 4]);
  });

  it('preserves a rest even when the following onset is weak', () => {
    const result = selectHummingMelody([
      { ...note(0), durationSeconds: 0.2, onsetStrength: 0.7 },
      { ...note(0.35), durationSeconds: 0.2, onsetStrength: 0.1 },
    ], 2);
    expect(result.notes).toHaveLength(2);
  });

  it('supplies integer beat-grid positions and requests integer Strudel weights', () => {
    const attachment = hummingAttachment();
    attachment.transcription.notes = [
      { pitchMidi: 60, startSeconds: 0, durationSeconds: 0.48 },
      { pitchMidi: 62, startSeconds: 0.73, durationSeconds: 0.25 },
    ];
    attachment.melodyDurationSeconds = 1;
    const context = formatHummingContext('', attachment);
    expect(context).toContain('"start_tick":3');
    expect(context).toContain('"duration_ticks":2');
    expect(context).toContain('integer @ weights only');
    expect(context).toContain('"pitch":"C4"');
    expect(context).toContain('"pitch":"D4"');
    expect(context).not.toContain('pitch_bends_cents');
    expect(context).toContain('.s("piano")');
  });

  it('retains both phrases and their internal rest', () => {
    const result = selectHummingMelody([note(0), note(0.6), note(3), note(3.6)], 5);
    expect(result.notes.map((value) => value.startSeconds)).toEqual([0, 0.6, 3, 3.6]);
    expect(result.melodyDurationSeconds).toBeCloseTo(4.1);
  });

  it('retains phrases across a long rest without shifting their timing', () => {
    const result = selectHummingMelody([note(2), note(2.6), note(25), note(25.6)], 30);
    expect(result.trimStartSeconds).toBe(2);
    expect(result.notes).toHaveLength(4);
    [0, 0.6, 23, 23.6].forEach((start, index) => {
      expect(result.notes[index].startSeconds).toBeCloseTo(start);
    });
  });

  it('preserves validated melody metadata across JSON transfer and later history', () => {
    const message = { id: 'user-1', role: 'user' as const, content: '', timestamp: 1, humming: hummingAttachment() };
    const restored = JSON.parse(JSON.stringify(projectChatMessageForTransfer(message)));
    expect(isSafeChatMessageTransfer(restored)).toBe(true);
    expect(restored.humming).toEqual(message.humming);
    expect(conversationHistoryFromMessages([restored])[0].content).toContain('"pitch":"C4"');
  });

  it.each(['blob', 'pcm', 'audioUrl', 'localPath'])('rejects local-only %s in a melody attachment', (field) => {
    const message = {
      id: 'user-1', role: 'user' as const, content: '', timestamp: 1,
      humming: { ...hummingAttachment(), [field]: 'device-local data' },
    };
    expect(isSafeChatMessageTransfer(message)).toBe(false);
    expect(() => projectChatMessageForTransfer(message)).toThrow('Unsafe');
  });
});
