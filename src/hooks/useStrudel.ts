import { useState, useCallback, useEffect, useRef } from 'react';
import { getEngineUnavailableMessage } from '../lib/engine-status';
import { getErrorMessage } from '../lib/errors';
import { t } from '../lib/i18n';
import { strudelService, type StrudelState } from '../services/strudel';

const MAX_HISTORY = 50;

export function useStrudel() {
  const [state, setState] = useState<StrudelState>(() => ({
    code: '',
    isPlaying: false,
    isPaused: false,
    error: null,
    engineReady: false,
    engineStatus: 'initializing',
  }));

  const historyRef = useRef<string[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  const [exportState, setExportState] = useState<{
    status: 'idle' | 'exporting' | 'error';
    progress: number;
    error?: string;
  }>({ status: 'idle', progress: 0 });

  useEffect(() => {
    const unsub = strudelService.onStateChange(setState);
    return unsub;
  }, []);

  const setRoot = useCallback((el: HTMLDivElement) => {
    void strudelService.attach(el).catch(() => {});
  }, []);

  // play(code?) — if code provided, set it first then evaluate
  const play = useCallback(async (code?: string) => {
    if (!strudelService.isReady) {
      setState(s => ({
        ...s,
        error: getEngineUnavailableMessage(s.engineStatus) ?? t('engineStarting'),
      }));
      return false;
    }
    try {
      const currentCode = strudelService.code;
      if (code !== undefined && code !== currentCode) {
        strudelService.setCode(code);
      }
      if (currentCode) {
        historyRef.current.push(currentCode);
        if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
        setHistoryLen(historyRef.current.length);
      }
      await strudelService.play();
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    strudelService.stop();
  }, []);

  const pause = useCallback(() => {
    strudelService.pause();
  }, []);

  const setCode = useCallback((code: string) => {
    strudelService.setCode(code);
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(s => ({ ...s, error }));
  }, []);

  const reinit = useCallback(() => strudelService.reinit(), []);

  const undo = useCallback(async () => {
    const prev = historyRef.current.pop();
    setHistoryLen(historyRef.current.length);
    if (prev) {
      strudelService.setCode(prev);
      await strudelService.play();
    } else {
      strudelService.stop();
      strudelService.setCode('');
    }
  }, []);

  const canUndo = historyLen > 0 || state.code !== '';

  // Export current pattern to WAV.
  // NOTE: After this returns (success OR error), the underlying audio graph is rebuilt and
  // master volume / LPF are at their defaults. The caller (CodePanel) must re-apply the
  // current UI values via strudelService.setMasterVolume / setMasterLPF.
  const exportWav = useCallback(
    async (params: { filename: string; beginCycle: number; endCycle: number; sampleRate: number }): Promise<boolean> => {
      setExportState({ status: 'exporting', progress: 0 });
      try {
        await strudelService.exportWav({
          ...params,
          onProgress: (p) => setExportState((s) => ({ ...s, progress: p })),
        });
        setExportState((s) => ({ ...s, progress: 1 }));
        return true;
      } catch (e) {
        const message = getErrorMessage(e);
        setExportState({ status: 'error', progress: 0, error: message });
        return false;
      }
    },
    [],
  );

  const resetExportState = useCallback(() => {
    setExportState({ status: 'idle', progress: 0 });
  }, []);

  return {
    code: state.code,
    currentCode: state.code,
    isPlaying: state.isPlaying,
    isPaused: state.isPaused,
    engineReady: state.engineReady,
    engineStatus: state.engineStatus,
    error: state.error,
    canUndo,
    setRoot,
    play,
    pause,
    stop,
    setCode,
    setError,
    undo,
    init: stop, // no-op; engine initializes on first attach
    reinit,
    exportState,
    exportWav,
    resetExportState,
    scrollCodeToBottom: () => strudelService.scrollCodeToBottom(),
    scrollCodeToPosition: (pos: number) => strudelService.scrollCodeToPosition(pos),
    scrollCodeToBottomEased: (ms: number) => strudelService.scrollCodeToBottomEased(ms),
    // [video] Frame-driven scroll for Remotion rendering (VIDEO_SCROLL_PROGRESS); unused in normal app flow
    scrollCodeToBottomProgress: (p: number) => strudelService.scrollCodeToBottomProgress(p),
    triggerFadeIn: () => strudelService.triggerFadeIn(),
    // [video] Allow App.tsx's postMessage handler to inject Remotion frame time into the Strudel scheduler, driving the highlight box
    setVideoTime: (t: number) => strudelService.setVideoTime(t),
  };
}
