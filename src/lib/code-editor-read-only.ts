/**
 * The studio's editor, refusing edits.
 *
 * Wanted while the reading has sent an older take to the window: that take is
 * history, and history is read, not rewritten. The working draft is elsewhere
 * (`session.code`) and untouched for the whole time, so coming back to it is
 * just a matter of putting it back on screen.
 *
 * Note which of the two noes this is. CodeMirror's `readOnly` turns away the
 * typist and not the program, so `setCode` still works through it — which is
 * exactly what is needed, since the next version has to be able to arrive in a
 * window nobody is allowed to type into.
 */

import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';

/**
 * Module-level, and that is safe: the studio has one editor (a singleton
 * service), and a compartment is only a key — a rebuilt editor re-installs it
 * against its own fresh state.
 */
const readOnlyCompartment = new Compartment();

type EditorViewLike = {
  dispatch: (transaction: { effects: unknown }) => void;
};

export function installCodeEditorReadOnly(editor: EditorViewLike): void {
  editor.dispatch({
    effects: StateEffect.appendConfig.of(readOnlyCompartment.of([]) as Extension),
  });
}

export function setCodeEditorReadOnly(editor: EditorViewLike, on: boolean): void {
  editor.dispatch({
    effects: readOnlyCompartment.reconfigure(
      /* Two different noes, and both are wanted — the same pair the archive's
         reading window uses (`read-only-code-editor.ts`). `readOnly` refuses
         edits; `editable: false` also drops `contenteditable`, which is what
         keeps a tap on a phone from raising the soft keyboard over a window
         there is nothing to type into. Selecting and copying still work. */
      on ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
    ),
  });
}
