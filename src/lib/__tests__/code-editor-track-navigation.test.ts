// @vitest-environment happy-dom
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRACK_CODE_HIGHLIGHT_MS,
  disposeTrackNavigation,
  installCodeEditorTrackNavigation,
  revealTrackCode,
  type TrackCodeRange,
  type TrackRevealView,
} from '../code-editor-track-navigation';

const doc = 'stack(\n  s("bd"),\n  note("36")\n)';
const layerFrom = doc.indexOf('s("bd")');
const layerTo = layerFrom + 's("bd")'.length;

// The extension's view seam is the narrow dispatch shape the service holds;
// a real EditorView satisfies it at runtime but TypeScript compares it
// against CodeMirror's overloaded dispatch, so the test bridges explicitly.
const reveal = (view: EditorView, range: TrackCodeRange): void => {
  revealTrackCode(view as unknown as TrackRevealView, range);
};
const install = (view: EditorView): void => {
  installCodeEditorTrackNavigation(view as unknown as TrackRevealView);
};
const dispose = (view: EditorView): void => {
  disposeTrackNavigation(view as unknown as TrackRevealView);
};

let holder: HTMLDivElement;
beforeEach(() => {
  holder = document.createElement('div');
  document.body.append(holder);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  holder.remove();
});

function createView(): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc }),
    parent: holder,
  });
  install(view);
  return view;
}

describe('code editor track navigation', () => {
  it('highlights the track slot without touching the document or the selection', () => {
    const view = createView();
    const selection = view.state.selection.main;

    reveal(view, { from: layerFrom, to: layerTo });

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.from).toBe(selection.from);
    expect(view.state.selection.main.to).toBe(selection.to);
    const marked = view.dom.querySelector<HTMLElement>('.code-editor-track-highlight');
    expect(marked?.textContent).toBe('s("bd")');
  });

  it('clears the highlight when its time is up', () => {
    const view = createView();
    reveal(view, { from: layerFrom, to: layerTo });
    expect(view.dom.querySelector('.code-editor-track-highlight')).not.toBeNull();

    vi.advanceTimersByTime(TRACK_CODE_HIGHLIGHT_MS - 1);
    expect(view.dom.querySelector('.code-editor-track-highlight')).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(view.dom.querySelector('.code-editor-track-highlight')).toBeNull();
    // Only the reveal and its clear touched the editor.
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('clears the highlight on the next document edit', () => {
    const view = createView();
    reveal(view, { from: layerFrom, to: layerTo });
    view.dispatch({ changes: { from: 0, insert: ' ' } });
    expect(view.dom.querySelector('.code-editor-track-highlight')).toBeNull();
  });

  it('restarts the highlight for a repeated navigation and retires the old timer', () => {
    const view = createView();
    reveal(view, { from: layerFrom, to: layerTo });
    vi.advanceTimersByTime(TRACK_CODE_HIGHLIGHT_MS - 300);

    // The second reveal must keep the block lit past the first reveal's own
    // deadline, then clear on its own.
    reveal(view, { from: layerFrom, to: layerTo });
    vi.advanceTimersByTime(300);
    expect(view.dom.querySelector('.code-editor-track-highlight')).not.toBeNull();

    vi.advanceTimersByTime(TRACK_CODE_HIGHLIGHT_MS - 300 - 1);
    expect(view.dom.querySelector('.code-editor-track-highlight')).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(view.dom.querySelector('.code-editor-track-highlight')).toBeNull();
  });

  it('drops the pending clear timer when the view disposes', () => {
    const view = createView();
    reveal(view, { from: layerFrom, to: layerTo });
    const dispatchSpy = vi.spyOn(view, 'dispatch');
    expect(dispatchSpy).not.toHaveBeenCalled();

    dispose(view);
    vi.advanceTimersByTime(TRACK_CODE_HIGHLIGHT_MS * 3);
    // The extension's own timer must not send anything into a gone view.
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('keeps the caret selection intact across a navigation and its clear', () => {
    const view = createView();
    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf('note')) });
    const from = view.state.selection.main.from;

    reveal(view, { from: layerFrom, to: layerTo });
    vi.advanceTimersByTime(TRACK_CODE_HIGHLIGHT_MS);

    expect(view.state.selection.main.from).toBe(from);
    expect(view.state.selection.main.empty).toBe(true);
  });
});
