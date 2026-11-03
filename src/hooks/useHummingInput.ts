import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEntryPoint } from '../lib/analytics';
import {
  clearHummingDraft,
  discardHummingDraft,
  getHummingAsset,
  getHummingDraft,
  replaceHummingDraftIfPersistent,
  saveHummingDraft,
} from '../lib/humming-storage';
import { projectHummingAttachment } from '../lib/humming-transfer';
import { isSessionStoragePersistent } from '../lib/session-storage';
import { decodeHummingRecording } from '../services/humming-audio';
import {
  HummingTranscriptionError,
  transcribeHumming,
} from '../services/humming-transcriber';
import { startHummingRecording, type HummingRecorderSession } from '../services/humming-recorder';
import {
  BASIC_PITCH_MODEL_VERSION,
  HUMMING_RECORDING_LIMIT_SECONDS,
  HUMMING_MAX_ATTACHMENT_BYTES,
  HUMMING_PREPROCESSING_VERSION,
  HUMMING_SCHEMA_VERSION,
  type HummingAttachment,
  type HummingWorkerProgressStage,
  type LocalHummingDraft,
} from '../types/humming';

export type HummingInstructionSender = (
  text: string,
  entryPoint: Extract<AgentEntryPoint, 'text' | 'suggestion'>,
  attachment: HummingAttachment,
) => boolean | void | Promise<boolean | void>;

export interface HummingInputController {
  draft: LocalHummingDraft | null;
  audioUrl: string | null;
  isPersistent: boolean;
  isStarting: boolean;
  isRecording: boolean;
  recordingElapsedSeconds: number;
  isFinalizingRecording: boolean;
  isRerecording: boolean;
  isTranscribing: boolean;
  isSavingDraft: boolean;
  isSavingReplacement: boolean;
  progress: number;
  progressStage: HummingWorkerProgressStage | null;
  error: string | null;
  replacementCandidate: LocalHummingDraft | null;
  replacementAudioUrl: string | null;
  canRecord: boolean;
  startRecording(): void;
  cancelRecording(): void;
  stopRecording(): void;
  reRecord(): void;
  cancelRerecord(): void;
  retrySaveReplacement(): Promise<boolean>;
  useOriginalRecording(): void;
  retrySave(): Promise<boolean>;
  discard(): void;
  cancelTranscription(): void;
  restoreAttachment(attachment: HummingAttachment): Promise<boolean>;
  submit(text: string, entryPoint: Extract<AgentEntryPoint, 'text' | 'suggestion'>): Promise<boolean>;
}

interface HummingInputState {
  scopeKey: string;
  loaded: boolean;
  draft: LocalHummingDraft | null;
  audioUrl: string | null;
  isPersistent: boolean;
  isStarting: boolean;
  isRecording: boolean;
  recordingElapsedSeconds: number;
  isFinalizingRecording: boolean;
  isRerecording: boolean;
  isTranscribing: boolean;
  isSavingDraft: boolean;
  isSavingReplacement: boolean;
  progress: number;
  progressStage: HummingWorkerProgressStage | null;
  error: string | null;
  replacementCandidate: LocalHummingDraft | null;
  replacementAudioUrl: string | null;
}

function emptyState(scopeKey: string, loaded = false): HummingInputState {
  return {
    scopeKey,
    loaded,
    draft: null,
    audioUrl: null,
    isPersistent: true,
    isStarting: false,
    isRecording: false,
    recordingElapsedSeconds: 0,
    isFinalizingRecording: false,
    isRerecording: false,
    isTranscribing: false,
    isSavingDraft: false,
    isSavingReplacement: false,
    progress: 0,
    progressStage: null,
    error: null,
    replacementCandidate: null,
    replacementAudioUrl: null,
  };
}

function errorCode(error: unknown): string {
  return error instanceof HummingTranscriptionError
    ? error.code
    : error instanceof Error
      ? error.message
      : 'transcription_failed';
}

interface UseHummingInputOptions {
  ownerKey: string;
  sessionId: string | null;
  busy: boolean;
  pauseTransport: () => void;
  onSend: HummingInstructionSender;
}

export function useHummingInput({
  ownerKey,
  sessionId,
  busy,
  pauseTransport,
  onSend,
}: UseHummingInputOptions): HummingInputController {
  const scopeKey = ownerKey + '\u0000' + (sessionId ?? '');
  const [state, setState] = useState<HummingInputState>(() => emptyState(scopeKey, !sessionId));
  const scopeRef = useRef(scopeKey);
  const recorderRef = useRef<{
    scopeKey: string;
    session: HummingRecorderSession;
    mode: 'new' | 'replace';
    generation: number;
  } | null>(null);
  const permissionControllerRef = useRef<{
    scopeKey: string;
    controller: AbortController;
    mode: 'new' | 'replace';
    generation: number;
  } | null>(null);
  const transcriptionRef = useRef<{ scopeKey: string; controller: AbortController } | null>(null);
  const replacementSaveControllerRef = useRef<{ scopeKey: string; controller: AbortController } | null>(null);
  const transcriptionGenerationRef = useRef(0);
  const recordingGenerationRef = useRef(0);
  const cancelledRecordingGenerationsRef = useRef(new Set<number>());
  const recordingTimerRef = useRef<{ scopeKey: string; id: number } | null>(null);
  const recordingStartedAtRef = useRef<{ scopeKey: string; time: number } | null>(null);

  scopeRef.current = scopeKey;
  const visibleState = state.scopeKey === scopeKey ? state : emptyState(scopeKey, !sessionId);
  const setForScope = useCallback((targetScope: string, update: (current: HummingInputState) => HummingInputState) => {
    setState((current) => current.scopeKey === targetScope ? update(current) : current);
  }, []);
  const clearRecordingTimer = useCallback((targetScope?: string) => {
    const timer = recordingTimerRef.current;
    if (timer && (!targetScope || timer.scopeKey === targetScope)) {
      window.clearInterval(timer.id);
      recordingTimerRef.current = null;
    }
    if (!targetScope || recordingStartedAtRef.current?.scopeKey === targetScope) {
      recordingStartedAtRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const cancelledRecordingGenerations = cancelledRecordingGenerationsRef.current;
    if (sessionId) {
      void getHummingDraft(ownerKey, sessionId).then((draft) => {
        if (!active) return;
        const audioUrl = draft ? URL.createObjectURL(draft.blob) : null;
        setState((current) => {
          if (
            current.scopeKey === scopeKey
            && (current.draft || current.replacementCandidate || current.isStarting || current.isRecording || current.isTranscribing)
          ) {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            return { ...current, loaded: true };
          }
          if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
          return {
            ...emptyState(scopeKey),
            loaded: true,
            draft,
            audioUrl,
            isPersistent: isSessionStoragePersistent(),
          };
        });
      }).catch(() => {
        if (active) {
          setState((current) => current.scopeKey === scopeKey
            ? { ...current, error: 'draft_load_failed' }
            : current);
        }
      });
    }

    return () => {
      active = false;
      clearRecordingTimer(scopeKey);
      recordingGenerationRef.current += 1;
      if (permissionControllerRef.current?.scopeKey === scopeKey) {
        permissionControllerRef.current.controller.abort();
        permissionControllerRef.current = null;
      }
      if (recorderRef.current?.scopeKey === scopeKey) {
        const activeRecorder = recorderRef.current;
        if (activeRecorder.mode === 'replace') {
          cancelledRecordingGenerations.add(activeRecorder.generation);
          activeRecorder.session.cancel();
        } else {
          activeRecorder.session.stop();
        }
        recorderRef.current = null;
      }
      if (transcriptionRef.current?.scopeKey === scopeKey) {
        transcriptionRef.current.controller.abort();
        transcriptionRef.current = null;
        transcriptionGenerationRef.current += 1;
      }
      if (replacementSaveControllerRef.current?.scopeKey === scopeKey) {
        replacementSaveControllerRef.current.controller.abort();
        replacementSaveControllerRef.current = null;
      }
      setState((current) => {
        if (current.scopeKey !== scopeKey) return current;
        if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
        if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
        return emptyState(scopeKey, !sessionId);
      });
    };
  }, [clearRecordingTimer, ownerKey, scopeKey, sessionId]);

  const beginRecording = useCallback((mode: 'new' | 'replace') => {
    const replacing = mode === 'replace';
    if (
      !sessionId
      || busy
      || !visibleState.loaded
      || (replacing ? !visibleState.draft || visibleState.replacementCandidate : Boolean(visibleState.draft))
      || visibleState.isStarting
      || visibleState.isRecording
      || visibleState.isFinalizingRecording
      || visibleState.isTranscribing
      || visibleState.isSavingDraft
      || visibleState.isSavingReplacement
    ) return;

    pauseTransport();
    clearRecordingTimer(scopeKey);
    const controller = new AbortController();
    const generation = ++recordingGenerationRef.current;
    permissionControllerRef.current = { scopeKey, controller, mode, generation };
    setForScope(scopeKey, (current) => ({
      ...current,
      isStarting: true,
      isRecording: false,
      isFinalizingRecording: false,
      isRerecording: replacing,
      recordingElapsedSeconds: 0,
      error: null,
    }));

    void startHummingRecording(controller.signal, {
      onStopping() {
        const startedAt = recordingStartedAtRef.current;
        const elapsed = startedAt?.scopeKey === scopeKey
          ? Math.min(HUMMING_RECORDING_LIMIT_SECONDS, Math.floor((performance.now() - startedAt.time) / 1000))
          : 0;
        clearRecordingTimer(scopeKey);
        if (recordingGenerationRef.current !== generation) return;
        setForScope(scopeKey, (current) => ({
          ...current,
          isRecording: false,
          isFinalizingRecording: true,
          recordingElapsedSeconds: elapsed,
        }));
      },
    }).then((session) => {
      if (permissionControllerRef.current?.controller === controller) permissionControllerRef.current = null;
      if (scopeRef.current !== scopeKey || controller.signal.aborted || recordingGenerationRef.current !== generation) {
        void session.recording.catch(() => {});
        session.cancel();
        return;
      }
      recorderRef.current = { scopeKey, session, mode, generation };
      recordingStartedAtRef.current = { scopeKey, time: performance.now() };
      setForScope(scopeKey, (current) => ({
        ...current,
        isStarting: false,
        isRecording: true,
        isFinalizingRecording: false,
        recordingElapsedSeconds: 0,
        error: null,
      }));
      const timerId = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (!startedAt || startedAt.scopeKey !== scopeKey || recordingGenerationRef.current !== generation) return;
        const elapsed = Math.min(
          HUMMING_RECORDING_LIMIT_SECONDS,
          Math.floor((performance.now() - startedAt.time) / 1000),
        );
        setForScope(scopeKey, (current) => ({ ...current, recordingElapsedSeconds: elapsed }));
      }, 250);
      recordingTimerRef.current = { scopeKey, id: timerId };

      void session.recording.then(async (recording) => {
        if (recorderRef.current?.session === session) recorderRef.current = null;
        clearRecordingTimer(scopeKey);
        if (cancelledRecordingGenerationsRef.current.delete(generation)) return;
        const stillCurrent = scopeRef.current === scopeKey && recordingGenerationRef.current === generation;
        if (replacing && !stillCurrent) return;
        const draft: LocalHummingDraft = {
          ownerKey,
          sessionId,
          id: crypto.randomUUID(),
          blob: recording.blob,
          mimeType: recording.mimeType,
          durationSeconds: recording.durationSeconds,
          createdAt: Date.now(),
        };

        if (replacing) {
          let persistent = false;
          const replacementSaveController = new AbortController();
          replacementSaveControllerRef.current = {
            scopeKey,
            controller: replacementSaveController,
          };
          try {
            persistent = (await replaceHummingDraftIfPersistent(draft, replacementSaveController.signal)).persistent;
          } catch {
            persistent = false;
          } finally {
            if (replacementSaveControllerRef.current?.controller === replacementSaveController) {
              replacementSaveControllerRef.current = null;
            }
          }
          if (scopeRef.current !== scopeKey || recordingGenerationRef.current !== generation) return;
          const audioUrl = URL.createObjectURL(draft.blob);
          setForScope(scopeKey, (current) => {
            if (!persistent) {
              if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
              return {
                ...current,
                replacementCandidate: draft,
                replacementAudioUrl: audioUrl,
                isStarting: false,
                isRecording: false,
                isFinalizingRecording: false,
                isRerecording: false,
                recordingElapsedSeconds: 0,
                error: 'replacement_storage_unavailable',
              };
            }
            if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
            if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
            return {
              ...current,
              draft,
              audioUrl,
              isPersistent: true,
              replacementCandidate: null,
              replacementAudioUrl: null,
              isStarting: false,
              isRecording: false,
              isFinalizingRecording: false,
              isRerecording: false,
              recordingElapsedSeconds: 0,
              error: null,
            };
          });
          return;
        }

        let persistent = false;
        try {
          const saved = await saveHummingDraft(draft);
          persistent = saved.persistent;
        } catch {
          persistent = false;
        }
        if (!stillCurrent || scopeRef.current !== scopeKey || recordingGenerationRef.current !== generation) return;
        const audioUrl = URL.createObjectURL(draft.blob);
        setForScope(scopeKey, (current) => {
          if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
          return {
            ...current,
            draft,
            audioUrl,
            isPersistent: persistent,
            isStarting: false,
            isRecording: false,
            isFinalizingRecording: false,
            isRerecording: false,
            recordingElapsedSeconds: 0,
            error: null,
          };
        });
      }).catch((error: unknown) => {
        if (recorderRef.current?.session === session) recorderRef.current = null;
        clearRecordingTimer(scopeKey);
        cancelledRecordingGenerationsRef.current.delete(generation);
        if (scopeRef.current !== scopeKey || recordingGenerationRef.current !== generation) return;
        const cancelled = errorCode(error) === 'cancelled';
        setForScope(scopeKey, (current) => ({
          ...current,
          isStarting: false,
          isRecording: false,
          isFinalizingRecording: false,
          isRerecording: false,
          recordingElapsedSeconds: 0,
          error: cancelled ? null : replacing ? 'rerecord_failed' : errorCode(error),
        }));
      });
    }).catch((error: unknown) => {
      cancelledRecordingGenerationsRef.current.delete(generation);
      if (permissionControllerRef.current?.controller === controller) permissionControllerRef.current = null;
      clearRecordingTimer(scopeKey);
      if (scopeRef.current !== scopeKey || recordingGenerationRef.current !== generation) return;
      const cancelled = errorCode(error) === 'cancelled';
      setForScope(scopeKey, (current) => ({
        ...current,
        isStarting: false,
        isRecording: false,
        isFinalizingRecording: false,
        isRerecording: false,
        recordingElapsedSeconds: 0,
        error: cancelled ? null : replacing ? 'rerecord_failed' : errorCode(error),
      }));
    });
  }, [
    busy,
    clearRecordingTimer,
    ownerKey,
    pauseTransport,
    scopeKey,
    sessionId,
    setForScope,
    visibleState.draft,
    visibleState.isFinalizingRecording,
    visibleState.isRecording,
    visibleState.isStarting,
    visibleState.isTranscribing,
    visibleState.isSavingDraft,
    visibleState.isSavingReplacement,
    visibleState.loaded,
    visibleState.replacementCandidate,
  ]);

  const startRecording = useCallback(() => beginRecording('new'), [beginRecording]);
  const reRecord = useCallback(() => beginRecording('replace'), [beginRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.scopeKey === scopeKey) recorderRef.current.session.stop();
  }, [scopeKey]);

  const cancelActiveRecording = useCallback((mode?: 'new' | 'replace') => {
    const permission = permissionControllerRef.current;
    const active = recorderRef.current;
    const matchingPermission = permission?.scopeKey === scopeKey && (!mode || permission.mode === mode);
    const matchingRecorder = active?.scopeKey === scopeKey && (!mode || active.mode === mode);
    if (!matchingPermission && !matchingRecorder) return;
    if (permission?.scopeKey === scopeKey && (!mode || permission.mode === mode)) {
      cancelledRecordingGenerationsRef.current.add(permission.generation);
      permission.controller.abort();
      permissionControllerRef.current = null;
    }
    if (active?.scopeKey === scopeKey && (!mode || active.mode === mode)) {
      cancelledRecordingGenerationsRef.current.add(active.generation);
      active.session.cancel();
      recorderRef.current = null;
    }
    recordingGenerationRef.current += 1;
    clearRecordingTimer(scopeKey);
    setForScope(scopeKey, (current) => ({
      ...current,
      isStarting: false,
      isRecording: false,
      isFinalizingRecording: false,
      isRerecording: false,
      recordingElapsedSeconds: 0,
      error: null,
    }));
  }, [clearRecordingTimer, scopeKey, setForScope]);
  const cancelRecording = useCallback(() => cancelActiveRecording('new'), [cancelActiveRecording]);
  const cancelRerecord = useCallback(() => cancelActiveRecording('replace'), [cancelActiveRecording]);

  const retrySave = useCallback(async (): Promise<boolean> => {
    const draft = visibleState.draft;
    if (!draft || visibleState.isSavingDraft) return false;
    setForScope(scopeKey, (current) => ({ ...current, isSavingDraft: true }));
    try {
      const result = await saveHummingDraft(draft);
      if (scopeRef.current !== scopeKey) return false;
      setForScope(scopeKey, (current) => ({
        ...current,
        isSavingDraft: false,
        isPersistent: result.persistent,
        error: result.persistent ? null : 'storage_unavailable',
      }));
      return result.persistent;
    } catch {
      setForScope(scopeKey, (current) => ({ ...current, isSavingDraft: false, error: 'storage_unavailable' }));
      return false;
    }
  }, [scopeKey, setForScope, visibleState.draft, visibleState.isSavingDraft]);

  const retrySaveReplacement = useCallback(async (): Promise<boolean> => {
    const candidate = visibleState.replacementCandidate;
    if (!candidate || visibleState.isSavingReplacement || replacementSaveControllerRef.current) return false;
    const controller = new AbortController();
    replacementSaveControllerRef.current = { scopeKey, controller };
    setForScope(scopeKey, (current) => ({ ...current, isSavingReplacement: true }));
    try {
      const result = await replaceHummingDraftIfPersistent(candidate, controller.signal);
      if (controller.signal.aborted || scopeRef.current !== scopeKey) return false;
      if (!result.persistent) {
        setForScope(scopeKey, (current) => ({
          ...current,
          isSavingReplacement: false,
          error: 'replacement_storage_unavailable',
        }));
        return false;
      }
      const audioUrl = URL.createObjectURL(candidate.blob);
      setForScope(scopeKey, (current) => {
        if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
        if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
        return {
          ...current,
          draft: candidate,
          audioUrl,
          isPersistent: true,
          isSavingReplacement: false,
          replacementCandidate: null,
          replacementAudioUrl: null,
          error: null,
        };
      });
      return true;
    } catch {
      if (!controller.signal.aborted && scopeRef.current === scopeKey) {
        setForScope(scopeKey, (current) => ({
          ...current,
          isSavingReplacement: false,
          error: 'replacement_storage_unavailable',
        }));
      }
      return false;
    } finally {
      if (replacementSaveControllerRef.current?.controller === controller) {
        replacementSaveControllerRef.current = null;
      }
    }
  }, [scopeKey, setForScope, visibleState.isSavingReplacement, visibleState.replacementCandidate]);

  const useOriginalRecording = useCallback(() => {
    setForScope(scopeKey, (current) => {
      if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
      return {
        ...current,
        replacementCandidate: null,
        replacementAudioUrl: null,
        error: null,
      };
    });
  }, [scopeKey, setForScope]);

  const discard = useCallback(() => {
    if (visibleState.isSavingDraft || visibleState.isSavingReplacement) return;
    if (permissionControllerRef.current?.scopeKey === scopeKey) {
      permissionControllerRef.current.controller.abort();
      permissionControllerRef.current = null;
    }
    const active = recorderRef.current;
    if (active?.scopeKey === scopeKey) {
      active.session.cancel();
      recorderRef.current = null;
    }
    recordingGenerationRef.current += 1;
    clearRecordingTimer(scopeKey);
    transcriptionRef.current?.controller.abort();
    transcriptionRef.current = null;
    transcriptionGenerationRef.current += 1;
    if (sessionId) void discardHummingDraft(ownerKey, sessionId).catch(() => {});
    setForScope(scopeKey, (current) => {
      if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
      if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
      return { ...emptyState(scopeKey, true), isPersistent: current.isPersistent };
    });
  }, [clearRecordingTimer, ownerKey, scopeKey, sessionId, setForScope, visibleState.isSavingDraft, visibleState.isSavingReplacement]);

  const cancelTranscription = useCallback(() => {
    if (transcriptionRef.current?.scopeKey !== scopeKey) return;
    transcriptionRef.current.controller.abort();
    transcriptionRef.current = null;
    transcriptionGenerationRef.current += 1;
    setForScope(scopeKey, (current) => ({
      ...current,
      isTranscribing: false,
      progress: 0,
      progressStage: null,
      error: null,
    }));
  }, [scopeKey, setForScope]);

  const restoreAttachment = useCallback(async (rawAttachment: HummingAttachment): Promise<boolean> => {
    if (!sessionId) return false;
    const attachment = projectHummingAttachment(rawAttachment);
    if (!attachment) return false;

    try {
      const asset = await getHummingAsset(ownerKey, attachment.id);
      if (!asset) {
        setForScope(scopeKey, (current) => ({ ...current, error: 'recording_unavailable' }));
        return false;
      }
      const draft: LocalHummingDraft = {
        ...asset,
        sessionId,
        durationSeconds: attachment.recordingDurationSeconds,
      };
      const saved = await saveHummingDraft(draft);
      if (scopeRef.current !== scopeKey) return false;
      const audioUrl = URL.createObjectURL(draft.blob);
      setForScope(scopeKey, (current) => {
        if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
        if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
        return {
          ...current,
          loaded: true,
          draft,
          audioUrl,
          replacementCandidate: null,
          replacementAudioUrl: null,
          isPersistent: saved.persistent,
          error: null,
        };
      });
      return true;
    } catch {
      setForScope(scopeKey, (current) => ({ ...current, error: 'draft_load_failed' }));
      return false;
    }
  }, [ownerKey, scopeKey, sessionId, setForScope]);

  const submit = useCallback(async (
    text: string,
    entryPoint: Extract<AgentEntryPoint, 'text' | 'suggestion'>,
  ): Promise<boolean> => {
    const draft = visibleState.draft;
    if (
      !draft
      || !sessionId
      || busy
      || visibleState.isTranscribing
      || visibleState.isStarting
      || visibleState.isRecording
      || visibleState.isFinalizingRecording
      || visibleState.isRerecording
      || visibleState.isSavingDraft
      || visibleState.isSavingReplacement
      || visibleState.replacementCandidate
    ) return false;
    if (!visibleState.isPersistent) {
      setForScope(scopeKey, (current) => ({ ...current, error: 'storage_unavailable' }));
      return false;
    }

    const generation = transcriptionGenerationRef.current + 1;
    transcriptionGenerationRef.current = generation;
    const controller = new AbortController();
    transcriptionRef.current = { scopeKey, controller };
    setForScope(scopeKey, (current) => ({
      ...current,
      isTranscribing: true,
      progress: 0,
      progressStage: 'loading',
      error: null,
    }));

    try {
      const pcm = await decodeHummingRecording(draft.blob);
      if (
        controller.signal.aborted
        || scopeRef.current !== scopeKey
        || transcriptionGenerationRef.current !== generation
      ) return false;

      const transcription = await transcribeHumming(pcm.samples, {
        recordingDurationSeconds: draft.durationSeconds,
        sampleRate: pcm.sampleRate,
        signal: controller.signal,
        onProgress(stage, progress) {
          setForScope(scopeKey, (current) => ({
            ...current,
            progressStage: stage,
            progress,
          }));
        },
      });
      if (
        controller.signal.aborted
        || scopeRef.current !== scopeKey
        || transcriptionGenerationRef.current !== generation
      ) return false;

      const attachment: HummingAttachment = {
        kind: 'humming',
        schemaVersion: HUMMING_SCHEMA_VERSION,
        id: draft.id,
        recordingDurationSeconds: draft.durationSeconds,
        trimStartSeconds: transcription.result.trimStartSeconds,
        melodyDurationSeconds: transcription.result.melodyDurationSeconds,
        transcription: {
          engine: 'basic-pitch',
          modelVersion: BASIC_PITCH_MODEL_VERSION,
          preprocessingVersion: HUMMING_PREPROCESSING_VERSION,
          notes: transcription.result.notes,
          warnings: transcription.result.warnings,
        },
      };
      if (new Blob([JSON.stringify(attachment)]).size > HUMMING_MAX_ATTACHMENT_BYTES) {
        throw new HummingTranscriptionError('attachment_too_large');
      }

      const safeAttachment = projectHummingAttachment(attachment);
      if (!safeAttachment) throw new HummingTranscriptionError('invalid_transcription');
      const accepted = await onSend(text, entryPoint, safeAttachment);
      if (accepted === false) return false;
      try {
        await clearHummingDraft(ownerKey, sessionId);
      } catch {
        // The message now has a durable melody reference. A stale draft row is
        // recoverable and must not make the already-accepted turn run twice.
      }
      setForScope(scopeKey, (current) => {
        if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
        if (current.replacementAudioUrl) URL.revokeObjectURL(current.replacementAudioUrl);
        return {
          ...emptyState(scopeKey, true),
          isPersistent: current.isPersistent,
        };
      });
      return true;
    } catch (error) {
      if (scopeRef.current === scopeKey && transcriptionGenerationRef.current === generation) {
        setForScope(scopeKey, (current) => ({
          ...current,
          error: errorCode(error),
        }));
      }
      return false;
    } finally {
      if (transcriptionRef.current?.controller === controller) transcriptionRef.current = null;
      if (scopeRef.current === scopeKey && transcriptionGenerationRef.current === generation) {
        setForScope(scopeKey, (current) => ({
          ...current,
          isTranscribing: false,
          progress: 0,
          progressStage: null,
        }));
      }
    }
  }, [
    busy,
    onSend,
    ownerKey,
    scopeKey,
    sessionId,
    setForScope,
    visibleState.draft,
    visibleState.isFinalizingRecording,
    visibleState.isRecording,
    visibleState.isRerecording,
    visibleState.isSavingDraft,
    visibleState.isSavingReplacement,
    visibleState.isStarting,
    visibleState.isPersistent,
    visibleState.isTranscribing,
    visibleState.replacementCandidate,
  ]);

  return {
    ...visibleState,
    canRecord: Boolean(sessionId) && visibleState.loaded && !busy && !visibleState.draft
      && !visibleState.isStarting && !visibleState.isRecording && !visibleState.isFinalizingRecording
      && !visibleState.isTranscribing,
    startRecording,
    cancelRecording,
    stopRecording,
    reRecord,
    cancelRerecord,
    retrySaveReplacement,
    useOriginalRecording,
    retrySave,
    discard,
    cancelTranscription,
    restoreAttachment,
    submit,
  };
}
