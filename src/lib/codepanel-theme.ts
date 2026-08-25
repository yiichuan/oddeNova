import type { Extension } from '@codemirror/state';
import { installOddenovaDarkSyntaxHighlight } from './oddenova-dark-syntax-highlight';

/**
 * `.theme(name)`, confined to the code panel's syntax colours.
 *
 * On strudel.cc the same call is a page-wide repaint: the website's
 * `activateTheme` injects `:root { --background: … !important }` for every key
 * of the theme's `settings`, toggles `dark` on `<html>`, and pushes the palette
 * into `@strudel/draw` so the visualizer follows. That is right for a page that
 * *is* one REPL, and wrong here — it would drag oddeNova's own tokens, the
 * `.dark` class `appearance-preferences.ts` owns, and the studio's visualizer
 * along with whatever piece the user happens to be playing.
 *
 * What it does instead is reconfigure the theme compartment, and only that.
 * `themes[name]` is a self-contained CodeMirror theme whose rules are scoped to
 * `.cm-editor`, so a pattern gets to recolour the code it wrote and nothing
 * else on the page.
 *
 * **The panel's own surface deliberately does not follow.** Background,
 * foreground, caret, selection and the line numbers stay oddeNova's, because
 * `editor-preferences.ts` pins them on `.cm-editor` with `!important` and the
 * studio is built around that surface — a piece is a guest in the panel, not
 * its decorator. Nothing here has to enforce that: the compartment cannot
 * outrank a pinned `!important` rule, so leaving those alone *is* leaving them
 * to `editor-preferences.ts`. Reaching past it would take a deliberately
 * higher-specificity stylesheet, which is exactly what this does not write.
 */

type EditorViewLike = {
  dispatch: (transaction: { effects: unknown }) => void;
};

type ThemeCompartmentLike = {
  reconfigure: (extension: Extension) => unknown;
};

export interface CodePanelThemeOptions {
  /** The CodeMirror view — `StrudelMirror.editor`. */
  editor: EditorViewLike;
  /** Strudel's theme compartment, which oddeNova's syntax highlight also occupies. */
  themeCompartment: ThemeCompartmentLike;
  /** `themes` from `@strudel/codemirror` — name to CodeMirror extension. */
  themes: Record<string, Extension | undefined>;
}

export interface CodePanelTheme {
  /** Recolour the panel's syntax with a named Strudel theme. Unknown names are left alone. */
  apply: (name: string) => void;
  /** Put oddeNova's own syntax colours back. No-op if no theme is active. */
  reset: () => void;
}

export function createCodePanelTheme({
  editor,
  themeCompartment,
  themes,
}: CodePanelThemeOptions): CodePanelTheme {
  let current: string | null = null;
  const warned = new Set<string>();

  const apply = (name: string): void => {
    if (name === current) return;

    const extension = themes[name];
    if (!extension) {
      // Upstream falls back to strudelTheme here. Scoped, that would answer a
      // typo by replacing oddeNova's palette with Strudel's default, so leave
      // the panel as it is and say so once.
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`[strudel] unknown theme "${name}" — leaving the code panel as it is`);
      }
      return;
    }

    current = name;
    editor.dispatch({ effects: themeCompartment.reconfigure(extension) });
  };

  const reset = (): void => {
    if (current === null) return;
    current = null;
    installOddenovaDarkSyntaxHighlight(editor, themeCompartment);
  };

  return { apply, reset };
}

/** Just enough of a Pattern to read a value out of it at a point in time. */
interface QueryablePattern {
  queryArc: (begin: number, end: number) => { value?: unknown }[];
}

/**
 * The body of `.theme()`: read the theme name a pattern holds at the current
 * time, and hand it over.
 *
 * A painter is the only hook Strudel offers that samples over time, which is
 * what `.theme("<a b>/2")` needs. The Drawer runs it once per animation frame
 * while the transport is running and passes `scheduler.now()` — cycles, not
 * seconds — so the pattern takes that number as-is. Zero-width queries are how
 * `getPainters` reads its own state upstream, so a point query is fair game.
 *
 * It hands over the name on every frame and lets `apply` decide what counts as
 * a change. Deduping here as well would be a second cache to keep in step with
 * that one, and they would fall out of step exactly where it matters: after a
 * `reset`, a painter that still remembered the name would sit on it and never
 * repaint.
 *
 * Lives here, apart from the registration in `StrudelService.prebake`, so this
 * contract can be tested without standing up an audio engine.
 */
export function createThemePainter(
  namePattern: QueryablePattern,
  apply: (name: string) => void,
): (ctx: unknown, time: number) => void {
  return (_ctx, time) => {
    const name = namePattern.queryArc(time, time)[0]?.value;
    if (typeof name === 'string') apply(name);
  };
}
