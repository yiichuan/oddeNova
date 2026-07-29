import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { getMiniReplPrebake } from './mini-repl-engine';
import { PlayIcon, StopIcon, RetryIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import ClaviatureView from './Claviature';
import { highlightLines } from './static-highlight';

interface StrudelMirrorInstance {
  dispose?: () => void;
  evaluate: (autostart?: boolean) => Promise<void>;
  setCode: (code: string) => void;
  stop: () => void;
  toggle: () => Promise<void> | void;
  drawFirstFrame?: () => Promise<void>;
}

interface PaintHap {
  hasOnset?: () => boolean;
  value: { note?: string | number } | string | number;
}
type PaintCallback = (ctx: CanvasRenderingContext2D | undefined, time: number, haps: PaintHap[], drawTime: [number, number]) => void;

interface OnPaintPattern {
  onPaint: (painter: PaintCallback) => OnPaintPattern;
  punchcard: (options: { labels: boolean }) => OnPaintPattern;
}

interface CodeBlockProps {
  /**
   * A single example, or — matching strudel.cc's `<MiniRepl tunes={...}>` —
   * a list the reader can page through with the prev/next buttons.
   */
  code: string | string[];
  /** Renders a scrolling punchcard/pianoroll visualization below the editor, matching strudel.cc's `<MiniRepl punchcard>` examples. */
  punchcard?: boolean;
  punchcardLabels?: boolean;
  /** Paints the first frame before playback starts, matching strudel.cc's `<MiniRepl autodraw>` examples — needed by blocks whose visual is inline (`._punchcard()`, `._pianoroll()`) rather than a punchcard canvas. */
  autodraw?: boolean;
  /** Renders a piano keyboard below the editor, highlighting notes as they play, matching strudel.cc's `<MiniRepl claviature>` examples. */
  claviature?: boolean;
  claviatureLabels?: Record<string, string | number>;
  claviatureRange?: [string, string];
}

/**
 * A playable Strudel code example — each instance is its own independent
 * `StrudelMirror` (editor + scheduler), same approach strudel.cc's own
 * MiniRepl uses. All instances share one superdough AudioContext (never a
 * per-block context) and self-coordinate via StrudelMirror's built-in
 * "solo" behavior, so starting one stops any other that's playing.
 */
export function CodeBlock({
  code,
  punchcard = false,
  punchcardLabels = true,
  autodraw = false,
  claviature = false,
  claviatureLabels,
  claviatureRange = ['C2', 'C6'],
}: CodeBlockProps) {
  const tunes = Array.isArray(code) ? code : null;
  const initialCode = tunes ? tunes[0] : code;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<StrudelMirrorInstance | null>(null);
  // StrudelMirror derives inline widget ids (._scope(), ._pianoroll(), etc.) from
  // this `id` — without one, every block computes the same id (e.g.
  // `_widget__scope_0`) and they clobber each other's analyser/canvas wiring,
  // matching strudel.cc's own MiniRepl passing a per-instance id for the same reason.
  const replId = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Best-effort: size the canvas as soon as React attaches it (commit
  // phase), same as strudel.cc's own MiniRepl, so the common case never
  // needs a resize later at all. In deeply nested flex layouts this can
  // still read clientWidth as 0 before the whole subtree's geometry has
  // settled — guarded below, since setting width=0 would make the canvas
  // element itself zero-size (not just its drawing blank). The
  // ResizeObserver further down is the authoritative fallback for that case
  // and for later real layout changes.
  const setCanvasRef = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el && el.clientWidth > 0 && el.width !== el.clientWidth) {
      el.width = el.clientWidth;
    }
  };
  const [started, setStarted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [tuneIndex, setTuneIndex] = useState(0);

  // Paging to another tune evaluates it right away (so it starts playing),
  // same as strudel.cc's MiniRepl prev/next buttons.
  function changeTune(index: number) {
    if (!tunes) return;
    const next = ((index % tunes.length) + tunes.length) % tunes.length;
    setTuneIndex(next);
    editorRef.current?.setCode(tunes[next]);
    void editorRef.current?.evaluate();
  }

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const [{ StrudelMirror }, { transpiler }, { webaudioOutput }, { getAudioContext }, { noteToMidi }, { getDrawContext }] = await Promise.all([
        import('@strudel/codemirror'),
        import('@strudel/transpiler'),
        import('@strudel/webaudio'),
        import('superdough'),
        import('@strudel/core'),
        import('@strudel/draw'),
      ]);
      if (disposed || !containerRef.current) return;

      const canvas = canvasRef.current;
      const editPattern = claviature
        ? (pat: OnPaintPattern) =>
            pat.onPaint((_ctx, _time, haps) => {
              const active = haps
                .filter((h) => h.hasOnset?.())
                .map((h) => (typeof h.value === 'object' ? h.value.note : h.value))
                .filter((n): n is string | number => n !== undefined)
                .map((n) => (typeof n === 'string' ? (noteToMidi(n) as number) : n));
              setActiveNotes(active);
            })
        : punchcard
          ? (pat: OnPaintPattern) => pat.punchcard({ labels: punchcardLabels })
          : undefined;

      const editor = new StrudelMirror({
        id: replId,
        root: containerRef.current,
        initialCode,
        transpiler,
        defaultOutput: webaudioOutput,
        getTime: () => getAudioContext().currentTime,
        prebake: getMiniReplPrebake,
        // Matches strudel.cc's MiniRepl. The window matters beyond the punchcard
        // canvas: it is what the Drawer queries, and the Drawer always queries the
        // *final* pattern — which is how `._punchcard()` picks up a `.color()`
        // applied after it, while `._pianoroll()` (which queries its own position
        // in the chain via Pattern.draw) does not. A [0, 0] window collapses that
        // query to nothing and makes `cycles` zero, so inline visuals go blank.
        drawTime: claviature ? [0, 0] : punchcard ? [0, 4] : [-2, 2],
        autodraw: punchcard || claviature || autodraw,
        // Also matches strudel.cc's MiniRepl: a block with its own punchcard
        // canvas draws into that, everything else draws into the page-level
        // background canvas from `getDrawContext()`. This is what the
        // unprefixed visual functions (`punchcard()`, `spiral()`) render into —
        // unlike `pianoroll()`/`scope()`/`spectrum()`/`pitchwheel()`, they have
        // no `getDrawContext()` fallback of their own, so leaving this undefined
        // makes them throw inside the draw loop and silently paint nothing.
        drawContext: punchcard ? canvas?.getContext('2d') : getDrawContext(),
        editPattern,
        onUpdateState: (state: { started?: boolean; isDirty?: boolean; evalError?: unknown }) => {
          setStarted(!!state.started);
          setIsDirty(!!state.isDirty);
          setError(state.evalError ? String((state.evalError as { message?: string })?.message ?? state.evalError) : null);
        },
      }) as StrudelMirrorInstance;
      editorRef.current = editor;
    })();

    return () => {
      disposed = true;
      editorRef.current?.dispose?.();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync the canvas on later layout changes (window resize, sidebar
  // toggle, or the ref-callback above having read clientWidth as 0 before
  // this deeply-nested flex layout had settled) — and repaint immediately
  // afterward, since resizing a canvas clears it and nothing else will
  // redraw it until the user presses play.
  useEffect(() => {
    if (!punchcard) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (canvas.width !== canvas.clientWidth && canvas.clientWidth > 0) {
        canvas.width = canvas.clientWidth;
        void editorRef.current?.drawFirstFrame?.();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [punchcard]);

  // On macOS, Option+Period (the Alt-. stop shortcut) is a dead-key combo that
  // produces a composed character (e.g. "≥") as `event.key`, not ".". CodeMirror's
  // own keymap matches on `event.key`, so it silently misses this and the browser
  // types the composed character instead. Same root cause as App.tsx's global
  // Option+. handler for the main editor — mirrored per-instance here since a
  // docs page can have many independent code blocks instead of one shared editor.
  const handleKeyDownCapture = (e: KeyboardEvent) => {
    if (e.altKey && e.code === 'Period' && e.key !== '.') {
      e.preventDefault();
      void editorRef.current?.toggle();
    }
  };

  return (
    <div className="mb-4 border border-[#323232] bg-[#111]" onKeyDownCapture={handleKeyDownCapture}>
      <div className="flex items-center border-b border-[#323232]">
        <button
          type="button"
          onClick={() => void editorRef.current?.toggle()}
          aria-label={started ? 'stop' : 'play'}
          className="w-9 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 shrink-0 border-r border-[#323232]"
        >
          {started ? <StopIcon size={13} /> : <PlayIcon size={13} />}
        </button>
        <button
          type="button"
          onClick={() => void editorRef.current?.evaluate()}
          disabled={!isDirty}
          aria-label="update"
          className="w-9 h-8 flex items-center justify-center text-white/70 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:text-white enabled:hover:bg-white/5"
        >
          <RetryIcon size={13} />
        </button>
        {tunes && (
          <div className="flex items-center ml-auto shrink-0">
            <span className="px-2 text-[11px] text-white/40 tabular-nums">
              {tuneIndex + 1}/{tunes.length}
            </span>
            <button
              type="button"
              onClick={() => changeTune(tuneIndex - 1)}
              aria-label="previous example"
              className="w-9 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 border-l border-[#323232]"
            >
              <ChevronLeftIcon size={13} />
            </button>
            <button
              type="button"
              onClick={() => changeTune(tuneIndex + 1)}
              aria-label="next example"
              className="w-9 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/5 border-l border-[#323232]"
            >
              <ChevronRightIcon size={13} />
            </button>
          </div>
        )}
      </div>
      <div ref={containerRef} className="mini-repl-code p-2 text-[13px] [&_.cm-editor]:bg-transparent" />
      {punchcard && <canvas ref={setCanvasRef} height={100} className="block w-full border-t border-[#323232]" />}
      {claviature && (
        <div className="border-t border-[#323232] p-2 [&_svg]:max-w-full [&_svg]:h-auto">
          <ClaviatureView
            options={{
              range: claviatureRange,
              scaleY: 0.75,
              colorize: [{ keys: activeNotes, color: 'steelblue' }],
              labels: claviatureLabels ?? {},
            }}
          />
        </div>
      )}
      {error && <div className="px-3 pb-2 text-[12px] text-red-400">{error}</div>}
    </div>
  );
}

/**
 * Non-interactive code display for source snippets that were plain markdown
 * fenced code blocks (not `<MiniRepl>`) — e.g. a list of sound names to try,
 * not a runnable pattern. No play/refresh controls, since there's nothing to
 * evaluate. Tokenized with the JS grammar so these read like strudel.cc's own
 * static docs snippets (colored strings/comments/etc.) instead of flat text.
 *
 * `plain` opts out of highlighting for content the JS tokenizer can't read
 * safely — specifically a bare, unquoted URL, whose `//` gets lexed as a
 * line comment (correct JS, wrong here), greying out text that isn't a
 * comment at all.
 */
export function StaticCode({ code, plain = false }: { code: string; plain?: boolean }) {
  if (plain) {
    return (
      <pre className="mb-4 rounded-md bg-white/[0.06] p-3 text-[13px] overflow-x-auto">
        <code>{code}</code>
      </pre>
    );
  }
  const lines = highlightLines(code);
  return (
    <pre className="static-code mb-4 rounded-md bg-white/[0.06] p-3 text-[13px] overflow-x-auto">
      <code>
        {lines.map((line, i) => (
          <Fragment key={i}>
            {line.map((span, j) =>
              span.className ? (
                <span key={j} className={span.className}>
                  {span.text}
                </span>
              ) : (
                span.text
              ),
            )}
            {i < lines.length - 1 && '\n'}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

/** Matches the source docs' <Box> callout — a step-by-step tip or aside. */
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-2 border-white/20 pl-3 py-1 mb-4 bg-white/[0.03] text-white/75">
      {children}
    </div>
  );
}

/** A progressively enhanced disclosure matching strudel.cc's click-to-reveal solutions. */
export function QA({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group mb-4 bg-white/[0.06] text-white/75">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-white/90 [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <span aria-hidden="true" className="text-lg leading-none transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="px-4 pb-3 pt-1">{children}</div>
    </details>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-left border-collapse [&_th]:border-b [&_th]:border-[#323232] [&_th]:pb-1 [&_th]:pr-4 [&_td]:border-b [&_td]:border-[#232323] [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top [&_th:first-child]:whitespace-nowrap [&_td:first-child]:whitespace-nowrap">
        {children}
      </table>
    </div>
  );
}
