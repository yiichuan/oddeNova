// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHummingInput } from '../useHummingInput';
import { hummingAttachment, hummingDraft } from '../../lib/__tests__/fixtures/humming';

const mocks = vi.hoisted(() => ({
  getHummingDraft: vi.fn(), saveHummingDraft: vi.fn(), clearHummingDraft: vi.fn(),
  discardHummingDraft: vi.fn(), getHummingAsset: vi.fn(),
  replaceHummingDraftIfPersistent: vi.fn(), startHummingRecording: vi.fn(),
  decodeHummingRecording: vi.fn(), transcribeHumming: vi.fn(),
}));
vi.mock('../../lib/humming-storage', () => mocks);
vi.mock('../../lib/session-storage', () => ({ isSessionStoragePersistent: () => true }));
vi.mock('../../services/humming-recorder', () => ({ startHummingRecording: mocks.startHummingRecording }));
vi.mock('../../services/humming-audio', () => ({ decodeHummingRecording: mocks.decodeHummingRecording }));
vi.mock('../../services/humming-transcriber', async (original) => ({
  ...await original<typeof import('../../services/humming-transcriber')>(),
  transcribeHumming: mocks.transcribeHumming,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: Root[] = [];

async function renderHook() {
  let hook: ReturnType<typeof useHummingInput>;
  let sessionId: string | null = 'source';
  const onSend = vi.fn(() => true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  function Probe() {
    const value = useHummingInput({ ownerKey: 'guest', sessionId, busy: false, pauseTransport: vi.fn(), onSend });
    useEffect(() => { hook = value; });
    return null;
  }
  await act(async () => { root.render(createElement(Probe)); });
  return {
    getHook: () => hook!,
    onSend,
    async switchSession(nextSessionId: string | null) {
      sessionId = nextSessionId;
      await act(async () => { root.render(createElement(Probe)); });
    },
  };
}

function configureRecorderSession() {
  let resolveRecording: (recording: { blob: Blob; mimeType: string; durationSeconds: number }) => void = () => {};
  let rejectRecording: (error: Error) => void = () => {};
  let notifyStopping: (() => void) | undefined;
  const recording = new Promise<{ blob: Blob; mimeType: string; durationSeconds: number }>((resolve, reject) => {
    resolveRecording = resolve;
    rejectRecording = reject;
  });
  const session = {
    recording,
    stop: vi.fn(() => notifyStopping?.()),
    cancel: vi.fn(() => rejectRecording(new Error('cancelled'))),
  };
  mocks.startHummingRecording.mockImplementation((_signal, options) => {
    notifyStopping = options?.onStopping;
    return Promise.resolve(session);
  });
  return {
    session,
    finish() {
      resolveRecording({
        blob: new Blob(['new take'], { type: 'audio/webm' }),
        mimeType: 'audio/webm',
        durationSeconds: 4.5,
      });
    },
  };
}

describe('useHummingInput resets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHummingDraft.mockResolvedValue(hummingDraft());
    mocks.clearHummingDraft.mockResolvedValue(undefined);
    mocks.discardHummingDraft.mockResolvedValue(undefined);
    mocks.replaceHummingDraftIfPersistent.mockResolvedValue({ persistent: true });
    mocks.decodeHummingRecording.mockResolvedValue({ samples: new Float32Array(8), sampleRate: 22050 });
    const attachment = hummingAttachment();
    mocks.transcribeHumming.mockResolvedValue({ result: {
      trimStartSeconds: attachment.trimStartSeconds,
      melodyDurationSeconds: attachment.melodyDurationSeconds,
      notes: attachment.transcription.notes, warnings: [],
    } });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('can record again after discarding a draft in the same session', async () => {
    const { getHook } = await renderHook();
    expect(getHook().draft).not.toBeNull();
    await act(async () => { getHook().discard(); });
    expect(getHook().draft).toBeNull();
    expect(getHook().canRecord).toBe(true);
    expect(mocks.getHummingDraft).toHaveBeenCalledTimes(1);
  });

  it('can record again after sending a draft in the same session', async () => {
    const { getHook, onSend } = await renderHook();
    await act(async () => { expect(await getHook().submit('', 'text')).toBe(true); });
    expect(onSend).toHaveBeenCalledOnce();
    expect(mocks.clearHummingDraft).toHaveBeenCalledWith('guest', 'source');
    expect(getHook().draft).toBeNull();
    expect(getHook().canRecord).toBe(true);
  });

  it('retains the draft and does not send when transcription fails schema validation', async () => {
    mocks.transcribeHumming.mockResolvedValue({ result: {
      trimStartSeconds: 0, melodyDurationSeconds: 1,
      notes: [{ pitchMidi: 60, startSeconds: 0, durationSeconds: 0.5, pitchBendsCents: Array(25).fill(1) }],
      warnings: [],
    } });
    const { getHook, onSend } = await renderHook();
    await act(async () => { expect(await getHook().submit('', 'text')).toBe(false); });
    expect(onSend).not.toHaveBeenCalled();
    expect(mocks.clearHummingDraft).not.toHaveBeenCalled();
    expect(getHook().draft).not.toBeNull();
    expect(getHook().isTranscribing).toBe(false);
    expect(getHook().error).toBe('invalid_transcription');
  });

  it('shows one finalizing state and replaces the original only after a durable re-record save', async () => {
    const recorder = configureRecorderSession();
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:original')
      .mockReturnValueOnce('blob:replacement');
    const { getHook } = await renderHook();

    await act(async () => {
      getHook().reRecord();
      await Promise.resolve();
    });
    expect(getHook().draft?.id).toBe(hummingDraft().id);
    expect(getHook().isRecording).toBe(true);
    expect(getHook().isRerecording).toBe(true);

    act(() => getHook().stopRecording());
    expect(getHook().isFinalizingRecording).toBe(true);
    expect(getHook().isRecording).toBe(false);
    await act(async () => {
      recorder.finish();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.replaceHummingDraftIfPersistent).toHaveBeenCalledOnce();
    expect(getHook().draft?.id).not.toBe(hummingDraft().id);
    expect(getHook().audioUrl).toBe('blob:replacement');
    expect(getHook().replacementCandidate).toBeNull();
    expect(getHook().isRerecording).toBe(false);
    expect(getHook().isFinalizingRecording).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original');
  });

  it('keeps the original draft and blocks sending when a replacement cannot be saved', async () => {
    const recorder = configureRecorderSession();
    mocks.replaceHummingDraftIfPersistent.mockResolvedValueOnce({ persistent: false });
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:original')
      .mockReturnValueOnce('blob:candidate');
    const { getHook, onSend } = await renderHook();

    await act(async () => {
      getHook().reRecord();
      await Promise.resolve();
    });
    act(() => getHook().stopRecording());
    await act(async () => {
      recorder.finish();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getHook().draft?.id).toBe(hummingDraft().id);
    expect(getHook().audioUrl).toBe('blob:original');
    expect(getHook().replacementCandidate).not.toBeNull();
    expect(getHook().replacementAudioUrl).toBe('blob:candidate');
    await act(async () => { expect(await getHook().submit('', 'text')).toBe(false); });
    expect(onSend).not.toHaveBeenCalled();

    act(() => getHook().useOriginalRecording());
    expect(getHook().replacementCandidate).toBeNull();
    expect(getHook().audioUrl).toBe('blob:original');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:candidate');
  });

  it('restores the existing draft when re-recording cannot start', async () => {
    mocks.startHummingRecording.mockRejectedValueOnce(new Error('permission denied'));
    const { getHook } = await renderHook();

    await act(async () => {
      getHook().reRecord();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getHook().draft?.id).toBe(hummingDraft().id);
    expect(getHook().isRerecording).toBe(false);
    expect(getHook().error).toBe('rerecord_failed');
  });

  it('can retry saving the replacement and promote it only after durable success', async () => {
    const recorder = configureRecorderSession();
    mocks.replaceHummingDraftIfPersistent
      .mockResolvedValueOnce({ persistent: false })
      .mockResolvedValueOnce({ persistent: true });
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:original')
      .mockReturnValueOnce('blob:candidate')
      .mockReturnValueOnce('blob:saved-candidate');
    const { getHook } = await renderHook();

    await act(async () => {
      getHook().reRecord();
      await Promise.resolve();
    });
    act(() => getHook().stopRecording());
    await act(async () => {
      recorder.finish();
      await Promise.resolve();
      await Promise.resolve();
    });
    const candidateId = getHook().replacementCandidate?.id;
    expect(candidateId).toBeTruthy();

    await act(async () => { expect(await getHook().retrySaveReplacement()).toBe(true); });

    expect(getHook().draft?.id).toBe(candidateId);
    expect(getHook().audioUrl).toBe('blob:saved-candidate');
    expect(getHook().replacementCandidate).toBeNull();
    expect(getHook().isSavingReplacement).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:candidate');
  });

  it('aborts an in-flight replacement save when the conversation scope changes', async () => {
    const recorder = configureRecorderSession();
    let replacementSignal: AbortSignal | undefined;
    mocks.replaceHummingDraftIfPersistent.mockImplementation((_draft, signal) => {
      replacementSignal = signal;
      return new Promise((resolve) => {
        signal?.addEventListener('abort', () => resolve({ persistent: false }), { once: true });
      });
    });
    mocks.getHummingDraft.mockImplementation(async (_ownerKey, requestedSessionId) => (
      requestedSessionId === 'source' ? hummingDraft() : null
    ));
    const { getHook, switchSession } = await renderHook();

    await act(async () => {
      getHook().reRecord();
      await Promise.resolve();
    });
    act(() => getHook().stopRecording());
    await act(async () => {
      recorder.finish();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(replacementSignal?.aborted).toBe(false);

    await switchSession('other');

    expect(replacementSignal?.aborted).toBe(true);
    expect(getHook().draft).toBeNull();
    expect(getHook().replacementCandidate).toBeNull();
  });

  it('releases a failed replacement candidate when its conversation scope changes', async () => {
    const recorder = configureRecorderSession();
    mocks.replaceHummingDraftIfPersistent.mockResolvedValueOnce({ persistent: false });
    mocks.getHummingDraft.mockImplementation(async (_ownerKey, requestedSessionId) => (
      requestedSessionId === 'source' ? hummingDraft() : null
    ));
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:original')
      .mockReturnValueOnce('blob:candidate');
    const { getHook, switchSession } = await renderHook();

    await act(async () => {
      getHook().reRecord();
      await Promise.resolve();
    });
    act(() => getHook().stopRecording());
    await act(async () => {
      recorder.finish();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getHook().replacementCandidate).not.toBeNull();

    await switchSession('other');

    expect(getHook().replacementCandidate).toBeNull();
    expect(getHook().draft).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:candidate');
  });

  it('derives elapsed time from the clock and caps its display at the recording limit', async () => {
    configureRecorderSession();
    let tick: (() => void) | undefined;
    const originalSetInterval = window.setInterval;
    Object.defineProperty(window, 'setInterval', {
      configurable: true,
      value: (handler: TimerHandler) => {
        if (typeof handler === 'function') tick = handler as () => void;
        return 1;
      },
    });
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    try {
      const { getHook } = await renderHook();

      await act(async () => {
        getHook().reRecord();
        await Promise.resolve();
      });
      now.mockReturnValue(12_600);
      act(() => tick?.());
      expect(getHook().recordingElapsedSeconds).toBe(12);
      now.mockReturnValue(35_100);
      act(() => tick?.());
      expect(getHook().recordingElapsedSeconds).toBe(30);

      act(() => getHook().cancelRerecord());
    } finally {
      Object.defineProperty(window, 'setInterval', { configurable: true, value: originalSetInterval });
    }
  });
});
