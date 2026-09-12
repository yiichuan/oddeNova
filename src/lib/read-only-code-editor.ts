/**
 * A CodeMirror view for reading a Strudel script and nothing else — the archive
 * counterpart to the studio's editor.
 *
 * Why a real editor rather than a `<pre>`: everything that makes the studio's
 * code legible is written against `.cm-editor` in index.css — the gutter's fixed
 * 44px on a phone, the 16px face that stops iOS zooming, the 2.0 line height and
 * 0.1em tracking, the hanging 3ch indent on a wrapped line, the fades at both
 * ends, the bar that only shows itself while the code is moving. A second,
 * hand-set code box would have to restate all of it and would drift from it by
 * the next change. This one wears the same classes and inherits the lot,
 * including the palette `editor-preferences.ts` injects, which is why a theme
 * change repaints it without anything being rebuilt.
 *
 * It is emphatically not a second studio editor: it is built from CodeMirror
 * directly rather than from StrudelMirror, so it carries no scheduler, no
 * transpiler and no binding to the audio engine. It holds a string. Playing,
 * copying and opening in the studio stay with the page around it.
 */

import type { EditorView } from '@codemirror/view';

/** The class the read-only view wears on top of `.cm-editor`'s own rules. */
export const READ_ONLY_CODE_CLASS = 'code-readonly';

export async function createReadOnlyCodeEditor(
  parent: HTMLElement,
  doc: string,
): Promise<EditorView> {
  /* Loaded on demand. The Favorites page is reached without the studio ever
     being opened, and CodeMirror is not small enough to pull into that page's
     first paint for a window that may never be opened. */
  const [
    { EditorView: View, lineNumbers },
    { EditorState },
    { LRLanguage, LanguageSupport },
    { parser },
    { oddenovaSyntaxHighlight },
  ] = await Promise.all([
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('@codemirror/language'),
    import('@lezer/javascript'),
    import('./oddenova-syntax-highlight'),
  ]);

  return new View({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        /* One axis only. A phone is narrower than the measure a Strudel line is
           written to, so a script set as written would be read by dragging it
           sideways a line at a time — and a window you have to move in two
           directions to read is one you cannot keep your place in. The studio's
           own editor wraps at this width for the same reason. */
        View.lineWrapping,
        /* Two different noes, and both are wanted. `readOnly` refuses edits;
           `editable: false` also drops `contenteditable`, which is what keeps a
           tap from raising the soft keyboard over a page that has nothing to
           type into. Selecting and copying the code still work — CodeMirror's
           own selection does not depend on the element being editable. */
        EditorState.readOnly.of(true),
        View.editable.of(false),
        /* The grammar is Lezer's JavaScript parser, which carries its own
           highlighting props; the colours on top of it are oddeNova's, named
           through the same `--syntax-*` properties the studio's editor reads. So
           a keyword is the same colour in both windows, in both palettes. */
        new LanguageSupport(LRLanguage.define({ parser })),
        oddenovaSyntaxHighlight,
      ],
    }),
  });
}

/**
 * Show a different script in a view that is already built.
 *
 * A new version arrives at the top: it is a different script, and starting it
 * where the last one was left off would open it part-read. Re-setting the *same*
 * script is a no-op on purpose — a play or stop re-renders the page around this
 * window, and a reader who has scrolled halfway down a long script should not be
 * sent back to line one for pressing play.
 */
export function setReadOnlyCode(view: EditorView, code: string): void {
  if (view.state.doc.toString() === code) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: code },
    selection: { anchor: 0 },
    scrollIntoView: false,
  });
  view.scrollDOM.scrollTop = 0;
}
