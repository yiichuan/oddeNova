import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { sleeveShadowColor, type CoverRoom } from './featured-cover-light';
import {
  deviceTiltSupported,
  orientationReading,
  screenOrientationAngle,
  screenTiltReading,
  tiltFromReading,
  type TiltReading,
} from './featured-device-tilt';

/** Where the sleeve's shadow falls: down and behind, before any lean. */
const RESTING_THROW = '0 12px 28px';

/** How far the sleeve leans at the end of its range, in degrees per axis. */
const MAX_TILT_DEG = 8;

interface TiltValues extends CSSProperties {
  '--tilt-x': string;
  '--tilt-y': string;
  '--tilt-highlight-x': string;
  '--tilt-highlight-y': string;
  '--tilt-highlight-opacity': number;
  '--tilt-shadow': string;
}

/**
 * A plane that leans away from the hand, and the box it leans inside.
 *
 * Which hand is whichever one is there. A display has a pointer, and the plane
 * leans away from wherever the cursor is over it. A phone has no pointer — a
 * finger is only ever on the glass for the moment it presses — but it has the
 * one thing the display does not, which is that the whole page is being held:
 * the readings say how far the thing has been turned since it was picked up,
 * and the sleeve is turned with it.
 *
 * Both are read, and neither is asked for. A machine with a cursor sends no
 * orientation; a phone has no cursor to send. What is left is the case where
 * both are there — this page's own layout opened on a machine with a mouse, or
 * a tablet on a keyboard — and there the sleeve simply answers whichever hand
 * moved last, which is the right answer to "which hand is holding it". They
 * arrive here as the same -1..1 pair, and everything past that point — the
 * lean, the light caught on it, the shadow it throws — is one piece of
 * arithmetic serving both.
 *
 * Nothing that has to be pressed can live on the plane alone. The lean moves
 * the plane's edges under the hand — the side the pointer is on projects some
 * 13px inside the resting box, the far side hangs that far outside it, and
 * both keep moving while a press is being made. Whoever renders this surface
 * therefore answers presses on an ancestor of it (see the root of
 * FeaturedCard); what is written in here is free to move because nothing
 * depends on where it has got to.
 */
export default function FeaturedTiltSurface({
  active,
  room,
  showHighlight = true,
  children,
}: {
  active: boolean;
  /** The room the sleeve stands in — it is what its shadow is cast by. */
  room: CoverRoom;
  showHighlight?: boolean;
  children: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const resting = `${RESTING_THROW} ${sleeveShadowColor(room, 0)}`;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const reset = () => {
      surface.style.setProperty('--tilt-x', '0deg');
      surface.style.setProperty('--tilt-y', '0deg');
      surface.style.setProperty('--tilt-highlight-opacity', '0');
      surface.style.setProperty('--tilt-shadow', resting);
    };
    reset();

    const syncOrigin = () => {
      const cover = surface.firstElementChild as HTMLElement | null;
      if (!cover) return;
      surface.style.transformOrigin = `${surface.clientWidth / 2}px ${cover.clientHeight / 2}px`;
    };
    syncOrigin();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduced) return;
    /* A coarse pointer has no resting position to read a lean from — a finger
       is only over the sleeve for the instant it presses it, and on a page
       whose whole surface is dragged it is over it for every one of those
       drags. So the cursor is read only where there is a real one, and the
       device wherever the browser has the event at all. */
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const deviceHand = deviceTiltSupported();
    if (!precisePointer && !deviceHand) return;

    let frameId: number | null = null;
    let lastFrame = 0;
    /* Two separate things, and the reason they are separate is a bug that read
       as "the tilt does not work". `x`/`y` are *where* the hand is — the lean
       itself, already a fraction of the full lean. `gloss` is how much light the
       sleeve is catching and how far its shadow is thrown.

       They used to be one: the geometry was `x * 8° * strength`, and on a phone
       the strength was itself derived from how far the phone had been turned. So
       a small turn was attenuated twice — a 2° tip came out as roughly 0.12° of
       lean, which is nothing anyone can see, and a sensor that was working looked
       like a sensor that was not. The pointer never showed it, because its
       strength is a flat 1 inside the tile. */
    const current = { x: 0, y: 0, gloss: 0 };
    const target = { x: 0, y: 0, gloss: 0 };

    const render = () => {
      const rotateX = -current.y * MAX_TILT_DEG;
      const rotateY = current.x * MAX_TILT_DEG;
      const shadowX = -current.x * 13 * current.gloss;
      const shadowY = 12 - current.y * 9 * current.gloss;
      const shadowBlur = 28 + current.gloss * 8;
      surface.style.setProperty('--tilt-x', `${rotateX}deg`);
      surface.style.setProperty('--tilt-y', `${rotateY}deg`);
      surface.style.setProperty('--tilt-highlight-x', `${(current.x + 1) * 50}%`);
      surface.style.setProperty('--tilt-highlight-y', `${(current.y + 1) * 50}%`);
      surface.style.setProperty('--tilt-highlight-opacity', `${current.gloss * 0.16}`);
      surface.style.setProperty(
        '--tilt-shadow',
        `${shadowX}px ${shadowY}px ${shadowBlur}px ${sleeveShadowColor(room, current.gloss)}`,
      );
    };

    const requestFrame = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame((now) => {
        frameId = null;
        const elapsed = lastFrame === 0 ? 16 : Math.min(now - lastFrame, 64);
        lastFrame = now;
        const directionMix = 1 - Math.exp(-elapsed / 65);
        const glossMix = 1 - Math.exp(-elapsed / (target.gloss > current.gloss ? 70 : 115));
        current.x += (target.x - current.x) * directionMix;
        current.y += (target.y - current.y) * directionMix;
        current.gloss += (target.gloss - current.gloss) * glossMix;
        render();
        const remaining = Math.abs(target.x - current.x)
          + Math.abs(target.y - current.y)
          + Math.abs(target.gloss - current.gloss);
        if (remaining > 0.001) requestFrame();
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      /* A real cursor only. A hybrid device — a tablet on a keyboard, a laptop
         with a touchscreen — answers "is there a fine pointer" yes and still
         sends a `pointermove` for every finger that touches the glass. Those
         land outside the tile as often as not, and each one used to reset the
         target to square: the device's own lean, arriving between them, was
         being wiped out by the hand that was holding the phone. Defensive rather
         than diagnosed — it is not claimed to be what the reporter saw. */
      if (event.pointerType && event.pointerType !== 'mouse') return;
      /* Read against the box the card rests in, not against the card. A
         leaning plane's bounding box draws in on the side that has gone away
         from the viewer, so measuring the pointer against the surface itself
         lets the tile pull out from under a hand near its edge: the pointer
         falls outside, the lean resets, the box comes back, and the two chase
         each other. The wrapper holds the perspective and no transform of its
         own, so its rect is the tile standing still. */
      const rect = (surface.parentElement ?? surface).getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        target.x = 0;
        target.y = 0;
        target.gloss = 0;
        requestFrame();
        return;
      }
      target.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      target.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
      target.gloss = 1;
      requestFrame();
    };

    /* Where the phone was when this sleeve took the centre. Captured on the
       first reading rather than assumed to be level: see tiltFromReading. This
       effect re-runs whenever the sleeve stops being the centre one — a scroll,
       a snap, a cover flying into its detail — so coming back recalibrates
       against the posture the phone is in by then, and a record does not arrive
       already leaning because the reader has since sat down. */
    let baseline: TiltReading | null = null;
    /* The screen's own rotation, so a phone turned on its side leans back when it
       is tipped back rather than sideways. Read per reading, since it can change
       under a page that is not re-rendering. */
    const recalibrate = () => { baseline = null; };

    const onOrientation = (event: DeviceOrientationEvent) => {
      const raw = orientationReading(event);
      if (!raw) return;
      const reading = screenTiltReading(raw, screenOrientationAngle());
      baseline ??= reading;
      const tilt = tiltFromReading(reading, baseline);
      target.x = tilt.x;
      target.y = tilt.y;
      /* How far the phone has been turned, in one number — where the pointer's
         gloss says "the hand is over the sleeve", the device's says "the sleeve
         is being turned this much". It is what the light is spent by, so a phone
         held exactly as it was picked up shows a sleeve standing square with no
         highlight on it, and tipping it is what lights the artwork. All the way
         up a little before the lean is: past two thirds of the way the sleeve is
         plainly turned, and the light should already be all there.

         It no longer touches the geometry. See `current` above. */
      target.gloss = Math.min(1, Math.hypot(tilt.x, tilt.y) * 1.5);
      requestFrame();
    };

    /* Coming back to a page that was in the background, and turning the phone on
       its side, are both "the phone is not where it was": the next reading is the
       new baseline rather than a turn the reader never made. */
    const onVisibility = () => { if (!document.hidden) recalibrate(); };

    const resizeObserver = new ResizeObserver(syncOrigin);
    resizeObserver.observe(surface);

    if (precisePointer) window.addEventListener('pointermove', onPointerMove, { passive: true });
    if (deviceHand) {
      window.addEventListener('deviceorientation', onOrientation);
      window.addEventListener('orientationchange', recalibrate);
      window.screen?.orientation?.addEventListener?.('change', recalibrate);
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', recalibrate);
      window.screen?.orientation?.removeEventListener?.('change', recalibrate);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      reset();
    };
    // The room is in here because the shadow is: a theme flip has to re-cast
    // it, and the reset above is the only thing that writes the resting one.
  }, [active, resting, room]);

  const style: TiltValues = {
    '--tilt-x': '0deg',
    '--tilt-y': '0deg',
    '--tilt-highlight-x': '50%',
    '--tilt-highlight-y': '50%',
    '--tilt-highlight-opacity': 0,
    '--tilt-shadow': resting,
  };

  return (
    <div className="relative w-full [perspective:900px]">
      <div
        ref={surfaceRef}
        data-tilt-active={active}
        data-testid="featured-tilt-surface"
        /* Flat, deliberately. Nothing inside the surface carries a z of its
           own — the lean is one rotation on this element and the perspective
           above it — so `preserve-3d` here would buy no depth and would cost
           the paint order: it puts every child on its own plane, and coplanar
           siblings are then sorted by where they lie in 3D rather than by the
           order they were written in. The overlay the credits button stretches
           across the whole card is one of those siblings, the artwork is
           another, and once the card leans on two axes the sort flips along a
           diagonal — the overlay covering half the cover and lying under the
           other half, which is a focus ring drawn round a corner of the tile
           and a hover that changes down the same diagonal. Flattened, the
           overlay is simply last and covers all of it. */
        className="relative w-full rounded-[2px] [transform:rotateX(var(--tilt-x))_rotateY(var(--tilt-y))]"
        style={style}
      >
        {children}
        {showHighlight && <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-[5] aspect-square w-full rounded-[2px]"
          style={{
            background: 'radial-gradient(circle at var(--tilt-highlight-x) var(--tilt-highlight-y), rgba(255,255,255,0.72), rgba(255,255,255,0.16) 22%, transparent 58%)',
            opacity: 'var(--tilt-highlight-opacity)',
          }}
        />}
      </div>
    </div>
  );
}
