import { encodeM4a } from './m4a-encoder';

self.onmessage = async (event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    const blob = await encodeM4a(event.data.channels, event.data.sampleRate, (progress) => {
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'done', blob });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
