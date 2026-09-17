// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ODDENOVA_BRIDGE_CONNECTION_KEY,
  type OddeNovaBridgeSnapshot,
} from '../../lib/oddenova-bridge';
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

function renderHook(options: { busy?: boolean; ownerKey?: string } = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let status: OddeNovaBridgeStatus | undefined;
  const importer = vi.fn(async () => ({ outcome: 'updated' as const, sessionId: 'session-1' }));
  const onApplied = vi.fn();

  function Probe({ busy }: { busy: boolean }) {
    const value = useOddeNovaBridge({
      importer,
      isReady: true,
      isBusy: busy,
      isPersistent: true,
      ownerKey: options.ownerKey ?? 'guest',
      onApplied,
    });
    useEffect(() => { status = value; }, [value]);
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
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('polls, imports, acknowledges, and advances the tab revision', async () => {
    storeConnection();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
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

  it('queues a received snapshot while the app is busy', async () => {
    storeConnection();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
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
});
