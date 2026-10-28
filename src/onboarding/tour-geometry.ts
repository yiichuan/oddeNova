/**
 * The tour's geometry, kept apart from React so it can be checked directly:
 * where a target is on screen, the scrim with a hole cut round it, and where
 * the card goes beside it.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * The first element matching `selector` that is actually on screen: laid out,
 * not inside an `inert` subtree (the phone's closed code window keeps its
 * layout, so a size alone does not say it is showing).
 */
export function visibleRectOf(selector: string, root: ParentNode = document): Rect | null {
  for (const element of root.querySelectorAll(selector)) {
    if (element.closest('[inert]')) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  return null;
}

export function expandRect(rect: Rect, by: number, viewport: Size): Rect {
  const left = Math.max(0, rect.left - by);
  const top = Math.max(0, rect.top - by);
  const right = Math.min(viewport.width, rect.left + rect.width + by);
  const bottom = Math.min(viewport.height, rect.top + rect.height + by);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.round(a.left) === Math.round(b.left)
    && Math.round(a.top) === Math.round(b.top)
    && Math.round(a.width) === Math.round(b.width)
    && Math.round(a.height) === Math.round(b.height);
}

/**
 * The whole viewport with `hole` cut out, for an even-odd fill. Only painted
 * area takes pointer events, so the cut-out is exactly where the page stays
 * reachable.
 */
export function scrimPath(viewport: Size, hole: Rect | null, radius = 6): string {
  const outer = `M0 0H${viewport.width}V${viewport.height}H0Z`;
  if (!hole || hole.width === 0 || hole.height === 0) return outer;
  const r = Math.min(radius, hole.width / 2, hole.height / 2);
  const { left: x, top: y, width: w, height: h } = hole;
  return `${outer}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}`
    + `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`
    + `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * `above-start` / `below-start`: directly above or below the target, its left
 * edge on the target's — for a small control, where a card centred over it
 * would float free of it.
 */
export type CardPlacement = 'auto' | 'above-start' | 'below-start';

/**
 * Where the card goes: beside the target, on the first side it fits whole —
 * below, above, right, left — so it never covers what it is pointing at.
 * A preferred placement is taken when it fits. When no side fits the card
 * takes the roomiest one and stays on screen.
 */
export function placeCard(
  target: Rect | null,
  card: Size,
  viewport: Size,
  options: { margin?: number; gap?: number; placement?: CardPlacement } = {},
): { left: number; top: number } {
  const margin = options.margin ?? 12;
  const gap = options.gap ?? 12;
  const maxLeft = viewport.width - margin - card.width;
  const maxTop = viewport.height - margin - card.height;

  if (!target) {
    return {
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
    };
  }

  if (options.placement === 'above-start') {
    const top = target.top - gap - card.height;
    if (top >= margin) return { left: clamp(target.left, margin, maxLeft), top };
  }
  if (options.placement === 'below-start') {
    const top = target.top + target.height + gap;
    if (top <= maxTop) return { left: clamp(target.left, margin, maxLeft), top };
  }

  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const centredLeft = clamp(target.left + target.width / 2 - card.width / 2, margin, maxLeft);
  const centredTop = clamp(target.top + target.height / 2 - card.height / 2, margin, maxTop);

  const sides = [
    { room: viewport.height - bottom - gap - margin, need: card.height, at: { left: centredLeft, top: bottom + gap } },
    { room: target.top - gap - margin, need: card.height, at: { left: centredLeft, top: target.top - gap - card.height } },
    { room: viewport.width - right - gap - margin, need: card.width, at: { left: right + gap, top: centredTop } },
    { room: target.left - gap - margin, need: card.width, at: { left: target.left - gap - card.width, top: centredTop } },
  ];
  const fitting = sides.find((side) => side.room >= side.need);
  if (fitting) return fitting.at;

  const roomiest = sides.reduce((best, side) => (side.room - side.need > best.room - best.need ? side : best));
  return {
    left: clamp(roomiest.at.left, margin, maxLeft),
    top: clamp(roomiest.at.top, margin, maxTop),
  };
}
