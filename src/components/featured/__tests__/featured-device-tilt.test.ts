// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TILT_RANGE_DEG,
  deviceTiltNeedsPermission,
  deviceTiltState,
  orientationReading,
  requestDeviceTilt,
  resetDeviceTiltStateForTests,
  screenOrientationAngle,
  screenTiltReading,
  subscribeDeviceTiltState,
  tiltFromReading,
} from '../featured-device-tilt';

/** The event, as far as this module reads one. */
const reading = (gamma: unknown, beta: unknown) =>
  ({ gamma, beta } as unknown as DeviceOrientationEvent);

/** Stand a DeviceOrientationEvent up, with or without the iOS permission gate. */
function installOrientation(options: { gate?: () => Promise<string> } = {}) {
  const constructor = options.gate
    ? Object.assign(function DeviceOrientationEvent() {}, { requestPermission: options.gate })
    : function DeviceOrientationEvent() {};
  vi.stubGlobal('DeviceOrientationEvent', constructor);
}

beforeEach(() => {
  resetDeviceTiltStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDeviceTiltStateForTests();
});

describe('asking for the readings', () => {
  it('is unsupported, and stays unsupported, where there is no event', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    expect(deviceTiltState()).toBe('unsupported');
    expect(deviceTiltNeedsPermission()).toBe(false);
    await expect(requestDeviceTilt()).resolves.toBe('unsupported');
  });

  it('needs no permission where the events simply arrive', async () => {
    installOrientation();
    expect(deviceTiltNeedsPermission()).toBe(false);
    await expect(requestDeviceTilt()).resolves.toBe('granted');
    expect(deviceTiltState()).toBe('granted');
  });

  it('grants once and reuses the answer rather than asking twice', async () => {
    const gate = vi.fn(async () => 'granted');
    installOrientation({ gate });
    expect(deviceTiltNeedsPermission()).toBe(true);

    await expect(requestDeviceTilt()).resolves.toBe('granted');
    await expect(requestDeviceTilt()).resolves.toBe('granted');
    expect(gate).toHaveBeenCalledTimes(1);
    expect(deviceTiltNeedsPermission()).toBe(false);
  });

  it('keeps a refusal and never nags', async () => {
    const gate = vi.fn(async () => 'denied');
    installOrientation({ gate });

    await expect(requestDeviceTilt()).resolves.toBe('denied');
    await expect(requestDeviceTilt()).resolves.toBe('denied');
    expect(gate).toHaveBeenCalledTimes(1);
    expect(deviceTiltState()).toBe('denied');
  });

  /* The bug this replaces: everything that was not a grant was flattened into
     `false` and cached for the life of the page, so one ask made at the wrong
     moment put the sensor permanently out of reach. */
  it('retries after a throw, and after a dialog that was dismissed', async () => {
    const gate = vi.fn()
      .mockRejectedValueOnce(new Error('not a user gesture'))
      .mockResolvedValueOnce('default')
      .mockResolvedValueOnce('granted');
    installOrientation({ gate: gate as unknown as () => Promise<string> });

    await expect(requestDeviceTilt()).resolves.toBe('error');
    await expect(requestDeviceTilt()).resolves.toBe('error');
    await expect(requestDeviceTilt()).resolves.toBe('granted');
    expect(gate).toHaveBeenCalledTimes(3);
  });

  it('joins a request that is already out instead of opening a second dialog', async () => {
    let settle!: (answer: string) => void;
    const gate = vi.fn(() => new Promise<string>((resolve) => { settle = resolve; }));
    installOrientation({ gate });

    const first = requestDeviceTilt();
    const second = requestDeviceTilt();
    expect(gate).toHaveBeenCalledTimes(1);
    expect(deviceTiltState()).toBe('requesting');

    settle('granted');
    expect(await first).toBe('granted');
    expect(await second).toBe('granted');
  });

  it('tells its listeners where the ask got to', async () => {
    const seen: string[] = [];
    installOrientation({ gate: async () => 'granted' });
    const stop = subscribeDeviceTiltState((next) => seen.push(next));

    await requestDeviceTilt();
    expect(seen).toEqual(['requesting', 'granted']);

    stop();
    resetDeviceTiltStateForTests();
    await requestDeviceTilt();
    expect(seen).toEqual(['requesting', 'granted']);
  });
});

describe('reading an event', () => {
  it('takes a pair of finite numbers', () => {
    expect(orientationReading(reading(4, -7))).toEqual({ gamma: 4, beta: -7 });
    expect(orientationReading(reading(0, 0))).toEqual({ gamma: 0, beta: 0 });
  });

  it('refuses everything that is not one', () => {
    for (const empty of [
      reading(null, 3),
      reading(3, null),
      reading(undefined, undefined),
      reading(Number.NaN, 3),
      reading(3, Number.POSITIVE_INFINITY),
      reading('4', 3),
    ]) {
      expect(orientationReading(empty)).toBeNull();
    }
  });
});

describe('the screen’s axes rather than the device’s', () => {
  const held = { gamma: 10, beta: 20 };

  it('leaves an upright phone alone', () => {
    expect(screenTiltReading(held, 0)).toEqual(held);
    expect(screenTiltReading(held, 360)).toEqual(held);
  });

  it('swaps the axes for a phone on its side, and gets the signs right', () => {
    expect(screenTiltReading(held, 90)).toEqual({ gamma: -20, beta: 10 });
    expect(screenTiltReading(held, 270)).toEqual({ gamma: 20, beta: -10 });
    expect(screenTiltReading(held, -90)).toEqual({ gamma: 20, beta: -10 });
  });

  it('turns an upside-down phone’s two axes around', () => {
    expect(screenTiltReading(held, 180)).toEqual({ gamma: -10, beta: -20 });
  });

  it('reads the angle from either of the two APIs, and 0 from neither', () => {
    expect(screenOrientationAngle()).toBe(0);
    vi.stubGlobal('screen', { orientation: { angle: 90 } });
    expect(screenOrientationAngle()).toBe(90);
    vi.stubGlobal('screen', {});
    Object.defineProperty(window, 'orientation', { value: -90, configurable: true });
    expect(screenOrientationAngle()).toBe(-90);
  });
});

describe('the lean a turn comes to', () => {
  const level = { gamma: 0, beta: 0 };

  it('maps the turn once, linearly — a small turn is a small lean, not nothing', () => {
    /* The old code multiplied this by a strength derived from the same turn, so
       a tenth of the range came out as a hundredth of the lean. Here a tenth is
       a tenth. */
    expect(tiltFromReading({ gamma: 2, beta: 0 }, level).x).toBeCloseTo(2 / TILT_RANGE_DEG, 6);
    expect(tiltFromReading({ gamma: 10, beta: 0 }, level).x).toBeCloseTo(0.5, 6);
    expect(tiltFromReading({ gamma: 0, beta: -10 }, level).y).toBeCloseTo(-0.5, 6);
  });

  it('stands square where the phone has not moved since it was picked up', () => {
    const posture = { gamma: -34, beta: 62 };
    expect(tiltFromReading(posture, posture)).toEqual({ x: 0, y: 0 });
  });

  it('stops at the end of the range rather than folding over', () => {
    expect(tiltFromReading({ gamma: 90, beta: 0 }, level).x).toBe(1);
    expect(tiltFromReading({ gamma: 0, beta: -170 }, level).y).toBe(-1);
  });

  it('takes the short way round beta’s wrap instead of snapping to the far end', () => {
    // Two degrees past ±180 is two degrees of turn, not three hundred and fifty-eight.
    expect(tiltFromReading({ beta: -179, gamma: 0 }, { beta: 179, gamma: 0 }).y)
      .toBeCloseTo(2 / TILT_RANGE_DEG, 6);
  });

  it('does not invent a wrap for gamma, which has none', () => {
    /* Gamma 89 to gamma -89 is a phone rolled almost all the way over — 178
       degrees of real motion, and beta is what wraps when it goes further. Read
       as a two-degree turn it would be a sleeve standing nearly square while the
       phone is upside down in the reader's hand. */
    expect(tiltFromReading({ gamma: -89, beta: 0 }, { gamma: 89, beta: 0 }).x).toBe(-1);
  });
});
