import { encodeAudioWithWorker } from './audio-encoding-worker';

/** The worker (and its encoder dependency) is loaded only for MP3 exports. */
export function audioBufferToMp3(buffer: AudioBuffer, onProgress?: (progress: number) => void): Promise<Blob> {
  return encodeAudioWithWorker(buffer, () => new Worker(new URL('./mp3-export.worker.ts', import.meta.url), { type: 'module' }), onProgress);
}
