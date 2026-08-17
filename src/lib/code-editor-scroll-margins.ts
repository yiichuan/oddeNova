import { EditorView } from '@codemirror/view';
import { StateEffect, type Extension } from '@codemirror/state';

export const CODE_EDITOR_BOTTOM_SCROLL_MARGIN = 22;

export const codeEditorScrollMargins = EditorView.scrollMargins.of(() => ({
  bottom: CODE_EDITOR_BOTTOM_SCROLL_MARGIN,
}));

type EditorViewLike = {
  dispatch: (transaction: { effects: unknown }) => void;
};

export function installCodeEditorScrollMargins(editor: EditorViewLike): void {
  editor.dispatch({
    effects: StateEffect.appendConfig.of(codeEditorScrollMargins as Extension),
  });
}
