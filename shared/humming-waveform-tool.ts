import { HUMMING_MAX_NOTES, type HummingModelRhythm, type HummingNote } from '../src/types/humming.js';

export const HUMMING_WAVEFORM_TOOL = 'analyzeHummingWaveform';

const time = { type: 'number', minimum: 0 } as const;
export const hummingWaveformTool = {
  type: 'function',
  function: {
    name: HUMMING_WAVEFORM_TOOL,
    description: 'Submit the estimated monophonic notes heard in this audio, ordered by start time.',
    parameters: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          maxItems: HUMMING_MAX_NOTES,
          description: 'One entry per audible note. Use an empty array for silence or when no melody can be identified.',
          items: {
            type: 'object',
            properties: {
              pitchMidi: { type: 'integer', minimum: 21, maximum: 108, description: 'MIDI pitch. Middle C is 60.' },
              startSeconds: time,
              endSeconds: time,
              uncertain: { type: 'boolean' },
            },
            required: ['pitchMidi', 'startSeconds', 'endSeconds'],
            additionalProperties: false,
          },
        },
        bpm: { type: ['number', 'null'], minimum: 20, maximum: 400 },
        timeSignature: { type: ['string', 'null'], description: 'Estimated meter such as 4/4, or null if unclear.' },
      },
      required: ['notes'],
      additionalProperties: false,
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseHummingModelRhythm(value: unknown): HummingModelRhythm | null {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'bpm' && key !== 'timeSignature')) return null;
  const { bpm = null, timeSignature = null } = value;
  if (bpm !== null && (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 20 || bpm > 400)) return null;
  if (timeSignature !== null && (typeof timeSignature !== 'string' || !/^(?:[1-9]|1[0-9]|2[0-4])\/(?:2|4|8|16)$/.test(timeSignature))) return null;
  return { bpm, timeSignature };
}

export function parseHummingToolResult(value: unknown, durationSeconds: number) {
  if (!isRecord(value) || !Array.isArray(value.notes) || value.notes.length > HUMMING_MAX_NOTES) return null;
  const rhythm = parseHummingModelRhythm({ bpm: value.bpm, timeSignature: value.timeSignature });
  if (!rhythm) return null;

  const notes: (Pick<HummingNote, 'pitchMidi' | 'startSeconds' | 'uncertain'> & { endSeconds: number })[] = [];
  let previousEnd = 0;
  for (const note of value.notes) {
    if (!isRecord(note)) return null;
    const { pitchMidi, startSeconds, endSeconds, uncertain } = note;
    if (typeof pitchMidi !== 'number' || !Number.isInteger(pitchMidi) || pitchMidi < 21 || pitchMidi > 108
      || typeof startSeconds !== 'number' || !Number.isFinite(startSeconds) || startSeconds < previousEnd
      || typeof endSeconds !== 'number' || !Number.isFinite(endSeconds)
      || endSeconds <= startSeconds || endSeconds > durationSeconds
      || (uncertain !== undefined && typeof uncertain !== 'boolean')) return null;
    notes.push({ pitchMidi, startSeconds, endSeconds, ...(uncertain ? { uncertain } : {}) });
    previousEnd = endSeconds;
  }
  return { notes, ...rhythm };
}
