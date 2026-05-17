import { useEffect, useRef, useState } from 'react';
import { fetchShare, type SharePayload } from '../services/share';

export type ImportStatus = 'idle' | 'loading' | 'error';

export function useImportShare(
  importSession: (payload: SharePayload) => Promise<void>,
  isReady: boolean
): ImportStatus {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const importSessionRef = useRef(importSession);
  importSessionRef.current = importSession;
  const didRun = useRef(false);

  useEffect(() => {
    if (!isReady || didRun.current) return;
    const match = /^\/s\/([^/]+)$/.exec(window.location.pathname);
    if (!match) return;

    didRun.current = true;
    const shareId = match[1];
    setStatus('loading');

    fetchShare(shareId)
      .then((payload) => importSessionRef.current(payload))
      .then(() => {
        history.replaceState(null, '', '/');
        setStatus('idle');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [isReady]);

  return status;
}
