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
    expect(formatHummingContext('', attachment)).toContain('pitch_midi');
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
    expect(conversationHistoryFromMessages([restored])[0].content).toContain('pitch_midi');
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
