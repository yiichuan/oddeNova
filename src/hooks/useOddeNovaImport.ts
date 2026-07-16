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
  const consumed = useRef(false);
  const imported = useRef(false);
  const [result, setResult] = useState<OddeNovaImportResult>({ status: 'idle' });

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    pending.current = parseOddeNovaImportHash(window.location.hash);
    if (pending.current.kind === 'none') return;

    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (pending.current.kind === 'error') {
      setResult({ status: 'error', reason: pending.current.reason });
    } else {
      setResult({ status: 'loading' });
    }
  }, []);

  useEffect(() => {
    if (!isReady || imported.current || pending.current?.kind !== 'payload') return;
    imported.current = true;
    void importer(pending.current.payload)
      .then((outcome) => setResult({ status: 'success', outcome, persistent: isPersistent }))
      .catch(() => setResult({ status: 'error', reason: 'invalid' }));
  }, [importer, isPersistent, isReady]);

  return result;
}
