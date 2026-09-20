import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

/** How long a track navigation's highlight stays on its code block. */
export const TRACK_CODE_HIGHLIGHT_MS = 1200;

export interface TrackCodeRange {
  from: number;
  to: number;
}

type TrackRevealView = {
  dispatch: (transaction: { effects?: unknown }) => void;
};

export type { TrackRevealView };

const setTrackHighlight = StateEffect.define<TrackCodeRange | null>();

const trackHighlightMark = Decoration.mark({ class: 'code-editor-track-highlight' });

// The highlight lives in its own StateField so it never shares fate with the
// text selection: an edit clears it (the range no longer describes the same
// code) and a fresh reveal replaces it.
const trackHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    if (transaction.docChanged) return Decoration.none;
    let next = decorations;
    for (const effect of transaction.effects) {
      if (!effect.is(setTrackHighlight)) continue;
      next = effect.value
        ? Decoration.set([trackHighlightMark.range(effect.value.from, effect.value.to)])
        : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const revealTimers = new WeakMap<object, { token: number; timer: number }>();

/**
 * Highlight `range` and scroll it into view. A new reveal restarts the
 * highlight and retires the previous clear timer, so repeated navigation to
 * the same track keeps it lit; a text edit clears the decoration through the
 * field itself.
 */
export function revealTrackCode(view: TrackRevealView, range: TrackCodeRange): void {
  const previous = revealTimers.get(view as unknown as object);
  const token = (previous?.token ?? 0) + 1;
  if (previous?.timer) window.clearTimeout(previous.timer);

  view.dispatch({
    effects: [
      setTrackHighlight.of({ from: range.from, to: range.to }),
      EditorView.scrollIntoView(range.from, { y: 'center' }),
    ],
  });

  const timer = window.setTimeout(() => {
    const current = revealTimers.get(view as unknown as object);
    if (!current || current.token !== token) return;
    revealTimers.set(view as unknown as object, { token, timer: 0 });
    view.dispatch({ effects: [setTrackHighlight.of(null)] });
  }, TRACK_CODE_HIGHLIGHT_MS);
  revealTimers.set(view as unknown as object, { token, timer });
}

/** Drop a pending highlight timer — the view is going away or re-attaching. */
export function disposeTrackNavigation(view: TrackRevealView): void {
  const state = revealTimers.get(view as unknown as object);
  if (state?.timer) window.clearTimeout(state.timer);
  revealTimers.delete(view as unknown as object);
}

/** Add the navigation highlight field to a freshly mounted editor view. */
export function installCodeEditorTrackNavigation(view: TrackRevealView): void {
  view.dispatch({ effects: [StateEffect.appendConfig.of(trackHighlightField)] });
}

/** Outcome of asking the service to reveal a track's code. */
export type TrackRevealStatus = 'revealed' | 'stale-code' | 'unknown-track' | 'unavailable';
