// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useSwipeDismiss } from '../useSwipeDismiss';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('side drawer swipes', () => {
  it.each(['left', 'right'] as const)('dismisses only a deliberate %s swipe', (direction) => {
    const dismiss = vi.fn();
    function Drawer() {
      return <div {...useSwipeDismiss(direction, dismiss)} />;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Drawer />));
    const panel = container.firstElementChild!;
    const touch = (type: string, x: number, y: number, count = 1) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        touches: Array.from({ length: count }, () => ({ clientX: x, clientY: y })),
        changedTouches: [{ clientX: x, clientY: y }],
      });
      act(() => { panel.dispatchEvent(event); });
    };
    const dx = direction === 'left' ? -100 : 100;
    try {
      touch('touchstart', 150, 100);
      touch('touchend', 150 - dx, 100); // Wrong direction.
      touch('touchstart', 150, 100);
      touch('touchend', 160, 100); // Tap jitter.
      touch('touchstart', 150, 100);
      touch('touchmove', 150 + dx, 150); // Vertical scroll locks the gesture out.
      touch('touchend', 150 + dx, 100);
      touch('touchstart', 150, 100, 2); // Pinch.
      touch('touchend', 150 + dx, 100);
      touch('touchstart', 150, 100);
      touch('touchcancel', 150, 100);
      touch('touchend', 150 + dx, 100);
      expect(dismiss).not.toHaveBeenCalled();
      touch('touchstart', 150, 100);
      touch('touchend', 150 + dx, 106);
      expect(dismiss).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
    }
  });
});
