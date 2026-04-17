import { useState, useCallback, useRef, useEffect } from 'react';
import {
  isSpeechSupported,
  createRecognition,
  startListening,
  stopListening,
} from '../services/speech';

export function useSpeech(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [supported] = useState(isSpeechSupported);
  const callbackRef = useRef(onResult);

  callbackRef.current = onResult;

  useEffect(() => {
    if (!supported) return;
    createRecognition(
      (text) => callbackRef.current(text),
      () => setIsListening(false)
    );
  }, [supported]);

  const start = useCallback(() => {
    if (!supported) return;
    setIsListening(true);
    startListening();
  }, [supported]);

  const stop = useCallback(() => {
    stopListening();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return { isListening, supported, start, stop, toggle };
}
