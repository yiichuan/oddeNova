/**
 * The playback accent: while a piece plays, the studio's own orange
 * (`#CD5633` — the playback progress bar, the control bar's particle field)
 * gives way to a colour lifted from the piece's own `.color()`, if it set one
 * worth using.
 *
 * `.color()` is not a painter — it is a plain per-hap value (`register(["color",
 * "colour"], ...)` in `@strudel/core`), so there is no hook comparable to
 * `.theme()`'s `onPaint` to intercept it. What *is* available every frame,
 * once `StrudelService` supplies its own `onDraw`, is the Drawer's own
 * `visibleHaps` — the same haps the mini-notation highlight reads `hap.value
 * .color` from (`@strudel/codemirror`'s `highlight.mjs`) — so this samples
 * that instead of adding a new registered method.
 *
 * Latched, not tracked: the first hued colour a currently-sounding hap
 * carries becomes the accent for the rest of that playback and stays there
 * even if `.color()` later cycles to white or black — a piece's own
 * alternation is for its punchcard, not for making the transport strobe.
 * `reset()` clears the latch; call it wherever a piece stops being live
 * (pause, stop, new code, or before a fresh evaluate), the same set of call
 * sites `CodePanelTheme`/`CodePanelDrawContext` reset from.
 */

/** Two hex digits apart is enough to call a channel "different" through 8-bit rounding. */
const SATURATION_THRESHOLD = 24;

/**
 * Whether a colour has a hue worth accenting with — not black, white, or a
 * shade of grey. A hex colour is grey when its channels are all close to each
 * other regardless of how light or dark it is, so this checks the spread
 * between the brightest and dimmest channel rather than the value of any one.
 */
export function isHuedColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return false;
  const hex = match[1];
  const channels =
    hex.length === 3
      ? hex.split('').map((c) => parseInt(c + c, 16))
      : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((c) => parseInt(c, 16));
  return Math.max(...channels) - Math.min(...channels) > SATURATION_THRESHOLD;
}

/** Just enough of a Hap to read whether it is sounding right now and what colour it carries. */
interface HapLike {
  isActive: (time: number) => boolean;
  value?: { color?: unknown };
}

export interface CodePanelAccent {
  /**
   * Look at one frame's haps for a hued `.color()` value. A no-op once
   * something has already latched, and while nothing is playing — the Drawer
   * only calls the frame this reads from during playback in the first place.
   */
  sample: (haps: readonly HapLike[], time: number) => void;
  /** Drop the latch. The next `sample()` call is free to latch again. */
  reset: () => void;
}

export function createCodePanelAccent(onChange: (color: string | null) => void): CodePanelAccent {
  let latched: string | null = null;

  return {
    sample: (haps, time) => {
      if (latched !== null) return;
      for (const hap of haps) {
        const color = hap.value?.color;
        if (hap.isActive(time) && isHuedColor(color)) {
          latched = color;
          onChange(color);
          return;
        }
      }
    },
    reset: () => {
      if (latched === null) return;
      latched = null;
      onChange(null);
    },
  };
}
