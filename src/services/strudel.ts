let initialized = false;
let _scopeAnalyser: AnalyserNode | null = null;

export function getScopeAnalyser(): AnalyserNode | null {
  if (_scopeAnalyser) return _scopeAnalyser;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return null;

    // getSuperdoughAudioController() is globally exported by @strudel/web.
    // Its .output.destinationGain is the final GainNode before the speakers —
    // tapping it gives us all audio output without disrupting the signal chain.
    // @ts-ignore
    const controller = typeof getSuperdoughAudioController === 'function'
      // @ts-ignore
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
    await evaluate('hush()');
    await evaluate(cleanCode);
    return { success: true };
  } catch (e: any) {
    console.error('Strudel eval error:', e);
    return { success: false, error: e.message || String(e) };
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
    // @ts-ignore - Strudel exposes getAudioContext globally
    return typeof getAudioContext === 'function' ? getAudioContext() : null;
  } catch {
    return null;
  }
}
