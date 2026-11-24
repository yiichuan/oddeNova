export const MUSIC_UNDERSTANDING_PATH = '/api/official/v1/tools/music-understanding';
export const MUSIC_ANALYSIS_SAMPLE_RATE = 22_050;

export interface MusicUnderstanding {
  melodyStyle: string;
}

export function parseMusicUnderstanding(value: unknown): MusicUnderstanding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const style = fields.melodyStyle ?? fields.melody_style;
  return typeof style === 'string' && style.trim() && style.length <= 1200
    ? { melodyStyle: style.trim() }
    : null;
}
