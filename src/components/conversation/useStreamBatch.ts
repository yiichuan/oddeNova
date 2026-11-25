import { useEffectEvent, useLayoutEffect, useState, type RefObject } from 'react';
import { ROUTER_STREAM_BATCH_MS } from '../../agent/progress';

interface StreamSnapshot {
  replyComplete?: boolean;
}

/** Keep new snapshots behind the current reveal, including the final transition. */
export function useStreamBatch<T extends StreamSnapshot>(
  value: T,
  active: boolean,
  turnId: string | undefined,
  revealUntil: RefObject<number>,
): T {
  const [batch, setBatch] = useState({ value, active, turnId, finishing: false });
  const [completed, setCompleted] = useState<{ value: T; turnId: string | undefined } | null>(null);
  if (active && value.replyComplete && completed?.value !== value) {
    setCompleted({ value, turnId });
  } else if (completed && (completed.turnId !== turnId || (active && !value.replyComplete))) {
    setCompleted(null);
  }
  const reset = batch.turnId !== turnId || (!batch.active && active);
  if (reset) setBatch({ value, active, turnId, finishing: false });

  // The persisted final message can arrive while the last complete streaming
  // snapshot is still queued. Reveal that snapshot before swapping to history.
  const desired = !active && batch.active && !batch.value.replyComplete
    && completed && completed.turnId === turnId ? completed.value : value;
  const pending = !reset && batch.value !== desired && (active || batch.active);
  const commit = useEffectEvent(() => {
    const finishing = !active && desired !== value;
    setBatch({ value: desired, active: active || finishing, turnId, finishing });
  });

  useLayoutEffect(() => {
    if (!pending) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = () => {
      const remaining = revealUntil.current - performance.now();
      if (remaining > 0) timer = setTimeout(ready, remaining);
      else commit();
    };
    if (active) timer = setTimeout(ready, ROUTER_STREAM_BATCH_MS);
    // Let the queued final batch's layout effect register its animation.
    else if (batch.finishing) timer = setTimeout(ready, 0);
    else ready();
    return () => clearTimeout(timer);
  }, [active, pending, turnId, batch.value, batch.finishing, revealUntil]);

  return pending ? batch.value : value;
}
