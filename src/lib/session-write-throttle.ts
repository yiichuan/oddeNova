/**
 * Rate limiter for the local session store.
 *
 * A streaming agent turn mutates the session once per token: every reasoning
 * and reply delta appends to the last message and hands the whole session back
 * to `persistSession`. Writing each of those straight through meant one
 * IndexedDB transaction per token, each carrying a structured clone of the
 * entire session — messages, code, and every past revision — so the clone grew
 * with the very text that was producing it. A long answer (the agent loop
 * allows 30 iterations over ten minutes) queued tens of thousands of
 * ever-larger clones and took the renderer down with it.
 *
 * So streaming writes go through `schedule`, which keeps at most one write per
 * `intervalMs` per session in flight: the first lands immediately (a reload a
 * moment later still finds the turn), the rest collapse into a single trailing
 * write carrying only the newest snapshot. Everything else — a committed
 * reply, a code edit, a checkpoint — still goes through `writeNow`, which
 * cancels the session's scheduled write so the authoritative snapshot is never
 * overtaken by a stale one. IndexedDB runs transactions with overlapping scope
 * in creation order, so the last write issued is the one that survives.
 */
export interface SessionWriteThrottle<T extends { id: string }> {
  /** Coalescing write for streamed mutations: at most one per interval per id. */
  schedule: (value: T) => void;
  /** Write at once, dropping any write scheduled for the same id. */
  writeNow: (value: T) => Promise<void>;
  /** Issue what is scheduled and wait for everything still in flight. */
  flush: (id?: string) => Promise<void>;
  /** Forget an id's scheduled write — for a session being deleted. */
  discard: (id: string) => void;
}

export function createSessionWriteThrottle<T extends { id: string }>(
  write: (value: T) => Promise<void>,
  intervalMs: number,
): SessionWriteThrottle<T> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const trailing = new Map<string, T>();
  const inFlight = new Map<string, Promise<void>>();

  const issue = (value: T): Promise<void> => {
    const run: Promise<void> = write(value)
      .catch(() => undefined)
      .finally(() => {
        if (inFlight.get(value.id) === run) inFlight.delete(value.id);
      });
    inFlight.set(value.id, run);
    return run;
  };

  const clearTimer = (id: string): void => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  };

  // Re-armed after every trailing write rather than only while deltas arrive:
  // the window has to stay shut for a full interval after each write, or a
  // steady stream would just alternate schedule/fire and write every delta.
  const armTimer = (id: string): void => {
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      const next = trailing.get(id);
      if (next === undefined) return;
      trailing.delete(id);
      void issue(next);
      armTimer(id);
    }, intervalMs));
  };

  const flushOne = async (id: string): Promise<void> => {
    clearTimer(id);
    const next = trailing.get(id);
    if (next !== undefined) {
      trailing.delete(id);
      await issue(next);
      return;
    }
    await inFlight.get(id);
  };

  return {
    schedule(value: T): void {
      if (timers.has(value.id)) {
        trailing.set(value.id, value);
        return;
      }
      void issue(value);
      armTimer(value.id);
    },

    writeNow(value: T): Promise<void> {
      clearTimer(value.id);
      trailing.delete(value.id);
      return issue(value);
    },

    flush(id?: string): Promise<void> {
      const ids = id
        ? [id]
        : [...new Set([...timers.keys(), ...trailing.keys(), ...inFlight.keys()])];
      return Promise.all(ids.map(flushOne)).then(() => undefined);
    },

    discard(id: string): void {
      clearTimer(id);
      trailing.delete(id);
    },
  };
}
