import type { MusicUnderstanding } from '../../shared/music-understanding.js';

export const HUMMING_SCHEMA_VERSION = 1 as const;
export const HUMMING_RECORDING_LIMIT_SECONDS = 30;
export const HUMMING_MAX_NOTES = 512;
export const HUMMING_MAX_ATTACHMENT_BYTES = 64 * 1024;
export const HUMMING_MAX_TAKES = 8;
export const BASIC_PITCH_MODEL_VERSION = 'spotify-basic-pitch-ts@1.0.1';
export const HUMMING_PREPROCESSING_VERSION = 'mono-sinc-22050-v1';

export const HUMMING_WAVEFORM_VERSION = 'monophonic-waveform-v1';
export const HUMMING_WAVEFORM_PREPROCESSING_VERSION = 'mono-sinc-12000-v1';

export const HUMMING_LLM_MODEL_VERSION = 'qwen3.8-omni-flash';
export const HUMMING_LLM_PREPROCESSING_VERSION = 'mono-pcm16-wav-v1';
export const HUMMING_AGENT_PREPROCESSING_VERSION = 'mono-sinc-12000-frames-v1';

export interface HummingModelRhythm {
  bpm: number | null;
  timeSignature: string | null;
}

export type HummingWarning = 'ambiguous_melody' | 'low_signal';

export interface HummingNote {
  pitchMidi: number;
  /** Seconds relative to the first detected note. Internal rests are retained. */
  startSeconds: number;
  durationSeconds: number;
  /** Sparse pitch contour in cents relative to pitchMidi; not a confidence score. */
  pitchBendsCents?: number[];
  uncertain?: boolean;
  /** Relative level in dB, with the loudest note in this take at 0 dB. */
  levelDb?: number;
}

export interface HummingAttachment {
  kind: 'humming';
  schemaVersion: typeof HUMMING_SCHEMA_VERSION;
  /** A random local asset identifier, never a URL. */
  id: string;
  recordingDurationSeconds: number;
  trimStartSeconds: number;
  melodyDurationSeconds: number;
  understanding?: MusicUnderstanding;
  transcription: HummingTranscription;
  additionalTakes?: HummingAttachment[];
}

type HummingTranscription = {
  notes: HummingNote[];
  warnings: HummingWarning[];
} & ({
  engine: 'basic-pitch';
  modelVersion: typeof BASIC_PITCH_MODEL_VERSION;
  preprocessingVersion: typeof HUMMING_PREPROCESSING_VERSION;
} | {
  engine: 'waveform';
  modelVersion: typeof HUMMING_WAVEFORM_VERSION;
  preprocessingVersion: typeof HUMMING_WAVEFORM_PREPROCESSING_VERSION;
} | {
  engine: 'audio-llm';
  modelVersion: string;
  preprocessingVersion: typeof HUMMING_LLM_PREPROCESSING_VERSION | typeof HUMMING_AGENT_PREPROCESSING_VERSION;
  modelRhythm: HummingModelRhythm;
});

/** Device-local only. This shape must never be serialized into a Session. */
export interface LocalHummingAsset {
  ownerKey: string;
  id: string;
  sessionId?: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

/** Device-local unsent draft, isolated from both other owners and sessions. */
export interface LocalHummingDraft extends LocalHummingAsset {
  sessionId: string;
  durationSeconds: number;
}

export interface HummingMelodyResult {
  trimStartSeconds: number;
  melodyDurationSeconds: number;
  notes: HummingNote[];
  warnings: HummingWarning[];
}
