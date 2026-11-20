/// <reference lib="webworker" />
import { HUMMING_WAVEFORM_SAMPLE_RATE, measureHummingFrames } from '../lib/humming-waveform';
import { resampleMono } from '../services/humming-audio';

const scope = self as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try {
    const { samples, sampleRate } = event.data;
    const mono = resampleMono(samples, sampleRate, HUMMING_WAVEFORM_SAMPLE_RATE);
    const { frames } = measureHummingFrames(mono);
    // Keep the original time and the unrounded-to-note
    // pitch and both energy measurements, leaving segmentation to the agent.
    const csv = frames.map(({ time, pitch, level, treble }) =>
      `${Math.round(time * 1000)},${pitch?.toFixed(1) ?? ''},${Math.round(level)},${Math.round(treble)}`).join('\n');
    scope.postMessage({ csv });
  } catch {
    scope.postMessage({ error: 'invalid_audio' });
  }
});
