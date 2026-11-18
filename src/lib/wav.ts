// --- WAV encoder (16-bit PCM, interleaved stereo / mono) ---
// Inlined here because @strudel/webaudio doesn't export its internal helper.
export function encodeWav16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  let samples: Float32Array;
  if (numChannels === 2) {
    const l = channels[0];
    const r = channels[1];
    samples = new Float32Array(l.length * 2);
    for (let i = 0; i < l.length; i++) {
      samples[i * 2] = l[i];
      samples[i * 2 + 1] = r[i];
    }
  } else {
    samples = channels[0];
  }

  const dataLength = samples.length * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);

  const writeString = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);             // fmt chunk size
  view.setUint16(20, 1, true);              // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return ab;
}
