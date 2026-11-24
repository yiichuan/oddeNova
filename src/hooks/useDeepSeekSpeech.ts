import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getAudioRecorderOptions, supportsAudioRecording, transcribeWithDeepSeek } from '../services/deepseek-asr';

export type DeepSeekSpeechMode = 'idle' | 'recording' | 'transcribing';

const MAX_RECORDING_SECONDS = 119;

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function recordingError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'MIC_PERMISSION_DENIED';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'MIC_NOT_FOUND';
  return error instanceof Error ? error.message : 'RECORDING_FAILED';
}

export function useDeepSeekSpeech(onResult: (text: string) => void) {
  const [mode, setMode] = useState<DeepSeekSpeechMode>('idle');
  const [isStarting, setIsStarting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(supportsAudioRecording);
  const resultCallbackRef = useRef(onResult);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const startingRef = useRef(false);
  const stopRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    resultCallbackRef.current = onResult;
  });

  const stop = useCallback(() => {
    if (mode !== 'recording') return;
    setStartedAt(null);
    setMode('transcribing');
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      setError('RECORDER_NOT_ACTIVE');
      setMode('idle');
      return;
    }
    try {
      recorder.stop();
    } catch (caught) {
      setError(recordingError(caught));
      setMode('idle');
      stopTracks(streamRef.current);
      streamRef.current = null;
    }
  }, [mode]);
  stopRef.current = stop;

  useEffect(() => {
    if (mode !== 'recording' || startedAt === null) return;
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(Math.min(elapsed, MAX_RECORDING_SECONDS));
      if (elapsed >= MAX_RECORDING_SECONDS) stopRef.current();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [mode, startedAt]);

  const start = useCallback(async (apiKey: string) => {
    if (!supported || startingRef.current || mode !== 'idle') return;

    startingRef.current = true;
    setIsStarting(true);
    setError(null);
    const sessionId = ++sessionRef.current;
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessionId !== sessionRef.current) {
        stopTracks(stream);
        return;
      }

      const recorder = new MediaRecorder(stream, getAudioRecorderOptions());
      const chunks: Blob[] = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (sessionId !== sessionRef.current) return;
        sessionRef.current += 1;
        setError('RECORDING_FAILED');
        setMode('idle');
        setStartedAt(null);
        stopTracks(stream);
        if (streamRef.current === stream) streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
      };
      recorder.onstop = () => {
        stopTracks(stream);
        if (streamRef.current === stream) streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
        if (sessionId !== sessionRef.current) return;

        if (chunks.length === 0) {
          setError('EMPTY_RECORDING');
          setMode('idle');
          setStartedAt(null);
          setElapsedSeconds(0);
          return;
        }

        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const controller = new AbortController();
        abortControllerRef.current = controller;
        void transcribeWithDeepSeek(audio, apiKey, controller.signal)
          .then((text) => {
            if (sessionId === sessionRef.current) resultCallbackRef.current(text);
          })
          .catch((caught: unknown) => {
            if (sessionId === sessionRef.current && !controller.signal.aborted) {
              setError(caught instanceof Error ? caught.message : 'TRANSCRIPTION_FAILED');
            }
          })
          .finally(() => {
            if (abortControllerRef.current === controller) abortControllerRef.current = null;
            if (sessionId === sessionRef.current) {
              setMode('idle');
              setStartedAt(null);
              setElapsedSeconds(0);
            }
          });
      };

      recorder.start(250);
      setElapsedSeconds(0);
      setStartedAt(Date.now());
      setMode('recording');
    } catch (caught) {
      if (sessionId === sessionRef.current) {
        setError(recordingError(caught));
        setMode('idle');
        setStartedAt(null);
      }
      stopTracks(stream);
      if (streamRef.current === stream) streamRef.current = null;
      recorderRef.current = null;
    } finally {
      if (sessionId === sessionRef.current) {
        startingRef.current = false;
        setIsStarting(false);
      }
    }
  }, [mode, supported]);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    startingRef.current = false;
    setIsStarting(false);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* The stream is stopped below either way. */ }
      }
    }
    recorderRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
    setMode('idle');
    setStartedAt(null);
    setElapsedSeconds(0);
    setError(null);
  }, []);

  useEffect(() => () => {
    sessionRef.current += 1;
    abortControllerRef.current?.abort();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* The stream is stopped below either way. */ }
      }
    }
    stopTracks(streamRef.current);
  }, []);

  return { mode, isStarting, elapsedSeconds, error, supported, streamRef, start, stop, cancel, clearError: () => setError(null) };
}
