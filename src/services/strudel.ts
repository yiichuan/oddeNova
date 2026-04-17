let initialized = false;

export async function initEngine(): Promise<void> {
  if (initialized) return;
  try {
    initStrudel({
      prebake: () => samples('github:tidalcycles/dirt-samples'),
    });
    initialized = true;
  } catch (e) {
    console.error('Failed to init Strudel:', e);
    throw e;
  }
}

export async function evaluateCode(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    hush();
    await evaluate(code);
    return { success: true };
  } catch (e: any) {
    console.error('Strudel eval error:', e);
    return { success: false, error: e.message || String(e) };
  }
}

export function stopPlayback(): void {
  try {
    hush();
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
