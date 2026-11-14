interface OfflineSchedule {
  beginCycle: number;
  endCycle: number;
  cps: number;
  schedule: (begin: number, end: number) => Promise<void>;
}

/** Schedule one cycle at a time in the same graph, so effect tails carry over. */
export async function renderOfflineAudio(
  context: OfflineAudioContext,
  timeline: OfflineSchedule,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  signal?.throwIfAborted();
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  // Cancellation can happen during sample loading, outside a Promise.race.
  void aborted.catch(() => {});

  let rendering: Promise<AudioBuffer> | undefined;
  let pauseScheduled = false;
  const onAbort = () => {
    if (rendering && !pauseScheduled && typeof context.suspend === 'function' && context.state !== 'closed') {
      // Give the audio thread time to receive the request. Near the end it
      // may already be too late to suspend, in which case discard the result.
      void context.suspend(context.currentTime + 0.05).catch(() => {});
    }
    rejectAbort(signal?.reason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (typeof context.suspend !== 'function' || typeof context.resume !== 'function') {
      await timeline.schedule(timeline.beginCycle, timeline.endCycle);
      signal?.throwIfAborted();
      rendering = context.startRendering();
      return await Promise.race([rendering, aborted]);
    }

    const { beginCycle, endCycle, cps, schedule } = timeline;
    for (let begin = beginCycle; begin < endCycle; begin += 1) {
      const end = Math.min(begin + 1, endCycle);
      await schedule(begin, end);
      signal?.throwIfAborted();

      // Pause one cycle ahead of the next onset, leaving room for Web Audio
      // to round the suspend time to a render quantum.
      const pause = end < endCycle ? context.suspend((begin - beginCycle) / cps) : undefined;
      pauseScheduled = !!pause;
      // Attach handlers before starting/resuming, including on failure.
      void pause?.catch(() => {});

      if (!rendering) {
        rendering = context.startRendering();
        void rendering.catch(() => {});
      } else {
        await Promise.race([context.resume(), aborted]);
      }

      if (pause) {
        const result = await Promise.race([pause, rendering, aborted]);
        if (result) return result;
        signal?.throwIfAborted();
      }
    }

    // A valid export always schedules at least one cycle or partial cycle.
    return await Promise.race([rendering!, aborted]);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
