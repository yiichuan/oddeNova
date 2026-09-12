// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeaturedTiltSurface from '../FeaturedTiltSurface';
import { TILT_RANGE_DEG } from '../featured-device-tilt';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];
let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    // A phone: no cursor, and no reduced-motion preference.
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

/** Run the animation out until the smoothing has arrived where it is going. */
function settleFrames(steps = 400) {
  for (let step = 0; step < steps && frames.length > 0; step += 1) {
    const pending = frames.splice(0);
    now += 64;
    act(() => { for (const frame of pending) frame(now); });
  }
}

function render(active = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(
    <FeaturedTiltSurface active={active} room="space">
      <div />
    </FeaturedTiltSurface>,
  ));
  const surface = container.querySelector<HTMLElement>('[data-testid="featured-tilt-surface"]')!;
  return { container, surface };
}

/** A reading, as the window delivers one. */
function tip(gamma: number, beta: number) {
  const event = new Event('deviceorientation') as DeviceOrientationEvent & {
    gamma: number | null;
    beta: number | null;
  };
  Object.assign(event, { gamma, beta, alpha: 0 });
  act(() => { window.dispatchEvent(event); });
}

const deg = (surface: HTMLElement, axis: 'x' | 'y') =>
  Number.parseFloat(surface.style.getPropertyValue(`--tilt-${axis}`));

describe('FeaturedTiltSurface answering the device', () => {
  it('leans in proportion to the turn, once — a small turn is visible', () => {
    const { surface } = render();

    // The first reading is the posture the phone is being held in, not a turn.
    tip(0, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(0, 3);

    /* Half the range is half the lean. The bug this covers multiplied the angle
       by a strength derived from the same turn, so half the range came out as
       roughly a third of it and a two-degree tip was invisible. */
    tip(TILT_RANGE_DEG / 2, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(4, 1);

    // And a two-degree tip is a tenth of the lean rather than a hundredth.
    tip(2, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(0.8, 1);
  });

  it('stops at eight degrees however far the phone is turned', () => {
    const { surface } = render();
    tip(0, 0);
    tip(90, -90);
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(8, 1);
    // Front-back leans the other way round: the top edge going away tips it back.
    expect(deg(surface, 'x')).toBeCloseTo(8, 1);
  });

  it('lights the artwork by how far it has been turned, and not at all at rest', () => {
    const { surface } = render();
    tip(0, 0);
    settleFrames();
    expect(Number(surface.style.getPropertyValue('--tilt-highlight-opacity'))).toBeCloseTo(0, 3);

    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    expect(Number(surface.style.getPropertyValue('--tilt-highlight-opacity'))).toBeGreaterThan(0.1);
  });

  it('ignores a reading with nothing in it', () => {
    const { surface } = render();
    tip(0, 0);
    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    const leaning = deg(surface, 'y');

    const empty = new Event('deviceorientation') as DeviceOrientationEvent;
    Object.assign(empty, { gamma: null, beta: null });
    act(() => { window.dispatchEvent(empty); });
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(leaning, 3);
  });

  it('does not answer a sleeve that is not the one in the centre', () => {
    const { surface } = render(false);
    tip(0, 0);
    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBe(0);
  });

  it('stays square where reduced motion is asked for', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { surface } = render();
    tip(0, 0);
    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBe(0);
  });

  it('lets a finger on a hybrid device alone rather than squaring the sleeve', () => {
    // Both hands present: a fine pointer *and* the orientation event.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('hover'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { surface } = render();
    tip(0, 0);
    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    const leaning = deg(surface, 'y');
    expect(leaning).toBeCloseTo(8, 1);

    const touch = new Event('pointermove') as PointerEvent;
    Object.assign(touch, { pointerType: 'touch', clientX: -500, clientY: -500 });
    act(() => { window.dispatchEvent(touch); });
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(leaning, 1);
  });

  it('takes its baseline again after the page has been away', () => {
    const { surface } = render();
    tip(0, 0);
    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(8, 1);

    // Back from the background, held at the angle it was left at: square again,
    // rather than stuck leaning at a turn the reader is no longer making.
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    tip(TILT_RANGE_DEG, 0);
    settleFrames();
    expect(deg(surface, 'y')).toBeCloseTo(0, 1);
  });

  it('lets go of the window when it goes away', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { surface } = render();
    tip(0, 0);
    tip(TILT_RANGE_DEG, 0);
    settleFrames();

    act(() => { roots.splice(0).forEach((root) => root.unmount()); });
    expect(remove).toHaveBeenCalledWith('deviceorientation', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('orientationchange', expect.any(Function));
    // And the surface is left standing square rather than mid-lean.
    expect(deg(surface, 'y')).toBe(0);
  });
});
