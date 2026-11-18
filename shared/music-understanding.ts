export const MUSIC_UNDERSTANDING_PATH = '/api/official/v1/tools/music-understanding';
export const MUSIC_ANALYSIS_SAMPLE_RATE = 22_050;

interface StructuredMusicUnderstanding {
  melody: string;
  notes?: string;
  bpm?: string;
  timeSignature?: string;
  harmony?: string;
  rhythm: string;
  suggestions: string;
  uncertainty?: string;
}

export type MusicUnderstanding = StructuredMusicUnderstanding | { summary: string };

export function parseMusicUnderstanding(value: unknown): MusicUnderstanding | null {
  if (!value || typeof value !== 'object') return null;
  const {
    melody,
    notes,
    bpm,
    time_signature: providerTimeSignature,
    timeSignature: appTimeSignature,
    harmony,
    rhythm,
    suggestions,
    uncertainty,
    summary,
  } = value as Record<string, unknown>;
  if (typeof summary === 'string' && summary.trim() && summary.length <= 2400) {
    return { summary: summary.trim() };
  }
  const validText = (text: unknown): text is string =>
    typeof text === 'string' && text.trim().length > 0 && text.length <= 1200;
  if (!validText(melody) || !validText(rhythm) || !validText(suggestions)) return null;
  const timeSignature = validText(appTimeSignature) ? appTimeSignature : providerTimeSignature;
  return {
    melody: melody.trim(),
    ...(validText(notes) ? { notes: notes.trim() } : {}),
    ...(validText(bpm) ? { bpm: bpm.trim() } : {}),
    ...(validText(timeSignature) ? { timeSignature: timeSignature.trim() } : {}),
    ...(validText(harmony) ? { harmony: harmony.trim() } : {}),
    rhythm: rhythm.trim(),
    suggestions: suggestions.trim(),
    ...(validText(uncertainty) ? { uncertainty: uncertainty.trim() } : {}),
  };
}
