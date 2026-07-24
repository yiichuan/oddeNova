export interface LatestSaveQueue<T extends { id: string }> {
  enqueue: (value: T) => Promise<void>;
  flush: (id?: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
}

export function createLatestSaveQueue<T extends { id: string }>(
  save: (value: T) => Promise<void>,
  onError: (error: unknown) => void = () => undefined,
): LatestSaveQueue<T> {
  const pending = new Map<string, T>();
  const active = new Map<string, Promise<void>>();
  const failed = new Map<string, { value: T; error: unknown }>();

  const start = (id: string): Promise<void> => {
    const run = (async () => {
      while (pending.has(id)) {
        const next = pending.get(id)!;
        pending.delete(id);
        try {
          await save(next);
          failed.delete(id);
        } catch (error) {
          // If a newer snapshot is already waiting, keep draining: a
          // successful latest save makes this intermediate failure irrelevant.
          if (pending.has(id)) continue;
          failed.set(id, { value: next, error });
          throw error;
        }
      }
    })().finally(() => {
      active.delete(id);
      if (pending.has(id)) start(id);
    });

    active.set(id, run);
    void run.catch(onError);
    return run;
  };

  const flushOne = async (id: string): Promise<void> => {
    // A failure that settled before this flush began gets one retry. If that
    // retry fails, retain it so a later flush (for example another sign-out
    // attempt) can retry again instead of silently forgetting the snapshot.
    let mayRetrySettledFailure = !active.has(id) && failed.has(id);
    while (true) {
      const run = active.get(id);
      if (run) {
        await run;
        continue;
      }

      const terminalFailure = failed.get(id);
      if (!terminalFailure) return;
      if (!mayRetrySettledFailure) throw terminalFailure.error;

      mayRetrySettledFailure = false;
      pending.set(id, terminalFailure.value);
      start(id);
    }
  };

  const flush = async (id?: string): Promise<void> => {
    const ids = id
      ? [id]
      : [...new Set([...active.keys(), ...pending.keys(), ...failed.keys()])];
    const results = await Promise.allSettled(ids.map(flushOne));
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  };

  return {
    enqueue(value: T): Promise<void> {
      pending.set(value.id, value);
      return active.get(value.id) ?? start(value.id);
    },
    flush,
    async discard(id: string): Promise<void> {
      // Let an already-issued request settle, but prevent queued/failed
      // snapshots from running after the authoritative delete.
      while (true) {
        pending.delete(id);
        failed.delete(id);
        const run = active.get(id);
        if (!run) break;
        await run.catch(() => undefined);
      }
      pending.delete(id);
      failed.delete(id);
    },
  };
}
