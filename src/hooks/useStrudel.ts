import { useState, useCallback, useEffect, useRef } from 'react';
import { strudelService, type StrudelState } from '../services/strudel';

const MAX_HISTORY = 50;

export function useStrudel() {
  const [state, setState] = useState<StrudelState>(() => ({
    code: '',
    isPlaying: false,
    error: null,
    engineReady: false,
  }));

  const historyRef = useRef<string[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  useEffect(() => {
    const unsub = strudelService.onStateChange(setState);
    return unsub;
  }, []);

  const setRoot = useCallback((el: HTMLDivElement) => {
    strudelService.attach(el);
  }, []);

  // play(code?) — if code provided, set it first then evaluate
  const play = useCallback(async (code?: string) => {
    if (!strudelService.isReady) {
      setState(s => ({ ...s, error: '音频引擎启动中，请稍后再试' }));
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

  const setCode = useCallback((code: string) => {
    strudelService.setCode(code);
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(s => ({ ...s, error }));
  }, []);

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

  return {
    code: state.code,
    currentCode: state.code,
    isPlaying: state.isPlaying,
    engineReady: state.engineReady,
    error: state.error,
    canUndo,
    setRoot,
    play,
    stop,
    setCode,
    setError,
    undo,
    init: stop, // no-op; engine initializes on first attach
  };
}
