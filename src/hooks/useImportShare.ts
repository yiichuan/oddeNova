import { useEffect, useRef, useState } from 'react';
import { fetchShare, type SharePayload } from '../services/share';

export type ImportStatus = 'idle' | 'loading' | 'error';

export function getShareIdFromLocation(location: Location): string | null {
  const pathMatch = /^\/s\/([^/]+)$/.exec(location.pathname);
  if (pathMatch) return pathMatch[1];

  const queryId = new URLSearchParams(location.search).get('share');
  return queryId || null;
}

export function useImportShare(
  importSession: (payload: SharePayload) => Promise<void>,
  isReady: boolean
): ImportStatus {
  // Derive initial status from URL so we never call setState synchronously inside an effect.
  const [status, setStatus] = useState<ImportStatus>(() =>
    getShareIdFromLocation(window.location) ? 'loading' : 'idle'
  );
  const didRun = useRef(false);

  useEffect(() => {
    if (!isReady || didRun.current) return;
    const shareId = getShareIdFromLocation(window.location);
    if (!shareId) return;

    didRun.current = true;

    fetchShare(shareId)
      .then((payload) => importSession(payload))
      .then(() => {
        history.replaceState(null, '', '/');
        setStatus('idle');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [isReady, importSession]);

  return status;
}
