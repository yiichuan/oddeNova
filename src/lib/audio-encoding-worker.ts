type EncoderMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string };

/** Shared transfer, error handling and cleanup for offline audio encoders. */
export function encodeAudioWithWorker(
  buffer: AudioBuffer,
  createWorker: () => Worker,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = createWorker();
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.progress);
      } else {
        cleanup();
        if (message.type === 'done') resolve(message.blob);
        else reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Audio encoding failed'));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('Could not read audio encoder response'));
    };
    try {
      // Copy before transferring: detaching AudioBuffer-owned storage is unsafe.
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice());
      worker.postMessage({ channels, sampleRate: buffer.sampleRate }, channels.map((channel) => channel.buffer));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
