import { useCallback, useEffect, useRef, useState } from 'react';

type PreviewState = { id: string; phase: 'loading' | 'playing' | 'failed' } | null;

export function useSamplePreview(selectedId: string | undefined) {
  const active = useRef<{ id: string; audio: HTMLAudioElement } | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);

  const release = useCallback(() => {
    const current = active.current;
    if (!current) return;
    active.current = null;
    current.audio.onended = null;
    current.audio.onerror = null;
    current.audio.pause();
    current.audio.removeAttribute('src');
    current.audio.load();
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

  const play = (id: string, url: string) => {
    if (active.current?.id === id) {
      stop();
      return;
    }
    release();

    const audio = new Audio();
    active.current = { id, audio };
    const fail = () => {
      if (active.current?.audio !== audio) return;
      release();
      setPreview({ id, phase: 'failed' });
    };
    audio.onended = () => {
      if (active.current?.audio === audio) stop();
    };
    audio.onerror = fail;
    setPreview({ id, phase: 'loading' });
    audio.src = url;
    // Call play in the click handler so mobile browsers see the user gesture.
    void audio.play().then(() => {
      if (active.current?.audio === audio) setPreview({ id, phase: 'playing' });
    }).catch(fail);
  };

  return { preview, play, stop };
}
