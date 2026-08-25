/**
 * The canvas the studio's non-underscored painters share — `.punchcard()`,
 * `.pianoroll()`, `.spiral()`, and so on — scoped to the code panel instead of
 * the whole page.
 *
 * `@strudel/draw`'s `getDrawContext(id)` looks the canvas up by id first
 * (`document.querySelector('#' + id)`) and only falls into its own creation
 * branch if nothing is found. Left to create one itself, it builds a canvas
 * sized to `window.innerWidth`/`innerHeight`, `position: fixed` at the
 * viewport's corner, and prepends it to `<body>` — right for strudel.cc, where
 * the canvas *is* the page, wrong here: it would draw over the whole studio —
 * chat, nav, everything — for what a piece's own code asked to paint on itself.
 *
 * So this makes the canvas first, at that id, confined to the panel — which is
 * enough for `getDrawContext` to find it and hand back a context without ever
 * reaching its own creation logic.
 */

export interface CodePanelDrawContextOptions {
  /** The element StrudelMirror mounts into — the box the canvas is confined to. */
  panel: HTMLElement;
  /** `getDrawContext` from `@strudel/draw`; finds a canvas by id before creating one. */
  getDrawContext: (id?: string) => unknown;
}

export interface CodePanelDrawContext {
  /** The 2D context painters draw into — pass straight through as `drawContext`. */
  context: CanvasRenderingContext2D;
  /**
   * Erase whatever the last frame left on the panel.
   *
   * A painter only draws when the Drawer's animation frame loop asks it to,
   * and that loop stops the moment the transport does — on pause exactly like
   * on stop, `cyclist`'s `setStarted(false)` runs on both. So there is never a
   * frame left to clear the canvas *for* pause; the last thing painted stays
   * on screen, frozen, until something erases it or a new frame overwrites it.
   *
   * `@strudel/draw`'s own `cleanupDraw` looks like that something, but it
   * calls `getDrawContext()` with no id, which resolves to `#test-canvas` —
   * the default, full-page canvas this module deliberately doesn't use — so it
   * clears a canvas nothing here ever painted on, and this one keeps showing
   * its last frame regardless. Hence a real clear, owned here and called
   * explicitly wherever playback stops being live: pause, stop, a new piece
   * arriving via `setCode`, and before `play()` re-evaluates.
   */
  clear: () => void;
  /** Stop tracking the panel's size. Call before the panel is torn down or replaced. */
  dispose: () => void;
}

export const CODE_PANEL_CANVAS_ID = 'codepanel-strudel-canvas';

export function createCodePanelDrawContext({
  panel,
  getDrawContext,
}: CodePanelDrawContextOptions): CodePanelDrawContext {
  // `position: absolute` needs a positioned ancestor to confine itself to.
  // `.cm-editor` — a child StrudelMirror mounts moments later — sets its own
  // `relative` for its own overlays; this does the same one level up, for the
  // panel as a whole. A real browser reports an unset position as `static`;
  // happy-dom (this module's tests) reports `''` — both mean "not yet
  // positioned".
  const currentPosition = getComputedStyle(panel).position;
  if (currentPosition === '' || currentPosition === 'static') {
    panel.style.position = 'relative';
  }

  const canvas = document.createElement('canvas');
  canvas.id = CODE_PANEL_CANVAS_ID;
  // Floats over the code, same as strudel.cc's own canvas does over its REPL —
  // `pointer-events: none` so it never intercepts a click or keystroke meant
  // for the editor underneath.
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  panel.appendChild(canvas);

  // The painters read `ctx.canvas.width`/`height` as their coordinate space
  // (see `@strudel/draw`'s punchcard/pianoroll), so this is what keeps their
  // drawing scaled to the panel's actual box rather than the tab's last size.
  const pixelRatio = window.devicePixelRatio || 1;
  const resize = (): void => {
    canvas.width = Math.max(1, Math.round(panel.clientWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(panel.clientHeight * pixelRatio));
  };
  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(panel);

  const context = getDrawContext(CODE_PANEL_CANVAS_ID) as CanvasRenderingContext2D;

  return {
    context,
    clear: () => context.clearRect(0, 0, canvas.width, canvas.height),
    dispose: () => observer.disconnect(),
  };
}
