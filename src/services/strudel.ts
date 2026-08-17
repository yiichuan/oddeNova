import { getErrorMessage } from '../lib/errors';
import { t } from '../lib/i18n';
import { findUnknownSamples } from '../lib/sample-allowlist';
import { registerSoundfonts } from '../lib/soundfont-loader';
import { trackWavExportCompleted } from '../lib/analytics';
import { installOddenovaDarkSyntaxHighlight } from '../lib/oddenova-dark-syntax-highlight';
import { installCodeEditorScrollMargins } from '../lib/code-editor-scroll-margins';

type SafariAudioContextState = AudioContextState | 'interrupted';

type StrudelReplState = {
  code?: string;
  started?: boolean;
  evalError?: Error | unknown;
};

interface StrudelMirrorType {
  dispose?: () => void;
  editor?: {
    dispatch: (transaction: { effects: unknown }) => void;
  };
  repl: {
    setCode: (code: string) => void;
    stop: () => void;
    scheduler?: {
      started?: boolean;
      now?: () => number;
      pause?: () => void;
      stop?: () => void;
      setCycle?: (cycle: number) => void;
      getTime?: () => number;
      lastBegin?: number;
      lastEnd?: number;
      num_cycles_at_cps_change?: number;
      num_ticks_since_cps_change?: number;
      seconds_at_cps_change?: number;
    };
    [key: string]: unknown;
  };
  setCode: (code: string) => void;
  setAutocompletionEnabled: (enabled: boolean) => void;
  setLineWrappingEnabled: (enabled: boolean) => void;
  changeSetting: (key: 'isTabIndentationEnabled', value: boolean) => void;
  evaluate: (autostart?: boolean) => Promise<void>;
}

export type StrudelState = {
  code: string;
  isPlaying: boolean;
  isPaused: boolean;
  error: string | null;
  engineReady: boolean;
  engineStatus: 'initializing' | 'ready' | 'failed';
};

type StateCallback = (state: StrudelState) => void;

const USER_RESUME_PROMPT = t('clickToResume');

type PageAudioRecoveryTarget = Pick<Window | Document, 'addEventListener' | 'removeEventListener'>;

type PageAudioRecoveryOptions = {
  getIsPlaying: () => boolean;
  getVisibilityState: () => DocumentVisibilityState;
  // Whether to proactively stop playback when the page is hidden. Mobile OSes
  // suspend the AudioContext for backgrounded tabs, so we stop cleanly and ask
  // the user to resume; desktop keeps audio running in the background, so it
  // should keep playing across tab switches.
  shouldInterruptOnHidden: () => boolean;
  onPlaybackInterrupted: () => void;
  requestUserResume: () => void;
  windowTarget: PageAudioRecoveryTarget;
  documentTarget: PageAudioRecoveryTarget;
};

type PageAudioRecovery = {
  clearResumeIntent: () => void;
  dispose: () => void;
};

function isOfflineAudioContext(ctx: BaseAudioContext): boolean {
  return typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
}

// Touch devices (phones, tablets) report a coarse pointer. We use this rather
// than a viewport-width breakpoint because the goal is to detect platforms that
// suspend the AudioContext for backgrounded tabs — that maps to the device
// being touch-driven, not to how wide the window happens to be.
function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

// Disconnect a node (optionally from a specific destination), ignoring the
// "node is not connected" error WebAudio throws when it was never wired up.
function safeDisconnect(node: AudioNode, dest?: AudioNode): void {
  try {
    if (dest) node.disconnect(dest);
    else node.disconnect();
  } catch { /* not connected */ }
}

export async function ensureAudioContextResumed(): Promise<SafariAudioContextState> {
  const { getAudioContext } = await import('superdough');
  const ctx = getAudioContext() as AudioContext & { state: SafariAudioContextState };

  if (isOfflineAudioContext(ctx)) return ctx.state;
  if (ctx.state === 'running' || ctx.state === 'closed') return ctx.state;

  await ctx.resume();
  return ctx.state;
}

export function installPageAudioRecovery(options: PageAudioRecoveryOptions): PageAudioRecovery {
  let shouldResume = false;
  let hasRequestedResume = false;

  const rememberResumeIntent = (): void => {
    if (shouldResume || !options.getIsPlaying()) return;

    shouldResume = true;
    hasRequestedResume = false;
    options.onPlaybackInterrupted();
  };

  const requestResumeIfVisible = (): void => {
    if (!shouldResume || hasRequestedResume || options.getVisibilityState() !== 'visible') return;
    hasRequestedResume = true;
    options.requestUserResume();
  };

  const handleVisibilityChange = (): void => {
    if (options.getVisibilityState() === 'hidden') {
      if (options.shouldInterruptOnHidden()) {
        rememberResumeIntent();
      }
    } else {
      requestResumeIfVisible();
    }
  };

  options.documentTarget.addEventListener('visibilitychange', handleVisibilityChange);
  options.windowTarget.addEventListener('pagehide', rememberResumeIntent);
  options.windowTarget.addEventListener('pageshow', requestResumeIfVisible);
  options.windowTarget.addEventListener('focus', requestResumeIfVisible);

  return {
    clearResumeIntent: () => {
      shouldResume = false;
      hasRequestedResume = false;
    },
    dispose: () => {
      options.documentTarget.removeEventListener('visibilitychange', handleVisibilityChange);
      options.windowTarget.removeEventListener('pagehide', rememberResumeIntent);
      options.windowTarget.removeEventListener('pageshow', requestResumeIfVisible);
      options.windowTarget.removeEventListener('focus', requestResumeIfVisible);
    },
  };
}

export class StrudelService {
  private static _instance: StrudelService | null = null;

  private editorInstance: StrudelMirrorType | null = null;
  private containerElement: HTMLElement | null = null;
  private autocompletionEnabled = false;
  private lineWrappingEnabled = false;
  private isAudioInitialized = false;
  private isInitializing = false;

  // Video mode: drive the Strudel scheduler clock from postMessage frame time
  // instead of AudioContext.currentTime, so mini-notation highlights work in
  // Remotion headless render without any WebAudio / sample loading.
  private readonly _isVideoMode: boolean = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  private _videoTime = 0;
  // [video] Remotion updates this value per frame via postMessage, replacing AudioContext.currentTime to drive highlighting
  setVideoTime = (t: number): void => { this._videoTime = t; };

  private masterLpfNode: BiquadFilterNode | null = null;
  private masterChainReady = false;
  private masterChainSettingUp = false;
  // Current UI master values, mirrored here so exportWav can re-apply them on the
  // OfflineAudioContext (the live masterLpfNode lives on the closed ctx after export).
  private currentMasterVolume = 1;
  private currentMasterLpfHz = 20000;
  private pendingSeekCycle: number | null = null;
  private pageAudioRecovery: PageAudioRecovery | null = null;
  private _state: StrudelState = {
    code: '',
    isPlaying: false,
    isPaused: false,
    error: null,
    engineReady: false,
    engineStatus: 'initializing',
  };

  private stateCallbacks: StateCallback[] = [];

  static instance(): StrudelService {
    if (!StrudelService._instance) {
      StrudelService._instance = new StrudelService();
    }
    return StrudelService._instance;
  }

  constructor() {
    if (!this._isVideoMode && typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.pageAudioRecovery = installPageAudioRecovery({
        getIsPlaying: () => this._state.isPlaying,
        getVisibilityState: () => document.visibilityState,
        shouldInterruptOnHidden: isTouchDevice,
        onPlaybackInterrupted: () => {
          this.editorInstance?.repl.stop();
          this.pendingSeekCycle = null;
          this.notify({ isPlaying: false, isPaused: false });
        },
        requestUserResume: () => this.notify({ error: USER_RESUME_PROMPT, isPlaying: false, isPaused: false }),
        windowTarget: window,
        documentTarget: document,
      });
    }
  }

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

  setAutocompletionEnabled(enabled: boolean): void {
    this.autocompletionEnabled = enabled;
    this.editorInstance?.setAutocompletionEnabled(enabled);
  }

  setLineWrappingEnabled(enabled: boolean): void {
    this.lineWrappingEnabled = enabled;
    this.editorInstance?.setLineWrappingEnabled(enabled);
  }

  private prebake = async (): Promise<void> => {
    try {
      const { evalScope, Pattern, noteToMidi, valueToMidi } = await import('@strudel/core');
      const { initAudioOnFirstClick, registerSynthSounds, samples, aliasBank, getAudioContext, getSuperdoughAudioController } = await import('superdough');

      initAudioOnFirstClick();

      const loadModules = evalScope(
        import('@strudel/core'),
        import('@strudel/codemirror'),
        import('@strudel/draw'),
        import('@strudel/mini'),
        import('@strudel/tonal'),
        import('@strudel/webaudio'),
      );

      if (this._isVideoMode) {
        // Video/headless render: only load pattern evaluation modules.
        // Skip WebAudio init and remote sample downloads — they freeze the
        // Remotion headless Chrome page and are not needed for screenshot rendering.
        await loadModules;
      } else {
        await Promise.all([
          loadModules,
          registerSynthSounds(),
          samples('/sample-index/dirt-samples.json'),
          samples('/sample-index/tidal-drum-machines.json'),
          samples('/sample-index/piano.json'),
          samples('/sample-index/vcsl.json'),
          samples('/sample-index/mridangam.json'),
        ]);
        await samples('/sample-index/uzu-drumkit.json');
        await aliasBank('/sample-index/tidal-drum-machines-alias.json');
        registerSoundfonts();
        (window as unknown as Record<string, unknown>).getAudioContext = getAudioContext;
        (window as unknown as Record<string, unknown>).getSuperdoughAudioController = getSuperdoughAudioController;
        (window as unknown as Record<string, unknown>).recordLive = (sec: number, name?: string) =>
          this.recordLive(sec, name);
      }

      // Register .piano() pattern method (from strudel packages/repl/prebake.mjs)
      const maxPan = noteToMidi('C8');
      const panwidth = (pan: number, width: number) => pan * width + (1 - width) / 2;
      if (!Pattern.prototype.piano) {
        Pattern.prototype.piano = function () {
          return this.fmap((v: Record<string, unknown>) => ({ ...v, clip: v['clip'] ?? 1 }))
            .s('piano')
            .release(0.1)
            .fmap((value: Record<string, unknown>) => {
              const midi = valueToMidi(value);
              const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5);
              return { ...value, pan: ((value['pan'] as number) || 1) * pan };
            });
        };
      }

      this.isAudioInitialized = true;
      this.notify({ engineReady: true, engineStatus: 'ready', error: null });
    } catch (error) {
      const message = getErrorMessage(error);
      this.isAudioInitialized = false;
      this.notify({ engineReady: false, engineStatus: 'failed', error: message });
      throw error;
    }
  };

  attach = async (container: HTMLElement): Promise<void> => {
    if (this.containerElement === container && this.editorInstance) return;
    if (this.isInitializing) return;

    this.containerElement = container;
    this.isInitializing = true;
    this.notify({ engineReady: false, engineStatus: 'initializing', error: null });
    try {
      const { StrudelMirror, compartments } = await import('@strudel/codemirror');
      const { transpiler } = await import('@strudel/transpiler');
      cachedTranspiler = transpiler;
      const { getDrawContext } = await import('@strudel/draw');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let defaultOutput: any;
      let getTimeFn: () => number;

      if (this._isVideoMode) {
        // [video] Remotion headless render: disable audio output, use frame time instead of AudioContext clock
        defaultOutput = async () => {};
        getTimeFn = () => this._videoTime;
      } else {
        const { webaudioOutput } = await import('@strudel/webaudio');
        const { getAudioContext } = await import('superdough');
        defaultOutput = webaudioOutput;
        getTimeFn = () => getAudioContext().currentTime;
      }

      const currentCode = this._state.code;

      if (this.editorInstance) {
        this.editorInstance.dispose?.();
        this.editorInstance = null;
      }

      this.containerElement.innerHTML = '';

      const editor = new StrudelMirror({
        root: this.containerElement,
        initialCode: currentCode,
        transpiler,
        defaultOutput,
        getTime: getTimeFn,
        drawTime: [0, -2],
        drawContext: getDrawContext(), // default id='test-canvas'; src/index.css has the corresponding #test-canvas z-index rule
        onUpdateState: (state: StrudelReplState) => {
          const evalError = state.evalError;
          const error = evalError ? getErrorMessage(evalError) : null;
          const nextCode = state.code ?? this._state.code;
          const didCodeChange = nextCode !== this._state.code;
          if (didCodeChange) this.pendingSeekCycle = null;
          this.notify({
            code: nextCode,
            isPlaying: state.started ?? false,
            isPaused: didCodeChange || state.started ? false : this._state.isPaused,
            error,
          });
        },
        onError: (error: Error) => {
          this.notify({ error: error.message });
        },
        prebake: this.prebake,
      });
      this.editorInstance = editor;
      editor.setAutocompletionEnabled(this.autocompletionEnabled);
      editor.setLineWrappingEnabled(this.lineWrappingEnabled);
      editor.changeSetting('isTabIndentationEnabled', true);
      if (editor.editor) {
        installOddenovaDarkSyntaxHighlight(editor.editor, compartments.theme);
        installCodeEditorScrollMargins(editor.editor);
      }

      // Sync REPL internal state with initial code
      this.editorInstance?.repl.setCode(currentCode);
    } catch (error) {
      const message = getErrorMessage(error);
      this.isAudioInitialized = false;
      this.notify({ engineReady: false, engineStatus: 'failed', error: message });
      throw error;
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

      const lpfNode = ctx.createBiquadFilter();
      lpfNode.type = 'lowpass';
      lpfNode.frequency.value = 20000;
      this.masterLpfNode = lpfNode;

      safeDisconnect(destGain, ctx.destination);
      destGain.connect(lpfNode);
      lpfNode.connect(ctx.destination);
      this.masterChainReady = true;
    } catch {
      this.masterChainSettingUp = false;
    }
  };

  private rebuildMasterChain = async (): Promise<void> => {
    this.masterChainReady = false;
    this.masterChainSettingUp = false;
    this.masterLpfNode = null;
    await this.setupMasterChain();
  };

  private resetLiveAudioGraph = async (): Promise<void> => {
    const {
      getAudioContext,
      setAudioContext,
      setSuperdoughAudioController,
      getSuperdoughAudioController,
      clearNodePools,
      resetGlobalEffects,
      initAudio,
    } = await import('superdough');

    const currentCtx = getAudioContext() as AudioContext & { state: SafariAudioContextState };
    this.editorInstance?.repl.stop();

    if (!isOfflineAudioContext(currentCtx) && currentCtx.state !== 'closed' && typeof currentCtx.close === 'function') {
      try { await currentCtx.close(); } catch { /* Safari may reject close while interrupted */ }
    }

    setAudioContext(null);
    setSuperdoughAudioController(null);
    clearNodePools();
    resetGlobalEffects();
    registerSoundfonts();

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).getAudioContext = getAudioContext;
      (window as unknown as Record<string, unknown>).getSuperdoughAudioController = getSuperdoughAudioController;
    }

    const nextCtx = getAudioContext() as AudioContext & { state: SafariAudioContextState };
    if (!isOfflineAudioContext(nextCtx) && nextCtx.state !== 'running') {
      await nextCtx.resume();
    }

    await initAudio({ maxPolyphony: 128, multiChannelOrbits: false });
    await this.rebuildMasterChain();
    await this.setMasterVolume(this.currentMasterVolume);
    await this.setMasterLPF(this.currentMasterLpfHz);
  };

  private ensurePlayableAudioGraph = async (): Promise<void> => {
    if (this._isVideoMode) return;

    const { getAudioContext } = await import('superdough');
    const ctx = getAudioContext() as AudioContext & { state: SafariAudioContextState };
    if (isOfflineAudioContext(ctx)) return;

    if (ctx.state === 'closed') {
      await this.resetLiveAudioGraph();
      return;
    }

    try {
      await ensureAudioContextResumed();
    } catch {
      await this.resetLiveAudioGraph();
      return;
    }

    const resumedCtx = getAudioContext() as AudioContext & { state: SafariAudioContextState };
    if (!isOfflineAudioContext(resumedCtx) && resumedCtx.state !== 'running') {
      await this.resetLiveAudioGraph();
    }
  };

  private isLikelyAudioGraphError(error: unknown): boolean {
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    return /AudioContext|AudioNode|InvalidAccessError|interrupted|suspended|closed/i.test(message);
  }

  setMasterVolume = async (value: number): Promise<void> => {
    this.currentMasterVolume = value;
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
    this.currentMasterLpfHz = freq;
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
    const didChange = code !== this._state.code;
    if (didChange) this.pendingSeekCycle = null;
    this._state = { ...this._state, code, ...(didChange ? { isPaused: false } : {}) };
    if (this.editorInstance) {
      // Skip the full-document replace when content is unchanged — a redundant
      // setCode clears all CodeMirror decorations (miniLocation highlight boxes)
      // and shows up as a visible flash
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cmView = (this.editorInstance as any)?.editor as { state: { doc: { toString(): string } } } | undefined;
      if (cmView?.state.doc.toString() === code) return;
      this.editorInstance.setCode(code);
    }
  };

  private applySeekCycle(cycle: number): boolean {
    const scheduler = this.editorInstance?.repl.scheduler;
    if (!scheduler || !Number.isFinite(cycle)) return false;

    if (typeof scheduler.setCycle === 'function') {
      scheduler.setCycle(cycle);
      return true;
    }

    // Cyclist does not expose setCycle(), but its next tick takes its cycle
    // origin from lastEnd when the tick counter is reset.
    scheduler.lastBegin = cycle;
    scheduler.lastEnd = cycle;
    scheduler.num_cycles_at_cps_change = cycle;
    scheduler.num_ticks_since_cps_change = 0;
    scheduler.seconds_at_cps_change = scheduler.getTime?.() ?? 0;
    return true;
  }

  seekPlayback = (progress: number, loopCycles: number): boolean => {
    if (!Number.isFinite(progress) || !Number.isFinite(loopCycles) || loopCycles <= 0) return false;
    const targetCycle = Math.min(1, Math.max(0, progress)) * loopCycles;

    if (!this._state.isPlaying) {
      this.pendingSeekCycle = targetCycle;
      return true;
    }

    return this.applySeekCycle(targetCycle);
  };

  private applyPendingSeek(): void {
    if (this.pendingSeekCycle === null) return;
    if (this.applySeekCycle(this.pendingSeekCycle)) this.pendingSeekCycle = null;
  }

  pause = (): boolean => {
    const scheduler = this.editorInstance?.repl.scheduler;
    if (!scheduler || !this._state.isPlaying) return false;

    const currentCycle = scheduler.now?.();
    if (Number.isFinite(currentCycle)) this.pendingSeekCycle = currentCycle as number;

    if (typeof scheduler.pause === 'function') scheduler.pause();
    else if (typeof scheduler.stop === 'function') scheduler.stop();
    else this.editorInstance?.repl.stop();

    this.notify({ isPlaying: false, isPaused: true });
    return true;
  };

  play = async (): Promise<void> => {
    if (!this.editorInstance) throw new Error('Engine not initialized');
    this.notify({ error: null });
    try {
      await this.ensurePlayableAudioGraph();
      await this.editorInstance.evaluate();
      this.applyPendingSeek();
      this.pageAudioRecovery?.clearResumeIntent();
      void this.setupMasterChain();
    } catch (error) {
      if (this.isLikelyAudioGraphError(error)) {
        try {
          await this.resetLiveAudioGraph();
          await this.editorInstance.evaluate();
          this.applyPendingSeek();
          this.pageAudioRecovery?.clearResumeIntent();
          void this.setupMasterChain();
          return;
        } catch (retryError) {
          const message = getErrorMessage(retryError);
          this.notify({ error: message });
          throw retryError;
        }
      }
      const message = getErrorMessage(error);
      this.notify({ error: message });
      throw error;
    }
  };

  stop = (): void => {
    this.pageAudioRecovery?.clearResumeIntent();
    this.pendingSeekCycle = null;
    this.editorInstance?.repl.stop();
    this.notify({ isPlaying: false, isPaused: false });
  };

  scrollCodeToBottom = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollDOM = ((this.editorInstance as any)?.editor as any)?.scrollDOM as HTMLElement | undefined;
    if (scrollDOM) {
      scrollDOM.scrollTop = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    }
  };

  scrollCodeToPosition = (scrollTop: number): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollDOM = ((this.editorInstance as any)?.editor as any)?.scrollDOM as HTMLElement | undefined;
    if (scrollDOM) {
      scrollDOM.scrollTop = scrollTop;
    }
  };

  scrollCodeToBottomEased = (durationMs: number): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollDOM = ((this.editorInstance as any)?.editor as any)?.scrollDOM as HTMLElement | undefined;
    if (!scrollDOM) return;
    const startPos = scrollDOM.scrollTop;
    const endPos = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    if (endPos <= startPos) return;
    const startTime = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      scrollDOM.scrollTop = startPos + (endPos - startPos) * easeOutCubic(t);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // [video] Scroll start position for the frame-driven scroll below; only touched in video mode
  private scrollProgressStart: number | null = null;

  // [video] Frame-driven variant of scrollCodeToBottomEased, only used by Remotion video
  // rendering (VIDEO_SCROLL_PROGRESS message) — never called during normal app usage.
  // Remotion pushes an eased progress (0..1) every frame so the scroll is tied to video
  // time instead of wall-clock time (wall-clock animations get compressed during headless render)
  scrollCodeToBottomProgress = (progress: number): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollDOM = ((this.editorInstance as any)?.editor as any)?.scrollDOM as HTMLElement | undefined;
    if (!scrollDOM) return;
    if (this.scrollProgressStart === null) {
      this.scrollProgressStart = scrollDOM.scrollTop;
    }
    const endPos = scrollDOM.scrollHeight - scrollDOM.clientHeight;
    scrollDOM.scrollTop = this.scrollProgressStart + (endPos - this.scrollProgressStart) * progress;
    if (progress >= 1) this.scrollProgressStart = null;
  };

  triggerFadeIn = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollDOM = ((this.editorInstance as any)?.editor as any)?.scrollDOM as HTMLElement | undefined;
    if (!scrollDOM) return;
    scrollDOM.classList.remove('video-fade-in');
    // force reflow so re-adding the class restarts the animation
    void scrollDOM.offsetWidth;
    scrollDOM.classList.add('video-fade-in');
    const onEnd = () => {
      scrollDOM.classList.remove('video-fade-in');
      scrollDOM.removeEventListener('animationend', onEnd);
    };
    scrollDOM.addEventListener('animationend', onEnd);
  };

  exportWav = async (params: {
    filename: string;
    beginCycle: number;
    endCycle: number;
    sampleRate: number;
    onProgress?: (progress: number) => void;
  }): Promise<void> => {
    const { filename, beginCycle, endCycle, sampleRate, onProgress } = params;
    if (!this.editorInstance) throw new Error('Engine not initialized');
    if (endCycle <= beginCycle) throw new Error(t('cycleError'));

    this.editorInstance.repl.stop();
    // evaluate() defaults to autostart=true which kicks the scheduler back on
    // (the user sees playback resume the moment they click Export). We just
    // need the pattern compiled, not played — pass false.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.editorInstance as any).evaluate(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const replAny = this.editorInstance.repl as any;
    const pattern = replAny.scheduler?.pattern;
    const cps = replAny.scheduler?.cps ?? 0.5;
    if (!pattern) throw new Error('Code failed to parse — cannot export');

    // We inline the offline render (rather than calling @strudel/webaudio's
    // renderPatternAudio) so we can splice the same master Gain + LPF chain that
    // the live path uses — keeping exported audio audibly identical to playback.
    // IMPORTANT: import everything from the bundled `superdough` entry only.
    // The npm package ships `dist/index.mjs` as its `main`, but its source
    // files (e.g. `superdough/superdoughoutput.mjs`, `superdough/nodePools.mjs`)
    // re-import their own copy of `./helpers.mjs` -> `./audioContext.mjs`.
    // Importing from a source path therefore yields a *second* module graph
    // with its own `audioContext` module-level variable that the bundled
    // `setAudioContext()` never touches. When code in that second graph runs
    // (e.g. `effectSend` -> `gainNode(wet)` inside `Orbit.sendDelay`), it
    // calls its own `getAudioContext()`, which falls back to `new AudioContext()`
    // — a fresh live ctx — and then tries to connect that send gain to nodes
    // living on the OfflineAudioContext, throwing InvalidAccessError. The user-
    // visible symptom is that all `delay()` / `room()` sends silently fail
    // during export, so the exported WAV is missing delay/reverb tails.
    const {
      superdough,
      getAudioContext,
      setAudioContext,
      setSuperdoughAudioController,
      getSuperdoughAudioController,
      initAudio,
      resetGlobalEffects,
      errorLogger,
      clearNodePools,
    } = await import('superdough');

    let progressTimer: ReturnType<typeof setInterval> | null = null;
    if (onProgress) {
      progressTimer = setInterval(() => {
        try {
          const ctx = getAudioContext();
          if (ctx instanceof OfflineAudioContext) {
            const total = ctx.length / ctx.sampleRate;
            const p = total > 0 ? ctx.currentTime / total : 0;
            try { onProgress(Math.max(0, Math.min(1, p))); } catch { /* user callback must not crash polling */ }
          }
        } catch { /* ignore polling errors */ }
      }, 100);
    }

    try {
      const liveCtx = getAudioContext();
      await liveCtx.close();
      // Drop every cached audio node before switching to the offline ctx.
      // `getNodeFromPool` would otherwise hand back nodes bound to the now-
      // closed live ctx (compressor / filter / etc. cached during a prior
      // Play), and connecting those to the offline graph throws
      // InvalidAccessError. The dist filter for `state !== 'closed'` is a
      // belt-and-suspenders fallback; clearing here is the primary defense
      // and also covers future offline→live transitions where the prior ctx
      // never enters the 'closed' state.
      clearNodePools();

      const offlineCtx = new OfflineAudioContext(
        2,
        ((endCycle - beginCycle) / cps) * sampleRate,
        sampleRate,
      );
      setAudioContext(offlineCtx);
      // Drop the existing controller so getSuperdoughAudioController() lazily
      // rebuilds a fresh one bound to the offline ctx, using the bundled
      // SuperdoughAudioController class (which shares the bundled helpers /
      // audioContext module state — see the comment on the import above).
      setSuperdoughAudioController(null);
      await initAudio({ maxPolyphony: 1024, multiChannelOrbits: false });

      // Splice master Gain + LPF between destinationGain and ctx.destination,
      // mirroring setupMasterChain() on the live ctx so UI master controls
      // affect the exported audio.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controller = getSuperdoughAudioController() as any;
      const destGain: GainNode | undefined = controller?.output?.destinationGain;
      if (destGain) {
        safeDisconnect(destGain, offlineCtx.destination);
        const masterGain = offlineCtx.createGain();
        masterGain.gain.value = this.currentMasterVolume;
        const lpf = offlineCtx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = this.currentMasterLpfHz;
        destGain.connect(masterGain);
        masterGain.connect(lpf);
        lpf.connect(offlineCtx.destination);
      }

      // Schedule all haps onto the offline ctx (sorted by onset for `cut` correctness).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const haps = (pattern as any)
        .queryArc(beginCycle, endCycle, { _cps: cps })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => a.whole.begin.valueOf() - b.whole.begin.valueOf());
      for (const hap of haps) {
        if (hap.hasOnset()) {
          try {
            hap.ensureObjectValue();
            await superdough(
              hap.value,
              (hap.whole.begin.valueOf() - beginCycle) / cps,
              hap.duration / cps,
              cps,
              (hap.whole.begin.valueOf() - beginCycle) / cps,
            );
          } catch (err) {
            errorLogger(err, 'webaudio');
          }
        }
      }

      // Wait for any pending reverb IR generation to finish. Superdough builds
      // its reverb convolver IR via a *nested* OfflineAudioContext whose
      // `oncomplete` callback installs `convolver.buffer` (see
      // strudel/packages/superdough/reverbGen.mjs -> applyGradualLowpass).
      // If we call startRendering() before that callback fires, the convolver
      // has an empty buffer and `room()` produces silence — which is exactly
      // what caused the exported audio to be 12-14 dB quieter in the 500-8kHz
      // band and to come out mono (no decorrelated reverb tail).
      //
      // Poll the controller's per-orbit reverb nodes until their `.buffer` is
      // populated. Reverb nodes live on `controller.nodes[orbitNum].reverbNode`
      // (see strudel/packages/superdough/superdoughoutput.mjs: SuperdoughAudioController).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const controllerForWait = getSuperdoughAudioController() as any;
      console.log('[exportWav] scheduled', haps.length, 'haps; orbits:', Object.keys(controllerForWait?.nodes ?? {}));
      const waitForReverbReady = async (): Promise<void> => {
        const deadline = Date.now() + 5000; // hard cap so we never hang
        while (true) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const orbits: Record<string, any> = controllerForWait?.nodes ?? {};
          const reverbs = Object.values(orbits)
            .map((o) => o?.reverbNode)
            .filter(Boolean);
          if (reverbs.length === 0) {
            console.log('[exportWav] no reverb nodes attached to any orbit; skipping wait');
            return; // no reverb in this pattern
          }
          const status = reverbs.map((n) => ({
            hasBuffer: !!n.buffer,
            len: n.buffer?.length ?? 0,
            channels: n.buffer?.numberOfChannels ?? 0,
            duration: n.duration,
          }));
          const ready = reverbs.every((n) => n.buffer && n.buffer.length > 0);
          if (ready) {
            console.log('[exportWav] reverb IRs ready:', status);
            return;
          }
          if (Date.now() > deadline) {
            console.warn('[exportWav] reverb wait timed out, rendering anyway:', status);
            return;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
      };
      await waitForReverbReady();

      const renderedBuffer = await offlineCtx.startRendering();
      const wav = audioBufferToWav16(renderedBuffer);
      downloadWav(wav, filename);
      trackWavExportCompleted();

      setAudioContext(null);
      setSuperdoughAudioController(null);
      resetGlobalEffects();
    } finally {
      if (progressTimer !== null) clearInterval(progressTimer);
      try { onProgress?.(1); } catch { /* user callback must not crash recovery */ }
      try {
        // Drop any nodes cached against the offline ctx before rebuilding the
        // live chain, so the next Play doesn't reuse offline-bound nodes.
        clearNodePools();
        await this.rebuildMasterChain();
        // registerSoundfonts is synchronous (returns void) — no await needed.
        registerSoundfonts();
        (window as unknown as Record<string, unknown>).getAudioContext = getAudioContext;
        (window as unknown as Record<string, unknown>).getSuperdoughAudioController = getSuperdoughAudioController;
      } catch { /* best-effort restoration */ }
    }
    // Note: master volume / LPF are reset to defaults after rebuildMasterChain; the calling hook is responsible for re-applying current UI values.
  };

  /**
   * Record the currently-playing live audio for `durationSec` seconds and download
   * it as a WAV. Tap point is identical to what reaches `ctx.destination` (after
   * master Gain + master LPF), so the recording captures exactly what the user
   * hears — making it directly comparable with the offline `exportWav` output.
   *
   * Usage from devtools console:
   *   await window.recordLive(8, 'live')   // record 8 seconds → live.wav
   *
   * The caller is responsible for starting playback (`play()`) before invoking
   * this; recording starts immediately and runs in real time.
   */
  recordLive = async (durationSec: number, filename = 'live'): Promise<void> => {
    if (durationSec <= 0) throw new Error('durationSec must be > 0');
    await this.setupMasterChain();
    const { getAudioContext, getSuperdoughAudioController } = await import('superdough');
    const ctx = getAudioContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = getSuperdoughAudioController() as any;
    const destGain: AudioNode | undefined = controller?.output?.destinationGain;
    // Prefer tapping after the master LPF (closest to ctx.destination); fall back
    // to destinationGain if the master chain isn't wired for some reason.
    const tap: AudioNode | undefined = this.masterLpfNode ?? destGain;
    if (!tap) throw new Error('No audio chain to record from');

    // ScriptProcessorNode is deprecated but universally supported and avoids
    // AudioWorklet boilerplate. 4096-sample blocks ≈ ~85ms @ 48kHz — fine for
    // a debug recorder.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp = (ctx as any).createScriptProcessor(4096, 2, 2) as ScriptProcessorNode;
    const leftChunks: Float32Array[] = [];
    const rightChunks: Float32Array[] = [];
    sp.onaudioprocess = (e: AudioProcessingEvent) => {
      // Copy because the underlying buffer is reused across callbacks.
      leftChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      rightChunks.push(new Float32Array(e.inputBuffer.getChannelData(1)));
    };
    // Pass SP through a muted gain into destination so it actually fires (a SP
    // with no downstream connection won't process). Gain=0 keeps output silent.
    const muteGain = ctx.createGain();
    muteGain.gain.value = 0;
    tap.connect(sp);
    sp.connect(muteGain);
    muteGain.connect(ctx.destination);

    await new Promise((r) => setTimeout(r, durationSec * 1000));

    safeDisconnect(tap, sp);
    safeDisconnect(sp);
    safeDisconnect(muteGain);

    const totalLen = leftChunks.reduce((acc, c) => acc + c.length, 0);
    const left = new Float32Array(totalLen);
    const right = new Float32Array(totalLen);
    let off = 0;
    for (let i = 0; i < leftChunks.length; i++) {
      left.set(leftChunks[i], off);
      right.set(rightChunks[i], off);
      off += leftChunks[i].length;
    }
    const wav = encodeWav16([left, right], ctx.sampleRate);
    downloadWav(wav, filename);
  };

  clearError = (): void => {
    this.notify({ error: null });
  };

  reinit = async (): Promise<void> => {
    if (!this.containerElement) return;
    this.isAudioInitialized = false;
    this.isInitializing = false;
    if (this.editorInstance) {
      this.editorInstance.dispose?.();
      this.editorInstance = null;
    }
    this.notify({ engineReady: false, engineStatus: 'initializing', error: null });
    await this.attach(this.containerElement);
  };
}

export const strudelService = StrudelService.instance();


// --- WAV encoder (16-bit PCM, interleaved stereo / mono) ---
// Inlined here because @strudel/webaudio doesn't export its internal helper.
function encodeWav16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  let samples: Float32Array;
  if (numChannels === 2) {
    const l = channels[0];
    const r = channels[1];
    samples = new Float32Array(l.length * 2);
    for (let i = 0; i < l.length; i++) {
      samples[i * 2] = l[i];
      samples[i * 2 + 1] = r[i];
    }
  } else {
    samples = channels[0];
  }

  const dataLength = samples.length * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);

  const writeString = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);             // fmt chunk size
  view.setUint16(20, 1, true);              // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return ab;
}

function audioBufferToWav16(buffer: AudioBuffer): ArrayBuffer {
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  return encodeWav16(channels, buffer.sampleRate);
}

function downloadWav(ab: ArrayBuffer, filename: string): void {
  const blob = new Blob([ab], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// --- Code normalization ---

/**
 * Collapses newlines inside single/double-quoted string literals.
 * LLM sometimes writes multi-line strings with regular quotes, which causes
 * "Unterminated string constant" in both our validator and Strudel's evaluator.
 * Template literals (backticks) are left untouched.
 */
export function normalizeCode(code: string): string {
  let result = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    // Line comment — copy until newline, skip string processing
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      if (end === -1) { result += code.slice(i); break; }
      result += code.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    // Block comment — copy verbatim
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) { result += code.slice(i); break; }
      result += code.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    // Template literal — copy verbatim (already supports multiline)
    if (ch === '`') {
      result += ch;
      i++;
      while (i < code.length) {
        const c = code[i];
        result += c;
        i++;
        if (c === '\\') { result += code[i] ?? ''; i++; continue; }
        if (c === '`') break;
      }
      continue;
    }
    // Single or double quoted string — collapse inner newlines
    if (ch === '"' || ch === "'") {
      result += ch;
      i++;
      while (i < code.length) {
        const c = code[i];
        if (c === '\\') {
          result += c + (code[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (c === '\r' || c === '\n') {
          result += ' ';
          i++;
          if (c === '\r' && code[i] === '\n') i++;
          continue;
        }
        result += c;
        i++;
        if (c === ch) break;
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

// Cached after first attach() so validateCodeTranspiler can run synchronously.
let cachedTranspiler: ((code: string, opts?: object) => unknown) | null = null;

type ValidationResult = { ok: true } | { ok: false; error: string; kind: 'syntax' | 'runtime' };

const PASS_THROUGH = new Set([
  'undefined', 'NaN', 'Infinity', 'globalThis', 'window', 'self',
  'console', 'Math', 'Number', 'String', 'Array', 'Object', 'JSON',
  'Boolean', 'Symbol', 'Date', 'RegExp', 'Promise',
]);

function stripUIDecorations(code: string): string {
  return code
    .replace(/\._scope\(\)/g, '')
    .replace(/\._pianoroll\(\{[^}]*\}\)/g, '')
    .replace(/\._pianoroll\(\)/g, '');
}

// Small scanner helpers for validators that need to inspect method arguments
// without treating comments or unrelated string literals as executable code.
function readQuotedString(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = '';
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      value += ch + (source[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === quote) return { value, end: i + 1 };
    value += ch;
    i++;
  }
  return null;
}

function skipStringOrComment(source: string, start: number): number | null {
  const ch = source[start];
  if (ch === '/' && source[start + 1] === '/') {
    const end = source.indexOf('\n', start + 2);
    return end === -1 ? source.length : end + 1;
  }
  if (ch === '/' && source[start + 1] === '*') {
    const end = source.indexOf('*/', start + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (ch !== '"' && ch !== "'" && ch !== '`') return null;

  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    i++;
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === ch) break;
  }
  return i;
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  while (i < source.length) {
    const skipped = skipStringOrComment(source, i);
    if (skipped !== null) {
      i = skipped;
      continue;
    }

    if (source[i] === '(') depth++;
    if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function skipWhitespaceAndComments(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    if (/\s/.test(source[i] ?? '')) {
      i++;
      continue;
    }
    const skipped = skipStringOrComment(source, i);
    if (skipped !== null && source[i] === '/') {
      i = skipped;
      continue;
    }
    return i;
  }
  return i;
}

// Strudel's .arp() accepts a mini-notation pattern of numeric chord-tone
// indices. A named mode like .arp("pinkyup") is syntactically valid JS, so the
// proxy dry-run below cannot catch it; it only fails later when Strudel queries
// the pattern and tries to index the collected chord haps with a non-number.
function findInvalidArpArguments(code: string): string[] {
  const invalid: string[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i + 2);
      i = end === -1 ? code.length : end + 1;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < code.length) {
        const c = code[i];
        i++;
        if (c === '\\') i++;
        if (c === quote) break;
      }
      continue;
    }
    // Match only actual method calls. This avoids flagging names such as
    // ".arpeggio" while still allowing whitespace before the opening paren.
    if (code.startsWith('.arp', i) && !/[A-Za-z0-9_$]/.test(code[i + 4] ?? '')) {
      let j = i + 4;
      while (/\s/.test(code[j] ?? '')) j++;
      if (code[j] !== '(') {
        i++;
        continue;
      }
      j++;
      while (/\s/.test(code[j] ?? '')) j++;
      const parsed = readQuotedString(code, j);
      if (parsed && /[A-Za-z_]/.test(parsed.value)) {
        invalid.push(parsed.value);
      }
      i = parsed?.end ?? j + 1;
      continue;
    }
    i++;
  }
  return invalid;
}

// .voicing() expects chord events. note("<Cm7 ...>").dict(...).voicing() is
// valid JavaScript and passes the proxy dry-run, but Strudel later sees no
// chord field on the haps and throws: [voicing]: unknown chord "undefined".
function hasNoteVoicingChain(code: string): boolean {
  let i = 0;
  while (i < code.length) {
    const skipped = skipStringOrComment(code, i);
    if (skipped !== null) {
      i = skipped;
      continue;
    }

    const prev = code[i - 1] ?? '';
    const next = code[i + 4] ?? '';
    if (
      !code.startsWith('note', i) ||
      /[A-Za-z0-9_$]/.test(prev) ||
      prev === '.' ||
      /[A-Za-z0-9_$]/.test(next)
    ) {
      i++;
      continue;
    }

    let j = skipWhitespaceAndComments(code, i + 4);
    if (code[j] !== '(') {
      i++;
      continue;
    }
    const close = findMatchingParen(code, j);
    if (close === -1) return false;
    j = close + 1;

    while (j < code.length) {
      j = skipWhitespaceAndComments(code, j);
      if (code[j] !== '.') break;
      j++;

      const nameStart = j;
      while (/[A-Za-z0-9_$]/.test(code[j] ?? '')) j++;
      const methodName = code.slice(nameStart, j);
      const argsStart = skipWhitespaceAndComments(code, j);
      if (methodName === 'voicing' && code[argsStart] === '(') return true;
      if (code[argsStart] !== '(') break;

      const argsEnd = findMatchingParen(code, argsStart);
      if (argsEnd === -1) return false;
      j = argsEnd + 1;
    }

    i = j;
  }
  return false;
}

// --- Code validation (no audio engine needed) ---

/** @deprecated Use validateCodeRuntime directly. */
export function validateCode(code: string): { ok: boolean; error?: string } {
  if (!code?.trim()) return { ok: false, error: t('emptyCode') };
  const result = validateCodeRuntime(code);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export function validateCodeRuntime(code: string): ValidationResult {
  const clean = normalizeCode(stripUIDecorations(code));
  if (!clean.trim()) return { ok: false, error: t('emptyCode'), kind: 'syntax' };

  // Proxy dry-run (caller guarantees the engine is ready — see App.tsx handleInstruction guard)
  const stripped = clean.replace(/^\s*setcps\([^)]*\)\s*;?\s*$/gm, '');

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
    // Check for hallucinated sample names after syntax/runtime validation passes.
    const unknownSamples = findUnknownSamples(code);
    if (unknownSamples.length > 0) {
      const quoted = unknownSamples.map((s) => `"${s}"`).join(', ');
      return {
        ok: false,
        kind: 'runtime',
        error: `Unknown sample name(s): ${quoted}. Only use approved sample names (piano, arpy, bass, bd, sd, hh ...). See the quality gate in your system prompt.`,
      };
    }
    // Catch Strudel API misuse that is syntactically valid but crashes during
    // pattern query, before it reaches live playback.
    const invalidArpArgs = findInvalidArpArguments(code);
    if (invalidArpArgs.length > 0) {
      const quoted = invalidArpArgs.map((s) => `"${s}"`).join(', ');
      return {
        ok: false,
        kind: 'runtime',
        error: `Invalid .arp() argument(s): ${quoted}. Strudel .arp() selects chord tones by numeric indices only, e.g. .arp("0 1 2 3") or .arp("3 2 1 0"); named modes such as "pinkyup" are not supported.`,
      };
    }
    // note(...).voicing() has no chord field, so Strudel later reports unknown chord "undefined".
    if (hasNoteVoicingChain(code)) {
      return {
        ok: false,
        kind: 'runtime',
        error: 'Use chord(...) before .voicing(); note(...) produces note events, so Strudel sees no chord field and crashes with unknown chord "undefined".',
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: getErrorMessage(e), kind: 'runtime' };
  }
}

// Runs the Strudel transpiler to catch mini-notation parse errors that the
// Proxy dry-run cannot see (e.g. unclosed brackets in "bd [sd").
// Returns ok:true when the transpiler is not yet loaded (first run before attach).
export function validateCodeTranspiler(code: string): { ok: boolean; error?: string } {
  if (!cachedTranspiler) return { ok: true };
  const clean = stripUIDecorations(code);
  try {
    cachedTranspiler(clean);
    return { ok: true };
  } catch (e) {
    const msg = getErrorMessage(e);
    // Only surface errors explicitly from the mini-notation parser (prefixed with
    // "[mini]" by mini2ast). Other transpiler errors (acorn JS parse issues,
    // unregistered plugins, etc.) may be false positives — let them pass through.
    if (msg.startsWith('[mini]')) {
      return { ok: false, error: msg };
    }
    return { ok: true };
  }
}

// Legacy export for agent tools compatibility
export function isInitialized(): boolean {
  return strudelService.isReady;
}
