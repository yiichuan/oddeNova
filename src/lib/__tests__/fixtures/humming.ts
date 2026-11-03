import type { HummingAttachment, LocalHummingDraft } from '../../../types/humming';

export function hummingAttachment(): HummingAttachment {
  return {
    kind: 'humming', schemaVersion: 1,
    id: '11111111-1111-4111-8111-111111111111',
    recordingDurationSeconds: 5, trimStartSeconds: 0, melodyDurationSeconds: 4.1,
    transcription: {
      engine: 'basic-pitch', modelVersion: 'spotify-basic-pitch-ts@1.0.1',
      preprocessingVersion: 'mono-sinc-22050-v1',
      notes: [{ pitchMidi: 60, startSeconds: 0, durationSeconds: 0.5 }],
      warnings: [],
    },
  };
}

export function hummingDraft(sessionId = 'source', ownerKey = 'guest'): LocalHummingDraft {
  return {
    id: hummingAttachment().id, sessionId, ownerKey,
    blob: new Blob(['local recording'], { type: 'audio/webm' }),
    mimeType: 'audio/webm', createdAt: 1, durationSeconds: 5,
  };
}
