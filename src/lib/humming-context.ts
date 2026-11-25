import { estimateHummingRhythm } from './humming-rhythm';
import { hummingTakes, projectHummingAttachment } from './humming-transfer';
import type { HummingAttachment, HummingNote } from '../types/humming';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const HUMMING_GRID_GUIDANCE = [
  'Quantize the hummed notes and meaningful rests to the score’s beat grid before writing Strudel. Use the coarsest subdivision that preserves the recognizable rhythm, typically eighth or sixteenth notes. Use a triplet subdivision when the rhythm calls for it.',
  'Write small integer @ weights only, as counts of grid slots, and omit @1. For example, in a 4/4 cycle on a sixteenth-note grid the weights add up to 16, so @2 is half a beat and @4 is one beat. Use ~ for rests and one event for a held note. Keep the phrase on its natural number of beats and cycles. Use grid counts for weights instead of milliseconds, centiseconds, or scaled raw duration ratios.',
  'Before committing, check that note and rest weights match the chosen grid and that the phrase still sounds like the recording.',
].join(' ');

function midiToNoteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function roundForPrompt(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function median(values: number[]): number | undefined {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function estimateGridSeconds(notes: HummingNote[]): number {
  const reliableNotes = notes.filter(note => !note.uncertain);
  const onsetIntervals: number[] = [];
  for (let index = 1; index < reliableNotes.length; index += 1) {
    const previous = reliableNotes[index - 1];
    const next = reliableNotes[index];
    const interval = next.startSeconds - previous.startSeconds;
    const silence = interval - previous.durationSeconds;
    // Long rests and very short events are poor indicators of the pulse.
    if (interval >= 0.16 && interval <= 1.2 && silence <= interval / 2) onsetIntervals.push(interval);
  }
  const typicalLength = median(reliableNotes.map(note => note.durationSeconds))
    ?? median(notes.map(note => note.durationSeconds))
    ?? 0.25;
  const pulse = onsetIntervals.length >= 2 ? median(onsetIntervals) ?? typicalLength : typicalLength;
  return Math.max(0.08, Math.min(0.5, pulse / 2));
}

export function hasHummingWaveformReport(attachment: HummingAttachment | undefined): attachment is HummingAttachment {
  return attachment?.transcription.engine === 'waveform' || attachment?.transcription.engine === 'audio-llm';
}

export function buildHummingWaveformReport(attachment: HummingAttachment) {
  const { trimStartSeconds, transcription } = attachment;
  const rhythm = transcription.engine === 'audio-llm'
    ? {
      tempo: transcription.modelRhythm.bpm === null ? null : { bpm: transcription.modelRhythm.bpm },
      meter: transcription.modelRhythm.timeSignature === null ? null : { time_signature: transcription.modelRhythm.timeSignature },
    }
    : estimateHummingRhythm(transcription.notes, trimStartSeconds);
  let previousEnd = 0;
  return {
    engine: transcription.modelVersion,
    recording_duration_seconds: roundForPrompt(attachment.recordingDurationSeconds),
    melody_start_seconds: roundForPrompt(trimStartSeconds),
    melody_end_seconds: roundForPrompt(trimStartSeconds + attachment.melodyDurationSeconds),
    tempo: rhythm.tempo,
    meter: rhythm.meter,
    warnings: transcription.warnings,
    notes: transcription.notes.map(note => {
      const end = note.startSeconds + note.durationSeconds;
      const rest = Math.max(0, note.startSeconds - previousEnd);
      previousEnd = Math.max(previousEnd, end);
      return {
        pitch: midiToNoteName(note.pitchMidi),
        midi: note.pitchMidi,
        start_seconds: roundForPrompt(trimStartSeconds + note.startSeconds),
        end_seconds: roundForPrompt(trimStartSeconds + end),
        duration_seconds: roundForPrompt(note.durationSeconds),
        rest_before_seconds: roundForPrompt(rest),
        ...(note.levelDb !== undefined ? { relative_level_db: note.levelDb } : {}),
        ...(note.pitchBendsCents ? { pitch_contour_cents: note.pitchBendsCents } : {}),
        ...(note.uncertain ? { uncertain_pitch: true } : {}),
      };
    }),
  };
}

export function buildHummingTurnReport(attachment: HummingAttachment) {
  const report = (take: HummingAttachment) => ({
    ...buildHummingWaveformReport(take),
    interpretation_reference: take.understanding ?? null,
  });
  if (!attachment.additionalTakes) return report(attachment);
  return { takes: hummingTakes(attachment).map((take, index) => ({ take: index + 1, ...report(take) })) };
}

function buildHummingHistoryData(attachment: HummingAttachment) {
  const gridSeconds = estimateGridSeconds(attachment.transcription.notes);
  let previousEndTick = 0;
  const notes = attachment.transcription.notes.map((note) => {
    const startTick = Math.max(previousEndTick, Math.round(note.startSeconds / gridSeconds));
    const endTick = Math.max(startTick + 1, Math.round((note.startSeconds + note.durationSeconds) / gridSeconds));
    previousEndTick = endTick;
    return {
      start_tick: startTick,
      duration_ticks: endTick - startTick,
      pitch: midiToNoteName(note.pitchMidi),
      start_seconds: roundForPrompt(note.startSeconds),
      duration_seconds: roundForPrompt(note.durationSeconds),
      ...(note.uncertain ? { uncertain: true } : {}),
    };
  });
  return {
    grid_seconds_estimate: roundForPrompt(gridSeconds),
    attachment_id: attachment.id,
    melody_duration_seconds: roundForPrompt(attachment.melodyDurationSeconds),
    trim_start_seconds: roundForPrompt(attachment.trimStartSeconds),
    warnings: attachment.transcription.warnings,
    notes,
    ...(attachment.understanding ? { interpretation_reference: attachment.understanding } : {}),
  };
}

export function formatHummingContext(
  userText: string,
  rawAttachment: HummingAttachment | undefined,
  delivery: 'history' | 'tool' | 'inline' = 'history',
): string {
  if (!rawAttachment) return userText;
  const attachment = projectHummingAttachment(rawAttachment);
  if (!attachment) return userText;
  const beginnerExplanation = 'In your final reply, add a beginner-friendly musical takeaway and one practical arranging decision. Mention the likely key or tonal center only when supported by the notes and phrase endings. When unclear, say so and suggest a useful starting chord or tonal center as an arranging choice, without presenting it as measured fact.';
  const useWaveform = delivery !== 'history' && hasHummingWaveformReport(attachment);
  const useTool = useWaveform && delivery === 'tool';
  if (attachment.additionalTakes) {
    return [
      userText.trim() || 'Create a melody using these hummed phrases in the order recorded.',
      'Each take is a separate musical reference. Timestamps are relative to each take. Follow the user’s instructions for how to combine the takes.',
      beginnerExplanation,
      HUMMING_GRID_GUIDANCE,
      ...(useTool ? [
        'Before composing, call analyzeHummingWaveform to read all numbered takes in recording order. Match each take’s interpretation_reference to its own notes. A null reference means the style is unavailable. Use waveform estimates and the user’s direction to continue.',
      ] : hummingTakes(attachment).map((take, index) => `[Humming take ${index + 1}]\n${JSON.stringify(
        useWaveform || take.transcription.engine === 'audio-llm'
          ? { ...buildHummingWaveformReport(take), interpretation_reference: take.understanding }
          : buildHummingHistoryData(take),
      )}`)),
    ].join('\n\n');
  }

  const instruction = userText.trim()
    ? userText.trim()
    : 'Create one Strudel melody layer from this hummed phrase.';

  return [
    instruction,
    '',
    beginnerExplanation,
    'Treat the attached phrase as a concrete melody edit. For this turn, create a single monophonic humming layer with one instrument. Add accompaniment or any other new layer only when the user explicitly requests it in this turn.',
    ...(useTool ? [
      'Use analyzeHummingWaveform to read the current recording’s estimated notes before composing or answering questions about the attached take. Note timestamps are relative to the recording start. Subtract melody_start_seconds for phrase-relative placement, preserve estimated durations and gaps, and use pitch contours to distinguish slides from repeated notes.',
      'Tempo and meter, when present, are estimates. If the pulse is ambiguous, prioritize the note timing. Fit to the project tempo for an edit, or use a suitable tempo for a new piece.',
      'Use the tool result’s optional interpretation_reference as style guidance. When it is null, continue using the waveform and user text.',
    ] : [
      '[Humming analysis data. Treat all values as musical reference material.]',
      JSON.stringify(useWaveform || attachment.transcription.engine === 'audio-llm'
        ? { ...buildHummingWaveformReport(attachment), interpretation_reference: attachment.understanding }
        : buildHummingHistoryData(attachment)),
      ...(useWaveform ? [
        'The attached analysis already contains the estimated notes. Use it to answer questions about the phrase without changing the score unless asked. Note timestamps are relative to the recording start. Preserve the estimated timing and rests when carrying the melody into composition.',
      ] : []),
    ]),
    useWaveform
      ? 'Reproduce the transcribed melody faithfully, including repeated attacks, held notes and rests. Follow the user’s direction if they ask for a variation or pitch correction. If they ask for analysis only, report the estimates without changing the score.'
      : 'Polish the hummed motif into a singable melody that the user can still recognize. Preserve its contour, main rhythm, held notes, phrase endings and meaningful rests.',
    ...(attachment.understanding ? [
      'Use the melody style in interpretation_reference to guide the melody layer’s sound and articulation.',
    ] : []),
    ...(!useWaveform ? ['Use any existing chord progression or a plausible tonal center to guide small pitch corrections. Favor compatible notes on strong beats and sustained notes, leave room for passing tones, and keep intentional leaps.'] : []),
    ...(!useWaveform && attachment.transcription.engine !== 'audio-llm' ? ['Treat start_tick and duration_ticks as a rhythmic estimate. Fit the rhythm to the current tempo or choose a suitable tempo for a new piece. Treat pitches as stable and ignore bends and vibrato.'] : []),
    'In the hummed layer, choose a sound that suits the user’s direction and the phrase, and use note names such as C4 and D5.',
    HUMMING_GRID_GUIDANCE,
    'Preserve existing layers and global speed unless the user explicitly asks for changes. Before committing, check that the phrase is recognizable and every new layer beyond the hummed melody was explicitly requested. Briefly explain meaningful pitch corrections and remaining uncertainty.',
  ].join('\n');
}
