import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { getMiniReplPrebake } from './mini-repl-engine';
import { PlayIcon, StopIcon, RetryIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import ClaviatureView from './Claviature';
import { highlightLines } from './static-highlight';
import { installOddenovaSyntaxHighlight } from '../lib/oddenova-syntax-highlight';
import { usePitchColors } from './pitch-theme';

const GLOBAL_VISUALIZATION_CALL = /\.(?:punchcard|pianoroll|scope|spiral|pitchwheel|spectrum)\s*\(/;

interface EditorViewLike {
  dispatch: (transaction: { effects: unknown }) => void;
}

interface StrudelMirrorInstance {
  dispose?: () => void;
  evaluate: (autostart?: boolean) => Promise<void>;
  setCode: (code: string) => void;
  stop: () => void;
  toggle: () => Promise<void> | void;
  drawFirstFrame?: () => Promise<void>;
  /** The CodeMirror view under this REPL — what the docs' syntax highlighter installs into. */
  editor?: EditorViewLike;
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

function ThemedClaviature({
  activeNotes,
  labels,
  range,
}: {
  activeNotes: number[];
  labels: Record<string, string | number>;
  range: [string, string];
}) {
  const colors = usePitchColors();
  return (
    <ClaviatureView
      options={{
        range,
        scaleY: 0.75,
        colorize: [{ keys: activeNotes, color: colors.pitch }],
        labels,
      }}
    />
  );
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
  const initialCode = Array.isArray(code) ? code[0] : code;
  const hasGlobalVisualization = (tunes ?? [initialCode]).some((tune) => GLOBAL_VISUALIZATION_CALL.test(tune));
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const globalVisualizationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<StrudelMirrorInstance | null>(null);
  // StrudelMirror derives inline widget ids (._scope(), ._pianoroll(), etc.) from
  // this `id` — without one, every block computes the same id (e.g.
  // `_widget__scope_0`) and they clobber each other's analyser/canvas wiring,
  // matching strudel.cc's own MiniRepl passing a per-instance id for the same reason.
  const replId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const globalVisualizationCanvasId = `${replId}-global-visualization`;

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
      const [{ StrudelMirror, compartments }, { transpiler }, { webaudioOutput }, { getAudioContext }, { noteToMidi }, { getDrawContext }] = await Promise.all([
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
        // A prop-driven punchcard owns the canvas below the editor. Unprefixed
        // visualizers instead paint into a per-example canvas behind the code:
        // keeping that context inside the block avoids @strudel/draw's default
        // `#test-canvas`, which is fixed to the viewport and prepended to body.
        // Blocks without either kind of painter need no draw context at all.
        drawContext: punchcard
          ? canvas?.getContext('2d')
          : hasGlobalVisualization
            ? getDrawContext(globalVisualizationCanvasId)
            : undefined,
        editPattern,
        onUpdateState: (state: { started?: boolean; isDirty?: boolean; evalError?: unknown }) => {
          setStarted(!!state.started);
          setIsDirty(!!state.isDirty);
          setError(state.evalError ? String((state.evalError as { message?: string })?.message ?? state.evalError) : null);
        },
      }) as StrudelMirrorInstance;
      editorRef.current = editor;
      // Same move the studio engine makes after creating its editor (see
      // src/services/strudel.ts): swap Strudel's own theme compartment for the
      // oddeNova highlighter, whose colours are `var(--syntax-…)` rules. The
      // compartment is then never touched again — a dark/light flip repaints
      // through the CSS variables learn.css declares per app theme, so the
      // editor instance itself is neither recreated nor re-evaluated.
      if (editor.editor) {
        installOddenovaSyntaxHighlight(editor.editor, compartments.theme);
      }
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

  // The global-visualization canvas is absolutely positioned, so its bitmap
  // must follow the editor host rather than contributing layout of its own.
  useEffect(() => {
    if (!hasGlobalVisualization) return;
    const host = containerRef.current;
    const canvas = globalVisualizationCanvasRef.current;
    if (!host || !canvas) return;
    const resize = () => {
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(host.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(host.clientHeight * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hasGlobalVisualization]);

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
    <div
      className="mb-4 border border-[var(--learn-border)] bg-[var(--learn-editor-bg)]"
      onKeyDownCapture={handleKeyDownCapture}
    >
      <div className="flex items-center border-b border-[var(--learn-border)]">
        <button
          type="button"
          onClick={() => void editorRef.current?.toggle()}
          aria-label={started ? 'stop' : 'play'}
          className="w-9 h-8 flex items-center justify-center text-[var(--learn-text-secondary)] hover:text-[var(--learn-text-primary)] hover:bg-[var(--learn-hover)] shrink-0 border-r border-[var(--learn-border)]"
        >
          {started ? <StopIcon size={13} /> : <PlayIcon size={13} />}
        </button>
        <button
          type="button"
          onClick={() => void editorRef.current?.evaluate()}
          disabled={!isDirty}
          aria-label="update"
          className="w-9 h-8 flex items-center justify-center text-[var(--learn-text-secondary)] shrink-0 disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:text-[var(--learn-text-primary)] enabled:hover:bg-[var(--learn-hover)]"
        >
          <RetryIcon size={13} />
        </button>
        {tunes && (
          <div className="flex items-center ml-auto shrink-0">
            <span className="px-2 text-[11px] text-[var(--learn-text-muted)] tabular-nums">
              {tuneIndex + 1}/{tunes.length}
            </span>
            <button
              type="button"
              onClick={() => changeTune(tuneIndex - 1)}
              aria-label="previous example"
              className="w-9 h-8 flex items-center justify-center text-[var(--learn-text-secondary)] hover:text-[var(--learn-text-primary)] hover:bg-[var(--learn-hover)] border-l border-[var(--learn-border)]"
            >
              <ChevronLeftIcon size={13} />
            </button>
            <button
              type="button"
              onClick={() => changeTune(tuneIndex + 1)}
              aria-label="next example"
              className="w-9 h-8 flex items-center justify-center text-[var(--learn-text-secondary)] hover:text-[var(--learn-text-primary)] hover:bg-[var(--learn-hover)] border-l border-[var(--learn-border)]"
            >
              <ChevronRightIcon size={13} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        className={`mini-repl-code p-2 text-[13px]${hasGlobalVisualization ? ' learn-global-visualization' : ''}`}
      >
        {hasGlobalVisualization && (
          <canvas
            ref={globalVisualizationCanvasRef}
            id={globalVisualizationCanvasId}
            aria-hidden="true"
            className="learn-global-visualization-canvas"
          />
        )}
      </div>
      {punchcard && (
        <canvas ref={setCanvasRef} height={100} className="mini-punchcard block w-full border-t border-[var(--learn-border)]" />
      )}
      {claviature && (
        <div className="border-t border-[var(--learn-border)] p-2 [&_svg]:max-w-full [&_svg]:h-auto">
          <ThemedClaviature
            activeNotes={activeNotes}
            labels={claviatureLabels ?? {}}
            range={claviatureRange}
          />
        </div>
      )}
      {error && <div className="px-3 pb-2 text-[12px] text-[var(--learn-error)]">{error}</div>}
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
      <pre className="mb-4 rounded-md bg-[var(--learn-chip)] p-3 text-[13px] overflow-x-auto">
        <code>{code}</code>
      </pre>
    );
  }
  const lines = highlightLines(code);
  return (
    <pre className="static-code mb-4 rounded-md bg-[var(--learn-chip)] p-3 text-[13px] overflow-x-auto">
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
    <div className="border-l-2 border-[var(--learn-border-strong)] pl-3 py-1 mb-4 bg-[var(--learn-chip)] text-[var(--learn-text-secondary)]">
      {children}
    </div>
  );
}

/** A progressively enhanced disclosure matching strudel.cc's click-to-reveal solutions. */
export function QA({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group mb-4 bg-[var(--learn-chip)] text-[var(--learn-text-secondary)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[var(--learn-text-primary)] [&::-webkit-details-marker]:hidden">
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
      <table className="w-full text-left border-collapse [&_th]:border-b [&_th]:border-[var(--learn-border-strong)] [&_th]:text-[var(--learn-text-primary)] [&_th]:pb-1 [&_th]:pr-4 [&_td]:border-b [&_td]:border-[var(--learn-border)] [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top [&_th:first-child]:whitespace-nowrap [&_td:first-child]:whitespace-nowrap">
        {children}
      </table>
    </div>
  );
}
