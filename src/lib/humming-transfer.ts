import { isImageAttachments } from './image-types.js';
import { parseHummingModelRhythm } from '../../shared/humming-waveform-tool.js';
import { parseMusicUnderstanding } from '../../shared/music-understanding.js';
import type { ChatMessage } from '../hooks/useChat';
import {
  BASIC_PITCH_MODEL_VERSION,
  HUMMING_AGENT_PREPROCESSING_VERSION,
  HUMMING_LLM_MODEL_VERSION,
  HUMMING_LLM_PREPROCESSING_VERSION,
  HUMMING_MAX_ATTACHMENT_BYTES,
  HUMMING_MAX_TAKES,
  HUMMING_MAX_NOTES,
  HUMMING_PREPROCESSING_VERSION,
  HUMMING_RECORDING_LIMIT_SECONDS,
  HUMMING_SCHEMA_VERSION,
  HUMMING_WAVEFORM_VERSION,
  HUMMING_WAVEFORM_PREPROCESSING_VERSION,
  type HummingAttachment,
  type HummingNote,
  type HummingWarning,
} from '../types/humming.js';

const ATTACHMENT_KEYS = new Set([
  'kind',
  'schemaVersion',
  'id',
  'recordingDurationSeconds',
  'trimStartSeconds',
  'melodyDurationSeconds',
  'transcription',
  'understanding',
  'additionalTakes',
]);
const UNDERSTANDING_KEYS = new Set(['melodyStyle', 'bpm', 'timeSignature', 'chords', 'key', 'rhythm']);
const TRANSCRIPTION_KEYS = new Set([
  'engine',
  'modelVersion',
  'modelRhythm',
  'preprocessingVersion',
  'notes',
  'warnings',
]);
const NOTE_KEYS = new Set([
  'pitchMidi',
  'startSeconds',
  'durationSeconds',
  'pitchBendsCents',
  'uncertain',
  'levelDb',
]);
const MESSAGE_KEYS = new Set([
  'id',
  'role',
  'content',
  'code',
  'revisionId',
  'inputMode',
  'agentAttemptId',
  'timestamp',
  'progressKind',
  'routerProgress',
  'toolName',
  'sampleSearchSummary',
  'ok',
  'isGreeting',
  'humming',
  'images',
  'selectedChoice',
  'layerNotes',
]);
const WARNING_VALUES = new Set<HummingWarning>(['ambiguous_melody', 'low_signal']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeNote(value: unknown, melodyDurationSeconds: number): HummingNote | null {
  if (!isRecord(value) || !hasOnlyKeys(value, NOTE_KEYS)) return null;
  const { pitchMidi, startSeconds, durationSeconds, pitchBendsCents, uncertain, levelDb } = value;
  if (
    !finite(pitchMidi)
    || !Number.isInteger(pitchMidi)
    || pitchMidi < 21
    || pitchMidi > 108
    || !finite(startSeconds)
    || startSeconds < 0
    || !finite(durationSeconds)
    || durationSeconds <= 0
    || startSeconds + durationSeconds > melodyDurationSeconds + 0.25
    || (levelDb !== undefined && (!finite(levelDb) || levelDb < -120 || levelDb > 0))
    || (uncertain !== undefined && typeof uncertain !== 'boolean')
  ) return null;

  let bends: number[] | undefined;
  if (pitchBendsCents !== undefined) {
    if (
      !Array.isArray(pitchBendsCents)
      || pitchBendsCents.length > 24
      || pitchBendsCents.some((bend) => !finite(bend) || Math.abs(bend) > 1200)
    ) return null;
    bends = pitchBendsCents as number[];
  }

  return {
    pitchMidi,
    startSeconds,
    durationSeconds,
    ...(bends ? { pitchBendsCents: bends } : {}),
    ...(levelDb !== undefined ? { levelDb } : {}),
    ...(uncertain === true ? { uncertain: true } : {}),
  };
}

export function projectHummingAttachment(value: unknown): HummingAttachment | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ATTACHMENT_KEYS)) return null;
  const {
    kind,
    schemaVersion,
    id,
    recordingDurationSeconds,
    trimStartSeconds,
    melodyDurationSeconds,
    transcription,
    understanding: rawUnderstanding,
  } = value;
  if (
    kind !== 'humming'
    || schemaVersion !== HUMMING_SCHEMA_VERSION
    || typeof id !== 'string'
    || !UUID_PATTERN.test(id)
    || !finite(recordingDurationSeconds)
    || recordingDurationSeconds <= 0
    || recordingDurationSeconds > HUMMING_RECORDING_LIMIT_SECONDS
    || !finite(trimStartSeconds)
    || trimStartSeconds < 0
    || !finite(melodyDurationSeconds)
    || melodyDurationSeconds <= 0
    || trimStartSeconds + melodyDurationSeconds > recordingDurationSeconds + 0.25
    || !isRecord(transcription)
    || !hasOnlyKeys(transcription, TRANSCRIPTION_KEYS)
    || !Array.isArray(transcription.notes)
    || transcription.notes.length === 0
    || transcription.notes.length > HUMMING_MAX_NOTES
    || !Array.isArray(transcription.warnings)
    || transcription.warnings.some((warning) => !WARNING_VALUES.has(warning as HummingWarning))
  ) return null;

  const modelRhythm = transcription.engine === 'audio-llm'
    ? parseHummingModelRhythm(transcription.modelRhythm) : null;
  if (transcription.engine !== 'audio-llm' && transcription.modelRhythm !== undefined) return null;
  const engineMetadata = transcription.engine === 'basic-pitch'
    && transcription.modelVersion === BASIC_PITCH_MODEL_VERSION
    && transcription.preprocessingVersion === HUMMING_PREPROCESSING_VERSION
    ? { engine: 'basic-pitch', modelVersion: BASIC_PITCH_MODEL_VERSION, preprocessingVersion: HUMMING_PREPROCESSING_VERSION } as const
    : transcription.engine === 'waveform'
      && transcription.modelVersion === HUMMING_WAVEFORM_VERSION
      && transcription.preprocessingVersion === HUMMING_WAVEFORM_PREPROCESSING_VERSION
      ? { engine: 'waveform', modelVersion: HUMMING_WAVEFORM_VERSION, preprocessingVersion: HUMMING_WAVEFORM_PREPROCESSING_VERSION } as const
      : transcription.engine === 'audio-llm'
        && typeof transcription.modelVersion === 'string'
        && /^[a-z0-9][a-z0-9._:/-]{0,127}$/i.test(transcription.modelVersion)
        && (transcription.preprocessingVersion === HUMMING_AGENT_PREPROCESSING_VERSION
          || (transcription.preprocessingVersion === HUMMING_LLM_PREPROCESSING_VERSION
            && transcription.modelVersion === HUMMING_LLM_MODEL_VERSION))
        && modelRhythm
        ? { engine: 'audio-llm', modelVersion: transcription.modelVersion, preprocessingVersion: transcription.preprocessingVersion, modelRhythm } as const
        : null;
  if (!engineMetadata) return null;

  const notes = transcription.notes.map((note) => normalizeNote(note, melodyDurationSeconds));
  if (notes.some((note) => !note)) return null;
  for (let index = 1; index < notes.length; index += 1) {
    if (notes[index]!.startSeconds < notes[index - 1]!.startSeconds) return null;
  }

  const understanding = parseMusicUnderstanding(rawUnderstanding);
  if (rawUnderstanding !== undefined && (
    !isRecord(rawUnderstanding)
    || !hasOnlyKeys(rawUnderstanding, UNDERSTANDING_KEYS)
    || !understanding
    || Object.values(rawUnderstanding).some(value => typeof value !== 'string' || !value.trim() || value.length > 1200)
  )) return null;

  const attachment: HummingAttachment = {
    kind: 'humming',
    schemaVersion: HUMMING_SCHEMA_VERSION,
    id,
    recordingDurationSeconds,
    trimStartSeconds,
    melodyDurationSeconds,
    ...(understanding ? { understanding } : {}),
    transcription: {
      ...engineMetadata,
      notes: notes as HummingNote[],
      warnings: [...new Set(transcription.warnings as HummingWarning[])],
    },
  };
  if (new Blob([JSON.stringify(attachment)]).size > HUMMING_MAX_ATTACHMENT_BYTES) return null;
  if (value.additionalTakes !== undefined) {
    if (!Array.isArray(value.additionalTakes) || value.additionalTakes.length === 0
      || value.additionalTakes.length >= HUMMING_MAX_TAKES) return null;
    const ids = new Set([attachment.id]);
    const takes: HummingAttachment[] = [];
    for (const raw of value.additionalTakes) {
      if (!isRecord(raw) || 'additionalTakes' in raw) return null;
      const take = projectHummingAttachment(raw);
      if (!take || ids.has(take.id)) return null;
      ids.add(take.id);
      takes.push(take);
    }
    attachment.additionalTakes = takes;
  }
  return attachment;
}

export function hummingTakes(attachment?: HummingAttachment): HummingAttachment[] {
  if (!attachment) return [];
  const { additionalTakes, ...first } = attachment;
  return [first, ...(additionalTakes ?? [])];
}

export function isSafeChatMessageTransfer(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, MESSAGE_KEYS)) return false;
  if (
    typeof value.id !== 'string'
    || !['user', 'assistant', 'progress'].includes(String(value.role))
    || typeof value.content !== 'string'
    || !finite(value.timestamp)
  ) return false;
  if (value.images !== undefined) {
    if (!Array.isArray(value.images) || !value.images.every(image => isRecord(image)
      && (image.publicUrl === undefined || typeof image.publicUrl === 'string'))) return false;
    if (!isImageAttachments(value.images.map(({ publicUrl: _publicUrl, ...image }) => image))) return false;
  }
  if (value.selectedChoice !== undefined && value.selectedChoice !== true) return false;
  if (value.layerNotes !== undefined && (!isRecord(value.layerNotes)
    || !Object.values(value.layerNotes).every(note => typeof note === 'string'))) return false;
  if (value.code !== undefined && typeof value.code !== 'string') return false;
  if (value.revisionId !== undefined && typeof value.revisionId !== 'string') return false;
  if (value.inputMode !== undefined && value.inputMode !== 'normal' && value.inputMode !== 'choice') return false;
  if (value.agentAttemptId !== undefined && typeof value.agentAttemptId !== 'string') return false;
  if (value.progressKind !== undefined && typeof value.progressKind !== 'string') return false;
  const routerProgress = value.routerProgress;
  if (routerProgress !== undefined && (!isRecord(routerProgress)
    || !Object.keys(routerProgress).every(key => ['kind', 'title', 'detail', 'durationMs', 'toolAction'].includes(key))
    || !['plan', 'tool', 'strategy', 'operation'].some(kind => kind === routerProgress.kind)
    || typeof routerProgress.title !== 'string'
    || (routerProgress.detail !== undefined && typeof routerProgress.detail !== 'string')
    || (routerProgress.toolAction !== undefined && typeof routerProgress.toolAction !== 'string')
    || (routerProgress.durationMs !== undefined
      && (!finite(routerProgress.durationMs) || Number(routerProgress.durationMs) < 0)))) return false;
  if (value.toolName !== undefined && typeof value.toolName !== 'string') return false;
  if (value.sampleSearchSummary !== undefined && (!Array.isArray(value.sampleSearchSummary)
    || !value.sampleSearchSummary.every(item => isRecord(item)
      && Object.keys(item).every(key => key === 'query' || key === 'labels')
      && typeof item.query === 'string'
      && Array.isArray(item.labels) && item.labels.every(label => typeof label === 'string')))) return false;
  if (value.ok !== undefined && typeof value.ok !== 'boolean') return false;
  if (value.isGreeting !== undefined && typeof value.isGreeting !== 'boolean') return false;
  // Only derived melody metadata can leave the device; raw recordings and
  // unknown attachment fields are rejected by the attachment schema.
  return value.humming === undefined || projectHummingAttachment(value.humming) !== null;
}

export function projectChatMessageForTransfer(value: ChatMessage): ChatMessage {
  if (!isSafeChatMessageTransfer(value)) {
    throw new Error('Unsafe or unsupported chat message in external transfer');
  }
  const humming = value.humming ? projectHummingAttachment(value.humming) : null;
  // Pick fields explicitly so local-only message properties can never ride
  // along with a cloud session or public share.
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    timestamp: value.timestamp,
    ...(value.images !== undefined ? { images: value.images } : {}),
    ...(value.selectedChoice ? { selectedChoice: value.selectedChoice } : {}),
    ...(value.layerNotes !== undefined ? { layerNotes: value.layerNotes } : {}),
    ...(humming ? { humming } : {}),
    ...(value.code !== undefined ? { code: value.code } : {}),
    ...(value.revisionId !== undefined ? { revisionId: value.revisionId } : {}),
    ...(value.inputMode !== undefined ? { inputMode: value.inputMode } : {}),
    ...(value.agentAttemptId !== undefined ? { agentAttemptId: value.agentAttemptId } : {}),
    ...(value.progressKind !== undefined ? { progressKind: value.progressKind } : {}),
    ...(value.routerProgress ? { routerProgress: value.routerProgress } : {}),
    ...(value.toolName !== undefined ? { toolName: value.toolName } : {}),
    ...(value.sampleSearchSummary !== undefined ? { sampleSearchSummary: value.sampleSearchSummary } : {}),
    ...(value.ok !== undefined ? { ok: value.ok } : {}),
    ...(value.isGreeting !== undefined ? { isGreeting: value.isGreeting } : {}),
  };
}
