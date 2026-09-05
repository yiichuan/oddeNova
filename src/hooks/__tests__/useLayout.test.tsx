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

/** The handlers only read clientX/clientY/pointerId and capture the pointer. */
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

function horizontalPointerEvent(clientX: number) {
  return {
    clientX,
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

describe('useLayout horizontal drag', () => {
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
    return { get: () => latest, min: window.innerWidth * 0.20 };
  }

  it('holds the column at its minimum width while the divider stays near it', () => {
    const { get, min } = mount();
    const startWidth = get().sidebarWidth;

    act(() => get().hDragHandlers.onPointerDown(horizontalPointerEvent(0)));
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 20 - startWidth)));
    act(() => get().hDragHandlers.onPointerUp(horizontalPointerEvent(min - 20 - startWidth)));

    expect(get().sidebarCollapsed).toBe(false);
    expect(get().sidebarWidth).toBeCloseTo(min);
  });

  it('collapses the column once the divider is dragged well past the minimum', () => {
    const { get, min } = mount();
    const startWidth = get().sidebarWidth;

    act(() => get().hDragHandlers.onPointerDown(horizontalPointerEvent(0)));
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 60 - startWidth)));

    expect(get().sidebarCollapsed).toBe(true);

    act(() => get().hDragHandlers.onPointerUp(horizontalPointerEvent(min - 60 - startWidth)));
    expect(get().sidebarCollapsed).toBe(true);
  });

  it('reopens the column when the same drag comes back past the minimum', () => {
    const { get, min } = mount();
    const startWidth = get().sidebarWidth;

    act(() => get().hDragHandlers.onPointerDown(horizontalPointerEvent(0)));
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 60 - startWidth)));
    expect(get().sidebarCollapsed).toBe(true);

    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(0)));
    expect(get().sidebarCollapsed).toBe(false);
    expect(get().sidebarWidth).toBeCloseTo(startWidth);
  });

  it('keeps a closed column closed while the divider hovers on the boundary', () => {
    const { get, min } = mount();
    const startWidth = get().sidebarWidth;

    act(() => get().hDragHandlers.onPointerDown(horizontalPointerEvent(0)));
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 60 - startWidth)));
    expect(get().sidebarCollapsed).toBe(true);

    // Back inside the dead band that sits above the closing boundary: closing
    // and reopening must not trade the column back and forth here.
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 40 - startWidth)));
    expect(get().sidebarCollapsed).toBe(true);
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 20 - startWidth)));
    expect(get().sidebarCollapsed).toBe(true);
  });

  it('reopens a collapsed column on a short pull, not a full minimum width', () => {
    const { get, min } = mount();
    const startWidth = get().sidebarWidth;

    act(() => get().hDragHandlers.onPointerDown(horizontalPointerEvent(0)));
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(min - 60 - startWidth)));
    act(() => get().hDragHandlers.onPointerUp(horizontalPointerEvent(min - 60 - startWidth)));
    expect(get().sidebarCollapsed).toBe(true);

    // The drag starts from zero, so these are distances travelled, not widths.
    act(() => get().hDragHandlers.onPointerDown(horizontalPointerEvent(0)));
    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(40)));
    expect(get().sidebarCollapsed).toBe(true);

    act(() => get().hDragHandlers.onPointerMove(horizontalPointerEvent(60)));
    expect(get().sidebarCollapsed).toBe(false);
    expect(get().sidebarWidth).toBeCloseTo(min);
  });
});
