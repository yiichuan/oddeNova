import { Mp3Encoder } from '@breezystack/lamejs';

/** Encode in small PCM blocks so the encoder never needs a second full-size PCM buffer. */
export function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (progress: number) => void,
): Blob {
  if (channels.length < 1 || channels.length > 2 || !channels[0].length
    || channels.some((channel) => channel.length !== channels[0].length)) {
    throw new Error('MP3 export requires non-empty mono or stereo audio');
  }
  if (sampleRate !== 44100 && sampleRate !== 48000) {
    throw new Error('MP3 export requires 44100 or 48000 Hz audio');
  }
  const encoder = new Mp3Encoder(channels.length, sampleRate, 320);
  const chunks: ArrayBuffer[] = [];
  const blockSize = 1152;
  const pcm = channels.map(() => new Int16Array(blockSize));
  const length = channels[0].length;
  for (let offset = 0; offset < length; offset += blockSize) {
    const count = Math.min(blockSize, length - offset);
    channels.forEach((channel, channelIndex) => {
      for (let i = 0; i < count; i++) {
        const value = Math.max(-1, Math.min(1, channel[offset + i]));
        pcm[channelIndex][i] = Math.round(value * (value < 0 ? 32768 : 32767));
      }
    });
    const encoded = encoder.encodeBuffer(pcm[0].subarray(0, count), pcm[1]?.subarray(0, count));
    // lamejs reuses its output storage. Own every chunk before the next call.
    if (encoded.length) chunks.push(new Uint8Array(encoded).buffer);
    if (offset % (blockSize * 64) === 0) onProgress?.((offset + count) / length);
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(new Uint8Array(tail).buffer);
  onProgress?.(1);
  return new Blob(chunks, { type: 'audio/mpeg' });
}
