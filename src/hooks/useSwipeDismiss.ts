import { useRef, type TouchEvent } from 'react';

/** Dismiss a side drawer without treating scrolling or long presses as swipes. */
export function useSwipeDismiss(direction: 'left' | 'right', onDismiss: () => void) {
  const origin = useRef<{ x: number; y: number; time: number } | null>(null);
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) {
        origin.current = null;
        return;
      }
      const touch = event.touches[0];
      origin.current = event.touches.length === 1
        ? { x: touch.clientX, y: touch.clientY, time: Date.now() }
        : null;
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const start = origin.current;
      const touch = event.touches[0];
      if (start && (event.touches.length !== 1 || Math.abs(touch.clientY - start.y) > 24)) {
        origin.current = null;
      }
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = origin.current;
      origin.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch || Date.now() - start.time > 600) return;
      const dx = (touch.clientX - start.x) * (direction === 'left' ? -1 : 1);
      if (dx < 56 || dx < Math.abs(touch.clientY - start.y) * 2) return;
      event.preventDefault();
      onDismiss();
    },
    onTouchCancel() { origin.current = null; },
  };
}
