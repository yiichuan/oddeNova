import { useEffect } from 'react';
import { trackAccountActive } from '../lib/analytics';

/** A visible signed-in app counts as active; hidden idle tabs do not. */
export function useAccountActivity(accountId: string | null, loading: boolean): void {
  useEffect(() => {
    if (loading || !accountId) return;
    const check = () => {
      if (document.visibilityState === 'visible') void trackAccountActive(accountId);
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    // A tab can stay visible across midnight without another navigation/login.
    // The analytics layer emits at most once per account/day per page load.
    const timer = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.clearInterval(timer);
    };
  }, [accountId, loading]);
}
