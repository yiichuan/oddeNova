// @vitest-environment happy-dom

import { act } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useLayout, type UseLayoutReturn } from '../useLayout';

const VIZ_RATIO_DEFAULT = 1 / (1 + 1.55);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ onValue }: { onValue: (value: UseLayoutReturn) => void }) {
  onValue(useLayout());
  return null;
}

/** The handlers only read clientY/pointerId and capture the pointer. */
function pointerEvent(clientY: number) {
  return {
    clientY,
    pointerId: 1,
    currentTarget: {
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
    },
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

describe('useLayout vertical drag', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  function mount() {
    let latest!: UseLayoutReturn;
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    act(() => root.render(<Probe onValue={(value) => { latest = value; }} />));
    // No `main` element is mounted here, so the drag math falls back to window.
    return {
      get: () => latest,
      min: window.innerHeight * 0.15,
      defaultHeight: window.innerHeight * VIZ_RATIO_DEFAULT,
    };
  }

  it('holds the pane at its minimum height while the divider stays near it', () => {
    const { get, min } = mount();
    const startHeight = get().vizHeight;

    act(() => get().vDragHandlers.onPointerDown(pointerEvent(0)));
    act(() => get().vDragHandlers.onPointerMove(pointerEvent(startHeight - min + 20)));
    act(() => get().vDragHandlers.onPointerUp(pointerEvent(startHeight - min + 20)));

    expect(get().vizCollapsed).toBe(false);
    expect(get().vizHeight).toBeCloseTo(min);
  });

  it('collapses the pane once the divider is dragged well past the minimum', () => {
    const { get, min } = mount();
    const startHeight = get().vizHeight;

    act(() => get().vDragHandlers.onPointerDown(pointerEvent(0)));
    act(() => get().vDragHandlers.onPointerMove(pointerEvent(startHeight - min + 60)));

    expect(get().vizCollapsed).toBe(true);

    act(() => get().vDragHandlers.onPointerUp(pointerEvent(startHeight - min + 60)));
    expect(get().vizCollapsed).toBe(true);
  });

  it('reopens at the default height, not the height it collapsed at', () => {
    const { get, min, defaultHeight } = mount();
    const startHeight = get().vizHeight;

    act(() => get().vDragHandlers.onPointerDown(pointerEvent(0)));
    act(() => get().vDragHandlers.onPointerMove(pointerEvent(startHeight - min + 60)));
    act(() => get().vDragHandlers.onPointerUp(pointerEvent(startHeight - min + 60)));
    expect(get().vizCollapsed).toBe(true);

    act(() => get().toggleVizCollapsed());

    expect(get().vizCollapsed).toBe(false);
    expect(get().vizHeight).toBeCloseTo(defaultHeight);
  });

  it('reopens the pane when the same drag comes back above the minimum', () => {
    const { get, min } = mount();
    const startHeight = get().vizHeight;

    act(() => get().vDragHandlers.onPointerDown(pointerEvent(0)));
    act(() => get().vDragHandlers.onPointerMove(pointerEvent(startHeight - min + 60)));
    expect(get().vizCollapsed).toBe(true);

    act(() => get().vDragHandlers.onPointerMove(pointerEvent(100)));
    expect(get().vizCollapsed).toBe(false);
    expect(get().vizHeight).toBeCloseTo(startHeight - 100);
  });
});
