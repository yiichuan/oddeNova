import { useEffect, useRef, useState } from 'react';

import {
  parseOddeNovaImportHash,
  type OddeNovaImportParseResult,
  type OddeNovaImportPayload,
} from '../lib/oddenova-import';
import type { OddeNovaImportOutcome } from './useSessions';

export type OddeNovaImportResult =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; outcome: OddeNovaImportOutcome; persistent: boolean }
  | { status: 'error'; reason: 'invalid' | 'unsupported-version' };

export function useOddeNovaImport(
  importer: (payload: OddeNovaImportPayload) => Promise<OddeNovaImportOutcome>,
  isReady: boolean,
  isPersistent: boolean,
): OddeNovaImportResult {
  const pending = useRef<OddeNovaImportParseResult | undefined>(undefined);
  const imported = useRef(false);
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<OddeNovaImportResult>({ status: 'idle' });

  useEffect(() => {
    // Opening an import link while this origin is already open is a same-document
    // navigation: only the fragment changes, so consume it on hashchange too.
    const consume = () => {
      const parsed = parseOddeNovaImportHash(window.location.hash);
      if (parsed.kind === 'none') return;
      pending.current = parsed;
      imported.current = false;
      setRequest((previous) => previous + 1);

      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (parsed.kind === 'error') {
        setResult({ status: 'error', reason: parsed.reason });
      } else {
        setResult({ status: 'loading' });
      }
    };

    consume();
    window.addEventListener('hashchange', consume);
    return () => window.removeEventListener('hashchange', consume);
  }, []);

  useEffect(() => {
    if (!isReady || imported.current || pending.current?.kind !== 'payload') return;
    imported.current = true;
    void importer(pending.current.payload)
      .then((outcome) => setResult({ status: 'success', outcome, persistent: isPersistent }))
      .catch(() => setResult({ status: 'error', reason: 'invalid' }));
  }, [importer, isPersistent, isReady, request]);

  useEffect(() => {
    if (result.status !== 'success' && result.status !== 'error') return;
    const timer = window.setTimeout(() => setResult({ status: 'idle' }), 4000);
    return () => window.clearTimeout(timer);
  }, [result]);

  return result;
}
