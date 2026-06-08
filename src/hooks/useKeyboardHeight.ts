import { useEffect, useRef, useState } from 'react';

/**
 * Listen to the on-screen keyboard height (px).
 * Uses the visualViewport API, compatible with both iOS Safari and Android Chrome.
 * Returns 0 when the keyboard is dismissed.
 *
 * Uses debounce to prevent the jitter caused by intermediate frames during
 * the iOS keyboard animation temporarily reporting a larger-than-final height.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Keyboard height = total window height − visual viewport height (offsetTop not subtracted to avoid calculation drift during page scroll)
        const height = Math.max(0, window.innerHeight - vv.height);
        setKeyboardHeight(Math.round(height));
      }, 100);
    };

    // iOS Safari sometimes fires scroll instead of resize when the keyboard appears; listen to both for cross-platform coverage
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return keyboardHeight;
}
