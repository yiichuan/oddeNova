import { useEffect, useState } from 'react';
import { normalizeDevicePixelRatio } from '../lib/track-preview-canvas';

/**
 * The display's real device pixel ratio as React state, subscribed once per
 * panel. Changes fire through `matchMedia('(resolution: …)')` so moving the
 * window between monitors of different densities triggers a deterministic
 * redraw; window resizes and page visibility re-sample the value, and a
 * re-read that equals the current state never re-renders.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => normalizeDevicePixelRatio(
    typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let disposed = false;
    let media: MediaQueryList | null = null;
    let onMediaChange: (() => void) | null = null;

    const read = (): number => normalizeDevicePixelRatio(
      typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
    );

    const resample = (): void => {
      if (disposed) return;
      const next = read();
      // Identity never updates React state: resampling is cheap, renders are not.
      setDpr(previous => (previous === next ? previous : next));
      // Re-register against the current value so the next crossing matches.
      const query = `(resolution: ${next}dppx)`;
      if (media && onMediaChange && media.media === query) return;
      if (media && onMediaChange) media.removeEventListener('change', onMediaChange);
      media = window.matchMedia(query);
      onMediaChange = () => {
        // The matched resolution changed: drop this listener, resample and
        // subscribe to the new ratio in one pass.
        if (media && onMediaChange) media.removeEventListener('change', onMediaChange);
        media = null;
        onMediaChange = null;
        resample();
      };
      media.addEventListener('change', onMediaChange);
    };

    const onResize = (): void => resample();
    const onVisibility = (): void => {
      if (document.visibilityState !== 'hidden') resample();
    };

    resample();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      if (media && onMediaChange) media.removeEventListener('change', onMediaChange);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return dpr;
}
