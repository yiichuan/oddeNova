import { describe, expect, it } from 'vitest';
import { decodeHummingMelody } from '../humming-decoder';
import { noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import { buildHummingTurnReport, formatHummingContext } from '../humming-context';
import { isSafeChatMessageTransfer, projectChatMessageForTransfer } from '../humming-transfer';
import { conversationHistoryFromMessages } from '../conversation-history';
import { hummingAttachment } from './fixtures/humming';

describe('humming melody and transfer', () => {
  it('preserves ordered takes across transfer and includes each phrase in the agent context', () => {
    const first = hummingAttachment();
    const second = { ...hummingAttachment(), id: '22222222-2222-4222-8222-222222222222' };
    second.transcription.notes[0].pitchMidi = 67;
    const message = {
      id: 'user-1', role: 'user' as const, content: '', timestamp: 1,
      humming: { ...first, additionalTakes: [second] },
    };
    const transferred = projectChatMessageForTransfer(message);
    expect(transferred.humming?.additionalTakes).toEqual([second]);
    const context = formatHummingContext('', transferred.humming);
    expect(context).toMatch(/\[Humming take 1\][\s\S]+\[Humming take 2\][\s\S]+"pitch":"G4"/);
    expect(buildHummingTurnReport({
      ...first, understanding: { melodyStyle: 'Folk' }, additionalTakes: [second],
    })).toMatchObject({ takes: [
      { take: 1, interpretation_reference: { melodyStyle: 'Folk' } },
      { take: 2, interpretation_reference: null, notes: expect.arrayContaining([expect.objectContaining({ pitch: 'G4' })]) },
    ] });
    expect(isSafeChatMessageTransfer({
      ...message, humming: { ...first, additionalTakes: [{ ...second, blob: new Blob() }] },
    })).toBe(false);
  });

  it('keeps every SDK note, including simultaneous pitches and repeated attacks', () => {
    const frames = Array.from({ length: 120 }, () => Array<number>(88).fill(0));
    const onsets = frames.map(frame => frame.slice());
    for (const [pitch, start, end] of [[60, 8, 28], [60, 29, 46], [72, 8, 34], [64, 70, 90]]) {
      for (let frame = start; frame < end; frame += 1) frames[frame][pitch - 21] = 0.8;
      onsets[start][pitch - 21] = 0.9;
    }
    const expected = noteFramesToTime(outputToNotesPoly(frames, onsets))
      .sort((left, right) => left.startTimeSeconds - right.startTimeSeconds);
    const result = decodeHummingMelody(frames, onsets);
    expect(expected).toHaveLength(4);
    expect(result.notes.map(note => note.pitchMidi)).toEqual(expected.map(note => note.pitchMidi));
    for (const [index, note] of result.notes.entries()) {
      expect(result.trimStartSeconds + note.startSeconds).toBeCloseTo(expected[index].startTimeSeconds, 12);
      expect(note.durationSeconds).toBe(expected[index].durationSeconds);
    }
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

  it('supplies estimated positions and asks for compact weights on the score’s beat grid', () => {
    const attachment = hummingAttachment();
    attachment.transcription.notes = [
      { pitchMidi: 60, startSeconds: 0, durationSeconds: 0.48 },
      { pitchMidi: 62, startSeconds: 0.73, durationSeconds: 0.25 },
    ];
    attachment.melodyDurationSeconds = 1;
    const context = formatHummingContext('', attachment);
    expect(context).toContain('Create one Strudel melody layer from this hummed phrase.');
    expect(context).toContain('single monophonic humming layer with one instrument');
    expect(context).toContain('"start_tick":3');
    expect(context).toContain('"duration_ticks":2');
    expect(context).toContain('integer @ weights only');
    expect(context).toContain('Quantize the hummed notes and meaningful rests');
    expect(context).toContain('the weights add up to 16');
    expect(context).toContain('instead of milliseconds, centiseconds, or scaled raw duration ratios');
    expect(context).toContain('"pitch":"C4"');
    expect(context).toContain('"pitch":"D4"');
    expect(context).not.toContain('pitch_bends_cents');
    expect(context).not.toContain('.s("piano")');
  });

  it('keeps the style from legacy understanding metadata across transfer and later history', () => {
    const reference = {
      melodyStyle: 'Mellow folk with a fingerpicked guitar lead',
      bpm: '96',
      timeSignature: '4/4',
      chords: 'unknown',
      key: 'C major',
      rhythm: 'Two short phrases separated by a pause.',
    };
    const message = {
      id: 'user-1', role: 'user' as const, content: '', timestamp: 1,
      humming: { ...hummingAttachment(), understanding: reference },
    };
    const restored = JSON.parse(JSON.stringify(projectChatMessageForTransfer(message)));
    expect(isSafeChatMessageTransfer(restored)).toBe(true);
    const style = { melodyStyle: reference.melodyStyle };
    expect(restored.humming).toEqual({ ...message.humming, understanding: style });
    const context = conversationHistoryFromMessages([restored])[0].content;
    expect(context).toContain('"pitch":"C4"');
    expect(context).toContain('Use the melody style in interpretation_reference');
    expect(context).toContain('only when the user explicitly requests it in this turn');
    const data = JSON.parse(context.split('\n').find(line => line.startsWith('{'))!);
    expect(data.interpretation_reference).toEqual(style);
    expect(isSafeChatMessageTransfer({
      ...message, humming: { ...message.humming, understanding: { ...reference, notes: 'G8' } },
    })).toBe(false);
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

 it('preserves main branch image attachments, choice markers and layer notes in transfers', () => {
  const message = {
    id: 'combined', role: 'user' as const, content: 'arrange', timestamp: 1,
    selectedChoice: true as const, layerNotes: { piano: 'Warm piano' },
    images: [{ id: 'image', name: 'score.jpg', mimeType: 'image/jpeg', width: 100, height: 100,
      size: 1000, path: 'owner/image.jpg', publicUrl: 'https://example.com/score.jpg' }],
    humming: hummingAttachment(),
  };
  expect(isSafeChatMessageTransfer(message)).toBe(true);
  expect(projectChatMessageForTransfer(message)).toEqual(message);
});

it('retains tool findings and their creative application when transferring a conversation', () => {
  const message = {
    id: 'image-progress', role: 'progress' as const, content: 'Inspect reference image', timestamp: 1,
    progressKind: 'router_progress' as const,
    routerProgress: {
      kind: 'tool' as const, title: 'Inspect reference image', toolAction: 'inspect images',
      detail: 'Blue gradient', application: 'Use a soft background melody.',
    },
  };
  expect(isSafeChatMessageTransfer(message)).toBe(true);
  expect(projectChatMessageForTransfer(message)).toEqual(message);
  expect(isSafeChatMessageTransfer({
    ...message, routerProgress: { ...message.routerProgress, application: { text: 'Invalid' } },
  })).toBe(false);
});
