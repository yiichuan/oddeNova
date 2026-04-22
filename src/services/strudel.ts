let initialized = false;
let _scopeAnalyser: AnalyserNode | null = null;
// Strudel's `repl.evaluate` catches runtime errors internally and only surfaces
// them via the `onEvalError` callback / repl state — it does NOT throw to the
// caller. Without capturing them here, `evaluateCode` would falsely report
// success and the UI would show "playing" while audio is actually silent.
let _lastEvalError: string | null = null;

export function getScopeAnalyser(): AnalyserNode | null {
  if (_scopeAnalyser) return _scopeAnalyser;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return null;

    // getSuperdoughAudioController() is globally exported by @strudel/web.
    // Its .output.destinationGain is the final GainNode before the speakers —
    // tapping it gives us all audio output without disrupting the signal chain.
    // @ts-expect-error — getSuperdoughAudioController is a Strudel global, not typed
    const controller = typeof getSuperdoughAudioController === 'function'
      // @ts-expect-error — calling the untyped global
      ? getSuperdoughAudioController()
      : null;
    const tapNode: AudioNode | null = controller?.output?.destinationGain ?? null;
    if (!tapNode) return null;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    tapNode.connect(analyser);
    _scopeAnalyser = analyser;
    return analyser;
  } catch {
    return null;
  }
}

export async function initEngine(): Promise<void> {
  if (initialized) return;
  try {
    initStrudel({
      prebake: () => Promise.all([
        samples('github:tidalcycles/dirt-samples'),
        samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json'),
        samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json'),
      ]),
      // @ts-expect-error — `onEvalError` is supported by @strudel/web's repl
      // at runtime but missing from the public type declarations.
      onEvalError: (err: unknown) => {
        _lastEvalError = err instanceof Error ? err.message : String(err);
      },
    });
    initialized = true;
    // Always override _scope — Strudel's built-in tries to render into the
    // REPL DOM which doesn't exist here. We strip ._scope() before evaluation
    // anyway, but this is a safety net.
    try {
      await evaluate(
        'if(typeof Pattern!=="undefined")' +
        '{Pattern.prototype._scope=function(){return this;}}'
      );
    } catch { /* ignore */ }
  } catch (e) {
    console.error('Failed to init Strudel:', e);
    throw e;
  }
}

export async function evaluateCode(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Strip ._scope() before evaluation — it's handled visually by our canvas widget
    const cleanCode = code.replace(/\._scope\(\)/g, '');
    // `repl.evaluate` already calls hush() internally (shouldHush defaults to
    // true), so an extra `evaluate('hush()')` here was redundant — and worse,
    // briefly left the scheduler holding a `silence` pattern.
    _lastEvalError = null;
    await evaluate(cleanCode);
    if (_lastEvalError) {
      const err = _lastEvalError;
      console.error('Strudel runtime error (caught via onEvalError):', err);
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Strudel eval error:', e);
    return { success: false, error: msg };
  }
}

// Syntax-level validation. Does NOT touch the audio engine — runs the code
// through `new Function()` purely to catch JS-level syntax errors (unbalanced
// parens / quotes / etc). Strudel runtime errors (unknown samples, bad
// patterns) are not caught here; they would surface only at evaluateCode time.
// For the agent's MVP weak-feedback loop this is enough to verify "the code
// is parseable" before commit, without disturbing the currently playing
// pattern.
export function validateCode(code: string): { ok: boolean; error?: string } {
  if (!code || !code.trim()) {
    return { ok: false, error: '代码为空' };
  }
  const cleanCode = code.replace(/\._scope\(\)/g, '');
  try {
    new Function(cleanCode);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// Stronger validation that also catches `ReferenceError` (e.g. agent
// hallucinations like `by(0.5)`, `sometimesBy(...)`) and `TypeError` from
// missing methods on Pattern. Strategy: wrap the code in `with(proxy) { ... }`
// where `proxy` forwards reads to `globalThis` (so all strudel globals — `s`,
// `note`, `stack`, `rev`, `fast`, ... — resolve) but THROWS when an identifier
// is unknown. Pattern constructors (`s()`, `stack()`, `.gain()`, ...) are pure
// builders with no audio side effects, so executing them is safe. The only
// scheduler-mutating call is `setcps()` — we strip those lines before the run
// to keep the currently playing tempo intact.
export function validateCodeRuntime(code: string): { ok: boolean; error?: string } {
  const syn = validateCode(code);
  if (!syn.ok) return syn;
  if (!initialized) return { ok: true };

  const stripped = code
    .replace(/\._scope\(\)/g, '')
    .replace(/^\s*setcps\([^)]*\)\s*;?\s*$/gm, '');

  // Identifiers that are JS-builtin or harmless to read but might be `undefined`.
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
    // `with` is allowed inside `new Function` bodies (non-strict by default).
    new Function('__strudel__', `with (__strudel__) { ${stripped} }`)(proxy);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function stopPlayback(): Promise<void> {
  try {
    await evaluate('hush()');
  } catch (e) {
    console.error('Failed to stop:', e);
  }
}

export function isInitialized(): boolean {
  return initialized;
}

export function getAudioCtx(): AudioContext | null {
  try {
    // @ts-expect-error — getAudioContext is a Strudel global, not typed
    return typeof getAudioContext === 'function' ? getAudioContext() : null;
  } catch {
    return null;
  }
}
