import { useEffect, useState } from 'react';
import { fetchShare, type SharePayload } from '../services/share';

export type ImportStatus = 'idle' | 'loading' | 'error';

export function useImportShare(
  importSession: (payload: SharePayload) => Promise<void>
): ImportStatus {
  const [status, setStatus] = useState<ImportStatus>('idle');

  useEffect(() => {
    const match = /^\/s\/([^/]+)$/.exec(window.location.pathname);
    if (!match) return;

    const shareId = match[1];
    setStatus('loading');

    fetchShare(shareId)
      .then((payload) => importSession(payload))
      .then(() => {
        history.replaceState(null, '', '/');
        setStatus('idle');
      })
      .catch(() => {
        setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}
