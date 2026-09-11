/**
 * The phone's own hand, standing in for the pointer.
 *
 * A sleeve on the desktop shelf leans away from the cursor: the pointer is the
 * hand the record is being held in, and the lean is what tells you it is an
 * object and not a picture. A phone has no pointer — a finger is only ever on
 * the glass for the moment it presses — but it has the one thing the desktop
 * does not, which is that the whole page is being held. So the hand becomes the
 * device: tip the phone and the record tips with it.
 *
 * Kept out of the component for the same reason the shelf's light is: none of
 * it needs a render to be true, and the two numbers below are the whole feel.
 */

/**
 * How far the phone has to be turned from where it was picked up for a sleeve
 * to be leaning as far as it leans. Deliberately short — a phone is read at a
 * fairly constant angle, and a range wide enough to be "a proper turn" is one
 * the sleeve never actually reaches. Past it the lean simply stops rather than
 * carrying on into a fold.
 */
export const TILT_RANGE_DEG = 20;

/** A reading, in the two axes a sleeve can lean on. Degrees, device frame. */
export interface TiltReading {
  /** Left-right: the phone's right edge going down is positive. */
  gamma: number;
  /** Front-back: the phone's top edge going away from you is positive. */
  beta: number;
}

/** Whether the browser has the event at all. Says nothing about permission. */
export function deviceTiltSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined';
}

interface PermissionGate {
  requestPermission: () => Promise<'granted' | 'denied' | 'default'>;
}

/**
 * iOS hands out motion readings only after they have been asked for, from
 * inside a real gesture, and the ask itself only exists there — everywhere else
 * the events simply arrive.
 */
function permissionGate(): PermissionGate | null {
  if (!deviceTiltSupported()) return null;
  const gate = window.DeviceOrientationEvent as unknown as Partial<PermissionGate>;
  return typeof gate.requestPermission === 'function' ? (gate as PermissionGate) : null;
}

/** Asked once per page load: a refusal is an answer, and re-asking is nagging. */
let pending: Promise<boolean> | null = null;

/**
 * Ask for the readings, from inside whatever gesture is calling.
 *
 * Answers true where there is nothing to ask — a browser that just sends the
 * events — so the caller has one thing to check. Nobody has to act on the
 * answer either: a refused permission means the events never arrive and the
 * sleeve stands square, which is exactly what a device that has no gyroscope
 * does. There is no fallback to fall back to and nothing to apologise for.
 */
export function requestDeviceTilt(): Promise<boolean> {
  if (pending) return pending;
  const gate = permissionGate();
  if (!gate) {
    pending = Promise.resolve(deviceTiltSupported());
    return pending;
  }
  pending = gate.requestPermission()
    .then((state) => state === 'granted')
    .catch(() => false);
  return pending;
}

/** The reading in an event, or null when the device had nothing to report. */
export function orientationReading(event: DeviceOrientationEvent): TiltReading | null {
  if (event.gamma === null || event.beta === null) return null;
  return { gamma: event.gamma, beta: event.beta };
}

/**
 * How far the phone has been turned since it was picked up, as the same
 * -1..1 pair the pointer hands the tilt surface: -1 is the left edge / the top
 * edge, +1 the right / the bottom.
 *
 * Measured against a baseline rather than against level, because there is no
 * such thing as level here: a phone is read at whatever angle it is read at,
 * and a sleeve that leans according to how you happen to be sitting would be
 * permanently half-turned. The baseline is where the page was when it came up,
 * so the shelf starts square and answers the turn rather than the posture.
 */
export function tiltFromReading(reading: TiltReading, baseline: TiltReading) {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value / TILT_RANGE_DEG));
  return {
    x: clamp(reading.gamma - baseline.gamma),
    y: clamp(reading.beta - baseline.beta),
  };
}
