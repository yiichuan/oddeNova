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

  private masterLpfNode: BiquadFilterNode | null = null;
  private masterChainReady = false;
  private masterChainSettingUp = false;

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

  private setupMasterChain = async (): Promise<void> => {
    if (this.masterChainReady || this.masterChainSettingUp) return;
    this.masterChainSettingUp = true;
    try {
      const { getAudioContext, getSuperdoughAudioController } = await import('superdough');
      const ctx = getAudioContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controller = getSuperdoughAudioController() as any;
      const destGain: GainNode = controller.output.destinationGain;

      this.masterLpfNode = ctx.createBiquadFilter();
      this.masterLpfNode.type = 'lowpass';
      this.masterLpfNode.frequency.value = 20000;

      destGain.disconnect();
      destGain.connect(this.masterLpfNode);
      this.masterLpfNode.connect(ctx.destination);
      this.masterChainReady = true;
    } catch {
      this.masterChainSettingUp = false;
    }
  };

  setMasterVolume = async (value: number): Promise<void> => {
    await this.setupMasterChain();
    const { getAudioContext, getSuperdoughAudioController } = await import('superdough');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = getSuperdoughAudioController() as any;
    const destGain: GainNode | undefined = controller?.output?.destinationGain;
    if (destGain) {
      destGain.gain.setTargetAtTime(value, getAudioContext().currentTime, 0.05);
    }
  };

  setMasterLPF = async (freq: number): Promise<void> => {
    await this.setupMasterChain();
    if (this.masterLpfNode) {
      const { getAudioContext } = await import('superdough');
      this.masterLpfNode.frequency.setTargetAtTime(freq, getAudioContext().currentTime, 0.01);
    }
  };

  setTempo = (bpm: number): void => {
    const cps = parseFloat(Math.max(0.05, Math.min(8, bpm / 240)).toFixed(6));
    const replacement = `setcps(${cps})`;

    // Surgical CodeMirror dispatch: replace only the setcps(...) token so that
    // miniLocation decorations (the white position boxes) survive unchanged.
    // Full setCode() replaces the whole document and clears all decorations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmView = (this.editorInstance as any)?.editor as {
      state: { doc: { toString(): string } };
      dispatch: (tr: object) => void;
    } | undefined;

    if (cmView) {
      const code = cmView.state.doc.toString();
      const match = /\bsetcps\s*\(\s*[\d.]+\s*\)/.exec(code);
      if (match) {
        cmView.dispatch({ changes: { from: match.index, to: match.index + match[0].length, insert: replacement } });
      } else {
        cmView.dispatch({ changes: { from: 0, to: 0, insert: replacement + '\n' } });
      }
      // The EditorView's updateListener already synced editorInstance.code and repl.setCode.
      // Sync our internal _state so agent tools and history see the right code.
      this._state = { ...this._state, code: cmView.state.doc.toString() };
      this.stateCallbacks.forEach(cb => cb(this._state));
    } else {
      // Engine not yet mounted — patch internal state only (no editor to update)
      const code = this._state.code;
      const match = /\bsetcps\s*\(\s*[\d.]+\s*\)/.exec(code);
      const patched = match
        ? code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length)
        : replacement + '\n' + code;
      if (patched !== code) this.notify({ code: patched });
    }

    // setcps is registered globally by @strudel/core via evalScope — apply immediately
    (window as unknown as Record<string, ((v: number) => void) | undefined>).setcps?.(cps);
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
    void this.setupMasterChain();
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
