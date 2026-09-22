import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ODDENOVA_BRIDGE_BOOTSTRAP_KEY,
  ODDENOVA_BRIDGE_CONNECTION_KEY,
  isOddeNovaBridgeSnapshot,
  normalizeOddeNovaBridgeBaseUrl,
  oddeNovaBridgeProjectKey,
  parseOddeNovaBridgePairResponse,
  parseOddeNovaBridgeBootstrap,
  readStoredBridgeConnection,
  verifyOddeNovaBridgeSnapshot,
  type AnyOddeNovaBridgeSnapshot,
  type OddeNovaBridgeSnapshotV3,
  type StoredOddeNovaBridgeConnection,
} from '../lib/oddenova-bridge';
import {
  bridgeCheckpointMatchesBinding,
  bridgePageMatchesSnapshot,
  makeOddeNovaBridgePageChange,
  type BridgePageState,
  type BridgePageStateResolution,
  type OddeNovaBridgeBinding,
} from '../lib/oddenova-bridge-state';
import { projectCreativeMessages, diffCreativeMessages, type PendingBridgeMessageDelta } from '../lib/oddenova-bridge-messages';
import {
  oddeNovaBridgeReceiverLockName,
  runWithOddeNovaBridgeReceiverLock,
} from '../lib/oddenova-bridge-receiver-lock';
import {
  deleteBridgeCheckpoint,
  confirmBridgeCheckpointPresentation,
  getBridgeCheckpoint,
  getLatestBridgeCheckpoint,
  getBridgeOutboxEntries,
  putBridgeOutboxEntry,
  type StoredBridgeCheckpoint,
  type StoredBridgeOutboxEntry,
} from '../lib/session-storage';
import type { ChatMessage } from './useChat';
import type {
  OddeNovaBridgeImportBinding,
  OddeNovaBridgeImportContext,
  OddeNovaBridgeImportResult,
  OddeNovaBridgeRebindInput,
} from './useSessions';

export type OddeNovaBridgeStatus =
  | { status: 'idle' | 'connecting' | 'connected' | 'recovering' }
  | { status: 'queued'; revision: number }
  | { status: 'applied'; revision: number; outcome: OddeNovaBridgeImportResult['outcome']; persistent: boolean }
  | { status: 'error'; message: string }
  | { status: 'recovery-required'; message: string }
  | { status: 'disconnected'; message?: string }
  | { status: 'occupied' | 'owner-changed' };

export interface UseOddeNovaBridgeResult {
  status: OddeNovaBridgeStatus;
  binding?: OddeNovaBridgeBinding;
}

export type OddeNovaBridgePresentationReason = 'new-skill-version' | 'first-import' | 'recovery';

interface LegacyPageState {
  sessionId: string;
  projectId: string;
  revision: number;
  title: string;
  code: string;
  messages: ChatMessage[];
}

interface UseOddeNovaBridgeOptions {
  importer: (
    snapshot: AnyOddeNovaBridgeSnapshot,
    binding?: OddeNovaBridgeImportBinding,
    context?: OddeNovaBridgeImportContext,
  ) => Promise<OddeNovaBridgeImportResult>;
  isReady: boolean;
  isBusy: boolean;
  isPersistent: boolean;
  ownerKey: string;
  presentAppliedSnapshot?: (
    snapshot: AnyOddeNovaBridgeSnapshot,
    result: OddeNovaBridgeImportResult,
    presentation: { reason: OddeNovaBridgePresentationReason },
  ) => void | Promise<void>;
  /** @deprecated Kept for v1/v2 test and integration adapters. */
  onApplied?: (snapshot: AnyOddeNovaBridgeSnapshot, result: OddeNovaBridgeImportResult) => void | Promise<void>;
  /** New resolver. It must read current sessions/editor state through refs. */
  resolvePageState?: (binding: OddeNovaBridgeBinding) => BridgePageStateResolution;
  /** Atomically move the exact paired session to a newly issued binding. */
  rebindSession?: (input: OddeNovaBridgeRebindInput) => Promise<{
    sessionId: string;
    previousBindingId: string;
    bindingId: string;
  }>;
  /** A cheap render signal for editor/session changes; the resolver stays stable. */
  pageStateVersion?: string;
  /** Kept for callers/tests that predate the resolver contract. */
  pageState?: LegacyPageState;
}

type FlushResult =
  | { status: 'confirmed'; completedLocalSequence: number; snapshot?: OddeNovaBridgeSnapshotV3 }
  | { status: 'busy'; completedLocalSequence: number }
  | { status: 'unavailable' | 'recovery-required'; completedLocalSequence: number; message: string };

interface ApplyOptions {
  forceImport?: boolean;
  deleteOutboxChangeIds?: string[];
  /**
   * Where this apply came from. `page-change` applies are already the product
   * of the pre-import reconciliation, so they must not run it again; every
   * other entry (poll, upgrade, recovery) reconciles before importing.
   */
  source?: 'poll' | 'page-change';
}

interface PendingPresentation {
  snapshot: OddeNovaBridgeSnapshotV3;
  sessionId: string;
  reason: OddeNovaBridgePresentationReason;
}

class BridgeRecoveryRequiredError extends Error {
  readonly code = 'recovery-required';
}

function connectionQuery(connection: StoredOddeNovaBridgeConnection): string {
  return new URLSearchParams({
    projectId: connection.projectId,
    baseUrl: normalizeOddeNovaBridgeBaseUrl(connection.baseUrl),
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
  sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
    ...connection,
    baseUrl: normalizeOddeNovaBridgeBaseUrl(connection.baseUrl),
  }));
}

function connectionBinding(connection: StoredOddeNovaBridgeConnection): OddeNovaBridgeBinding {
  return {
    ownerKey: connection.ownerKey,
    projectId: connection.projectId,
    baseUrl: normalizeOddeNovaBridgeBaseUrl(connection.baseUrl),
    serviceOrigin: connection.serviceOrigin,
    clientId: connection.clientId,
    ...(connection.bindingId ? { bindingId: connection.bindingId } : {}),
    ...(connection.sessionId ? { sessionId: connection.sessionId } : {}),
  };
}

function pageSignature(page: BridgePageState): string {
  return JSON.stringify({
    sessionId: page.sessionId,
    projectId: page.projectId,
    baseUrl: page.baseUrl,
    revision: page.revision,
    title: page.title,
    code: page.code,
    messages: projectCreativeMessages(page.messages),
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function statusMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useOddeNovaBridge(options: UseOddeNovaBridgeOptions): UseOddeNovaBridgeResult {
  const [status, setStatus] = useState<OddeNovaBridgeStatus>({ status: 'idle' });
  const [binding, setBinding] = useState<OddeNovaBridgeBinding | undefined>(undefined);
  const latest = useRef(options);
  const baseline = useRef<OddeNovaBridgeSnapshotV3 | undefined>(undefined);
  const activePollController = useRef<AbortController | undefined>(undefined);
  const flushPromise = useRef<Promise<FlushResult> | undefined>(undefined);
  const generation = useRef(0);
  const leaseReady = useRef(false);
  const receiverOwned = useRef(false);
  const dirtySince = useRef<number | undefined>(undefined);
  const localSequence = useRef(0);
  const observedPage = useRef<{ signature: string; sequence: number } | undefined>(undefined);
  const applying = useRef<{ sessionId: string; code: string } | undefined>(undefined);
  /** Only a confirmed checkpoint is allowed to establish this baseline. */
  const confirmedSkillRevision = useRef<number | undefined>(undefined);
  const pendingPresentation = useRef<PendingPresentation | undefined>(undefined);
  latest.current = options;

  const resolvePage = useCallback((connection: StoredOddeNovaBridgeConnection): BridgePageStateResolution => {
    const currentBinding = connectionBinding(connection);
    const resolver = latest.current.resolvePageState;
    if (resolver) return resolver(currentBinding);
    const legacy = latest.current.pageState;
    if (!legacy) return { status: 'missing', reason: 'No page state is available for this bridge' };
    if (
      legacy.projectId !== connection.projectId
      || (connection.sessionId !== undefined && legacy.sessionId !== connection.sessionId)
    ) return { status: 'missing', reason: 'The page state does not belong to this bridge' };
    return {
      status: 'ready',
      binding: { ...currentBinding, sessionId: legacy.sessionId },
      pageState: {
        ...legacy,
        baseUrl: normalizeOddeNovaBridgeBaseUrl(connection.baseUrl),
      },
    };
  }, []);

  const currentPage = useCallback((connection: StoredOddeNovaBridgeConnection): BridgePageState | undefined => {
    const result = resolvePage(connection);
    return result.status === 'ready' ? result.pageState : undefined;
  }, [resolvePage]);

  const queueLatestPageState = useCallback(async (): Promise<number> => {
    if (!receiverOwned.current || applying.current) return localSequence.current;
    const connection = readStoredBridgeConnection();
    const base = baseline.current;
    if (!connection?.bindingId || !base || connection.ownerKey !== latest.current.ownerKey) return localSequence.current;
    const result = resolvePage(connection);
    if (result.status !== 'ready') return localSequence.current;
    const page = result.pageState;
    if (page.revision !== base.revision) return localSequence.current;
    const payload = makeOddeNovaBridgePageChange({
      connection,
      baseline: base,
      page,
      changeId: crypto.randomUUID(),
    });
    if (!payload) {
      dirtySince.current = undefined;
      return localSequence.current;
    }
    const projectKey = oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId);
    const queued = await getBridgeOutboxEntries(connection.ownerKey, projectKey, connection.bindingId);
    const comparable = JSON.stringify({ ...payload, changeId: undefined });
    if (queued.some((entry) => JSON.stringify({ ...(entry.payload as object), changeId: undefined }) === comparable)) {
      return localSequence.current;
    }
    await putBridgeOutboxEntry({
      ownerKey: connection.ownerKey,
      projectKey,
      bindingId: connection.bindingId,
      changeId: payload.changeId,
      payload,
      createdAt: Date.now(),
    }, { generationGuard: true });
    return localSequence.current;
  }, [resolvePage]);

  // Track real page changes, not every render. The initial state is only an
  // observation; it becomes dirty after a later signature differs from it.
  useEffect(() => {
    const connection = readStoredBridgeConnection();
    if (!connection || connection.ownerKey !== latest.current.ownerKey || applying.current) return;
    const result = resolvePage(connection);
    if (result.status !== 'ready') return;
    const signature = pageSignature(result.pageState);
    const previous = observedPage.current;
    if (!previous) {
      observedPage.current = { signature, sequence: localSequence.current };
      return;
    }
    if (previous.signature === signature) return;
    localSequence.current += 1;
    observedPage.current = { signature, sequence: localSequence.current };
    dirtySince.current ??= Date.now();
    const immediate = previous.sequence > 0;
    const delay = immediate ? 0 : Math.min(500, Math.max(0, 2_000 - (Date.now() - dirtySince.current)));
    const timer = window.setTimeout(() => {
      void queueLatestPageState()
        .catch((error) => {
          // Queueing must not lose the local change: keep it in the page and
          // surface a retryable error. A generation guard rejection means this
          // page's binding no longer exists and the page stays fail-closed.
          setStatus({ status: 'error', message: statusMessage(error, '本机连接排队失败，正在重试。') });
        })
        .finally(() => activePollController.current?.abort());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [options.pageState, options.pageStateVersion, queueLatestPageState, resolvePage]);

  useEffect(() => {
    if (!options.isReady) return;
    const currentGeneration = ++generation.current;
    let cancelled = false;
    let controller: AbortController | undefined;
    let retryMs = 1_000;
    let connection: StoredOddeNovaBridgeConnection | undefined;

    const stillCurrent = (): boolean => (
      !cancelled
      && generation.current === currentGeneration
      && latest.current.ownerKey === connection?.ownerKey
    );

    const clearConnection = (): void => {
      sessionStorage.removeItem(ODDENOVA_BRIDGE_CONNECTION_KEY);
      connection = undefined;
      setBinding(undefined);
      baseline.current = undefined;
      confirmedSkillRevision.current = undefined;
      pendingPresentation.current = undefined;
      leaseReady.current = false;
    };

    const sendReadResponse = async (
      requestId: string,
      responseStatus: 'busy' | 'ready' | 'unavailable',
      completedLocalSequence: number,
    ): Promise<void> => {
      if (!connection?.bindingId || !stillCurrent()) return;
      await responseJson(await fetch(`${connection.serviceOrigin}/v3/read-response?${connectionQuery(connection)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: connection.projectId,
          baseUrl: connection.baseUrl,
          bindingId: connection.bindingId,
          clientId: connection.clientId,
          requestId,
          status: responseStatus,
          localSequence: completedLocalSequence,
        }),
      }));
    };

    const waitForVisibleEditor = async (snapshot: OddeNovaBridgeSnapshotV3, sessionId: string): Promise<void> => {
      const expected = connection!;
      const isSameBinding = (page: BridgePageStateResolution): boolean => {
        if (page.status !== 'ready') return false;
        const pageBinding = page.binding;
        return pageBinding.ownerKey === expected.ownerKey
          && pageBinding.projectId === expected.projectId
          && normalizeOddeNovaBridgeBaseUrl(pageBinding.baseUrl) === normalizeOddeNovaBridgeBaseUrl(expected.baseUrl)
          && pageBinding.bindingId === expected.bindingId
          && pageBinding.sessionId === sessionId;
      };
      const isCurrentBinding = (): boolean => {
        const stored = readStoredBridgeConnection();
        return Boolean(
          stored
          && stored.ownerKey === expected.ownerKey
          && stored.projectId === expected.projectId
          && normalizeOddeNovaBridgeBaseUrl(stored.baseUrl) === normalizeOddeNovaBridgeBaseUrl(expected.baseUrl)
          && stored.bindingId === expected.bindingId
          && stored.sessionId === sessionId,
        );
      };

      // The editor setter and React session switch can both complete before a
      // browser paint. Always cross one paint before the first probe, then
      // require the exact bound session and the actual CodeMirror document.
      await nextPaint();
      const deadline = Date.now() + 2_000;
      while (stillCurrent() && isCurrentBinding() && Date.now() < deadline) {
        const page = resolvePage(expected);
        if (
          isSameBinding(page)
          && page.status === 'ready'
          && page.visibleSessionId === sessionId
          && page.editorCode !== undefined
          && page.editorCode === snapshot.code
        ) return;
        await sleep(25);
      }
      throw new BridgeRecoveryRequiredError('编辑器尚未确认已应用本机连接版本，当前读取未确认。');
    };

    const waitForBoundSession = async (expectedSessionId: string): Promise<void> => {
      const expected = connection!;
      await nextPaint();
      const deadline = Date.now() + 2_000;
      while (stillCurrent() && Date.now() < deadline) {
        const page = resolvePage(expected);
        if (page.status === 'ready' && page.binding.sessionId === expectedSessionId) return;
        await sleep(25);
      }
      throw new BridgeRecoveryRequiredError('精确重绑后的本机会话尚未收敛，已停止恢复。');
    };

    const makeCheckpoint = (
      snapshot: OddeNovaBridgeSnapshotV3,
      sessionId: string,
      presentationReason?: OddeNovaBridgePresentationReason,
    ): StoredBridgeCheckpoint | undefined => {
      if (!connection?.bindingId) return undefined;
      return {
        schemaVersion: 1,
        ownerKey: connection.ownerKey,
        projectKey: oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId),
        bindingId: connection.bindingId,
        sessionId,
        snapshot: { ...snapshot, baseUrl: normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl), bindingId: connection.bindingId },
        ...(presentationReason
          ? {
              editorPresentation: {
                revision: snapshot.revision,
                skillRevision: snapshot.skillRevision,
                status: 'pending' as const,
              },
            }
          : {
              editorPresentation: {
                revision: snapshot.revision,
                skillRevision: snapshot.skillRevision,
                status: 'confirmed' as const,
              },
            }),
        updatedAt: Date.now(),
      };
    };

    const applySnapshot = async (
      value: AnyOddeNovaBridgeSnapshot,
      applyOptions: ApplyOptions = {},
    ): Promise<OddeNovaBridgeImportResult | undefined> => {
      if (!connection || !stillCurrent()) return undefined;
      if (
        !isOddeNovaBridgeSnapshot(value)
        || value.projectId !== connection.projectId
        || (value.protocolVersion === 3 && normalizeOddeNovaBridgeBaseUrl(value.baseUrl) !== normalizeOddeNovaBridgeBaseUrl(connection.baseUrl))
        || (value.protocolVersion === 3 && connection.bindingId !== undefined && value.bindingId !== connection.bindingId)
      ) throw new Error('Local connection returned an invalid snapshot');
      if (!await verifyOddeNovaBridgeSnapshot(value)) throw new Error('Local connection snapshot failed its content hash');

      const pending = pendingPresentation.current;
      const confirmedSkill = confirmedSkillRevision.current ?? baseline.current?.skillRevision;
      const isNewSkillVersion = value.protocolVersion === 3 && (
        (confirmedSkill !== undefined && value.skillRevision > confirmedSkill)
        || (pending !== undefined && value.skillRevision > pending.snapshot.skillRevision)
      );
      let snapshot: AnyOddeNovaBridgeSnapshot = pending !== undefined
        && value.protocolVersion === 3
        && !isNewSkillVersion
        ? pending.snapshot
        : value;
      // Pre-import reconciliation. A poll/recovery/new-skill entry must not
      // import on top of a page read taken before the app went busy: wait for
      // the busy state to end, flush the page again, and only then capture the
      // message delta this import must preserve. The loop keeps running while
      // the page keeps changing; cancellation, owner, binding, and session
      // checks are the only exits — there is no "give up after N tries".
      let pendingMessageDelta: PendingBridgeMessageDelta | undefined;
      if (value.protocolVersion === 3 && connection.bindingId && applyOptions.source !== 'page-change') {
        for (;;) {
          while (latest.current.isBusy && stillCurrent()) {
            setStatus({ status: 'queued', revision: value.revision });
            await sleep(250);
          }
          if (!stillCurrent()) return undefined;
          const targetSequence = localSequence.current;
          if (baseline.current) {
            const flushed = await flushPageChanges(targetSequence);
            if (flushed.status === 'recovery-required') throw new BridgeRecoveryRequiredError(flushed.message);
            if (flushed.status === 'busy') continue;
            if (flushed.status === 'confirmed' && flushed.snapshot && pending === undefined && flushed.snapshot.revision >= snapshot.revision) {
              // The flush already merged the page into the helper; its response
              // carries the helper's current skill revision, so never apply the
              // older snapshot that started this apply.
              snapshot = flushed.snapshot;
            }
            if (localSequence.current > targetSequence) continue;
          }
          const freshPage = currentPage(connection);
          if (freshPage && baseline.current) {
            const difference = diffCreativeMessages(baseline.current.messages, projectCreativeMessages(freshPage.messages));
            if (difference.upsertMessages.length > 0 || difference.deleteMessageIds.length > 0) {
              pendingMessageDelta = { capturedLocalSequence: localSequence.current, ...difference };
            }
          }
          break;
        }
      } else {
        while (latest.current.isBusy && stillCurrent()) {
          setStatus({ status: 'queued', revision: value.revision });
          await sleep(250);
        }
        if (!stillCurrent()) return undefined;
      }
      if (!stillCurrent()) return undefined;

      const trustedExistingPage = snapshot.protocolVersion === 3
        && !baseline.current
        && !pending
        && Boolean(connection.sessionId)
        && (() => {
          const page = currentPage(connection);
          return page !== undefined && bridgePageMatchesSnapshot(page, snapshot);
        })();
      const presentationReason: OddeNovaBridgePresentationReason | undefined = snapshot.protocolVersion === 3
          ? pending !== undefined
            ? isNewSkillVersion ? 'new-skill-version' : 'recovery'
            : isNewSkillVersion
            ? 'new-skill-version'
            : !baseline.current && !trustedExistingPage
              ? 'first-import'
              : undefined
        : undefined;

      // A pre-checkpoint connection may only recover automatically when the
      // helper snapshot is exactly the version already recorded on the local
      // bridge session. Revision alone is insufficient: it cannot tell a
      // deleted local message from a message added by the helper.
      if (snapshot.protocolVersion === 3 && !baseline.current && !pending && connection.sessionId) {
        const page = currentPage(connection);
        if (
          !page
          || !bridgePageMatchesSnapshot(page, snapshot)
        ) {
          throw new BridgeRecoveryRequiredError('旧连接没有可靠同步基线，helper 内容已变化；本地会话仍保留，当前读取未确认。');
        }
      }

      if (snapshot.protocolVersion === 3 && baseline.current) {
        if (!presentationReason && snapshot.revision < baseline.current.revision) {
          return { outcome: 'unchanged', sessionId: connection.sessionId ?? '', codeChanged: false, skillRevision: baseline.current.skillRevision };
        }
        if (!presentationReason && snapshot.revision === baseline.current.revision) {
          if (snapshot.contentHash !== baseline.current.contentHash) throw new Error('The same bridge revision arrived with different content');
          if (!applyOptions.forceImport) {
            return { outcome: 'unchanged', sessionId: connection.sessionId ?? '', codeChanged: false, skillRevision: snapshot.skillRevision };
          }
        }
      }

      const pageBefore = currentPage(connection);
      const importBinding: OddeNovaBridgeImportBinding = {
        ownerKey: connection.ownerKey,
        projectId: connection.projectId,
        baseUrl: connection.baseUrl,
        ...(connection.bindingId ? { bindingId: connection.bindingId } : {}),
        ...(connection.sessionId ? { sessionId: connection.sessionId } : {}),
        clientId: connection.clientId,
      };
      applying.current = { sessionId: connection.sessionId ?? pageBefore?.sessionId ?? '', code: snapshot.code };
      let result: OddeNovaBridgeImportResult | undefined;
      try {
        const context: OddeNovaBridgeImportContext | undefined = snapshot.protocolVersion === 3 && connection.sessionId && connection.bindingId
          ? {
              checkpoint: makeCheckpoint(snapshot, connection.sessionId, presentationReason),
              deleteOutboxChangeIds: applyOptions.deleteOutboxChangeIds,
              ...(pendingMessageDelta ? { pendingMessageDelta } : {}),
              // The baseline is the page-confirmed boundary: with one in hand
              // the commit must replace an existing checkpoint, and a missing
              // row is a broken generation rather than a fresh one.
              checkpointExpectation: baseline.current ? 'update' : 'initial',
            }
          : snapshot.protocolVersion === 3 && connection.bindingId
            ? {
                checkpoint: makeCheckpoint(snapshot, '', presentationReason),
                deleteOutboxChangeIds: applyOptions.deleteOutboxChangeIds,
                checkpointExpectation: baseline.current ? 'update' : 'initial',
              }
            : applyOptions.deleteOutboxChangeIds?.length
              ? { deleteOutboxChangeIds: applyOptions.deleteOutboxChangeIds }
              : undefined;
        result = connection.bindingId
          ? await latest.current.importer(snapshot, importBinding, context)
          : await latest.current.importer(snapshot);
        if (!stillCurrent()) return undefined;
        if (!result.sessionId) throw new Error('Bridge import did not identify a local session');
        if (connection.sessionId && connection.sessionId !== result.sessionId) {
          throw new BridgeRecoveryRequiredError('本机连接绑定的作品会话发生变化，已停止同步。');
        }
        connection.sessionId = result.sessionId;
        storeConnection(connection);
        setBinding(connectionBinding(connection));
        const effectivePresentationReason = presentationReason
          ?? (snapshot.protocolVersion === 2 && result.outcome !== 'unchanged' ? 'first-import' : undefined);
        if (effectivePresentationReason) {
          if (snapshot.protocolVersion === 3) {
            if (!connection.bindingId) throw new BridgeRecoveryRequiredError('新 skill 版本缺少绑定会话，当前读取未确认。');
            pendingPresentation.current = {
              snapshot,
              sessionId: result.sessionId,
              reason: effectivePresentationReason,
            };
          }
          if (latest.current.presentAppliedSnapshot) {
            await latest.current.presentAppliedSnapshot(snapshot, result, { reason: effectivePresentationReason });
          } else {
            await latest.current.onApplied?.(snapshot, result);
          }
          if (snapshot.protocolVersion === 3) {
            await waitForVisibleEditor(snapshot, result.sessionId);
            const confirmed = await confirmBridgeCheckpointPresentation({
              ownerKey: connection.ownerKey,
              projectKey: oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId),
              bindingId: connection.bindingId!,
              sessionId: result.sessionId,
              revision: snapshot.revision,
              skillRevision: snapshot.skillRevision,
            });
            if (!confirmed) throw new BridgeRecoveryRequiredError('编辑器确认对应的 Bridge checkpoint 已变化，当前读取未确认。');
            pendingPresentation.current = undefined;
          }
        }
        if (snapshot.protocolVersion === 3) {
          // The in-memory baseline and the connection revisions are the
          // confirmed page boundary. They intentionally move only after the
          // app has presented the exact CodeMirror document.
          baseline.current = snapshot;
          confirmedSkillRevision.current = snapshot.skillRevision;
          connection.lastRevision = snapshot.revision;
          connection.lastSkillRevision = snapshot.skillRevision;
        } else {
          connection.lastRevision = Math.max(connection.lastRevision, value.revision);
        }
        storeConnection(connection);
        const after = currentPage(connection);
        // The merged page state only counts as observed once the import window
        // is fully closed. A pending message delta must not let this reset
        // claim the page is already in sync.
        if (after && !result?.hasPendingLocalMessages) {
          observedPage.current = { signature: pageSignature(after), sequence: localSequence.current };
        }
      } finally {
        applying.current = undefined;
      }
      // The apply is over and the importer already persisted the canonical
      // state. Messages completed inside the import window are merged into the
      // session but not yet represented by the helper canonical, so queue them
      // again here and let the send loop pick the outbox up promptly.
      if (result?.hasPendingLocalMessages && stillCurrent()) {
        try {
          await queueLatestPageState();
        } catch (error) {
          if (stillCurrent()) {
            setStatus({ status: 'error', message: statusMessage(error, '本机连接排队失败，正在重试。') });
          }
        }
        activePollController.current?.abort();
      }
      return result;
    };

    const flushPageChanges = async (targetSequence = localSequence.current): Promise<FlushResult> => {
      if (flushPromise.current) return flushPromise.current;
      const run = (async (): Promise<FlushResult> => {
        if (!connection?.bindingId || !baseline.current) {
          return { status: 'unavailable', completedLocalSequence: localSequence.current, message: 'Bridge baseline is not available' };
        }
        if (!stillCurrent()) return { status: 'unavailable', completedLocalSequence: localSequence.current, message: 'Bridge binding changed' };
        const pageResult = resolvePage(connection);
        if (pageResult.status !== 'ready') {
          return {
            status: pageResult.status === 'ambiguous' ? 'recovery-required' : 'unavailable',
            completedLocalSequence: localSequence.current,
            message: pageResult.reason ?? 'The bound bridge session is not available',
          };
        }
        if (pageResult.pageState.revision !== baseline.current.revision) {
          return { status: 'recovery-required', completedLocalSequence: localSequence.current, message: 'Local bridge baseline and session revision disagree' };
        }
        const projectKey = oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId);
        let entries = await getBridgeOutboxEntries(connection.ownerKey, projectKey, connection.bindingId);
        if (entries.length === 0) {
          const payload = makeOddeNovaBridgePageChange({
            connection,
            baseline: baseline.current,
            page: pageResult.pageState,
            changeId: crypto.randomUUID(),
          });
          if (payload) {
            const entry: StoredBridgeOutboxEntry = {
              ownerKey: connection.ownerKey,
              projectKey,
              bindingId: connection.bindingId,
              changeId: payload.changeId,
              payload,
              createdAt: Date.now(),
            };
            await putBridgeOutboxEntry(entry, { generationGuard: true });
            entries = [entry];
          }
        }
        if (entries.length === 0) {
          dirtySince.current = undefined;
          return { status: 'confirmed', completedLocalSequence: Math.min(targetSequence, localSequence.current) };
        }
        if (!leaseReady.current) {
          return { status: 'unavailable', completedLocalSequence: localSequence.current, message: 'Bridge lease is not active' };
        }
        // The last helper canonical snapshot this flush actually merged. The
        // caller prefers it over the snapshot that started the flush, because
        // it carries the helper's current skill revision plus the merged page.
        let lastSnapshot: OddeNovaBridgeSnapshotV3 | undefined;
        for (const entry of entries) {
          if (!stillCurrent()) return { status: 'unavailable', completedLocalSequence: localSequence.current, message: 'Bridge binding changed' };
          const value = await responseJson(await fetch(`${connection.serviceOrigin}/v3/page-change?${connectionQuery(connection)}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
            body: JSON.stringify(entry.payload),
          })) as { snapshot: OddeNovaBridgeSnapshotV3 };
          lastSnapshot = value.snapshot;
          const result = await applySnapshot(value.snapshot, {
            forceImport: true,
            deleteOutboxChangeIds: [entry.changeId],
            source: 'page-change',
          });
          if (!result) return { status: 'busy', completedLocalSequence: localSequence.current };
        }
        if (localSequence.current <= targetSequence) dirtySince.current = undefined;
        return {
          status: 'confirmed',
          completedLocalSequence: Math.min(targetSequence, localSequence.current),
          ...(lastSnapshot ? { snapshot: lastSnapshot } : {}),
        };
      })();
      flushPromise.current = run;
      try {
        return await run;
      } finally {
        if (flushPromise.current === run) flushPromise.current = undefined;
      }
    };

    let activeRefreshRequestIds: string[] = [];

    const handleReadRequests = async (requestIds: string[]): Promise<FlushResult | undefined> => {
      if (requestIds.length === 0 || !connection?.bindingId) return undefined;
      const target = localSequence.current;
      if (latest.current.isBusy) {
        for (const requestId of requestIds) await sendReadResponse(requestId, 'busy', localSequence.current);
        activeRefreshRequestIds = [];
        return undefined;
      }
      let flushed: FlushResult;
      try {
        flushed = await flushPageChanges(target);
      } catch (error) {
        for (const requestId of requestIds) await sendReadResponse(requestId, 'unavailable', localSequence.current);
        activeRefreshRequestIds = [];
        if (error instanceof BridgeRecoveryRequiredError) throw error;
        return undefined;
      }
      if (flushed.status !== 'confirmed') {
        const responseStatus = flushed.status === 'busy' ? 'busy' : 'unavailable';
        for (const requestId of requestIds) await sendReadResponse(requestId, responseStatus, flushed.completedLocalSequence);
        activeRefreshRequestIds = [];
        if (flushed.status === 'recovery-required') throw new BridgeRecoveryRequiredError(flushed.message);
        return undefined;
      }
      return flushed;
    };

    const prepareConnection = async (): Promise<void> => {
      baseline.current = undefined;
      confirmedSkillRevision.current = undefined;
      pendingPresentation.current = undefined;
      connection = readStoredBridgeConnection();
      let rawBootstrap: string | null = null;
      try { rawBootstrap = sessionStorage.getItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY); } catch { rawBootstrap = null; }
      let bootstrap;
      try { bootstrap = rawBootstrap ? parseOddeNovaBridgeBootstrap(JSON.parse(rawBootstrap) as unknown) : undefined; } catch { bootstrap = undefined; }

      if (connection && connection.ownerKey !== latest.current.ownerKey) {
        clearConnection();
        connection = undefined;
        if (!bootstrap) {
          setStatus({ status: 'owner-changed' });
          return;
        }
      }

      if (bootstrap) {
        setStatus({ status: 'connecting' });
        const previousConnection = connection;
        const baseUrl = normalizeOddeNovaBridgeBaseUrl(bootstrap.baseUrl);
        const query = new URLSearchParams({ projectId: bootstrap.projectId, baseUrl }).toString();
        const version = bootstrap.protocolVersion === 3 ? 'v3' : 'v2';
        const pairedValue = await responseJson(await fetch(`${bootstrap.serviceOrigin}/${version}/pair?${query}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: bootstrap.projectId, baseUrl, pairingToken: bootstrap.pairingToken }),
        }));
        const paired = parseOddeNovaBridgePairResponse(pairedValue, bootstrap.protocolVersion);
        if (!paired) throw new Error('Local connection returned an invalid pairing response');
        connection = {
          projectId: bootstrap.projectId,
          baseUrl,
          serviceOrigin: bootstrap.serviceOrigin,
          pageToken: paired.pageToken,
          ownerKey: latest.current.ownerKey,
          clientId: crypto.randomUUID(),
          lastRevision: 0,
          lastSkillRevision: paired.skillRevision ?? 0,
          bindingId: paired.bindingId,
        };

        if (bootstrap.protocolVersion === 3 && connection.bindingId) {
          const isRebind = paired.previousBindingId !== undefined || paired.pairingKind === 'rebind';
          // A helper predating explicit rebind metadata is not allowed to make
          // the page guess from a timestamp. It is safe only when this browser
          // has no prior Bridge checkpoint/connection for this identity.
          if (!isRebind && paired.pairingKind === undefined) {
            const previousCheckpoint = await getLatestBridgeCheckpoint(
              connection.ownerKey,
              oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId),
            );
            const previousConnectionMatches = Boolean(
              previousConnection
              && previousConnection.ownerKey === connection.ownerKey
              && previousConnection.projectId === connection.projectId
              && normalizeOddeNovaBridgeBaseUrl(previousConnection.baseUrl) === connection.baseUrl
              && (previousConnection.bindingId || previousConnection.sessionId),
            );
            if (previousCheckpoint || previousConnectionMatches) {
              throw new BridgeRecoveryRequiredError('旧 helper 未提供明确的重绑来源，已停止恢复。');
            }
          }

          if (isRebind) {
            if (!paired.previousBindingId || paired.pairingKind === 'initial') {
              throw new BridgeRecoveryRequiredError('重配对响应缺少明确的 previousBindingId。');
            }
            const rebindSession = latest.current.rebindSession;
            if (!rebindSession) {
              throw new BridgeRecoveryRequiredError('当前页面不支持精确 Bridge 会话重绑。');
            }
            try {
              const rebound = await rebindSession({
                ownerKey: connection.ownerKey,
                projectKey: oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId),
                previousBindingId: paired.previousBindingId,
                bindingId: connection.bindingId,
                clientId: connection.clientId,
              });
              if (
                rebound.previousBindingId !== paired.previousBindingId
                || rebound.bindingId !== connection.bindingId
                || !rebound.sessionId
              ) throw new BridgeRecoveryRequiredError('本地 Bridge 重绑返回了不一致的会话身份。');
              connection.sessionId = rebound.sessionId;
              await waitForBoundSession(rebound.sessionId);
            } catch (error) {
              // The new page has not polled yet, so a lease may not exist. The
              // service accepts a valid current pageToken for this cleanup.
              try {
                await responseJson(await fetch(`${connection.serviceOrigin}/v3/disconnect?${connectionQuery(connection)}`, {
                  method: 'POST',
                  headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
                  body: JSON.stringify({
                    projectId: connection.projectId,
                    baseUrl: connection.baseUrl,
                    bindingId: connection.bindingId,
                    clientId: connection.clientId,
                  }),
                }));
              } catch {
                // Preserve the original recovery error; the binding will also
                // be rejected by the next pair once its token is rotated.
              }
              throw error instanceof BridgeRecoveryRequiredError
                ? error
                : new BridgeRecoveryRequiredError(statusMessage(error, '本地 Bridge 会话重绑失败，已停止恢复。'));
            }
          }
        }
        storeConnection(connection);
        sessionStorage.removeItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY);
      }
      if (!connection) return;
      if (connection.ownerKey !== latest.current.ownerKey) {
        clearConnection();
        setStatus({ status: 'owner-changed' });
        return;
      }

      setStatus({ status: 'recovering' });
      let pageResolution = resolvePage(connection);
      if (pageResolution.status === 'ambiguous') {
        throw new BridgeRecoveryRequiredError('当前作品存在多个候选会话，已停止同步，请显式重新配对。');
      }
      if (pageResolution.status === 'missing' && connection.sessionId) {
        try {
          if (connection.bindingId) {
            await responseJson(await fetch(`${connection.serviceOrigin}/v3/disconnect?${connectionQuery(connection)}`, {
              method: 'POST',
              headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
              body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, bindingId: connection.bindingId, clientId: connection.clientId }),
            }));
          }
        } finally {
          await deleteBridgeCheckpoint(connection.ownerKey, oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId), connection.bindingId ?? '');
          clearConnection();
          setStatus({ status: 'disconnected', message: '绑定会话已删除，本机连接已停止，未重新绑定其他会话。' });
        }
        return;
      }
      if (pageResolution.status === 'ready' && !connection.sessionId) {
        connection.sessionId = pageResolution.binding.sessionId;
        pageResolution = resolvePage(connection);
        storeConnection(connection);
      }
      setBinding(connectionBinding(connection));

      if (!connection.bindingId && pageResolution.status === 'ready') {
        try {
          const upgraded = await responseJson(await fetch(`${connection.serviceOrigin}/v3/upgrade?${connectionQuery(connection)}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, clientId: connection.clientId }),
          })) as { bindingId: string; skillRevision: number; snapshot: OddeNovaBridgeSnapshotV3 };
          connection.bindingId = upgraded.bindingId;
          connection.lastSkillRevision = upgraded.skillRevision;
          storeConnection(connection);
          setBinding(connectionBinding(connection));
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      }

      if (connection.bindingId) {
        const projectKey = oddeNovaBridgeProjectKey(connection.baseUrl, connection.projectId);
        const checkpoint = await getBridgeCheckpoint(connection.ownerKey, projectKey, connection.bindingId);
        if (checkpoint) {
          if (!bridgeCheckpointMatchesBinding(checkpoint, connectionBinding(connection)) || !await verifyOddeNovaBridgeSnapshot(checkpoint.snapshot)) {
            throw new BridgeRecoveryRequiredError('本地同步基线校验失败，已保留会话和待发送修改，当前读取未确认。');
          }
          if (connection.sessionId && checkpoint.sessionId !== connection.sessionId) {
            throw new BridgeRecoveryRequiredError('本地 checkpoint 与绑定会话不一致，已停止同步。');
          }
          connection.sessionId = checkpoint.sessionId;
          const checkpointPage = resolvePage(connection);
          if (checkpointPage.status !== 'ready') {
            try {
              await responseJson(await fetch(`${connection.serviceOrigin}/v3/disconnect?${connectionQuery(connection)}`, {
                method: 'POST',
                headers: { authorization: `Bearer ${connection.pageToken}`, 'content-type': 'application/json' },
                body: JSON.stringify({ projectId: connection.projectId, baseUrl: connection.baseUrl, bindingId: connection.bindingId, clientId: connection.clientId }),
              }));
            } catch {
              // A deleted local session must still stop this page even when
              // the helper has already forgotten the pairing.
            }
            await deleteBridgeCheckpoint(connection.ownerKey, projectKey, connection.bindingId);
            clearConnection();
            setStatus({ status: 'disconnected', message: '绑定会话已删除，本机连接已停止，未重新绑定其他会话。' });
            return;
          }
          if (checkpoint.editorPresentation?.status === 'pending') {
            pendingPresentation.current = {
              snapshot: checkpoint.snapshot,
              sessionId: checkpoint.sessionId,
              reason: 'recovery',
            };
          } else {
            baseline.current = checkpoint.snapshot;
            confirmedSkillRevision.current = checkpoint.snapshot.skillRevision;
            connection.lastRevision = checkpoint.snapshot.revision;
            connection.lastSkillRevision = checkpoint.snapshot.skillRevision;
          }
          storeConnection(connection);
          setBinding(connectionBinding(connection));
        }
      }
    };

    const run = async (): Promise<void> => {
      await prepareConnection();
      if (!connection || !stillCurrent()) return;
      const lockName = oddeNovaBridgeReceiverLockName(connection);
      const lockResult = await runWithOddeNovaBridgeReceiverLock(lockName, async () => {
        receiverOwned.current = true;
        setStatus({ status: 'connected' });
        let confirmedSequence = 0;
        try {
          while (!cancelled) {
            if (!connection || !stillCurrent()) return;
            if (latest.current.ownerKey !== connection.ownerKey) {
              clearConnection();
              setStatus({ status: 'owner-changed' });
              return;
            }

            // A page-change is legal only after both this tab lock and the
            // helper lease are held. The tab lock distinguishes duplicated
            // pages that inherited the same clientId from sessionStorage.
            controller = new AbortController();
            activePollController.current = controller;
            try {
              const query = connectionQuery(connection);
              const version = connection.bindingId ? 'v3' : 'v2';
              const after = connection.bindingId && !baseline.current ? 0 : connection.lastRevision;
              const response = await fetch(`${connection.serviceOrigin}/${version}/poll?${query}&after=${after}`, {
                headers: { authorization: `Bearer ${connection.pageToken}` },
                signal: controller.signal,
              });
              if (response.status === 204) {
                leaseReady.current = Boolean(connection.bindingId);
                if (connection.bindingId) {
                  const flushed = await flushPageChanges();
                  if (flushed.status === 'recovery-required') throw new BridgeRecoveryRequiredError(flushed.message);
                }
                retryMs = 1_000;
                if (stillCurrent()) {
                  setStatus((current) => current.status === 'error' ? { status: 'connected' } : current);
                }
                continue;
              }
              const raw = await responseJson(response);
              leaseReady.current = Boolean(connection.bindingId);
              const packet = connection.bindingId
                ? raw as { snapshot: OddeNovaBridgeSnapshotV3; refreshRequestIds?: string[] }
                : { snapshot: raw as AnyOddeNovaBridgeSnapshot, refreshRequestIds: [] };
              const value = packet.snapshot;
              const refreshRequestIds = connection.bindingId ? packet.refreshRequestIds ?? [] : [];
              activeRefreshRequestIds = refreshRequestIds;

              if (refreshRequestIds.length) {
                if (latest.current.isBusy) {
                  for (const requestId of refreshRequestIds) await sendReadResponse(requestId, 'busy', localSequence.current);
                  continue;
                }
                const confirmedFlush = await handleReadRequests(refreshRequestIds);
                if (!confirmedFlush) continue;
                confirmedSequence = confirmedFlush.completedLocalSequence;
              } else if (connection.bindingId) {
                const flushed = await flushPageChanges();
                if (flushed.status === 'recovery-required') throw new BridgeRecoveryRequiredError(flushed.message);
                if (flushed.status === 'confirmed') confirmedSequence = flushed.completedLocalSequence;
              }

              let result: OddeNovaBridgeImportResult | undefined;
              const incomingSkillAhead = connection.bindingId
                && value.protocolVersion === 3
                && (confirmedSkillRevision.current === undefined || value.skillRevision > confirmedSkillRevision.current);
              if (value.revision > connection.lastRevision || !baseline.current || Boolean(incomingSkillAhead) || refreshRequestIds.length > 0) {
                result = await applySnapshot(value);
              } else {
                result = { outcome: 'unchanged', sessionId: connection.sessionId ?? '', codeChanged: false };
              }
              if (!result) continue;
              if (!result.sessionId && connection.sessionId) result.sessionId = connection.sessionId;
              if (connection.bindingId && refreshRequestIds.length) {
                for (const requestId of refreshRequestIds) {
                  // Only report the sequence that this poll actually confirmed;
                  // an import that is still holding local message operations
                  // must not let a later sequence claim completion.
                  await sendReadResponse(requestId, 'ready', confirmedSequence);
                }
                activeRefreshRequestIds = [];
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
                  sessionId: result.sessionId || connection.sessionId,
                  outcome: result.outcome,
                  persistent: latest.current.isPersistent,
                }),
              }));
              setStatus({ status: 'applied', revision: connection.lastRevision, outcome: result.outcome, persistent: latest.current.isPersistent });
              retryMs = 1_000;
              if (result.hasPendingLocalMessages) {
                // The import is done but its window messages still have to
                // reach the helper. Process the outbox now instead of waiting
                // for the next long poll to time out.
                const flushed = await flushPageChanges();
                if (flushed.status === 'recovery-required') throw new BridgeRecoveryRequiredError(flushed.message);
                continue;
              }
            } catch (error) {
              if (cancelled) return;
              if (isAbortError(error)) continue;
              if (activeRefreshRequestIds.length) {
                for (const requestId of activeRefreshRequestIds) {
                  await sendReadResponse(requestId, 'unavailable', localSequence.current).catch(() => undefined);
                }
                activeRefreshRequestIds = [];
              }
              if (error instanceof BridgeRecoveryRequiredError) {
                setStatus({ status: 'recovery-required', message: error.message });
                return;
              }
              if ((error as { status?: number }).status === 409) { setStatus({ status: 'occupied' }); return; }
              if ((error as { status?: number }).status === 401) {
                clearConnection();
                setStatus({ status: 'error', message: '本机连接凭据已失效，请从 skill 显式重新打开。' });
                return;
              }
              setStatus({ status: 'error', message: '本机连接中断，正在重试。' });
              leaseReady.current = false;
              await sleep(retryMs);
              retryMs = Math.min(retryMs * 2, 30_000);
            }
          }
        } finally {
          receiverOwned.current = false;
          leaseReady.current = false;
        }
      });
      if (!stillCurrent()) return;
      if (lockResult === 'occupied') {
        setStatus({ status: 'occupied' });
      } else if (lockResult === 'unsupported') {
        throw new BridgeRecoveryRequiredError('当前浏览器不支持安全的跨标签页接收锁，已停止本机同步。');
      }
    };

    void run().catch((error: unknown) => {
      if (!cancelled) {
        setStatus(error instanceof BridgeRecoveryRequiredError
          ? { status: 'recovery-required', message: error.message }
          : { status: 'error', message: statusMessage(error, '本机连接失败') });
      }
    });

    const reconnectVisible = () => {
      if (!document.hidden) controller?.abort();
    };
    const flushBeforeHide = () => { void queueLatestPageState().catch(() => undefined); };
    document.addEventListener('visibilitychange', reconnectVisible);
    window.addEventListener('pagehide', flushBeforeHide);
    return () => {
      cancelled = true;
      generation.current += 1;
      controller?.abort();
      activePollController.current?.abort();
      flushPromise.current = undefined;
      applying.current = undefined;
      pendingPresentation.current = undefined;
      confirmedSkillRevision.current = undefined;
      leaseReady.current = false;
      receiverOwned.current = false;
      document.removeEventListener('visibilitychange', reconnectVisible);
      window.removeEventListener('pagehide', flushBeforeHide);
    };
  }, [options.isReady, options.ownerKey, currentPage, queueLatestPageState, resolvePage]);

  return { status, binding };
}
