import { encodeAudioWithWorker } from './audio-encoding-worker';

export function audioBufferToM4a(buffer: AudioBuffer, onProgress?: (progress: number) => void): Promise<Blob> {
  return encodeAudioWithWorker(buffer, () => new Worker(new URL('./m4a-export.worker.ts', import.meta.url), { type: 'module' }), onProgress);
}
