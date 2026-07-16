// @vitest-environment happy-dom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OddeNovaImportPayload } from '../../lib/oddenova-import';
import { useOddeNovaImport, type OddeNovaImportResult } from '../useOddeNovaImport';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const payload: OddeNovaImportPayload = {
  protocolVersion: 1,
  source: 'oddenova-strudel-skill',
  projectId: 'project-1',
  title: 'Imported beat',
  code: 'setcps(0.4)\nstack(s("bd"))',
  messages: [
    { role: 'user', content: 'Make a beat' },
    { role: 'assistant', content: 'Here is a beat' },
  ],
};

function fragment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `#oddenova=${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

function renderImportHook(
  importer: (value: OddeNovaImportPayload) => Promise<'created' | 'updated' | 'branched'>,
  isReady: boolean,
  isPersistent: boolean,
) {
  let result: OddeNovaImportResult | undefined;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe(props: {
    ready: boolean;
    persistent: boolean;
    onValue: (value: OddeNovaImportResult) => void;
  }) {
    const value = useOddeNovaImport(importer, props.ready, props.persistent);
    useEffect(() => {
      props.onValue(value);
    }, [props, value]);
    return null;
  }

  const onValue = (value: OddeNovaImportResult) => {
    result = value;
  };

  act(() => {
    root.render(<Probe ready={isReady} persistent={isPersistent} onValue={onValue} />);
  });

  return {
    root,
    getResult: () => {
      if (!result) throw new Error('hook did not render');
      return result;
    },
    rerender: (ready: boolean, persistent: boolean) => {
      act(() => {
        root.render(<Probe ready={ready} persistent={persistent} onValue={onValue} />);
      });
    },
  };
}

describe('useOddeNovaImport', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  it('removes the fragment immediately, waits for sessions, and imports the decoded payload once', async () => {
    window.history.pushState(null, '', `/compose?mode=edit${fragment(payload)}`);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const importer = vi.fn(async () => 'created' as const);
    const playback = vi.fn();
    const hook = renderImportHook(importer, false, true);
    roots.push(hook.root);

    expect(replaceState).toHaveBeenCalledWith(null, '', '/compose?mode=edit');
    expect(window.location.hash).toBe('');
    expect(hook.getResult()).toEqual({ status: 'loading' });
    expect(importer).not.toHaveBeenCalled();

    window.location.hash = '#changed-after-consumption';
    hook.rerender(true, true);
    await act(async () => {
      await Promise.resolve();
    });
    hook.rerender(true, false);

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith(payload);
    expect(importer.mock.calls[0]).toHaveLength(1);
    expect(playback).not.toHaveBeenCalled();
    expect(hook.getResult()).toEqual({ status: 'success', outcome: 'created', persistent: true });
  });

  it('maps unsupported protocol versions separately without invoking the importer', () => {
    window.history.pushState(null, '', `/compose${fragment({ ...payload, protocolVersion: 2 })}`);
    const importer = vi.fn(async () => 'created' as const);
    const hook = renderImportHook(importer, true, true);
    roots.push(hook.root);

    expect(hook.getResult()).toEqual({ status: 'error', reason: 'unsupported-version' });
    expect(importer).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('maps malformed payloads to invalid without invoking the importer', () => {
    window.history.pushState(null, '', '/compose#oddenova=%%%');
    const importer = vi.fn(async () => 'created' as const);
    const hook = renderImportHook(importer, true, true);
    roots.push(hook.root);

    expect(hook.getResult()).toEqual({ status: 'error', reason: 'invalid' });
    expect(importer).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('maps importer failures to invalid', async () => {
    window.history.pushState(null, '', `/compose${fragment(payload)}`);
    const importer = vi.fn(async () => {
      throw new Error('storage failed');
    });
    const hook = renderImportHook(importer, true, false);
    roots.push(hook.root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.getResult()).toEqual({ status: 'error', reason: 'invalid' });
  });
});
