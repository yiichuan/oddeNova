import { describe, expect, it } from 'vitest';
import { BlobSource, Input, MP4 } from 'mediabunny';
import { encodeM4a } from '../m4a-encoder';

describe('M4A encoding', () => {
  it.each([[44100, 1], [44100, 2], [48000, 1], [48000, 2]])(
    'encodes %i Hz, %i channel audio into an AAC MP4 file', async (sampleRate, count) => {
      const length = sampleRate + 123; // Partial final AAC frame and PCM block.
      const channels = Array.from({ length: count }, (_, channel) => Float32Array.from(
        { length }, (_, i) => Math.sin(2 * Math.PI * (channel ? 880 : 440) * i / sampleRate) * 0.4,
      ));
      const original = channels[0].slice();
      const progress: number[] = [];
      const blob = await encodeM4a(channels, sampleRate, (value) => progress.push(value));
      expect(blob.type).toBe('audio/mp4');
      const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
      try {
        const track = await input.getPrimaryAudioTrack();
        expect(track).not.toBeNull();
        expect(await track!.getCodec()).toBe('aac');
        expect(await track!.getSampleRate()).toBe(sampleRate);
        expect(await track!.getNumberOfChannels()).toBe(count);
        expect(await input.getVideoTracks()).toHaveLength(0);
        const duration = await input.computeDuration();
        expect(duration).toBeGreaterThanOrEqual(length / sampleRate - 0.025);
        expect(duration).toBeLessThan(length / sampleRate + 0.075);
      } finally {
        input.dispose();
      }
      expect(channels[0]).toEqual(original);
      expect(progress.at(-1)).toBe(1);
      expect(progress.every((value, i) => value >= 0 && value <= 1 && (i === 0 || value >= progress[i - 1]))).toBe(true);
    },
  );

  it('rejects invalid audio before encoding', async () => {
    await expect(encodeM4a([], 48000)).rejects.toThrow();
    await expect(encodeM4a([new Float32Array()], 48000)).rejects.toThrow();
    await expect(encodeM4a([new Float32Array(4), new Float32Array(3)], 48000)).rejects.toThrow();
    await expect(encodeM4a([new Float32Array(4)], 96000)).rejects.toThrow();
  });
});
