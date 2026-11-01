type EncoderMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string };

/** Shared transfer, error handling and cleanup for offline audio encoders. */
export function encodeAudioWithWorker(
  buffer: AudioBuffer,
  createWorker: () => Worker,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<EncoderMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.progress);
      } else {
        worker.terminate();
        if (message.type === 'done') resolve(message.blob);
        else reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Audio encoding failed'));
    };
    worker.onmessageerror = () => {
      worker.terminate();
      reject(new Error('Could not read audio encoder response'));
    };
    try {
      // Copy before transferring: detaching AudioBuffer-owned storage is unsafe.
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice());
      worker.postMessage({ channels, sampleRate: buffer.sampleRate }, channels.map((channel) => channel.buffer));
    } catch (error) {
      worker.terminate();
      reject(error);
    }
  });
}
