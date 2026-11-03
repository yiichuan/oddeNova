/// <reference lib="webworker" />
import {
  addPitchBendsToNoteEvents,
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from '@spotify/basic-pitch';
import { selectHummingMelody, type BasicPitchNote } from '../lib/humming-notes';
import { resampleMono } from '../services/humming-audio';
import {
  BASIC_PITCH_MODEL_VERSION,
  HUMMING_PREPROCESSING_VERSION,
  type HummingMelodyResult,
  type HummingWorkerProgressStage,
} from '../types/humming';

interface TranscribeRequest {
  type: 'transcribe';
  jobId: string;
  samples: ArrayBuffer;
  sampleRate: number;
  recordingDurationSeconds: number;
}

type WorkerRequest = TranscribeRequest;

type WorkerResponse =
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

// TensorFlow.js 3.x's browser platform reads `window` even when running in a
// dedicated worker. Alias it to the worker global; the browser timer workaround
// is disabled below because worker postMessage targets the page, not itself.
if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis,
  });
}

const scope = self as DedicatedWorkerGlobalScope;

function post(response: WorkerResponse): void {
  scope.postMessage(response);
}

async function inferWithBackend(
  samples: Float32Array,
  jobId: string,
  backend: 'webgl' | 'cpu',
): Promise<BasicPitchNote[]> {
  const tf = await import('@tensorflow/tfjs');
  tf.env().set('USE_SETTIMEOUTCUSTOM', false);
  const backendReady = await tf.setBackend(backend);
  if (!backendReady) throw new Error('backend_unavailable');
  await tf.ready();

  const modelUrl = new URL(
    import.meta.env.BASE_URL + 'models/basic-pitch/model.json',
    scope.location.origin,
  ).toString();
  const pitch = new BasicPitch(modelUrl);
  const model = await pitch.model;
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  // Basic Pitch 1.0.1 does not dispose its per-window input/output tensors.
  // Scope inference allocations so TFJS releases them before the Worker exits.
  const engine = tf.engine();
  engine.startScope('basic-pitch-inference');
  try {
    await pitch.evaluateModel(
      samples,
      (frameChunk, onsetChunk, contourChunk) => {
        frames.push(...frameChunk);
        onsets.push(...onsetChunk);
        contours.push(...contourChunk);
      },
      (progress) => {
        const progressOffset = backend === 'webgl' ? 0 : 0.55;
        const progressScale = backend === 'webgl' ? 0.55 : 0.45;
        post({
          type: 'progress',
          jobId,
          stage: 'transcribing',
          progress: progressOffset + Math.max(0, Math.min(1, progress)) * progressScale,
        });
      },
    );

    const noteEvents = outputToNotesPoly(frames, onsets, 0.35, 0.3, 5);
    return noteFramesToTime(addPitchBendsToNoteEvents(contours, noteEvents));
  } finally {
    try {
      engine.endScope();
    } finally {
      model.dispose();
    }
  }
}

async function transcribe(request: TranscribeRequest): Promise<void> {
  post({ type: 'progress', jobId: request.jobId, stage: 'loading', progress: 0 });

  try {
    const samples = resampleMono(new Float32Array(request.samples), request.sampleRate);
    let candidates: BasicPitchNote[];
    try {
      candidates = await inferWithBackend(samples, request.jobId, 'webgl');
    } catch {
      post({ type: 'progress', jobId: request.jobId, stage: 'fallback', progress: 0 });
      candidates = await inferWithBackend(samples, request.jobId, 'cpu');
    }

    const result = selectHummingMelody(candidates, request.recordingDurationSeconds);
    post({
      type: 'result',
      jobId: request.jobId,
      modelVersion: BASIC_PITCH_MODEL_VERSION,
      preprocessingVersion: HUMMING_PREPROCESSING_VERSION,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = [
      'no_melody_detected',
      'too_many_candidates',
      'too_many_notes',
      'invalid_recording_duration',
    ].includes(message) ? message : 'transcription_failed';
    post({ type: 'error', jobId: request.jobId, code });
  }
}

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type === 'transcribe') void transcribe(event.data);
});
