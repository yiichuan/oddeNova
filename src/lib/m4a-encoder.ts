import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { AudioSample, AudioSampleSource, BufferTarget, Mp4OutputFormat, Output, Quality } from 'mediabunny';

let registered = false;

/** AAC-LC in an audio-only MP4 container; no live AudioContext or real-time recording. */
export async function encodeM4a(
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  if (channels.length < 1 || channels.length > 2 || !channels[0].length
    || channels.some((channel) => channel.length !== channels[0].length)) {
    throw new Error('M4A export requires non-empty mono or stereo audio');
  }
  if (sampleRate !== 44100 && sampleRate !== 48000) {
    throw new Error('M4A export requires 44100 or 48000 Hz audio');
  }
  if (!registered) {
    // Use the same WASM encoder on all browsers, including those without WebCodecs AAC.
    registerAacEncoder();
    registered = true;
  }
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new AudioSampleSource({ codec: 'aac', quality: new Quality({ bitrate: 256000 }) });
  output.addAudioTrack(source);
  try {
    await output.start();
    const length = channels[0].length;
    const blockSize = 16384;
    for (let offset = 0; offset < length; offset += blockSize) {
      const count = Math.min(blockSize, length - offset);
      const planar = new Float32Array(count * channels.length);
      channels.forEach((channel, index) => planar.set(channel.subarray(offset, offset + count), index * count));
      const sample = new AudioSample({
        data: planar,
        format: 'f32-planar',
        numberOfChannels: channels.length,
        sampleRate,
        timestamp: offset / sampleRate,
      });
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
      onProgress?.((offset + count) / length * 0.95);
    }
    source.close();
    await output.finalize();
    if (!target.buffer) throw new Error('M4A encoding produced no file');
    onProgress?.(1);
    return new Blob([target.buffer], { type: 'audio/mp4' });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}
