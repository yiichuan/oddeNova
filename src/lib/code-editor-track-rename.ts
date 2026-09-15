// Editor-side adaptation for track renames: the CodeMirror history isolation
// for the rename transaction, and the ledger that binds one pending rename to
// a specific editor instance plus the exact before/after documents, so the
// repl's synchronous code callback can recognise its own transaction and
// undo/redo can be classified without touching the transport.
import { isolateHistory } from '@codemirror/commands';

/** The narrow dispatch surface the rename path needs from an EditorView. */
export interface TrackRenameView {
  dispatch: (transaction: {
    changes?: { from: number; to: number; insert: string };
    annotations?: readonly unknown[];
  }) => void;
  state: { doc: { toString(): string } };
}

/**
 * One dispatch, one isolated undo boundary: the rename must never merge with
 * a neighbouring manual input, and undo/redo must step over it exactly once.
 */
export function dispatchTrackRename(view: TrackRenameView, patch: { from: number; to: number; insert: string }): void {
  view.dispatch({ changes: patch, annotations: [isolateHistory.of('full')] });
}

/** A trusted source version: the exact document plus its track metadata. */
export interface RenameVersion<TTracks> {
  code: string;
  tracks: TTracks;
}

interface RenameEntry<TTracks> {
  before: RenameVersion<TTracks>;
  after: RenameVersion<TTracks>;
}

/**
 * Registry of trusted rename conversions for one compile generation.
 *
 * The pending entry is the transaction currently being dispatched; the history
 * entries are the confirmed before/after pairs that undo and redo walk
 * through. Everything is keyed by exact document text and editor identity —
 * there is no global "is renaming" flag to leak across editors or generations.
 */
export class TrackRenameLedger<TTracks> {
  private pending: { editor: object; after: RenameVersion<TTracks>; generation: number } | null = null;
  private entries: (RenameEntry<TTracks> & { generation: number })[] = [];
  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = limit;
  }

  begin(editor: object, after: RenameVersion<TTracks>, generation: number): void {
    this.pending = { editor, after, generation };
  }

  /**
   * Consume the pending transaction when `nextCode` is exactly its after-text
   * on the same editor and compile generation. Returns the version to
   * publish, or null when this document change belongs to the ordinary
   * editing path.
   */
  consume(editor: object, nextCode: string, generation: number): RenameVersion<TTracks> | null {
    if (!this.pending || this.pending.editor !== editor) return null;
    if (this.pending.generation !== generation || nextCode !== this.pending.after.code) return null;
    const { after } = this.pending;
    this.pending = null;
    return after;
  }

  /** Whether a registered transaction has not been consumed (or aborted) yet. */
  pendingActive(): boolean {
    return this.pending !== null;
  }

  abort(): void {
    this.pending = null;
  }

  /** Remember one confirmed conversion; oldest entries fall off the limit. */
  record(before: RenameVersion<TTracks>, after: RenameVersion<TTracks>, generation: number): void {
    this.entries.push({ before, after, generation });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  /**
   * Classify an ordinary-looking document change as an undo or redo step:
   * `nextCode` must land exactly on the version adjacent to the currently
   * mapped one, differing only by the registered marker change, and the
   * entries must still belong to the current compile generation.
   */
  match(currentCode: string | null, nextCode: string, generation: number): RenameVersion<TTracks> | null {
    if (!currentCode) return null;
    for (const entry of this.entries) {
      if (entry.generation !== generation) continue;
      if (entry.after.code === currentCode && nextCode === entry.before.code) return entry.before;
      if (entry.before.code === currentCode && nextCode === entry.after.code) return entry.after;
    }
    return null;
  }

  clear(): void {
    this.pending = null;
    this.entries = [];
  }
}
