import { useEffect, useRef, useState } from 'react';

import {
  ODDENOVA_BRIDGE_BOOTSTRAP_KEY,
  ODDENOVA_BRIDGE_CONNECTION_KEY,
  isOddeNovaBridgeSnapshot,
  parseOddeNovaBridgeBootstrap,
  readStoredBridgeConnection,
  verifyOddeNovaBridgeSnapshot,
  type OddeNovaBridgeSnapshot,
  type StoredOddeNovaBridgeConnection,
} from '../lib/oddenova-bridge';
import type { OddeNovaBridgeImportResult } from './useSessions';

export type OddeNovaBridgeStatus =
  | { status: 'idle' | 'connecting' | 'connected' }
  | { status: 'queued'; revision: number }
  | { status: 'applied'; revision: number; outcome: OddeNovaBridgeImportResult['outcome']; persistent: boolean }
  | { status: 'error'; message: string }
  | { status: 'occupied' | 'owner-changed' };

interface UseOddeNovaBridgeOptions {
  importer: (snapshot: OddeNovaBridgeSnapshot) => Promise<OddeNovaBridgeImportResult>;
  isReady: boolean;
  isBusy: boolean;
  isPersistent: boolean;
  ownerKey: string;
  onApplied: (snapshot: OddeNovaBridgeSnapshot, result: OddeNovaBridgeImportResult) => void;
}

function connectionQuery(connection: StoredOddeNovaBridgeConnection): string {
  return new URLSearchParams({
    projectId: connection.projectId,
    baseUrl: connection.baseUrl,
    clientId: connection.clientId,
  }).toString();
}

async function responseJson(response: Response): Promise<unknown> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
      ? (value as { error: string }).error
      : `Local connection failed (${response.status})`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return value;
}

function storeConnection(connection: StoredOddeNovaBridgeConnection): void {
  sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify(connection));
}

export function useOddeNovaBridge(options: UseOddeNovaBridgeOptions): OddeNovaBridgeStatus {
  const [status, setStatus] = useState<OddeNovaBridgeStatus>({ status: 'idle' });
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!options.isReady) return;
    let cancelled = false;
    let controller: AbortController | undefined;
    let visibilityWake = false;
    let retryMs = 1_000;

    const run = async () => {
      let connection = readStoredBridgeConnection();
      const rawBootstrap = sessionStorage.getItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY);
      const bootstrap = rawBootstrap ? parseOddeNovaBridgeBootstrap(JSON.parse(rawBootstrap) as unknown) : undefined;

      if (connection && connection.ownerKey !== options.ownerKey) {
        sessionStorage.removeItem(ODDENOVA_BRIDGE_CONNECTION_KEY);
        connection = undefined;
        if (!bootstrap) {
          setStatus({ status: 'owner-changed' });
          return;
        }
      }

      if (bootstrap) {
        setStatus({ status: 'connecting' });
        const query = new URLSearchParams({ projectId: bootstrap.projectId, baseUrl: bootstrap.baseUrl }).toString();
        const paired = await responseJson(await fetch(`${bootstrap.serviceOrigin}/v2/pair?${query}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: bootstrap.projectId, baseUrl: bootstrap.baseUrl, pairingToken: bootstrap.pairingToken }),
        })) as { pageToken: string };
        connection = {
          projectId: bootstrap.projectId,
          baseUrl: bootstrap.baseUrl,
          serviceOrigin: bootstrap.serviceOrigin,
          pageToken: paired.pageToken,
          ownerKey: options.ownerKey,
          clientId: crypto.randomUUID(),
          lastRevision: 0,
        };
        storeConnection(connection);
        sessionStorage.removeItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY);
      }
      if (!connection) return;
      setStatus({ status: 'connected' });

      while (!cancelled) {
        if (latest.current.ownerKey !== connection.ownerKey) {
          sessionStorage.removeItem(ODDENOVA_BRIDGE_CONNECTION_KEY);
          setStatus({ status: 'owner-changed' });
          return;
        }
        controller = new AbortController();
        try {
          const query = connectionQuery(connection);
          const response = await fetch(`${connection.serviceOrigin}/v2/poll?${query}&after=${connection.lastRevision}`, {
            headers: { authorization: `Bearer ${connection.pageToken}` },
            signal: controller.signal,
          });
          if (response.status === 204) { retryMs = 1_000; continue; }
          const value = await responseJson(response);
          if (!isOddeNovaBridgeSnapshot(value) || value.projectId !== connection.projectId) throw new Error('Local connection returned an invalid snapshot');
          if (!await verifyOddeNovaBridgeSnapshot(value)) throw new Error('Local connection snapshot failed its content hash');
          while (!cancelled && latest.current.isBusy) {
            setStatus({ status: 'queued', revision: value.revision });
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          if (cancelled) return;
          const result = await latest.current.importer(value);
          connection = { ...connection, lastRevision: Math.max(connection.lastRevision, value.revision) };
          storeConnection(connection);
          if (result.outcome !== 'unchanged') latest.current.onApplied(value, result);
          await responseJson(await fetch(`${connection.serviceOrigin}/v2/ack?${connectionQuery(connection)}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              projectId: connection.projectId,
              baseUrl: connection.baseUrl,
              revision: value.revision,
              sessionId: result.sessionId,
              outcome: result.outcome,
              persistent: latest.current.isPersistent,
            }),
          }));
          setStatus({ status: 'applied', revision: value.revision, outcome: result.outcome, persistent: latest.current.isPersistent });
          retryMs = 1_000;
        } catch (error) {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === 'AbortError' && visibilityWake) {
            visibilityWake = false;
            continue;
          }
          if ((error as { status?: number }).status === 409) { setStatus({ status: 'occupied' }); return; }
          if ((error as { status?: number }).status === 401) {
            sessionStorage.removeItem(ODDENOVA_BRIDGE_CONNECTION_KEY);
            setStatus({ status: 'error', message: '本机连接凭据已失效，请从 skill 显式重新打开。' });
            return;
          }
          setStatus({ status: 'error', message: '本机连接中断，正在重试。' });
          await new Promise((resolve) => setTimeout(resolve, retryMs));
          retryMs = Math.min(retryMs * 2, 30_000);
        }
      }
    };

    void run().catch((error: unknown) => {
      if (!cancelled) setStatus({ status: 'error', message: error instanceof Error ? error.message : '本机连接失败' });
    });
    const reconnectVisible = () => {
      if (!document.hidden) {
        visibilityWake = true;
        controller?.abort();
      }
    };
    document.addEventListener('visibilitychange', reconnectVisible);
    return () => {
      cancelled = true;
      controller?.abort();
      document.removeEventListener('visibilitychange', reconnectVisible);
    };
  }, [options.isReady, options.ownerKey]);

  return status;
}
