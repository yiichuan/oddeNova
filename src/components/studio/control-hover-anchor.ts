/**
 * Where a control's name goes when it is shown next to the control.
 *
 * Its own module rather than a second export from `ControlHoverLabel`, which
 * has to stay a file of components alone for fast refresh to work on it. What
 * lives here is the geometry the label is placed by — shared because more than
 * one bar of these buttons exists (the studio's transport, the Featured
 * player, the Favorites page's script window), and a label sitting 8px off one
 * of them and 6px off another is two conventions rather than one.
 */

export interface ControlHoverLabelAnchor {
  left: number;
  bottom: number;
}

/** Centred on the control, and clear of its top edge. */
export function anchorAbove(element: HTMLElement): ControlHoverLabelAnchor {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left + rect.width / 2,
    bottom: window.innerHeight - rect.top + 8,
  };
}
