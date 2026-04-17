import { useState, useCallback, useRef } from 'react';
import { initEngine, evaluateCode, stopPlayback, isInitialized } from '../services/strudel';

const MAX_HISTORY = 50;

export function useStrudel() {
  const [currentCode, setCurrentCode] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);

  const init = useCallback(async () => {
    try {
      await initEngine();
      setEngineReady(true);
      setError(null);
    } catch (e: any) {
      setError('Failed to initialize audio engine');
    }
  }, []);

  const play = useCallback(async (code: string) => {
    if (!isInitialized()) {
      setError('Engine not initialized. Click anywhere to start.');
      return false;
    }

    const result = await evaluateCode(code);
    if (result.success) {
      if (currentCode) {
        historyRef.current.push(currentCode);
        if (historyRef.current.length > MAX_HISTORY) {
          historyRef.current.shift();
        }
      }
      setCurrentCode(code);
      setIsPlaying(true);
      setError(null);
      return true;
    } else {
      setError(result.error || 'Failed to evaluate code');
      return false;
    }
  }, [currentCode]);

  const stop = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
    setError(null);
  }, []);

  const undo = useCallback(async () => {
    const prev = historyRef.current.pop();
    if (prev) {
      const result = await evaluateCode(prev);
      if (result.success) {
        setCurrentCode(prev);
        setIsPlaying(true);
        setError(null);
      }
    } else {
      stopPlayback();
      setCurrentCode('');
      setIsPlaying(false);
    }
  }, []);

  const canUndo = historyRef.current.length > 0 || currentCode !== '';

  return {
    currentCode,
    isPlaying,
    engineReady,
    error,
    canUndo,
    init,
    play,
    stop,
    undo,
    setError,
  };
}
