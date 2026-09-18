import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ODDENOVA_BRIDGE_BOOTSTRAP_KEY,
  ODDENOVA_BRIDGE_CONNECTION_KEY,
  isOddeNovaBridgeSnapshot,
  parseOddeNovaBridgeBootstrap,
  readStoredBridgeConnection,
  verifyOddeNovaBridgeSnapshot,
  type AnyOddeNovaBridgeSnapshot,
  type OddeNovaBridgeSnapshotV3,
  type StoredOddeNovaBridgeConnection,
} from '../lib/oddenova-bridge';
import { diffCreativeMessages, projectCreativeMessages } from '../lib/oddenova-bridge-messages';
import { deleteBridgeOutboxEntry, getBridgeOutboxEntries, putBridgeOutboxEntry, rebindBridgeOutboxEntries } from '../lib/session-storage';
import type { ChatMessage } from './useChat';
import type { OddeNovaBridgeImportResult } from './useSessions';

export type OddeNovaBridgeStatus =
  | { status: 'idle' | 'connecting' | 'connected' }
  | { status: 'queued'; revision: number }
  | { status: 'applied'; revision: number; outcome: OddeNovaBridgeImportResult['outcome']; persistent: boolean }
  | { status: 'error'; message: string }
  | { status: 'occupied' | 'owner-changed' };

interface UseOddeNovaBridgeOptions {
  importer: (snapshot: AnyOddeNovaBridgeSnapshot) => Promise<OddeNovaBridgeImportResult>;
  isReady: boolean;
  isBusy: boolean;
  isPersistent: boolean;
  ownerKey: string;
  onApplied: (snapshot: AnyOddeNovaBridgeSnapshot, result: OddeNovaBridgeImportResult) => void;
  pageState?: { sessionId: string; projectId: string; revision: number; title: string; code: string; messages: ChatMessage[] };
}

function connectionQuery(connection: StoredOddeNovaBridgeConnection): string {
  return new URLSearchParams({
    projectId: connection.projectId,
    baseUrl: connection.baseUrl,
    clientId: connection.clientId,
    ...(connection.bindingId ? { bindingId: connection.bindingId } : {}),
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
  const baseline = useRef<OddeNovaBridgeSnapshotV3 | undefined>(undefined);
  const activePollController = useRef<AbortController | undefined>(undefined);
  const dirtySince = useRef<number | undefined>(undefined);
  const observedPage = useRef<{ title: string; creative: string } | undefined>(undefined);
  latest.current = options;
  const pageSessionId = options.pageState?.sessionId;
  const pageProjectId = options.pageState?.projectId;
  const pageRevision = options.pageState?.revision;
  const pageTitle = options.pageState?.title;
  const pageCode = options.pageState?.code;
  const pageMessages = options.pageState?.messages;

  const queueLatestPageState = useCallback(async () => {
    const connection = readStoredBridgeConnection();
    const base = baseline.current;
    const page = latest.current.pageState;
    if (!connection?.bindingId || !base || connection.ownerKey !== latest.current.ownerKey || !page) return;
    if (page.projectId !== connection.projectId || page.revision !== base.revision) return;
    const messages = projectCreativeMessages(page.messages);
    const difference = diffCreativeMessages(base.messages, messages);
    const titleChanged = page.title !== base.title;
    const codeChanged = page.code !== base.code;
    if (!titleChanged && !codeChanged && difference.upsertMessages.length === 0 && difference.deleteMessageIds.length === 0) return;
    const projectKey = `${connection.baseUrl}\0${connection.projectId}`;
    const payload = {
      protocolVersion: 3, projectId: connection.projectId, baseUrl: connection.baseUrl,
      bindingId: connection.bindingId, clientId: connection.clientId, changeId: crypto.randomUUID(),
      baseRevision: connection.lastRevision, baseSkillRevision: connection.lastSkillRevision ?? 0,
      ...(titleChanged ? { title: page.title } : {}), ...(codeChanged ? { code: page.code } : {}),
      upsertMessages: difference.upsertMessages, deleteMessageIds: difference.deleteMessageIds,
    };
    const queued = await getBridgeOutboxEntries(connection.ownerKey, projectKey, connection.bindingId);
    const comparable = JSON.stringify({ ...payload, changeId: undefined });
    if (queued.some((entry) => JSON.stringify({ ...(entry.payload as object), changeId: undefined }) === comparable)) return;
    await putBridgeOutboxEntry({ ownerKey: connection.ownerKey, projectKey, bindingId: connection.bindingId, changeId: payload.changeId, payload, createdAt: Date.now() });
  }, []);

  useEffect(() => {
    if (!pageMessages || pageTitle === undefined) return;
    const creative = JSON.stringify(projectCreativeMessages(pageMessages));
    const immediate = observedPage.current !== undefined
      && (observedPage.current.title !== pageTitle || observedPage.current.creative !== creative);
    observedPage.current = { title: pageTitle, creative };
    dirtySince.current ??= Date.now();
    const delay = immediate ? 0 : Math.min(500, Math.max(0, 2_000 - (Date.now() - dirtySince.current)));
    const timer = window.setTimeout(() => {
      void queueLatestPageState().finally(() => activePollController.current?.abort());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    pageSessionId,
    pageProjectId,
    pageRevision,
    pageTitle,
    pageCode,
    pageMessages,
    queueLatestPageState,
  ]);

  useEffect(() => {
    if (!options.isReady) return;
    let cancelled = false;
    let controller: AbortController | undefined;
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
        const version = bootstrap.protocolVersion === 3 ? 'v3' : 'v2';
        const paired = await responseJson(await fetch(`${bootstrap.serviceOrigin}/${version}/pair?${query}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: bootstrap.projectId, baseUrl: bootstrap.baseUrl, pairingToken: bootstrap.pairingToken }),
        })) as { pageToken: string; bindingId?: string; revision?: number; skillRevision?: number };
        connection = {
          projectId: bootstrap.projectId,
          baseUrl: bootstrap.baseUrl,
          serviceOrigin: bootstrap.serviceOrigin,
          pageToken: paired.pageToken,
          ownerKey: options.ownerKey,
          clientId: crypto.randomUUID(),
          lastRevision: 0,
          lastSkillRevision: paired.skillRevision ?? 0,
          bindingId: paired.bindingId,
        };
        if (connection.bindingId) {
          await rebindBridgeOutboxEntries(
            connection.ownerKey,
            `${connection.baseUrl}\0${connection.projectId}`,
            connection.bindingId,
            connection.clientId,
          );
        }
        storeConnection(connection);
        sessionStorage.removeItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY);
      }
      if (!connection) return;
      if (connection.bindingId && connection.lastRevision > 0 && !latest.current.pageState) {
        await responseJson(await fetch(`${connection.serviceOrigin}/v3/disconnect`, {
          method: 'POST', headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, bindingId: connection.bindingId, clientId: connection.clientId }),
        }));
        sessionStorage.removeItem(ODDENOVA_BRIDGE_CONNECTION_KEY);
        setStatus({ status: 'idle' });
        return;
      }
      setStatus({ status: 'connected' });
      let upgradeSnapshot: OddeNovaBridgeSnapshotV3 | undefined;
      if (!connection.bindingId && latest.current.pageState?.projectId === connection.projectId) {
        try {
          const upgraded = await responseJson(await fetch(`${connection.serviceOrigin}/v3/upgrade`, {
            method: 'POST', headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, clientId: connection.clientId }),
          })) as { bindingId: string; skillRevision: number; snapshot: OddeNovaBridgeSnapshotV3 };
          connection = { ...connection, bindingId: upgraded.bindingId, lastSkillRevision: upgraded.skillRevision };
          baseline.current = upgraded.snapshot;
          upgradeSnapshot = upgraded.snapshot;
          storeConnection(connection);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      }

      const applySnapshot = async (value: AnyOddeNovaBridgeSnapshot) => {
        if (
          !isOddeNovaBridgeSnapshot(value)
          || value.projectId !== connection!.projectId
          || (value.protocolVersion === 3 && value.baseUrl !== connection!.baseUrl)
        ) throw new Error('Local connection returned an invalid snapshot');
        if (!await verifyOddeNovaBridgeSnapshot(value)) throw new Error('Local connection snapshot failed its content hash');
        while (!cancelled && latest.current.isBusy) {
          setStatus({ status: 'queued', revision: value.revision });
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (cancelled) return undefined;
        const result = await latest.current.importer(value);
        connection = {
          ...connection!, lastRevision: Math.max(connection!.lastRevision, value.revision),
          lastSkillRevision: value.protocolVersion === 3 ? value.skillRevision : connection!.lastSkillRevision,
        };
        if (value.protocolVersion === 3) baseline.current = value;
        storeConnection(connection);
        if (result.outcome !== 'unchanged') latest.current.onApplied(value, result);
        return result;
      };

      const flushPageChanges = async () => {
        if (!connection?.bindingId || !baseline.current) return;
        const page = latest.current.pageState;
        if (!page || page.projectId !== connection.projectId || page.revision !== baseline.current.revision) return;
        const projectKey = `${connection.baseUrl}\0${connection.projectId}`;
        let entries = await getBridgeOutboxEntries(connection.ownerKey, projectKey, connection.bindingId);
        if (entries.length === 0) {
          const messages = projectCreativeMessages(page.messages);
          const difference = diffCreativeMessages(baseline.current.messages, messages);
          const titleChanged = page.title !== baseline.current.title;
          const codeChanged = page.code !== baseline.current.code;
          if (!titleChanged && !codeChanged && difference.upsertMessages.length === 0 && difference.deleteMessageIds.length === 0) {
            dirtySince.current = undefined;
            return;
          }
          const payload = {
            protocolVersion: 3, projectId: connection.projectId, baseUrl: connection.baseUrl,
            bindingId: connection.bindingId, clientId: connection.clientId, changeId: crypto.randomUUID(),
            baseRevision: connection.lastRevision, baseSkillRevision: connection.lastSkillRevision ?? 0,
            ...(titleChanged ? { title: page.title } : {}), ...(codeChanged ? { code: page.code } : {}),
            upsertMessages: difference.upsertMessages, deleteMessageIds: difference.deleteMessageIds,
          };
          const entry = { ownerKey: connection.ownerKey, projectKey, bindingId: connection.bindingId, changeId: payload.changeId, payload, createdAt: Date.now() };
          await putBridgeOutboxEntry(entry);
          entries = [entry];
        }
        for (const entry of entries) {
          const value = await responseJson(await fetch(`${connection.serviceOrigin}/v3/page-change`, {
            method: 'POST', headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
            body: JSON.stringify(entry.payload),
          })) as { snapshot: OddeNovaBridgeSnapshotV3 };
          const result = await applySnapshot(value.snapshot);
          if (!result) return;
          await deleteBridgeOutboxEntry(entry);
        }
        dirtySince.current = undefined;
      };

      if (upgradeSnapshot) {
        await flushPageChanges();
        if (baseline.current?.contentHash === upgradeSnapshot.contentHash) await applySnapshot(upgradeSnapshot);
      }

      while (!cancelled) {
        if (latest.current.ownerKey !== connection.ownerKey) {
          sessionStorage.removeItem(ODDENOVA_BRIDGE_CONNECTION_KEY);
          setStatus({ status: 'owner-changed' });
          return;
        }
        controller = new AbortController();
        activePollController.current = controller;
        try {
          if (connection.bindingId) await flushPageChanges();
          const query = connectionQuery(connection);
          const version = connection.bindingId ? 'v3' : 'v2';
          const response = await fetch(`${connection.serviceOrigin}/${version}/poll?${query}&after=${connection.lastRevision}`, {
            headers: { authorization: `Bearer ${connection.pageToken}` },
            signal: controller.signal,
          });
          if (response.status === 204) { retryMs = 1_000; continue; }
          const raw = await responseJson(response);
          const packet = connection.bindingId
            ? raw as { snapshot: OddeNovaBridgeSnapshotV3; refreshRequestIds?: string[] }
            : { snapshot: raw as AnyOddeNovaBridgeSnapshot, refreshRequestIds: [] };
          const value = packet.snapshot;
          const refreshRequestIds = connection.bindingId ? packet.refreshRequestIds ?? [] : [];
          if (refreshRequestIds.length && !latest.current.isBusy) await flushPageChanges();
          if (connection.bindingId && refreshRequestIds.length && latest.current.isBusy) {
            for (const requestId of refreshRequestIds) {
              await responseJson(await fetch(`${connection.serviceOrigin}/v3/read-response`, {
                method: 'POST', headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
                body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, bindingId: connection.bindingId, clientId: connection.clientId, requestId, status: 'busy', localSequence: Date.now() }),
              }));
            }
          }
          const result = value.revision > connection.lastRevision ? await applySnapshot(value) : { outcome: 'unchanged' as const, sessionId: latest.current.pageState?.sessionId ?? '' };
          if (!result) return;
          if (connection.bindingId && refreshRequestIds.length && !latest.current.isBusy) {
            for (const requestId of refreshRequestIds) {
              await responseJson(await fetch(`${connection.serviceOrigin}/v3/read-response`, {
                method: 'POST', headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
                body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, bindingId: connection.bindingId, clientId: connection.clientId, requestId, status: 'ready', localSequence: Date.now() }),
              }));
            }
          }
          const ackVersion = connection.bindingId ? 'v3' : 'v2';
          await responseJson(await fetch(`${connection.serviceOrigin}/${ackVersion}/ack?${connectionQuery(connection)}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              projectId: connection.projectId,
              baseUrl: connection.baseUrl,
              ...(connection.bindingId
                ? { appliedRevision: connection.lastRevision, appliedSkillRevision: connection.lastSkillRevision ?? 0, bindingId: connection.bindingId, clientId: connection.clientId }
                : { revision: value.revision }),
              sessionId: result.sessionId || latest.current.pageState?.sessionId,
              outcome: result.outcome,
              persistent: latest.current.isPersistent,
            }),
          }));
          setStatus({ status: 'applied', revision: connection.lastRevision, outcome: result.outcome, persistent: latest.current.isPersistent });
          retryMs = 1_000;
        } catch (error) {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === 'AbortError') {
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
        controller?.abort();
      }
    };
    const flushBeforeHide = () => { void queueLatestPageState(); };
    document.addEventListener('visibilitychange', reconnectVisible);
    window.addEventListener('pagehide', flushBeforeHide);
    return () => {
      cancelled = true;
      controller?.abort();
      document.removeEventListener('visibilitychange', reconnectVisible);
      window.removeEventListener('pagehide', flushBeforeHide);
    };
  }, [options.isReady, options.ownerKey, options.pageState?.projectId, queueLatestPageState]);

  return status;
}
