/** Cancel an offline render without waiting for the entire audio buffer.
 * OfflineAudioContext has no close(); suspend its private graph and discard it.
 */
export async function renderOfflineAudio(context: OfflineAudioContext, signal?: AbortSignal): Promise<AudioBuffer> {
  signal?.throwIfAborted();
  const onAbort = () => {
    // Leave a few render quanta of headroom so the audio thread can receive
    // the suspension. If rendering already finished, the result is discarded.
    void context.suspend(context.currentTime + 0.05).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  let rejectAbort: (() => void) | undefined;
  try {
    return await new Promise((resolve, reject) => {
      rejectAbort = () => reject(signal?.reason);
      signal?.addEventListener('abort', rejectAbort, { once: true });
      context.startRendering().then(resolve, reject);
    });
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (rejectAbort) signal?.removeEventListener('abort', rejectAbort);
  }
}
