// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import {
  ODDENOVA_BRIDGE_BOOTSTRAP_KEY,
  consumeOddeNovaBridgeBootstrapHash,
  isOddeNovaBridgeSnapshot,
} from '../oddenova-bridge';

function bootstrapHash(value: unknown): string {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `#oddenova-connect=${encoded}`;
}

describe('oddenova bridge bootstrap', () => {
  afterEach(() => {
    sessionStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('removes a valid connection credential before app initialization and keeps it in tab storage', () => {
    history.replaceState(null, '', `/compose?mode=edit${bootstrapHash({
      protocolVersion: 2,
      projectId: 'p-1',
      baseUrl: window.location.origin,
      serviceOrigin: 'http://127.0.0.1:43210',
      pairingToken: 'one-time-secret',
    })}`);
    expect(consumeOddeNovaBridgeBootstrapHash()).toBe(true);
    expect(window.location.href).not.toContain('one-time-secret');
    expect(window.location.hash).toBe('');
    expect(JSON.parse(sessionStorage.getItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY)!)).toMatchObject({ projectId: 'p-1' });
  });

  it('rejects non-loopback services and wrong target origins', () => {
    for (const value of [
      { protocolVersion: 2, projectId: 'p', baseUrl: window.location.origin, serviceOrigin: 'https://evil.example', pairingToken: 'x' },
      { protocolVersion: 2, projectId: 'p', baseUrl: 'https://other.example', serviceOrigin: 'http://127.0.0.1:1234', pairingToken: 'x' },
    ]) {
      history.replaceState(null, '', `/${bootstrapHash(value)}`);
      consumeOddeNovaBridgeBootstrapHash();
      expect(sessionStorage.getItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY)).toBeNull();
    }
  });
});

it('validates stable-message v2 snapshots', () => {
  expect(isOddeNovaBridgeSnapshot({
    protocolVersion: 2,
    source: 'oddenova-strudel-skill',
    projectId: 'p',
    revision: 1,
    title: 'Piece',
    code: 'stack(s("bd"))',
    messages: [{ id: 'm1', role: 'user', content: 'make it', receivedAt: 1 }],
    contentHash: 'hash',
  })).toBe(true);
});

it('accepts canonical v3 snapshots and rejects incomplete v3 message metadata', () => {
  const snapshot = {
    protocolVersion: 3, source: 'oddenova-strudel-skill', projectId: 'p-1', baseUrl: window.location.origin, revision: 2, skillRevision: 1,
    title: 'Piece', code: 'stack()', contentHash: 'hash',
    messages: [{ id: 'm1', role: 'user', content: 'make it', createdAt: 1, order: 1, updatedRevision: 1 }],
  };
  expect(isOddeNovaBridgeSnapshot(snapshot)).toBe(true);
  expect(isOddeNovaBridgeSnapshot({ ...snapshot, messages: [{ id: 'm1', role: 'user', content: 'make it', createdAt: 1 }] })).toBe(false);
});
