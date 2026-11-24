import { MUSIC_ANALYSIS_SAMPLE_RATE, MUSIC_UNDERSTANDING_PATH, parseMusicUnderstanding } from '../../shared/music-understanding';
import { encodeWav16 } from '../lib/wav';
import { getAccessToken } from './auth-service';
import { decodeHummingRecording, resampleMono } from './humming-audio';

export async function understandHumming(
  recording: Blob,
  ownerKey: string,
  signal: AbortSignal,
) {
  const userId = ownerKey.startsWith('user:') ? ownerKey.slice(5) : null;
  const token = userId ? await getAccessToken(userId) : null;
  signal.throwIfAborted();
  if (!token) throw new Error('sign_in_required');

  const { samples, sampleRate } = await decodeHummingRecording(recording).catch(() => {
    throw new Error('invalid_audio');
  });
  signal.throwIfAborted();
  const mono = resampleMono(samples, sampleRate, MUSIC_ANALYSIS_SAMPLE_RATE);
  const response = await fetch(MUSIC_UNDERSTANDING_PATH, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' },
    body: encodeWav16([mono], MUSIC_ANALYSIS_SAMPLE_RATE),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401) throw new Error('sign_in_required');
  if (response.status === 429) throw new Error('rate_limited');
  if (!response.ok) {
    const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
    throw new Error(typeof code === 'string' ? code : 'upstream_failed');
  }
  const result = parseMusicUnderstanding(body);
  if (!result) throw new Error('invalid_result');
  return result;
}
