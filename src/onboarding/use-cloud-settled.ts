import { useCallback, useEffect, useRef, useState } from 'react';
import { readCloudOnboardingSettled, writeCloudOnboardingSettled } from './onboarding-cloud';

const READ_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/**
 * The account-level "guide settled" flag, for the desktop guide. A signed-in
 * reader who finished or declined the guide on one device is not invited on
 * another. Guests have no cloud record: their status is always `clear`.
 *
 * - `loading`: not yet known, including during automatic read retries.
 * - `clear`: nothing settled in the cloud.
 * - `settled`: finished or declined somewhere.
 * - `error`: unreadable for now; retried when the window regains focus or the
 *   network comes back, and the invitation waits meanwhile.
 */
export type CloudSettledStatus = 'loading' | 'clear' | 'settled' | 'error';

function userIdOf(ownerKey: string): string | null {
  return ownerKey.startsWith('user:') ? ownerKey.slice('user:'.length) : null;
}

export function useCloudSettled(ownerKey: string, enabled: boolean, isLocallySettled: () => boolean) {
  const userId = enabled ? userIdOf(ownerKey) : null;
  const [state, setState] = useState<{ ownerKey: string; status: CloudSettledStatus }>({ ownerKey, status: 'loading' });
  const [retryTick, setRetryTick] = useState(0);
  /** Bumped per owner (and per retry): a late answer about another owner is dropped. */
  const generationRef = useRef(0);
  const localRef = useRef(isLocallySettled);
  useEffect(() => {
    localRef.current = isLocallySettled;
  });

  const pushSettled = useCallback(async () => {
    if (!userId) return;
    const generation = generationRef.current;
    try {
      await writeCloudOnboardingSettled(userId);
      if (generation === generationRef.current) setState({ ownerKey, status: 'settled' });
    } catch {
      if (generation === generationRef.current) setState({ ownerKey, status: 'error' });
    }
  }, [ownerKey, userId]);

  useEffect(() => {
    if (!userId) return;
    const generation = ++generationRef.current;
    let retryTimer: number | undefined;

    const read = async (attempt: number) => {
      try {
        const settled = await readCloudOnboardingSettled(userId);
        if (generation !== generationRef.current) return;
        if (settled) setState({ ownerKey, status: 'settled' });
        // Settled here before the cloud heard of it (offline at the time).
        else if (localRef.current()) void pushSettled();
        else setState({ ownerKey, status: 'clear' });
      } catch {
        if (generation !== generationRef.current) return;
        const delay = READ_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          setState({ ownerKey, status: 'error' });
          return;
        }
        retryTimer = window.setTimeout(() => { void read(attempt + 1); }, delay);
      }
    };

    void read(0);
    return () => {
      window.clearTimeout(retryTimer);
      generationRef.current += 1;
    };
  }, [ownerKey, userId, retryTick, pushSettled]);

  const status: CloudSettledStatus = !userId
    ? 'clear'
    : state.ownerKey === ownerKey ? state.status : 'loading';

  useEffect(() => {
    if (status !== 'error') return;
    const retry = () => {
      setState({ ownerKey, status: 'loading' });
      setRetryTick((n) => n + 1);
    };
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
    };
  }, [ownerKey, status]);

  return { status, pushSettled };
}
