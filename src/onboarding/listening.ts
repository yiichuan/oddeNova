import type { ListeningWindow } from './intro-piano-case';

/**
 * Following one listen through the studio's own play key — "the first 5
 * seconds" — and saying truthfully whether it was heard.
 *
 * The reader starts and pauses it themselves; this only watches. Progress is
 * read off the transport's playhead, never off a timer started at the press:
 * a press is not a listen, and neither is the moment the engine spends coming
 * up. A pause keeps what was heard, and play picks up from there. When the
 * playhead reaches the end of the window the transport is stopped for them —
 * stopped, so the next press plays the window again from the top — and only
 * then does the window count as heard.
 */

/** The slice of the studio transport a listen needs. Small so it can be faked. */
export interface ListeningTransport {
  /** Cycles from the top of the piece, or null while nothing sounds. */
  currentCycle: () => number | null;
  /** End the window: silence, and rewind to the top. */
  stop: () => void;
}

/**
 * How far before the window's end the scheduler is stopped, in cycles.
 *
 * The scheduler queues a little ahead of what is sounding, so stopping exactly
 * at the boundary would already have queued the notes that open the next
 * stretch (at 5 s: the next chord). Notes started inside the window are on the
 * audio clock with their own envelopes, so they still play out to the boundary
 * and release naturally — the tail is the music's own, not a hard cut.
 */
export const PAUSE_LEAD_CYCLES = 0.12;

const POLL_MS = 50;

export interface ListeningWatch {
  /**
   * Stop watching the playhead. Deliberately leaves a stop this watch already
   * made to finish its tail and report: that stop is what silences the
   * transport, so the caller's "it stopped" cleanup arrives right after it and
   * must not throw the verdict away. Callers that outlive the step (an account
   * change, an unmount) guard `onHeard` themselves.
   */
  cancel: () => void;
}

/**
 * Watch a listen that is under way. Call it when the transport starts playing
 * the expected piece; cancel it when the transport stops.
 */
export function watchListening(
  transport: ListeningTransport,
  window: ListeningWindow,
  options: {
    cps: number;
    onProgress: (progress: number) => void;
    onHeard: () => void;
  },
): ListeningWatch {
  const span = window.endCycle - window.startCycle;
  let polling = true;

  const timer = setInterval(() => {
    if (!polling) return;
    const cycle = transport.currentCycle();
    if (cycle === null) return;
    options.onProgress(Math.max(0, Math.min(1, (cycle - window.startCycle) / span)));
    if (cycle < window.endCycle - PAUSE_LEAD_CYCLES) return;

    polling = false;
    clearInterval(timer);
    transport.stop();
    // What was queued before the stop is still sounding; the window is heard
    // once it has played out to the end.
    const remainingMs = Math.max(0, ((window.endCycle - cycle) / options.cps) * 1000);
    setTimeout(() => {
      options.onProgress(1);
      options.onHeard();
    }, remainingMs);
  }, POLL_MS);

  return {
    cancel: () => {
      if (!polling) return;
      polling = false;
      clearInterval(timer);
    },
  };
}
