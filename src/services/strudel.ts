import type { StrudelMirror as StrudelMirrorType, StrudelReplState } from '@strudel/codemirror';

export type StrudelState = {
  code: string;
  isPlaying: boolean;
  error: string | null;
  engineReady: boolean;
};

type StateCallback = (state: StrudelState) => void;

class StrudelService {
  private static _instance: StrudelService | null = null;

  private editorInstance: StrudelMirrorType | null = null;
  private containerElement: HTMLElement | null = null;
  private isAudioInitialized = false;
  private isInitializing = false;

  private _state: StrudelState = {
    code: '',
    isPlaying: false,
    error: null,
    engineReady: false,
  };

  private stateCallbacks: StateCallback[] = [];

  static instance(): StrudelService {
    if (!StrudelService._instance) {
      StrudelService._instance = new StrudelService();
    }
    return StrudelService._instance;
  }

  private constructor() {}

  onStateChange(cb: StateCallback): () => void {
    this.stateCallbacks.push(cb);
    cb(this._state);
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter(c => c !== cb);
    };
  }

  private notify(partial: Partial<StrudelState>): void {
    this._state = { ...this._state, ...partial };
    this.stateCallbacks.forEach(cb => cb(this._state));
  }

  get isReady(): boolean {
    return this.isAudioInitialized && !!this.editorInstance;
  }

  get code(): string {
    return this._state.code;
  }

  private prebake = async (): Promise<void> => {
    const { evalScope } = await import('@strudel/core');
    const { initAudioOnFirstClick, registerSynthSounds, samples } = await import('superdough');

    initAudioOnFirstClick();

    const loadModules = evalScope(
      import('@strudel/core'),
      import('@strudel/codemirror'),
      import('@strudel/draw'),
      import('@strudel/mini'),
      import('@strudel/tonal'),
      import('@strudel/webaudio'),
    );

    await Promise.all([
      loadModules,
      registerSynthSounds(),
      samples('github:tidalcycles/dirt-samples'),
      samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json'),
      samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json'),
    ]);

    this.isAudioInitialized = true;
    // Set engineReady after all modules and samples are loaded
    this.notify({ engineReady: true });
  };

  attach = async (container: HTMLElement): Promise<void> => {
    if (this.containerElement === container && this.editorInstance) return;
    if (this.isInitializing) return;

    this.isInitializing = true;
    try {
      const { StrudelMirror } = await import('@strudel/codemirror');
      const { transpiler } = await import('@strudel/transpiler');
      const { webaudioOutput } = await import('@strudel/webaudio');
      const { getAudioContext } = await import('superdough');
      const { getDrawContext } = await import('@strudel/draw');

      const currentCode = this._state.code;

      if (this.editorInstance) {
        this.editorInstance.dispose?.();
        this.editorInstance = null;
      }

      this.containerElement = container;
      this.containerElement.innerHTML = '';

      this.editorInstance = new StrudelMirror({
        root: this.containerElement,
        initialCode: currentCode,
        transpiler,
        defaultOutput: webaudioOutput,
        getTime: () => getAudioContext().currentTime,
        drawTime: [0, -2],
        drawContext: getDrawContext(),
        onUpdateState: (state: StrudelReplState) => {
          const evalError = state.evalError;
          const error = evalError
            ? (evalError instanceof Error ? evalError.message : String(evalError))
            : null;
          this.notify({
            code: state.code ?? this._state.code,
            isPlaying: state.started ?? false,
            error,
          });
        },
        onError: (error: Error) => {
          this.notify({ error: error.message });
        },
        prebake: this.prebake,
      });

      // Sync REPL internal state with initial code
      this.editorInstance.repl.setCode(currentCode);

    } finally {
      this.isInitializing = false;
    }
    // engineReady is set by prebake() after all modules load
  };

  setCode = (code: string): void => {
    this._state = { ...this._state, code };
    if (this.editorInstance) {
      this.editorInstance.setCode(code);
    }
  };

  play = async (): Promise<void> => {
    if (!this.editorInstance) throw new Error('Engine not initialized');
    this.notify({ error: null });
    await this.editorInstance.evaluate();
  };

  stop = (): void => {
    this.editorInstance?.repl.stop();
  };

  clearError = (): void => {
    this.notify({ error: null });
  };
}

export const strudelService = StrudelService.instance();


// --- Code validation (no audio engine needed) ---

export function validateCode(code: string): { ok: boolean; error?: string } {
  if (!code?.trim()) return { ok: false, error: '代码为空' };
  const clean = code
    .replace(/\._scope\(\)/g, '')
    .replace(/\._pianoroll\(\{[^}]*\}\)/g, '')
    .replace(/\._pianoroll\(\)/g, '');
  try {
    new Function(clean);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function validateCodeRuntime(code: string): { ok: boolean; error?: string } {
  const syn = validateCode(code);
  if (!syn.ok) return syn;
  if (!strudelService.isReady) return { ok: true };

  const stripped = code
    .replace(/\._scope\(\)/g, '')
    .replace(/\._pianoroll\(\{[^}]*\}\)/g, '')
    .replace(/\._pianoroll\(\)/g, '')
    .replace(/^\s*setcps\([^)]*\)\s*;?\s*$/gm, '');

  const PASS_THROUGH = new Set([
    'undefined', 'NaN', 'Infinity', 'globalThis', 'window', 'self',
    'console', 'Math', 'Number', 'String', 'Array', 'Object', 'JSON',
    'Boolean', 'Symbol', 'Date', 'RegExp', 'Promise',
  ]);

  const proxy = new Proxy({}, {
    has() { return true; },
    get(_t, key) {
      if (typeof key === 'symbol') return (globalThis as Record<symbol, unknown>)[key as unknown as symbol];
      const k = key as string;
      const v = (globalThis as Record<string, unknown>)[k];
      if (v === undefined && !PASS_THROUGH.has(k)) {
        throw new ReferenceError(`${k} is not defined`);
      }
      return v;
    },
  });

  try {
    new Function('__s__', `with (__s__) { ${stripped} }`)(proxy);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Legacy export for agent tools compatibility
export function isInitialized(): boolean {
  return strudelService.isReady;
}
