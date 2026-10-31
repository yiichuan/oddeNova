import { describe, expect, it } from 'vitest';
import { encodeMp3 } from '../mp3-encoder';

describe('MP3 encoding', () => {
  it.each([44100, 48000])('encodes a stereo tone at %i Hz into complete MPEG Layer III frames', async (sampleRate) => {
    // A partial final PCM block exercises the flush path too.
    const left = Float32Array.from({ length: sampleRate + 123 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5);
    const right = Float32Array.from(left, (v) => -v);
    const progress: number[] = [];
    const blob = encodeMp3([left, right], sampleRate, (p) => progress.push(p));
    expect(blob.type).toBe('audio/mpeg');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let offset = 0;
    let frames = 0;
    while (offset < bytes.length) {
      expect(bytes[offset]).toBe(0xff);
      expect(bytes[offset + 1] & 0xfe).toBe(0xfa); // MPEG-1, Layer III
      expect(bytes[offset + 2] >> 4).toBe(14); // 320 kbps
      expect((bytes[offset + 2] >> 2) & 3).toBe(sampleRate === 44100 ? 0 : 1);
      expect(bytes[offset + 3] >> 6).not.toBe(3); // stereo
      offset += Math.floor(144 * 320000 / sampleRate) + ((bytes[offset + 2] >> 1) & 1);
      frames++;
    }
    expect(offset).toBe(bytes.length);
    expect(frames * 1152).toBeGreaterThanOrEqual(left.length);
    expect(frames * 1152 - left.length).toBeLessThan(3 * 1152);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]))).toBe(true);
    expect(left[1]).toBeCloseTo(Math.sin(2 * Math.PI * 440 / sampleRate) * 0.5);
  });

  it('supports short mono audio and clips out-of-range samples', async () => {
    const bytes = new Uint8Array(await encodeMp3([new Float32Array([0, 2, -2, 0])], 44100).arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[3] >> 6).toBe(3);
  });

  it('rejects empty, mismatched, and unsupported audio', () => {
    expect(() => encodeMp3([], 48000)).toThrow();
    expect(() => encodeMp3([new Float32Array()], 48000)).toThrow();
    expect(() => encodeMp3([new Float32Array(4), new Float32Array(3)], 48000)).toThrow();
    expect(() => encodeMp3([new Float32Array(4)], 96000)).toThrow();
  });
});
