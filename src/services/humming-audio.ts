import { HUMMING_RECORDING_LIMIT_SECONDS } from '../types/humming';

export const HUMMING_SAMPLE_RATE = 22_050;
const SINC_RADIUS = 16;

export interface DecodedHummingRecording {
  samples: Float32Array;
  sampleRate: number;
}

function sinc(value: number): number {
  if (Math.abs(value) < 1e-8) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const mono = new Float32Array(buffer.length);
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_value, index) => buffer.getChannelData(index),
  );
  for (const channel of channels) {
    for (let index = 0; index < mono.length; index += 1) {
      mono[index] += channel[index] / channels.length;
    }
  }
  return mono;
}

/** Windowed-sinc resampler with an anti-alias low-pass for downsampling. */
export function resampleMono(
  source: Float32Array,
  sourceRate: number,
  targetRate = HUMMING_SAMPLE_RATE,
): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || source.length === 0) {
    throw new Error('invalid_audio_samples');
  }
  if (sourceRate === targetRate) return source.slice();

  const outputLength = Math.max(1, Math.round(source.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  const cutoff = Math.min(1, targetRate / sourceRate) * 0.94;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const center = outputIndex * ratio;
    const first = Math.max(0, Math.floor(center) - SINC_RADIUS + 1);
    const last = Math.min(source.length - 1, Math.floor(center) + SINC_RADIUS);
    let weighted = 0;
    let weightTotal = 0;

    for (let sourceIndex = first; sourceIndex <= last; sourceIndex += 1) {
      const distance = sourceIndex - center;
      const windowPosition = Math.abs(distance) / SINC_RADIUS;
      if (windowPosition >= 1) continue;
      const window = 0.5 + 0.5 * Math.cos(Math.PI * windowPosition);
      const weight = cutoff * sinc(cutoff * distance) * window;
      weighted += source[sourceIndex] * weight;
      weightTotal += weight;
    }
    output[outputIndex] = weightTotal === 0 ? 0 : weighted / weightTotal;
  }

  return output;
}

export async function decodeHummingRecording(blob: Blob): Promise<DecodedHummingRecording> {
  if (blob.size === 0) throw new Error('empty_recording');
  if (blob.size > 12 * 1024 * 1024) throw new Error('recording_too_large');

  const audioContext = (await import('superdough')).getAudioContext() as AudioContext;
  const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration <= 0 || decoded.duration > HUMMING_RECORDING_LIMIT_SECONDS + 1) {
    throw new Error('invalid_recording_duration');
  }
  // Keep the CPU-heavy resampling work off the UI thread. Decoding needs the
  // app's existing AudioContext, while the worker handles the pure PCM step.
  return {
    samples: downmixToMono(decoded),
    sampleRate: decoded.sampleRate,
  };
}
