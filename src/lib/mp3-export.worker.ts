import { encodeMp3 } from './mp3-encoder';

self.onmessage = (event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    const blob = encodeMp3(event.data.channels, event.data.sampleRate, (progress) => {
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'done', blob });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
