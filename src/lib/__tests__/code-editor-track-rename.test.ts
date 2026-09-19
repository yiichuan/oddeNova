// @vitest-environment happy-dom
// Integration checks for the rename transaction against the real CodeMirror
// build: the repl callback order (dispatch → updateListener → repl.setCode →
// service state), the isolated undo boundary, undo/redo walking registered
// versions, and decoration ranges moving with the change the way the mini
// location highlighter maps them.
import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrudelService } from '../../services/strudel';

const CODE = 'stack(\n  /* @layer 鼓组 */ s("bd*4"),\n  /* @layer 贝斯 */ note("c2")\n)';
const MARKER_0 = '/* @layer 鼓组 */';
const MARKER_1 = '/* @layer 贝斯 */';

vi.mock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
vi.mock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

// A decoration field over the second track's slot, mirroring how the mini
// location highlighter holds ranges that must survive unrelated edits.
const track2From = CODE.indexOf(MARKER_1);
const track2To = CODE.length - 1;
const miniLocationField = StateField.define<DecorationSet>({
  create: () => Decoration.set([Decoration.mark({ class: 'mini-location' }).range(track2From, track2To)]),
  update: (value, tr) => (tr.docChanged ? value.map(tr.changes) : value),
  provide: (field) => EditorView.decorations.from(field),
});
type DecorationSet = ReturnType<typeof Decoration.set>;

let holder: HTMLDivElement;
beforeEach(() => {
  holder = document.createElement('div');
  document.body.append(holder);
});
afterEach(() => {
  holder.remove();
});

function makeHarness() {
  const service = new StrudelService();
  const mutable = service as unknown as {
    _state: { code: string; activeCode: string; isPlaying: boolean; isPaused: boolean; isDirty: boolean };
    isAudioInitialized: boolean;
    editorInstance: unknown;
    handleReplUpdateState: (state: { code?: string; activeCode?: string; started?: boolean; isDirty?: boolean }) => void;
  };
  mutable.isAudioInitialized = true;
  mutable._state.code = CODE;

  const repl = {
    setCode: (next: string) => {
      mutable.handleReplUpdateState({ code: next, started: mutable._state.isPlaying, isDirty: true });
    },
    stop: vi.fn(),
    scheduler: { setCycle: vi.fn(), now: () => 0 },
  };
  const view = new EditorView({
    state: EditorState.create({
      doc: CODE,
      extensions: [
        history(),
        miniLocationField,
        EditorView.updateListener.of((tr) => {
          if (tr.docChanged) repl.setCode(view.state.doc.toString());
        }),
      ],
    }),
    parent: holder,
  });
  mutable.editorInstance = { editor: view, repl };

  const marker0 = CODE.indexOf(MARKER_0);
  const marker1 = CODE.indexOf(MARKER_1);
  service.trackPreview.commit({ queryArc: () => [] }, {
    oddenovaTracks: {
      tracks: [
        {
          id: '1:0', name: '鼓组', colorKey: '鼓组',
          sourceRange: { from: marker0, to: marker0 + MARKER_0.length + ' s("bd*4"),'.length },
          markerRange: { from: marker0, to: marker0 + MARKER_0.length },
          nameRange: { from: marker0 + 10, to: marker0 + 12 },
        },
        {
          id: '1:1', name: '贝斯', colorKey: '贝斯',
          sourceRange: { from: marker1, to: CODE.length - 1 },
          markerRange: { from: marker1, to: marker1 + MARKER_1.length },
          nameRange: { from: marker1 + 10, to: marker1 + 12 },
        },
      ],
      sourceCode: CODE,
      stackRange: { from: 0, to: CODE.length },
    },
  });
  const transportEvents: string[] = [];
  service.onTransportChange(event => transportEvents.push(event.reason));
  return { service, view, mutable, transportEvents };
}

function miniLocationRange(view: EditorView): { from: number; to: number } {
  const cursor = view.state.field(miniLocationField).iter();
  return { from: cursor.from, to: cursor.to };
}

describe('track rename editor integration', () => {
  it('renames through one dispatch, keeps the transport still, and maps decorations', () => {
    const { service, view, mutable, transportEvents } = makeHarness();
    mutable._state.isPaused = true;

    const result = service.renameTrack('1:0', '主鼓组变长了');

    expect(result).toEqual({ status: 'renamed', name: '主鼓组变长了' });
    const renamed = CODE.replace('鼓组', '主鼓组变长了');
    expect(view.state.doc.toString()).toBe(renamed);
    expect(mutable._state.code).toBe(renamed);
    expect(mutable._state.isPaused).toBe(true);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓组变长了', '贝斯']);
    expect(service.trackPreview.trackSource('1:1')?.sourceCode).toBe(renamed);
    expect(transportEvents).toEqual(['apply']);

    // The decoration over the second track shifted by the rename's length
    // delta, exactly the mapping the mini location highlighter relies on.
    const delta = renamed.length - CODE.length;
    const range = miniLocationRange(view);
    expect(range.from).toBe(track2From + delta);
    expect(range.to).toBe(track2To + delta);
    expect(view.dom.querySelector('.mini-location')?.textContent).toContain('note("c2")');
  });

  it('undo and redo step over the isolated rename boundary and re-sync the names', () => {
    const { service, view, mutable } = makeHarness();

    service.renameTrack('1:0', '主鼓');
    expect(view.state.doc.toString()).toBe(CODE.replace('鼓组', '主鼓'));

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(CODE);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['鼓组', '贝斯']);
    expect(mutable._state.code).toBe(CODE);

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(CODE.replace('鼓组', '主鼓'));
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓', '贝斯']);
  });

  it('keeps a rename and a following manual edit as separate undo entries', () => {
    const { service, view, mutable } = makeHarness();

    service.renameTrack('1:0', '主鼓');
    view.dispatch({ changes: { from: 0, to: 0, insert: '// 头部说明\n' } });
    const withEdit = view.state.doc.toString();
    expect(withEdit).not.toBe(CODE);

    // The first undo reverts only the manual edit; the rename's own entry
    // follows as an isolated step.
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(CODE.replace('鼓组', '主鼓'));
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓', '贝斯']);
    expect(mutable._state.code).toBe(CODE.replace('鼓组', '主鼓'));

    // The second undo reverts the rename itself and re-syncs the names.
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(CODE);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['鼓组', '贝斯']);
  });

  it('walks two consecutive renames back and forth one step at a time', () => {
    const { service, view } = makeHarness();

    service.renameTrack('1:0', '主鼓');
    service.renameTrack('1:1', '低音');
    const bothRenamed = view.state.doc.toString();

    undo(view);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓', '贝斯']);
    undo(view);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['鼓组', '贝斯']);
    redo(view);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓', '贝斯']);
    redo(view);
    expect(service.trackPreview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓', '低音']);
    expect(view.state.doc.toString()).toBe(bothRenamed);
  });

  it('refuses a rename once an ordinary edit has drifted the document', () => {
    const { service, view } = makeHarness();

    service.renameTrack('1:0', '主鼓');
    view.dispatch({ changes: { from: 0, to: 0, insert: '// note\n' } });

    expect(service.renameTrack('1:1', '低音')).toEqual({ status: 'stale-code' });
    expect(view.state.doc.toString()).toBe('// note\n' + CODE.replace('鼓组', '主鼓'));
  });
});
