import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { useScrollActivity } from '../../hooks/useScrollActivity';
import {
  READ_ONLY_CODE_CLASS,
  createReadOnlyCodeEditor,
  setReadOnlyCode,
} from '../../lib/read-only-code-editor';

interface ReadOnlyCodeViewProps {
  code: string;
  /**
   * Whether the window holding this view is on screen.
   *
   * The windows this sits in are hidden rather than unmounted, so that the page
   * behind them keeps its state. The editor is built the first time one of them
   * is actually opened — a code box measured while its box is `visibility:
   * hidden` has no width to lay a line out in — and kept afterwards.
   */
  active?: boolean;
  className?: string;
}

/**
 * A script, set the way the studio sets it, with nothing to press and nothing to
 * type into. See `lib/read-only-code-editor.ts` for why this is a real editor.
 */
export default function ReadOnlyCodeView({
  code,
  active = true,
  className = '',
}: ReadOnlyCodeViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /* What the editor should be holding, read at the moment it finishes building:
     the script can change while the import is still in flight. Kept in step from
     an effect declared above the build, so the build reads the latest value
     rather than the one its own commit closed over. */
  const codeRef = useRef(code);
  useEffect(() => { codeRef.current = code; }, [code]);
  const [built, setBuilt] = useState(false);

  /* Bound to the host rather than to CodeMirror's scroller, which does not exist
     yet — see useScrollActivity on why one listener on the box that is always
     there covers the child that arrives later. */
  useScrollActivity(hostRef);

  useEffect(() => {
    if (!active || viewRef.current || !hostRef.current) return undefined;
    let cancelled = false;
    void createReadOnlyCodeEditor(hostRef.current, codeRef.current).then((view) => {
      if (cancelled) {
        view.destroy();
        return;
      }
      viewRef.current = view;
      setReadOnlyCode(view, codeRef.current);
      setBuilt(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => () => {
    viewRef.current?.destroy();
    viewRef.current = null;
  }, []);

  useEffect(() => {
    if (viewRef.current) setReadOnlyCode(viewRef.current, code);
  }, [code, built]);

  /* The window is opened by a transition from `visibility: hidden`, so the box
     this measured itself against on the way in may not have been the box it ends
     up in. Asking for a measure on each showing costs nothing when nothing
     changed and saves a first paint of lines wrapped to the wrong width. */
  useEffect(() => {
    if (active) viewRef.current?.requestMeasure();
  }, [active]);

  return (
    <div
      ref={hostRef}
      data-testid="read-only-code"
      /* `code-editor-fade-top` and `code-scroll-autohide` are the studio code
         window's own two: the gradient over the first line, and the bar that only
         shows itself while the code is moving. */
      className={`${READ_ONLY_CODE_CLASS} code-editor-fade-top code-scroll-autohide h-full ${className}`}
    />
  );
}
