import { decodeHummingRecording } from './humming-audio';

export async function measureHummingRecording(recording: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  const pcm = await decodeHummingRecording(recording);
  signal.throwIfAborted();
  const durationSeconds = pcm.samples.length / pcm.sampleRate;

  const csv = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/humming-measurement.worker.ts', import.meta.url), { type: 'module' });
    const finish = (complete: () => void) => {
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
      complete();
    };
    const onAbort = () => finish(() => reject(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ csv?: string; error?: string }>) => {
      const { csv, error } = event.data;
      finish(() => typeof csv === 'string' ? resolve(csv) : reject(new Error(error ?? 'invalid_audio')));
    };
    worker.onerror = () => finish(() => reject(new Error('invalid_audio')));
    worker.onmessageerror = () => finish(() => reject(new Error('invalid_audio')));
    try {
      worker.postMessage(pcm, [pcm.samples.buffer as ArrayBuffer]);
    } catch (error) {
      finish(() => reject(error));
    }
  });
  return { csv, durationSeconds };
}
