export const MUSIC_UNDERSTANDING_PATH = '/api/official/v1/tools/music-understanding';
export const MUSIC_ANALYSIS_SAMPLE_RATE = 22_050;

export interface MusicUnderstanding {
  melody: string;
  rhythm: string;
  suggestions: string;
  uncertainty?: string;
}

export function parseMusicUnderstanding(value: unknown): MusicUnderstanding | null {
  if (!value || typeof value !== 'object') return null;
  const { melody, rhythm, suggestions, uncertainty } = value as Record<string, unknown>;
  const validText = (text: unknown): text is string =>
    typeof text === 'string' && text.trim().length > 0 && text.length <= 1200;
  if (!validText(melody) || !validText(rhythm) || !validText(suggestions)) return null;
  if (uncertainty != null && uncertainty !== '' && !validText(uncertainty)) return null;
  return {
    melody: melody.trim(),
    rhythm: rhythm.trim(),
    suggestions: suggestions.trim(),
    ...(validText(uncertainty) ? { uncertainty: uncertainty.trim() } : {}),
  };
}
