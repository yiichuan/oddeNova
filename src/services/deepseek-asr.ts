const DEEPSEEK_ASR_URL = 'https://api.deepseek.com/v1/tools/asr';
const ASR_SAMPLE_RATE = 16_000;

export function supportsAudioRecording(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';
}

export function getAudioRecorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  return mimeType ? { mimeType } : undefined;
}

function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
  const sourceLength = audioBuffer.length;
  const outputLength = Math.ceil(sourceLength * ASR_SAMPLE_RATE / audioBuffer.sampleRate);
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * audioBuffer.sampleRate / ASR_SAMPLE_RATE;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, sourceLength - 1);
    const mix = sourcePosition - leftIndex;
    let sample = 0;
    for (const channel of channels) {
      sample += channel[leftIndex] * (1 - mix) + channel[rightIndex] * mix;
    }
    output[index] = sample / channels.length;
  }

  const bytesPerSample = 2;
  const dataSize = output.length * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, ASR_SAMPLE_RATE, true);
  view.setUint32(28, ASR_SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of output) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

async function toDeepSeekAudio(recording: Blob): Promise<{ blob: Blob; filename: string }> {
  if (recording.type.toLowerCase().includes('audio/ogg')) {
    return { blob: recording, filename: 'voice.ogg' };
  }

  const { getAudioContext } = await import('superdough');
  const audioBuffer = await getAudioContext().decodeAudioData(await recording.arrayBuffer());
  return { blob: audioBufferToWav(audioBuffer), filename: 'voice.wav' };
}

export async function transcribeWithDeepSeek(
  recording: Blob,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  if (!recording.size) throw new Error('EMPTY_RECORDING');

  const audio = await toDeepSeekAudio(recording);
  const form = new FormData();
  form.append('file', audio.blob, audio.filename);

  const key = apiKey.trim();
  const response = await fetch(key ? DEEPSEEK_ASR_URL : '/api/official/v1/tools/asr', {
    method: 'POST',
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    body: form,
    signal,
  });
  const result = await response.json().catch(() => null) as {
    text?: unknown;
    error?: { message?: unknown };
    message?: unknown;
  } | null;

  if (!response.ok) {
    const detail = typeof result?.error?.message === 'string'
      ? result.error.message
      : typeof result?.message === 'string'
        ? result.message
        : response.statusText;
    throw new Error(`ASR_${response.status}: ${detail}`);
  }
  return typeof result?.text === 'string' ? result.text.trim() : '';
}
