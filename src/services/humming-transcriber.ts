import {
  BASIC_PITCH_MODEL_VERSION,
  HUMMING_PREPROCESSING_VERSION,
  type HummingMelodyResult,
  type HummingWorkerProgressStage,
} from '../types/humming';

interface TranscribeOptions {
  recordingDurationSeconds: number;
  sampleRate: number;
  signal?: AbortSignal;
  onProgress?: (stage: HummingWorkerProgressStage, progress: number) => void;
  timeoutMs?: number;
}

type WorkerMessage =
  | {
      type: 'progress';
      jobId: string;
      stage: HummingWorkerProgressStage;
      progress: number;
    }
  | {
      type: 'result';
      jobId: string;
      modelVersion: typeof BASIC_PITCH_MODEL_VERSION;
      preprocessingVersion: typeof HUMMING_PREPROCESSING_VERSION;
      result: HummingMelodyResult;
    }
  | { type: 'error'; jobId: string; code: string };

export interface HummingTranscription {
  modelVersion: typeof BASIC_PITCH_MODEL_VERSION;
  preprocessingVersion: typeof HUMMING_PREPROCESSING_VERSION;
  result: HummingMelodyResult;
}

export class HummingTranscriptionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'HummingTranscriptionError';
    this.code = code;
  }
}

export function transcribeHumming(
  pcm: Float32Array,
  options: TranscribeOptions,
): Promise<HummingTranscription> {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new HummingTranscriptionError('worker_unavailable'));
  }
  if (options.signal?.aborted) {
    return Promise.reject(new HummingTranscriptionError('cancelled'));
  }

  const worker = new Worker(
    new URL('../workers/humming-transcription.worker.ts', import.meta.url),
    { type: 'module', name: 'humming-transcription' },
  );
  const jobId = crypto.randomUUID();
  const samples = pcm.slice();
  const timeoutMs = options.timeoutMs ?? 180_000;

  return new Promise<HummingTranscription>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () => finish(() => reject(new HummingTranscriptionError('cancelled')));
    const timeoutId = window.setTimeout(
      () => finish(() => reject(new HummingTranscriptionError('timeout'))),
      timeoutMs,
    );

    options.signal?.addEventListener('abort', handleAbort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || message.jobId !== jobId) return;
      if (message.type === 'progress') {
        options.onProgress?.(message.stage, message.progress);
      } else if (message.type === 'result') {
        finish(() => resolve({
          modelVersion: message.modelVersion,
          preprocessingVersion: message.preprocessingVersion,
          result: message.result,
        }));
      } else {
        finish(() => reject(new HummingTranscriptionError(message.code)));
      }
    };
    worker.onerror = () => finish(() => reject(new HummingTranscriptionError('worker_failed')));
    worker.onmessageerror = () => finish(() => reject(new HummingTranscriptionError('worker_message_failed')));
    worker.postMessage({
      type: 'transcribe',
      jobId,
      samples: samples.buffer,
      sampleRate: options.sampleRate,
      recordingDurationSeconds: options.recordingDurationSeconds,
    }, [samples.buffer]);
  });
}
