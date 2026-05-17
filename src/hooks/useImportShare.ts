import { useEffect, useRef, useState } from 'react';
import { fetchShare, type SharePayload } from '../services/share';

export type ImportStatus = 'idle' | 'loading' | 'error';

export function useImportShare(
  importSession: (payload: SharePayload) => Promise<void>,
  isReady: boolean
): ImportStatus {
  // Derive initial status from URL so we never call setState synchronously inside an effect.
  const [status, setStatus] = useState<ImportStatus>(() =>
    /^\/s\/[^/]+$/.test(window.location.pathname) ? 'loading' : 'idle'
  );
  const didRun = useRef(false);

  useEffect(() => {
    if (!isReady || didRun.current) return;
    const match = /^\/s\/([^/]+)$/.exec(window.location.pathname);
    if (!match) return;

    didRun.current = true;
    const shareId = match[1];

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
