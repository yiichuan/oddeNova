// @vitest-environment happy-dom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ODDENOVA_BRIDGE_BOOTSTRAP_KEY,
  ODDENOVA_BRIDGE_CONNECTION_KEY,
  normalizeOddeNovaBridgeBaseUrl,
  type OddeNovaBridgeSnapshotV3,
  type OddeNovaBridgeSnapshot,
} from '../../lib/oddenova-bridge';
import type { BridgePageStateResolution, OddeNovaBridgeBinding } from '../../lib/oddenova-bridge-state';
import type { OddeNovaBridgeRebindInput } from '../useSessions';
import { putBridgeCheckpoint } from '../../lib/session-storage';
import type { OddeNovaBridgeLockManager } from '../../lib/oddenova-bridge-receiver-lock';
import { useOddeNovaBridge, type OddeNovaBridgeStatus } from '../useOddeNovaBridge';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const snapshot: OddeNovaBridgeSnapshot = {
  protocolVersion: 2,
  source: 'oddenova-strudel-skill',
  projectId: 'p-1',
  revision: 2,
  title: 'Piece',
  code: 'stack(s("bd"))',
  messages: [{ id: 'm1', role: 'user', content: 'make it', receivedAt: 1 }],
  contentHash: '144840418837d6bc7ede47ca2be941f56e2129014be0b2d06ef77c11f2fff23c',
};

const identityQueryPaths = new Set([
  '/v2/pair', '/v2/poll', '/v2/ack',
  '/v3/pair', '/v3/poll', '/v3/ack', '/v3/page-change',
  '/v3/read-response', '/v3/upgrade', '/v3/disconnect',
]);

function assertBridgeRequestIdentity(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  projectId = 'p-1',
  baseUrl = window.location.origin,
): URL {
  const url = new URL(String(input));
  if (!identityQueryPaths.has(url.pathname)) return url;
  const expectedBaseUrl = normalizeOddeNovaBridgeBaseUrl(baseUrl);
  let body: Record<string, unknown> | undefined;
  if (typeof init?.body === 'string') {
    body = JSON.parse(init.body) as Record<string, unknown>;
  }
  if (
    url.searchParams.get('projectId') !== projectId
    || url.searchParams.get('baseUrl') !== expectedBaseUrl
    || (body?.projectId !== undefined && body.projectId !== projectId)
    || (body?.baseUrl !== undefined && normalizeOddeNovaBridgeBaseUrl(String(body.baseUrl)) !== expectedBaseUrl)
    || ['pageToken', 'pairingToken', 'adminToken'].some((key) => url.searchParams.has(key))
  ) {
    throw new TypeError('CORS preflight would reject a bridge request without matching identity query parameters');
  }
  return url;
}

function storeConnection(ownerKey = 'guest') {
  sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
    projectId: 'p-1',
    baseUrl: window.location.origin,
    serviceOrigin: 'http://127.0.0.1:43123',
    pageToken: 'page-token',
    ownerKey,
    clientId: 'client-1',
    lastRevision: 0,
  }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createBrowserLockManager(): OddeNovaBridgeLockManager {
  const held = new Set<string>();
  return {
    request: async (name, _options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

async function hashV3Snapshot(snapshot: Omit<OddeNovaBridgeSnapshotV3, 'contentHash'>): Promise<OddeNovaBridgeSnapshotV3> {
  const content = {
    projectId: snapshot.projectId,
    revision: snapshot.revision,
    title: snapshot.title,
    code: snapshot.code,
    messages: snapshot.messages,
    baseUrl: snapshot.baseUrl,
    skillRevision: snapshot.skillRevision,
  };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(content)));
  const contentHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { ...snapshot, contentHash };
}

function renderHook(options: {
  busy?: boolean;
  ownerKey?: string;
  importSessionId?: string;
  rebindSession?: (input: OddeNovaBridgeRebindInput) => Promise<{ sessionId: string; previousBindingId: string; bindingId: string }>;
  resolvePageState?: (binding: OddeNovaBridgeBinding) => BridgePageStateResolution;
} = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let status: OddeNovaBridgeStatus | undefined;
  const importer = vi.fn(async () => ({ outcome: 'updated' as const, sessionId: options.importSessionId ?? 'session-1' }));
  const onApplied = vi.fn();

  function Probe({ busy }: { busy: boolean }) {
    const value = useOddeNovaBridge({
      importer,
      isReady: true,
      isBusy: busy,
      isPersistent: true,
      ownerKey: options.ownerKey ?? 'guest',
      rebindSession: options.rebindSession,
      resolvePageState: options.resolvePageState,
      onApplied,
    });
    useEffect(() => { status = value.status; }, [value]);
    return null;
  }
  act(() => root.render(<Probe busy={options.busy ?? false} />));
  return {
    root, importer, onApplied,
    getStatus: () => status,
    rerender: (busy: boolean) => act(() => root.render(<Probe busy={busy} />)),
  };
}

describe('useOddeNovaBridge', () => {
  const roots: Root[] = [];
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: createBrowserLockManager(),
    });
  });
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('polls, imports, acknowledges, and advances the tab revision', async () => {
    storeConnection();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      assertBridgeRequestIdentity(input, init);
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify(snapshot), { status: 200 });
      if (calls === 2) return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    }));
    const hook = renderHook();
    roots.push(hook.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    expect(hook.importer).toHaveBeenCalledWith(snapshot);
    expect(hook.onApplied).toHaveBeenCalledWith(snapshot, { outcome: 'updated', sessionId: 'session-1' });
    expect(hook.getStatus()).toEqual({ status: 'applied', revision: 2, outcome: 'updated', persistent: true });
    expect(JSON.parse(sessionStorage.getItem(ODDENOVA_BRIDGE_CONNECTION_KEY)!).lastRevision).toBe(2);
    const ackCall = vi.mocked(fetch).mock.calls[1];
    expect(ackCall[1]?.body).toContain('"revision":2');
  });

  it('clears a transient error after a successful empty poll', async () => {
    const projectId = 'recovery-project';
    const bindingId = 'recovery-binding';
    const sessionId = 'recovery-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 1,
      title: 'Recovery piece',
      code: 'note("recovery")',
      messages: [],
    });
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 1,
      title: initial.title,
      code: initial.code,
      messages: [],
      bridgeContentHash: initial.contentHash,
    };
    await putBridgeCheckpoint({
      schemaVersion: 1,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: initial,
      updatedAt: 1,
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'recovery-client',
      lastRevision: 1,
      lastSkillRevision: 1,
      bindingId,
      sessionId,
    }));
    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      if (calls === 2) return new Response(null, { status: 204 });
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    });
    vi.stubGlobal('fetch', fetchMock);
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    let status: OddeNovaBridgeStatus | undefined;
    function Probe() {
      const value = useOddeNovaBridge({
        importer: async () => ({ outcome: 'unchanged' as const, sessionId }),
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: (binding) => ({ status: 'ready' as const, binding: { ...binding, sessionId }, pageState: page }),
      });
      useEffect(() => { status = value.status; }, [value]);
      return null;
    }
    act(() => root.render(<Probe />));

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(status).toEqual({ status: 'error', message: '本机连接中断，正在重试。' });

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1_100)); });
    expect(status).toEqual({ status: 'connected' });
  });

  it.each([
    [401, { status: 'error', message: '本机连接凭据已失效，请从 skill 显式重新打开。' }],
    [409, { status: 'occupied' }],
  ] as const)('keeps the terminal %s response from retrying into a connected state', async (httpStatus, expectedStatus) => {
    storeConnection();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      assertBridgeRequestIdentity(input, init);
      return new Response(JSON.stringify({ error: 'connection rejected' }), { status: httpStatus });
    });
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook();
    roots.push(hook.root);

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(hook.getStatus()).toEqual(expectedStatus);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (httpStatus === 401) expect(sessionStorage.getItem(ODDENOVA_BRIDGE_CONNECTION_KEY)).toBeNull();
  });

  it('lets only one copied tab poll when both tabs inherit the same receiver identity', async () => {
    const projectId = 'copied-project';
    const bindingId = 'copied-binding';
    const sessionId = 'copied-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'shared-page-token',
      ownerKey: 'guest',
      clientId: 'shared-client-id',
      lastRevision: 0,
      lastSkillRevision: 0,
      bindingId,
      sessionId,
    }));
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 0,
      title: 'Copied tab piece',
      code: 'note("c4")',
      messages: [],
    };
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ));
    vi.stubGlobal('fetch', fetchMock);
    const resolvePageState = (binding: OddeNovaBridgeBinding) => ({
      status: 'ready' as const,
      binding: { ...binding, sessionId },
      pageState: page,
    });

    const original = renderHook({ resolvePageState });
    roots.push(original.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const copied = renderHook({ resolvePageState });
    roots.push(copied.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(copied.getStatus()).toEqual({ status: 'occupied' });
  });

  it('fails closed before polling when cross-tab receiver locks are unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    storeConnection();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook();
    roots.push(hook.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    expect(hook.getStatus()).toEqual({
      status: 'recovery-required',
      message: '当前浏览器不支持安全的跨标签页接收锁，已停止本机同步。',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops with recovery-required without making a page request for an ambiguous binding', async () => {
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId: 'ambiguous-project',
      baseUrl: window.location.origin,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'ambiguous-client',
      lastRevision: 1,
      bindingId: 'ambiguous-binding',
      sessionId: 'ambiguous-session',
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    let status: OddeNovaBridgeStatus | undefined;
    function Probe() {
      const value = useOddeNovaBridge({
        importer: async () => ({ outcome: 'unchanged' as const, sessionId: 'ambiguous-session' }),
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: () => ({ status: 'ambiguous' as const, candidates: ['session-a', 'session-b'] }),
      });
      useEffect(() => { status = value.status; }, [value]);
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await Promise.resolve(); });

    expect(status).toEqual({ status: 'recovery-required', message: '当前作品存在多个候选会话，已停止同步，请显式重新配对。' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends read responses with the same identity query as the request body', async () => {
    const projectId = 'read-response-project';
    const bindingId = 'read-response-binding';
    const sessionId = 'read-response-session';
    const clientId = 'read-response-client';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 1,
      title: 'Read response piece',
      code: 'note("read")',
      messages: [{ id: 'read-message', role: 'user', content: 'read', createdAt: 1, order: 1, updatedRevision: 1 }],
    });
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 1,
      title: initial.title,
      code: initial.code,
      messages: [{ id: 'read-message', role: 'user' as const, content: 'read', timestamp: 1 }],
      bridgeContentHash: initial.contentHash,
    };
    await putBridgeCheckpoint({
      schemaVersion: 1,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: initial,
      updatedAt: 1,
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId,
      lastRevision: 1,
      lastSkillRevision: 1,
      bindingId,
      sessionId,
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(null, { status: 204 });
        if (pollCount === 2) return new Response(JSON.stringify({ snapshot: initial, refreshRequestIds: ['read-request'] }), { status: 200 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (url.pathname === '/v3/read-response') return new Response(JSON.stringify({ completed: true }), { status: 200 });
      if (url.pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async () => ({ outcome: 'unchanged' as const, sessionId }),
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: (binding) => ({
          status: 'ready' as const,
          binding: { ...binding, sessionId },
          pageState: page,
          visibleSessionId: sessionId,
          editorCode: page.code,
        }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });

    const readResponse = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/read-response');
    expect(readResponse).toBeDefined();
    const readResponseUrl = new URL(String(readResponse?.[0]));
    expect(readResponseUrl.searchParams.get('projectId')).toBe(projectId);
    expect(readResponseUrl.searchParams.get('baseUrl')).toBe(baseUrl);
    expect(readResponseUrl.searchParams.get('clientId')).toBe(clientId);
    expect(readResponseUrl.searchParams.get('bindingId')).toBe(bindingId);
    expect(JSON.parse(String(readResponse?.[1]?.body))).toMatchObject({ projectId, baseUrl, bindingId, clientId, requestId: 'read-request', status: 'ready' });
  });

  it('queues a received snapshot while the app is busy', async () => {
    storeConnection();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      assertBridgeRequestIdentity(input, init);
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify(snapshot), { status: 200 });
      if (calls === 2) return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    }));
    const hook = renderHook({ busy: true });
    roots.push(hook.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(hook.getStatus()).toEqual({ status: 'queued', revision: 2 });
    expect(hook.importer).not.toHaveBeenCalled();

    hook.rerender(false);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 275)); });
    expect(hook.importer).toHaveBeenCalledTimes(1);
  });

  it('clears a connection instead of crossing an owner boundary', async () => {
    storeConnection('user:old');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook({ ownerKey: 'user:new' });
    roots.push(hook.root);
    await act(async () => { await Promise.resolve(); });
    expect(hook.getStatus()).toEqual({ status: 'owner-changed' });
    expect(sessionStorage.getItem(ODDENOVA_BRIDGE_CONNECTION_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the pairing request identity in the URL without exposing the pairing token', async () => {
    const projectId = 'pair-project';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    sessionStorage.setItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY, JSON.stringify({
      protocolVersion: 3,
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pairingToken: 'pairing-token',
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/pair') return new Response(JSON.stringify({ pageToken: 'page-token', bindingId: 'pair-binding', skillRevision: 1 }), { status: 200 });
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(null, { status: 204 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook();
    roots.push(hook.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    const pairCall = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/pair');
    expect(pairCall).toBeDefined();
    const pairUrl = new URL(String(pairCall?.[0]));
    expect(pairUrl.searchParams.get('projectId')).toBe(projectId);
    expect(pairUrl.searchParams.get('baseUrl')).toBe(baseUrl);
    expect(pairUrl.searchParams.has('pairingToken')).toBe(false);
    expect(JSON.parse(String(pairCall?.[1]?.body))).toMatchObject({ projectId, baseUrl, pairingToken: 'pairing-token' });
  });

  it('rebinds the exact session before the new page starts polling', async () => {
    const projectId = 'rebind-hook-project';
    const bindingId = 'binding-new';
    const previousBindingId = 'binding-old';
    const sessionId = 'session-rebound';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const nextSnapshot = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 1,
      title: 'Rebound piece',
      code: 'note("rebound")',
      messages: [],
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY, JSON.stringify({
      protocolVersion: 3,
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pairingToken: 'pairing-token',
    }));
    let bound = false;
    const order: string[] = [];
    let pollCount = 0;
    const rebindSession = vi.fn(async (input: OddeNovaBridgeRebindInput) => {
      order.push('rebind');
      expect(input).toMatchObject({ projectKey: `${baseUrl}\0${projectId}`, previousBindingId, bindingId, clientId: expect.any(String) });
      bound = true;
      return { sessionId, previousBindingId, bindingId };
    });
    const resolvePageState = (bridgeBinding: OddeNovaBridgeBinding): BridgePageStateResolution => {
      if (!bound) return { status: 'missing', reason: 'waiting for rebind' };
      return {
        status: 'ready',
        binding: bridgeBinding,
        pageState: {
          sessionId,
          projectId,
          baseUrl,
          revision: 1,
          title: 'Rebound piece',
          code: 'note("rebound")',
          messages: [],
        },
        visibleSessionId: sessionId,
        editorCode: 'note("rebound")',
      };
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      order.push(url.pathname);
      if (url.pathname === '/v3/pair') {
        return new Response(JSON.stringify({ pageToken: 'new-page-token', bindingId, previousBindingId, pairingKind: 'rebind', skillRevision: 1 }), { status: 200 });
      }
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(null, { status: 204 });
        if (pollCount === 2) return new Response(JSON.stringify({ snapshot: nextSnapshot, refreshRequestIds: [] }), { status: 200 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (url.pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`unexpected bridge request ${url.pathname}`);
    }));

    const hook = renderHook({ rebindSession, resolvePageState, importSessionId: sessionId });
    roots.push(hook.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });

    expect(rebindSession).toHaveBeenCalledTimes(1);
    expect(order.indexOf('rebind')).toBeGreaterThan(order.indexOf('/v3/pair'));
    expect(order.indexOf('/v3/poll')).toBeGreaterThan(order.indexOf('rebind'));
    expect(hook.getStatus()).toEqual(expect.objectContaining({ status: 'applied', revision: 1 }));
    expect(JSON.parse(sessionStorage.getItem(ODDENOVA_BRIDGE_CONNECTION_KEY)!)).toMatchObject({
      projectId,
      bindingId,
      sessionId,
    });
  });

  it('fails closed and disconnects the new binding when exact rebind fails', async () => {
    const projectId = 'rebind-failure-project';
    const bindingId = 'binding-new';
    const previousBindingId = 'binding-old';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    sessionStorage.setItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY, JSON.stringify({
      protocolVersion: 3,
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pairingToken: 'pairing-token',
    }));
    const rebindSession = vi.fn(async () => {
      throw new Error('checkpoint transaction failed');
    });
    const paths: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      paths.push(url.pathname);
      if (url.pathname === '/v3/pair') {
        return new Response(JSON.stringify({ pageToken: 'new-page-token', bindingId, previousBindingId, pairingKind: 'rebind' }), { status: 200 });
      }
      if (url.pathname === '/v3/disconnect') return new Response(JSON.stringify({ disconnected: true }), { status: 200 });
      throw new Error(`unexpected bridge request ${url.pathname}`);
    }));

    const hook = renderHook({ rebindSession });
    roots.push(hook.root);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(hook.getStatus()).toEqual(expect.objectContaining({ status: 'recovery-required' }));
    expect(paths).toEqual(['/v3/pair', '/v3/disconnect']);
    expect(sessionStorage.getItem(ODDENOVA_BRIDGE_CONNECTION_KEY)).toBeNull();
  });

  it('adds identity query parameters to the v2 upgrade request', async () => {
    const projectId = 'upgrade-project';
    const bindingId = 'upgraded-binding';
    const sessionId = 'upgrade-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 1,
      title: 'Upgrade piece',
      code: 'note("upgrade")',
      messages: [],
    };
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'upgrade-client',
      lastRevision: 1,
      sessionId,
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/upgrade') return new Response(JSON.stringify({ bindingId, skillRevision: 1 }), { status: 200 });
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(null, { status: 204 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async () => ({ outcome: 'unchanged' as const, sessionId }),
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: (binding) => ({ status: 'ready' as const, binding: { ...binding, sessionId }, pageState: page }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

    const upgradeCall = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/upgrade');
    expect(upgradeCall).toBeDefined();
    const upgradeUrl = new URL(String(upgradeCall?.[0]));
    expect(upgradeUrl.searchParams.get('projectId')).toBe(projectId);
    expect(upgradeUrl.searchParams.get('baseUrl')).toBe(baseUrl);
    expect(upgradeUrl.searchParams.get('clientId')).toBe('upgrade-client');
    expect(upgradeUrl.searchParams.get('bindingId')).toBeNull();
  });

  it('adds identity query parameters when disconnecting a missing bound session', async () => {
    const projectId = 'disconnect-project';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'disconnect-client',
      lastRevision: 1,
      bindingId: 'disconnect-binding',
      sessionId: 'deleted-session',
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/disconnect') return new Response(JSON.stringify({ disconnected: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async () => ({ outcome: 'unchanged' as const, sessionId: 'deleted-session' }),
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: () => ({ status: 'missing' as const, reason: 'The explicitly bound session no longer exists' }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await Promise.resolve(); });

    const disconnectCall = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/disconnect');
    expect(disconnectCall).toBeDefined();
    const disconnectUrl = new URL(String(disconnectCall?.[0]));
    expect(disconnectUrl.searchParams.get('projectId')).toBe(projectId);
    expect(disconnectUrl.searchParams.get('baseUrl')).toBe(baseUrl);
    expect(disconnectUrl.searchParams.get('clientId')).toBe('disconnect-client');
    expect(disconnectUrl.searchParams.get('bindingId')).toBe('disconnect-binding');
  });

  it('adds identity query parameters when a checkpoint session disappears', async () => {
    const projectId = 'checkpoint-disconnect-project';
    const bindingId = 'checkpoint-disconnect-binding';
    const sessionId = 'checkpoint-disconnect-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 1,
      title: 'Checkpoint piece',
      code: 'note("checkpoint")',
      messages: [],
    });
    await putBridgeCheckpoint({
      schemaVersion: 1,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: initial,
      updatedAt: 1,
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'checkpoint-disconnect-client',
      lastRevision: 1,
      lastSkillRevision: 1,
      bindingId,
      sessionId,
    }));
    let resolveCalls = 0;
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 1,
      title: initial.title,
      code: initial.code,
      messages: [],
      bridgeContentHash: initial.contentHash,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/disconnect') return new Response(JSON.stringify({ disconnected: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async () => ({ outcome: 'unchanged' as const, sessionId }),
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: (binding) => {
          resolveCalls += 1;
          return resolveCalls === 1
            ? { status: 'ready' as const, binding: { ...binding, sessionId }, pageState: page }
            : { status: 'missing' as const, reason: 'The checkpoint session no longer exists' };
        },
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });

    const disconnectCall = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/disconnect');
    expect(disconnectCall).toBeDefined();
    const disconnectUrl = new URL(String(disconnectCall?.[0]));
    expect(disconnectUrl.searchParams.get('projectId')).toBe(projectId);
    expect(disconnectUrl.searchParams.get('baseUrl')).toBe(baseUrl);
    expect(disconnectUrl.searchParams.get('clientId')).toBe('checkpoint-disconnect-client');
    expect(disconnectUrl.searchParams.get('bindingId')).toBe(bindingId);
  });

  it('remounts from a checkpoint and captures a local edit before reporting the page change', async () => {
    const projectId = 'refresh-project';
    const bindingId = 'refresh-binding';
    const sessionId = 'refresh-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 7,
      title: 'Refresh piece',
      code: 'note("before")',
      messages: [{ id: 'm-1', role: 'user', content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 }],
    });
    const updated = await hashV3Snapshot({
      ...initial,
      revision: 2,
      code: 'note("local edit")',
    });
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 1,
      title: initial.title,
      code: initial.code,
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', timestamp: 1 }],
      bridgeContentHash: initial.contentHash,
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: initial,
      updatedAt: 1,
    };
    await putBridgeCheckpoint(checkpoint);
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'client-refresh',
      lastRevision: 1,
      lastSkillRevision: 7,
      bindingId,
      sessionId,
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      const pathname = url.pathname;
      if (pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1 || pollCount === 3) return new Response(null, { status: 204 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (pathname === '/v3/page-change') return new Response(JSON.stringify({ snapshot: updated }), { status: 200 });
      if (pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    let status: OddeNovaBridgeStatus | undefined;
    let importerCalls = 0;

    function Probe({ version }: { version: string }) {
      const pageRef = useRef(page);
      const value = useOddeNovaBridge({
        importer: async (value, _binding, context) => {
          importerCalls += 1;
          pageRef.current.revision = value.revision;
          pageRef.current.code = value.code;
          if (value.protocolVersion === 3) pageRef.current.bridgeContentHash = value.contentHash;
          if (context?.checkpoint) await putBridgeCheckpoint(context.checkpoint);
          return { outcome: 'updated' as const, sessionId, codeChanged: true, skillRevision: value.protocolVersion === 3 ? value.skillRevision : undefined };
        },
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        pageStateVersion: version,
        resolvePageState: (binding) => ({
          status: 'ready' as const,
          binding: { ...binding, sessionId },
          pageState: pageRef.current,
          visibleSessionId: sessionId,
          editorCode: pageRef.current.code,
        }),
      });
      useEffect(() => { status = value.status; }, [value]);
      return null;
    }

    act(() => root.render(<Probe version={page.code} />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(pollCount).toBeGreaterThanOrEqual(2);

    // Simulate the user editing after the old hook has been mounted, then
    // unmount before the debounce writes an outbox row. The next mount must
    // derive that edit from the persisted checkpoint itself.
    page.code = 'note("local edit")';
    act(() => root.render(<Probe version={page.code} />));
    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);

    const remountedContainer = document.createElement('div');
    const remountedRoot = createRoot(remountedContainer);
    roots.push(remountedRoot);
    act(() => remountedRoot.render(<Probe version={page.code} />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });

    const pageChange = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/page-change');
    expect(pageChange).toBeDefined();
    expect(new URL(String(pageChange?.[0])).searchParams.get('projectId')).toBe(projectId);
    expect(new URL(String(pageChange?.[0])).searchParams.get('baseUrl')).toBe(baseUrl);
    expect(JSON.parse(String(pageChange?.[1]?.body))).toMatchObject({
      baseRevision: 1,
      baseSkillRevision: 7,
      code: 'note("local edit")',
    });
    expect(importerCalls).toBe(1);
    expect(status).toEqual({ status: 'connected' });
  });

  it('uses a zero-baseline poll to recover an old connection without a checkpoint', async () => {
    const projectId = 'legacy-baseline-project';
    const bindingId = 'legacy-baseline-binding';
    const sessionId = 'legacy-baseline-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 5,
      skillRevision: 9,
      title: 'Legacy piece',
      code: 'note("before")',
      messages: [{ id: 'm-1', role: 'user', content: 'make it', createdAt: 1, order: 1, updatedRevision: 5 }],
    });
    const updated = await hashV3Snapshot({ ...initial, revision: 6, code: 'note("local edit")' });
    const page = {
      sessionId,
      projectId,
      baseUrl,
      revision: 5,
      title: initial.title,
      code: 'note("local edit")',
      messages: [{ id: 'm-1', role: 'user' as const, content: 'make it', timestamp: 1 }],
      bridgeContentHash: initial.contentHash,
      bridgeProtocolVersion: 3 as const,
    };
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'legacy-client',
      lastRevision: 5,
      lastSkillRevision: 9,
      bindingId,
      sessionId,
    }));

    const pageRef = { current: page };
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) {
          expect(url.searchParams.get('after')).toBe('0');
          return new Response(JSON.stringify({ snapshot: initial }), { status: 200 });
        }
        if (pollCount === 2) return new Response(null, { status: 204 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (url.pathname === '/v3/page-change') return new Response(JSON.stringify({ snapshot: updated }), { status: 200 });
      if (url.pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    let importerCalls = 0;
    function Probe() {
      useOddeNovaBridge({
        importer: async (value, _binding, context) => {
          importerCalls += 1;
          if (value.revision > initial.revision) {
            pageRef.current.revision = value.revision;
            pageRef.current.code = value.code;
            if (value.protocolVersion === 3) pageRef.current.bridgeContentHash = value.contentHash;
          }
          if (context?.checkpoint) await putBridgeCheckpoint(context.checkpoint);
          return {
            outcome: value.revision === initial.revision ? 'unchanged' as const : 'updated' as const,
            sessionId,
            codeChanged: value.revision > initial.revision,
            skillRevision: value.protocolVersion === 3 ? value.skillRevision : undefined,
          };
        },
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        onApplied: vi.fn(),
        resolvePageState: (binding) => ({
          status: 'ready' as const,
          binding: { ...binding, sessionId },
          pageState: pageRef.current,
          visibleSessionId: sessionId,
          editorCode: pageRef.current.code,
        }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });

    const pageChange = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/page-change');
    expect(pageChange).toBeDefined();
    expect(new URL(String(pageChange?.[0])).searchParams.get('projectId')).toBe(projectId);
    expect(new URL(String(pageChange?.[0])).searchParams.get('baseUrl')).toBe(baseUrl);
    expect(JSON.parse(String(pageChange?.[1]?.body))).toMatchObject({
      baseRevision: 5,
      baseSkillRevision: 9,
      code: 'note("local edit")',
    });
    expect(importerCalls).toBe(2);
  });

  it('does not acknowledge a newer skill until the exact bound session and editor are visible', async () => {
    const projectId = 'presentation-project';
    const bindingId = 'presentation-binding';
    const sessionId = 'presentation-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 4,
      title: 'Presentation piece',
      code: 'note("old")',
      messages: [],
    });
    const incoming = await hashV3Snapshot({
      ...initial,
      revision: 2,
      skillRevision: 5,
      code: 'note("new")',
    });
    const pageRef = {
      current: {
        sessionId,
        projectId,
        baseUrl,
        revision: initial.revision,
        title: initial.title,
        code: initial.code,
        messages: [],
        bridgeContentHash: initial.contentHash,
        visibleSessionId: 'other-session',
        editorCode: 'other draft',
      },
    };
    await putBridgeCheckpoint({
      schemaVersion: 1,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: initial,
      editorPresentation: { revision: 1, skillRevision: 4, status: 'confirmed' },
      updatedAt: 1,
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'presentation-client',
      lastRevision: 1,
      lastSkillRevision: 4,
      bindingId,
      sessionId,
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(JSON.stringify({ snapshot: incoming }), { status: 200 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (url.pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let releasePresentation!: () => void;
    const presentAppliedSnapshot = vi.fn(() => new Promise<void>((resolve) => {
      releasePresentation = () => {
        pageRef.current.revision = incoming.revision;
        pageRef.current.code = incoming.code;
        pageRef.current.bridgeContentHash = incoming.contentHash;
        pageRef.current.visibleSessionId = sessionId;
        pageRef.current.editorCode = incoming.code;
        resolve();
      };
    }));
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async (value, _binding, context) => {
          if (context?.checkpoint) await putBridgeCheckpoint(context.checkpoint);
          return { outcome: 'updated' as const, sessionId, codeChanged: value.code !== initial.code, skillRevision: value.protocolVersion === 3 ? value.skillRevision : undefined };
        },
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        presentAppliedSnapshot,
        resolvePageState: (binding) => ({
          status: 'ready' as const,
          binding: { ...binding, sessionId },
          pageState: pageRef.current,
          visibleSessionId: pageRef.current.visibleSessionId,
          editorCode: pageRef.current.editorCode,
        }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });

    expect(presentAppliedSnapshot).toHaveBeenCalledWith(incoming, expect.anything(), { reason: 'new-skill-version' });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => new URL(String(input)).pathname === '/v3/ack')).toBe(false);
    expect(pageRef.current.visibleSessionId).toBe('other-session');

    await act(async () => {
      releasePresentation();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const ack = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/ack');
    expect(ack).toBeDefined();
    expect(JSON.parse(String(ack?.[1]?.body))).toMatchObject({ appliedRevision: 2, appliedSkillRevision: 5, sessionId });
    const storage = await import('../../lib/session-storage');
    await expect(storage.getBridgeCheckpoint('guest', `${baseUrl}\0${projectId}`, bindingId)).resolves.toMatchObject({
      editorPresentation: { revision: 2, skillRevision: 5, status: 'confirmed' },
    });
  });

  it('does not take the page back for a same-skill page change', async () => {
    const projectId = 'page-change-project';
    const bindingId = 'page-change-binding';
    const sessionId = 'page-change-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const initial = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 1,
      skillRevision: 4,
      title: 'Page change',
      code: 'note("old")',
      messages: [],
    });
    const incoming = await hashV3Snapshot({ ...initial, revision: 2, code: 'note("web edit")' });
    const pageRef = {
      current: {
        sessionId,
        projectId,
        baseUrl,
        revision: 1,
        title: initial.title,
        code: initial.code,
        messages: [],
        bridgeContentHash: initial.contentHash,
        visibleSessionId: 'other-session',
        editorCode: 'other draft',
      },
    };
    await putBridgeCheckpoint({
      schemaVersion: 1,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: initial,
      editorPresentation: { revision: 1, skillRevision: 4, status: 'confirmed' },
      updatedAt: 1,
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'page-change-client',
      lastRevision: 1,
      lastSkillRevision: 4,
      bindingId,
      sessionId,
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(JSON.stringify({ snapshot: incoming }), { status: 200 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (url.pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const presentAppliedSnapshot = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async (value, _binding, context) => {
          pageRef.current.revision = value.revision;
          pageRef.current.code = value.code;
          pageRef.current.bridgeContentHash = value.contentHash;
          if (context?.checkpoint) await putBridgeCheckpoint(context.checkpoint);
          return { outcome: 'updated' as const, sessionId, codeChanged: true, skillRevision: value.protocolVersion === 3 ? value.skillRevision : undefined };
        },
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        presentAppliedSnapshot,
        resolvePageState: (binding) => ({
          status: 'ready' as const,
          binding: { ...binding, sessionId },
          pageState: pageRef.current,
          visibleSessionId: pageRef.current.visibleSessionId,
          editorCode: pageRef.current.editorCode,
        }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });

    expect(presentAppliedSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => new URL(String(input)).pathname === '/v3/ack')).toBe(true);
    expect(pageRef.current.visibleSessionId).toBe('other-session');
  });

  it('replays a pending presentation before applying a same-skill page revision', async () => {
    const projectId = 'pending-recovery-project';
    const bindingId = 'pending-recovery-binding';
    const sessionId = 'pending-recovery-session';
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(window.location.origin);
    const pending = await hashV3Snapshot({
      protocolVersion: 3,
      source: 'oddenova-strudel-skill',
      projectId,
      baseUrl,
      bindingId,
      revision: 2,
      skillRevision: 5,
      title: 'Pending recovery',
      code: 'note("pending skill")',
      messages: [],
    });
    const incomingPageChange = await hashV3Snapshot({
      ...pending,
      revision: 3,
      code: 'note("same-skill web edit")',
    });
    const pageRef = {
      current: {
        sessionId,
        projectId,
        baseUrl,
        revision: 1,
        title: pending.title,
        code: 'note("old")',
        messages: [],
        bridgeContentHash: 'old-hash',
        visibleSessionId: 'other-session',
        editorCode: 'other draft',
      },
    };
    await putBridgeCheckpoint({
      schemaVersion: 1,
      ownerKey: 'guest',
      projectKey: `${baseUrl}\0${projectId}`,
      bindingId,
      sessionId,
      snapshot: pending,
      editorPresentation: { revision: 2, skillRevision: 5, status: 'pending' },
      updatedAt: 1,
    });
    sessionStorage.setItem(ODDENOVA_BRIDGE_CONNECTION_KEY, JSON.stringify({
      projectId,
      baseUrl,
      serviceOrigin: 'http://127.0.0.1:43123',
      pageToken: 'page-token',
      ownerKey: 'guest',
      clientId: 'pending-recovery-client',
      lastRevision: 1,
      lastSkillRevision: 4,
      bindingId,
      sessionId,
    }));

    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = assertBridgeRequestIdentity(input, init, projectId, baseUrl);
      if (url.pathname === '/v3/poll') {
        pollCount += 1;
        if (pollCount === 1) return new Response(JSON.stringify({ snapshot: incomingPageChange }), { status: 200 });
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      }
      if (url.pathname === '/v3/ack') return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
      throw new Error(`Unexpected bridge request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    let releasePresentation!: () => void;
    const presentAppliedSnapshot = vi.fn(() => new Promise<void>((resolve) => {
      releasePresentation = () => {
        pageRef.current.revision = pending.revision;
        pageRef.current.code = pending.code;
        pageRef.current.bridgeContentHash = pending.contentHash;
        pageRef.current.visibleSessionId = sessionId;
        pageRef.current.editorCode = pending.code;
        resolve();
      };
    }));
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    function Probe() {
      useOddeNovaBridge({
        importer: async (value, _binding, context) => {
          if (context?.checkpoint) await putBridgeCheckpoint(context.checkpoint);
          return { outcome: 'unchanged' as const, sessionId, codeChanged: false, skillRevision: value.protocolVersion === 3 ? value.skillRevision : undefined };
        },
        isReady: true,
        isBusy: false,
        isPersistent: true,
        ownerKey: 'guest',
        presentAppliedSnapshot,
        resolvePageState: (binding) => ({
          status: 'ready' as const,
          binding: { ...binding, sessionId },
          pageState: pageRef.current,
          visibleSessionId: pageRef.current.visibleSessionId,
          editorCode: pageRef.current.editorCode,
        }),
      });
      return null;
    }
    act(() => root.render(<Probe />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });

    expect(presentAppliedSnapshot).toHaveBeenCalledWith(pending, expect.anything(), { reason: 'recovery' });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => new URL(String(input)).pathname === '/v3/ack')).toBe(false);

    await act(async () => {
      releasePresentation();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const ack = vi.mocked(fetch).mock.calls.find(([input]) => new URL(String(input)).pathname === '/v3/ack');
    expect(ack).toBeDefined();
    expect(JSON.parse(String(ack?.[1]?.body))).toMatchObject({ appliedRevision: 2, appliedSkillRevision: 5, sessionId });
    const storage = await import('../../lib/session-storage');
    await expect(storage.getBridgeCheckpoint('guest', `${baseUrl}\0${projectId}`, bindingId)).resolves.toMatchObject({
      snapshot: { revision: 2, skillRevision: 5 },
      editorPresentation: { revision: 2, skillRevision: 5, status: 'confirmed' },
    });
  });
});
