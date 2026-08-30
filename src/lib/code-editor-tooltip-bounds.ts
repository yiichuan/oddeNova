import { tooltips } from '@codemirror/view';
import { StateEffect, type Extension } from '@codemirror/state';

type Rect = { top: number; bottom: number; left: number; right: number };

/** Structural stand-in for `EditorView`, so tests can hand this a plain object. */
type TooltipSpaceSource = { dom: { getBoundingClientRect: () => Rect } };

/**
 * The box CodeMirror's popups have to stay inside: the editor's own.
 *
 * Upstream measures a tooltip's room against `tooltipSpace`, which defaults to
 * the whole browser window. By that measure a completion list opened on the
 * last visible line has plenty of room below it, so it renders downward —
 * straight across the playback control bar, which is not part of the editor
 * and paints above it. The popup cannot win that from the inside: the code
 * layer is an isolated stacking context on purpose (it keeps CodeMirror's own
 * z-index scale — gutter 200, fade 240, scrollbar mask 250 — from escaping
 * into the app's, where it would cover modals), so every layer CodeMirror
 * owns, tooltips included, paints as one unit beneath the bar.
 *
 * Handing CodeMirror the editor's rect makes its existing logic do the right
 * thing instead: `writeMeasure` flips the list above the cursor when it would
 * overflow the bottom of this box, and shrinks it to the room available when
 * neither side can hold it. Same behaviour as upstream — measured against the
 * right box.
 */
export function codeEditorTooltipSpace(view: TooltipSpaceSource): Rect {
  const { top, bottom, left, right } = view.dom.getBoundingClientRect();
  return { top, bottom, left, right };
}

export const codeEditorTooltipBounds = tooltips({ tooltipSpace: codeEditorTooltipSpace });

type EditorViewLike = {
  dispatch: (transaction: { effects: unknown }) => void;
};

export function installCodeEditorTooltipBounds(editor: EditorViewLike): void {
  editor.dispatch({
    effects: StateEffect.appendConfig.of(codeEditorTooltipBounds as Extension),
  });
}
