import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface TiltValues extends CSSProperties {
  '--tilt-x': string;
  '--tilt-y': string;
  '--tilt-highlight-x': string;
  '--tilt-highlight-y': string;
  '--tilt-highlight-opacity': number;
  '--tilt-shadow': string;
}

export default function FeaturedTiltSurface({
  active,
  showHighlight = true,
  children,
}: {
  active: boolean;
  showHighlight?: boolean;
  children: ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const reset = () => {
      surface.style.setProperty('--tilt-x', '0deg');
      surface.style.setProperty('--tilt-y', '0deg');
      surface.style.setProperty('--tilt-highlight-opacity', '0');
      surface.style.setProperty('--tilt-shadow', '0 12px 28px rgba(0, 0, 0, 0.34)');
    };
    reset();

    const syncOrigin = () => {
      const cover = surface.firstElementChild as HTMLElement | null;
      if (!cover) return;
      surface.style.transformOrigin = `${surface.clientWidth / 2}px ${cover.clientHeight / 2}px`;
    };
    syncOrigin();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!active || reduced || !precisePointer) return;

    let frameId: number | null = null;
    let lastFrame = 0;
    const current = { x: 0, y: 0, strength: 0 };
    const target = { x: 0, y: 0, strength: 0 };

    const render = () => {
      const rotateX = -current.y * 8 * current.strength;
      const rotateY = current.x * 8 * current.strength;
      const shadowX = -current.x * 13 * current.strength;
      const shadowY = 12 - current.y * 9 * current.strength;
      const shadowBlur = 28 + current.strength * 8;
      surface.style.setProperty('--tilt-x', `${rotateX}deg`);
      surface.style.setProperty('--tilt-y', `${rotateY}deg`);
      surface.style.setProperty('--tilt-highlight-x', `${(current.x + 1) * 50}%`);
      surface.style.setProperty('--tilt-highlight-y', `${(current.y + 1) * 50}%`);
      surface.style.setProperty('--tilt-highlight-opacity', `${current.strength * 0.16}`);
      surface.style.setProperty(
        '--tilt-shadow',
        `${shadowX}px ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${0.34 + current.strength * 0.12})`,
      );
    };

    const requestFrame = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame((now) => {
        frameId = null;
        const elapsed = lastFrame === 0 ? 16 : Math.min(now - lastFrame, 64);
        lastFrame = now;
        const directionMix = 1 - Math.exp(-elapsed / 65);
        const strengthMix = 1 - Math.exp(-elapsed / (target.strength > current.strength ? 70 : 115));
        current.x += (target.x - current.x) * directionMix;
        current.y += (target.y - current.y) * directionMix;
        current.strength += (target.strength - current.strength) * strengthMix;
        render();
        const remaining = Math.abs(target.x - current.x)
          + Math.abs(target.y - current.y)
          + Math.abs(target.strength - current.strength);
        if (remaining > 0.001) requestFrame();
      });
    };

    const onPointerMove = (event: PointerEvent) => {
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
        target.strength = 0;
        requestFrame();
        return;
      }
      target.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      target.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
      target.strength = 1;
      requestFrame();
    };

    const resizeObserver = new ResizeObserver(syncOrigin);
    resizeObserver.observe(surface);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();
      reset();
    };
  }, [active]);

  const style: TiltValues = {
    '--tilt-x': '0deg',
    '--tilt-y': '0deg',
    '--tilt-highlight-x': '50%',
    '--tilt-highlight-y': '50%',
    '--tilt-highlight-opacity': 0,
    '--tilt-shadow': '0 12px 28px rgba(0, 0, 0, 0.34)',
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
           order they were written in. The tile's press target is one of those
           siblings (the overlay the credits button stretches across the whole
           card), the artwork is another, and once the card leans on two axes
           the sort flips along a diagonal — half the cover stops opening the
           record, and which half moves with the pointer that is doing the
           leaning. Flattened, the overlay is simply last and covers all of it. */
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
