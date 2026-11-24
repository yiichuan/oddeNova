import { useCallback, useEffect, useRef, useState } from 'react';

type PreviewState = { id: string; phase: 'loading' | 'playing' | 'failed' } | null;

export function useSamplePreview(selectedId: string | undefined) {
  const active = useRef<{ id: string; release: () => void } | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);

  const release = useCallback(() => {
    const current = active.current;
    if (!current) return;
    active.current = null;
    current.release();
  }, []);

  const stop = useCallback(() => {
    release();
    setPreview(null);
  }, [release]);

  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      release();
    };
  }, [release, stop]);

  useEffect(() => {
    const current = active.current;
    if (!current || current.id === selectedId) return;
    release();
    // The selection has already changed. Clear its status after releasing the media.
    queueMicrotask(() => setPreview(previous => previous?.id === current.id && !active.current ? null : previous));
  }, [selectedId, release]);

  const play = (id: string, source: string | ((signal: AbortSignal, onEnded: () => void) => Promise<void>)) => {
    if (active.current?.id === id) {
      stop();
      return;
    }
    release();

    const request = { id, release: () => {} };
    active.current = request;
    const fail = () => {
      if (active.current !== request) return;
      release();
      setPreview({ id, phase: 'failed' });
    };
    const ended = () => {
      if (active.current === request) stop();
    };
    setPreview({ id, phase: 'loading' });
    const start = () => {
      if (typeof source !== 'string') {
        const controller = new AbortController();
        request.release = () => controller.abort();
        return source(controller.signal, ended);
      }
      const audio = new Audio();
      request.release = () => {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      };
      audio.onended = ended;
      audio.onerror = fail;
      audio.src = source;
      // Call play in the click handler so mobile browsers see the user gesture.
      return audio.play();
    };
    void start().then(() => {
      if (active.current === request) setPreview({ id, phase: 'playing' });
    }).catch(fail);
  };

  return { preview, play, stop };
}
