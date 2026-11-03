import type { ChatMessage } from '../hooks/useChat';
import {
  BASIC_PITCH_MODEL_VERSION,
  HUMMING_MAX_ATTACHMENT_BYTES,
  HUMMING_MAX_NOTES,
  HUMMING_PREPROCESSING_VERSION,
  HUMMING_RECORDING_LIMIT_SECONDS,
  HUMMING_SCHEMA_VERSION,
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
]);
const TRANSCRIPTION_KEYS = new Set([
  'engine',
  'modelVersion',
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
  'toolName',
  'ok',
  'isGreeting',
  'humming',
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
  const { pitchMidi, startSeconds, durationSeconds, pitchBendsCents, uncertain } = value;
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
    || transcription.engine !== 'basic-pitch'
    || transcription.modelVersion !== BASIC_PITCH_MODEL_VERSION
    || transcription.preprocessingVersion !== HUMMING_PREPROCESSING_VERSION
    || !Array.isArray(transcription.notes)
    || transcription.notes.length === 0
    || transcription.notes.length > HUMMING_MAX_NOTES
    || !Array.isArray(transcription.warnings)
    || transcription.warnings.some((warning) => !WARNING_VALUES.has(warning as HummingWarning))
  ) return null;

  const notes = transcription.notes.map((note) => normalizeNote(note, melodyDurationSeconds));
  if (notes.some((note) => !note)) return null;
  for (let index = 1; index < notes.length; index += 1) {
    if (notes[index]!.startSeconds < notes[index - 1]!.startSeconds) return null;
  }

  const attachment: HummingAttachment = {
    kind: 'humming',
    schemaVersion: HUMMING_SCHEMA_VERSION,
    id,
    recordingDurationSeconds,
    trimStartSeconds,
    melodyDurationSeconds,
    transcription: {
      engine: 'basic-pitch',
      modelVersion: BASIC_PITCH_MODEL_VERSION,
      preprocessingVersion: HUMMING_PREPROCESSING_VERSION,
      notes: notes as HummingNote[],
      warnings: [...new Set(transcription.warnings as HummingWarning[])],
    },
  };
  if (new Blob([JSON.stringify(attachment)]).size > HUMMING_MAX_ATTACHMENT_BYTES) return null;
  return attachment;
}

export function isSafeChatMessageTransfer(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, MESSAGE_KEYS)) return false;
  if (
    typeof value.id !== 'string'
    || !['user', 'assistant', 'progress'].includes(String(value.role))
    || typeof value.content !== 'string'
    || !finite(value.timestamp)
  ) return false;
  if (value.code !== undefined && typeof value.code !== 'string') return false;
  if (value.revisionId !== undefined && typeof value.revisionId !== 'string') return false;
  if (value.inputMode !== undefined && value.inputMode !== 'normal' && value.inputMode !== 'choice') return false;
  if (value.agentAttemptId !== undefined && typeof value.agentAttemptId !== 'string') return false;
  if (value.progressKind !== undefined && typeof value.progressKind !== 'string') return false;
  if (value.toolName !== undefined && typeof value.toolName !== 'string') return false;
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
    ...(humming ? { humming } : {}),
    ...(value.code !== undefined ? { code: value.code } : {}),
    ...(value.revisionId !== undefined ? { revisionId: value.revisionId } : {}),
    ...(value.inputMode !== undefined ? { inputMode: value.inputMode } : {}),
    ...(value.agentAttemptId !== undefined ? { agentAttemptId: value.agentAttemptId } : {}),
    ...(value.progressKind !== undefined ? { progressKind: value.progressKind } : {}),
    ...(value.toolName !== undefined ? { toolName: value.toolName } : {}),
    ...(value.ok !== undefined ? { ok: value.ok } : {}),
    ...(value.isGreeting !== undefined ? { isGreeting: value.isGreeting } : {}),
  };
}
