import { HUMMING_RECORDING_LIMIT_SECONDS } from '../types/humming';

export interface HummingRecording {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

export interface HummingRecorderSession {
  recording: Promise<HummingRecording>;
  stop(): void;
  cancel(): void;
}

export interface HummingRecorderOptions {
  onStopping?: () => void;
}

function chooseRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

export async function startHummingRecording(
  signal?: AbortSignal,
  options: HummingRecorderOptions = {},
): Promise<HummingRecorderSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('microphone_unavailable');
  if (typeof MediaRecorder === 'undefined') throw new Error('recorder_unavailable');
  if (signal?.aborted) throw new Error('cancelled');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (error) {
    if (signal?.aborted) throw new Error('cancelled');
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('microphone_denied');
    }
    throw new Error('microphone_failed');
  }

  if (signal?.aborted) {
    stopTracks(stream);
    throw new Error('cancelled');
  }

  const mimeType = chooseRecordingMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stopTracks(stream);
    throw new Error('recorder_unavailable');
  }

  const chunks: BlobPart[] = [];
  const startedAt = performance.now();
  const timer: { id?: number } = {};
  let completed = false;
  let cancelled = false;
  let stopping = false;
  let resolveRecording: (recording: HummingRecording) => void = () => {};
  let rejectRecording: (error: Error) => void = () => {};
  const recording = new Promise<HummingRecording>((resolve, reject) => {
    resolveRecording = resolve;
    rejectRecording = reject;
  });

  const removeLifecycleListeners = () => {
    window.removeEventListener('pagehide', stop);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const track of stream.getTracks()) track.removeEventListener('ended', stop);
  };
  const cleanup = () => {
    if (timer.id !== undefined) window.clearTimeout(timer.id);
    removeLifecycleListeners();
    stopTracks(stream);
  };
  const finish = () => {
    if (completed) return;
    completed = true;
    cleanup();
    if (cancelled) {
      rejectRecording(new Error('cancelled'));
      return;
    }
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'application/octet-stream' });
    if (blob.size === 0) {
      rejectRecording(new Error('empty_recording'));
      return;
    }
    resolveRecording({
      blob,
      mimeType: blob.type,
      durationSeconds: Math.min(
        HUMMING_RECORDING_LIMIT_SECONDS,
        (performance.now() - startedAt) / 1000,
      ),
    });
  };
  const stop = () => {
    if (recorder.state === 'inactive') return;
    if (!stopping) {
      stopping = true;
      options.onStopping?.();
    }
    recorder.stop();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') stop();
  };

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('stop', finish, { once: true });
  recorder.addEventListener('error', () => {
    if (completed) return;
    completed = true;
    cleanup();
    rejectRecording(new Error('recording_interrupted'));
  }, { once: true });

  window.addEventListener('pagehide', stop, { once: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  for (const track of stream.getTracks()) track.addEventListener('ended', stop, { once: true });
  timer.id = window.setTimeout(stop, HUMMING_RECORDING_LIMIT_SECONDS * 1000);

  try {
    recorder.start(250);
  } catch {
    cleanup();
    throw new Error('recorder_failed');
  }

  return {
    recording,
    stop,
    cancel() {
      cancelled = true;
      stop();
    },
  };
}
