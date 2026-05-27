// src/hooks/useLongPress.ts
import { useRef, useCallback, useEffect } from 'react';

/**
 * Returns touch event handlers that fire `onLongPress` after the touch
 * has been held for `delay` ms without moving (moving = scroll intent).
 */
export function useLongPress(onLongPress: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref so the closure always calls the latest callback
  const callbackRef = useRef(onLongPress);
  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const onTouchStart = useCallback(() => {
    timerRef.current = setTimeout(() => {
      callbackRef.current();
    }, delay);
  }, [delay]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart,
    onTouchEnd: cancel,
    onTouchMove: cancel,
  };
}
