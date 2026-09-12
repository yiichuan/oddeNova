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
 * it needs a render to be true, and the numbers below are the whole feel.
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

/**
 * Where the ask has got to. Six answers rather than a boolean, because they are
 * not the same thing and the old code could not tell them apart: it flattened
 * every one of them into `false` and cached that for the life of the page, so a
 * request made at the wrong moment — or one that threw — permanently looked like
 * a reader who had said no.
 *
 * - `unsupported` — no event, or no secure context. Nothing to ask, nothing to
 *   retry. The sleeve stands square, the same as on a machine with no gyroscope.
 * - `prompt` — there is something to ask and it has not been asked yet.
 * - `requesting` — an ask is out. Concurrent callers join it rather than opening
 *   a second dialog.
 * - `granted` — readings may arrive. Note that they still may not: permission is
 *   not a sensor. Silence after a grant is its own case, never a refusal.
 * - `denied` — the reader said no. Not asked again on its own; a browser may
 *   refuse a later ask outright, and the way back is the site's own permission
 *   settings.
 * - `error` — the call threw, or came from outside a gesture. Retryable, and the
 *   next deliberate press is what retries it.
 */
export type DeviceTiltState =
  | 'unsupported'
  | 'prompt'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'error';

let state: DeviceTiltState = 'prompt';
let settled = false;
let inFlight: Promise<DeviceTiltState> | null = null;
const listeners = new Set<(next: DeviceTiltState) => void>();

function moveTo(next: DeviceTiltState): DeviceTiltState {
  state = next;
  settled = next === 'granted' || next === 'denied' || next === 'unsupported';
  for (const listener of listeners) listener(next);
  return next;
}

/** Where the ask stands right now. Resolves `unsupported` lazily, on first ask. */
export function deviceTiltState(): DeviceTiltState {
  if (!settled && state === 'prompt' && typeof window !== 'undefined' && !deviceTiltSupported()) {
    return moveTo('unsupported');
  }
  return state;
}

/** Whether asking would raise a dialog — i.e. there is a permission to get. */
export function deviceTiltNeedsPermission(): boolean {
  return permissionGate() !== null && deviceTiltState() === 'prompt';
}

export function subscribeDeviceTiltState(listener: (next: DeviceTiltState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ask for the readings, from inside whatever gesture is calling.
 *
 * Must be called synchronously from a trusted event handler: the spec ties
 * `requestPermission` to a transient user activation, and an `await` before it —
 * a save, an animation, a fetch — spends that activation. So callers start this
 * first and navigate afterwards, and nobody waits on the answer to open a page.
 *
 * A settled answer is reused; an unsettled one can be asked again. Nobody has to
 * act on the result either: without readings the sleeve stands square, which is
 * where it starts, and there is nothing to apologise for.
 */
export function requestDeviceTilt(): Promise<DeviceTiltState> {
  if (inFlight) return inFlight;
  const current = deviceTiltState();
  if (settled) return Promise.resolve(current);

  const gate = permissionGate();
  /* A platform that sends the events without being asked: there is no gate to
     pass, so being supported is the whole answer. */
  if (!gate) return Promise.resolve(moveTo(deviceTiltSupported() ? 'granted' : 'unsupported'));

  moveTo('requesting');
  inFlight = (async () => {
    try {
      const answer = await gate.requestPermission();
      /* `default` is "not answered" — a dialog dismissed rather than refused.
         Treating it as a refusal is what would put the reader out of reach of
         their own sensor for the rest of the page's life. */
      return moveTo(answer === 'granted' ? 'granted' : answer === 'denied' ? 'denied' : 'error');
    } catch {
      // Thrown, not refused: almost always "called outside a user gesture".
      return moveTo('error');
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Test seam: forget what was asked and answered. */
export function resetDeviceTiltStateForTests(): void {
  state = 'prompt';
  settled = false;
  inFlight = null;
}

/** A finite number, or null. Rejects the sensor's null, its NaN and its ∞. */
function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The reading in an event, or null when the device had nothing to report. */
export function orientationReading(event: DeviceOrientationEvent): TiltReading | null {
  const gamma = finiteOrNull(event.gamma);
  const beta = finiteOrNull(event.beta);
  if (gamma === null || beta === null) return null;
  return { gamma, beta };
}

/**
 * The two axes as the *screen* has them, rather than as the device does.
 *
 * `beta` and `gamma` are named against the device's own top edge, which stops
 * being the top of the page the moment the phone is turned on its side: in
 * landscape, tipping the phone away from you rolls it about the screen's
 * horizontal axis, and a sleeve fed the raw pair leans sideways when it should
 * lean back. The angle is what has to be re-read; which way round the screen is
 * says how.
 *
 * The multiples of 90° are the only cases worth handling — there is no such thing
 * as a 37° screen — so this is a swap and a sign, not trigonometry.
 */
export function screenTiltReading(reading: TiltReading, angle: number): TiltReading {
  const normalized = ((angle % 360) + 360) % 360;
  switch (normalized) {
    case 90: return { gamma: -reading.beta, beta: reading.gamma };
    case 180: return { gamma: -reading.gamma, beta: -reading.beta };
    case 270: return { gamma: reading.beta, beta: -reading.gamma };
    default: return reading;
  }
}

/** Which way round the screen is, from whichever of the two APIs exists. */
export function screenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  const fromScreen = window.screen?.orientation?.angle;
  if (typeof fromScreen === 'number' && Number.isFinite(fromScreen)) return fromScreen;
  const legacy = (window as unknown as { orientation?: unknown }).orientation;
  return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : 0;
}

/**
 * The shorter way round between two angles on a wrapping axis.
 *
 * Both axes wrap, and at a wrap the raw difference is the long way round: a
 * phone crossing from +179° to -179° has moved two degrees, and subtracting says
 * it moved three hundred and fifty-eight. Unhandled, that is a sleeve that snaps
 * to the far end of its range as you tip past the boundary.
 */
function angleDelta(value: number, from: number, period: number): number {
  const half = period / 2;
  return ((((value - from) % period) + period + half) % period) - half;
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
 *
 * One linear map, clamped at the ends of the range, and nothing else. What is
 * returned *is* the lean, in fractions of the full lean — anything applied on top
 * of it a second time is an attenuation applied twice, which is what used to make
 * a two-degree turn come out as a tenth of a degree of visible lean.
 */
export function tiltFromReading(reading: TiltReading, baseline: TiltReading) {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value / TILT_RANGE_DEG));
  return {
    /* Beta is the one that genuinely wraps: it runs -180..180, and a phone tipped
       through the far end comes back at the other. Gamma runs -90..90 and does
       *not* wrap — going past its end rolls beta over instead, so gamma 89 to
       gamma -89 is 178 degrees of real rotation and has to read as one, not as
       two. Both are given the full circle; only beta ever reaches its edge. */
    x: clamp(angleDelta(reading.gamma, baseline.gamma, 360)),
    y: clamp(angleDelta(reading.beta, baseline.beta, 360)),
  };
}
