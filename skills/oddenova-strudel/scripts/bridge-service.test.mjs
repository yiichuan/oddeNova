import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readJson } from './bridge-core.mjs';

const servicePath = fileURLToPath(new URL('./bridge-service.mjs', import.meta.url));

async function waitForRuntime(cacheDir) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const runtime = await readJson(join(cacheDir, 'runtime.json'));
    if (runtime?.port) return runtime;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('service did not start');
}

async function assertPreflight(root, pathname, identity, origin, method = 'POST', requestHeaders = 'authorization, content-type') {
  const response = await fetch(`${root}${pathname}?${new URLSearchParams(identity)}`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': method,
      'access-control-request-headers': requestHeaders,
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'authorization, content-type');
  assert.equal(response.headers.get('vary'), 'Origin');
}

test('service pairs one page, delivers full history, rejects a competing lease, and records ack', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'oddenova-service-'));
  const adminToken = 'admin-test-token';
  const child = spawn(process.execPath, [servicePath, cacheDir], {
    stdio: 'ignore',
    env: { ...process.env, ODDENOVA_BRIDGE_ADMIN_TOKEN: adminToken },
  });
  try {
    const runtime = await waitForRuntime(cacheDir);
    const root = `http://127.0.0.1:${runtime.port}`;
    const adminHeaders = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' };
    const base = {
      protocolVersion: 2,
      source: 'oddenova-strudel-skill',
      baseUrl: 'https://www.oddenova.com',
      projectId: 'service-project',
      title: 'Piece',
      locale: 'en',
    };
    const submit = async (number) => {
      const response = await fetch(`${root}/v2/submit`, {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({
          ...base,
          turnId: `turn-${number}`,
          code: `stack(s("bd*${number}"))`,
          messages: [{ role: 'user', content: `request ${number}` }, { role: 'assistant', content: `summary ${number}` }],
        }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const first = await submit(1);
    assert.equal(typeof first.bootstrapUrl, 'string');
    const bootstrap = JSON.parse(Buffer.from(new URL(first.bootstrapUrl).hash.split('=')[1], 'base64url').toString('utf8'));

    const identity = new URLSearchParams({ projectId: base.projectId, baseUrl: base.baseUrl }).toString();
    const missingProjectPreflight = await fetch(`${root}/v2/pair?baseUrl=${encodeURIComponent(base.baseUrl)}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://www.oddenova.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(missingProjectPreflight.status, 403);
    assert.equal(missingProjectPreflight.headers.get('access-control-allow-origin'), null);
    const missingBasePreflight = await fetch(`${root}/v2/pair?projectId=${encodeURIComponent(base.projectId)}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://www.oddenova.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(missingBasePreflight.status, 400);
    assert.equal(missingBasePreflight.headers.get('access-control-allow-origin'), null);
    const unknownProjectPreflight = await fetch(`${root}/v2/pair?projectId=unknown-project&baseUrl=${encodeURIComponent(base.baseUrl)}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://www.oddenova.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(unknownProjectPreflight.status, 403);
    assert.equal(unknownProjectPreflight.headers.get('access-control-allow-origin'), null);
    const foreignOriginPreflight = await fetch(`${root}/v2/pair?${identity}`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(foreignOriginPreflight.status, 403);
    assert.equal(foreignOriginPreflight.headers.get('access-control-allow-origin'), null);
    await assertPreflight(root, '/v2/pair', { projectId: base.projectId, baseUrl: base.baseUrl }, 'https://www.oddenova.com', 'POST', 'content-type');
    const pairResponse = await fetch(`${root}/v2/pair?${identity}`, {
      method: 'POST',
      headers: { origin: 'https://www.oddenova.com', 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: base.projectId, baseUrl: base.baseUrl, pairingToken: bootstrap.pairingToken }),
    });
    assert.equal(pairResponse.status, 200);
    const initialPair = await pairResponse.json();
    const { pageToken } = initialPair;
    assert.equal(initialPair.previousBindingId, undefined);

    const second = await submit(2);
    assert.equal(second.bootstrapUrl, undefined);
    const pollQuery = new URLSearchParams({ projectId: base.projectId, baseUrl: base.baseUrl, clientId: 'page-1', after: '0' });
    await assertPreflight(root, '/v2/poll', { projectId: base.projectId, baseUrl: base.baseUrl }, 'https://www.oddenova.com', 'GET', 'authorization');
    const poll = await fetch(`${root}/v2/poll?${pollQuery}`, {
      headers: { origin: 'https://www.oddenova.com', authorization: `Bearer ${pageToken}` },
    });
    assert.equal(poll.status, 200);
    const snapshot = await poll.json();
    assert.equal(snapshot.revision, 2);
    assert.equal(snapshot.messages.length, 4);

    const occupiedQuery = new URLSearchParams({ projectId: base.projectId, baseUrl: base.baseUrl, clientId: 'page-2', after: '0' });
    const occupied = await fetch(`${root}/v2/poll?${occupiedQuery}`, {
      headers: { origin: 'https://www.oddenova.com', authorization: `Bearer ${pageToken}` },
    });
    assert.equal(occupied.status, 409);

    await assertPreflight(root, '/v2/ack', { projectId: base.projectId, baseUrl: base.baseUrl }, 'https://www.oddenova.com');
    const ack = await fetch(`${root}/v2/ack?${identity}`, {
      method: 'POST',
      headers: { origin: 'https://www.oddenova.com', authorization: `Bearer ${pageToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: base.projectId, baseUrl: base.baseUrl, revision: 2, sessionId: 'session-1', outcome: 'updated', persistent: true }),
    });
    assert.equal(ack.status, 200);
    const status = await fetch(`${root}/v2/status?${identity}`, { headers: { authorization: `Bearer ${adminToken}` } });
    const statusBody = await status.json();
    assert.deepEqual(
      { ...statusBody.lastAck, at: undefined },
      { revision: 2, sessionId: 'session-1', outcome: 'updated', persistent: true, at: undefined },
    );
    assert.equal(typeof statusBody.lastAck.at, 'number');

    await Promise.all([submit(3), submit(4)]);
    const retry = await fetch(`${root}/v2/retry`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ projectId: base.projectId, baseUrl: base.baseUrl }),
    });
    assert.deepEqual(await retry.json(), { projectId: base.projectId, revision: 4, pending: true });
    const finalStatus = await fetch(`${root}/v2/status?${identity}`, { headers: { authorization: `Bearer ${adminToken}` } });
    const finalStatusBody = await finalStatus.json();
    assert.equal(finalStatusBody.revision, 4);
    assert.equal(finalStatusBody.messageCount, 8);

    await assertPreflight(root, '/v3/upgrade', { projectId: base.projectId, baseUrl: base.baseUrl }, 'https://www.oddenova.com');
    const upgrade = await fetch(`${root}/v3/upgrade?${identity}`, {
      method: 'POST',
      headers: { origin: 'https://www.oddenova.com', authorization: `Bearer ${pageToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: base.projectId, baseUrl: base.baseUrl, clientId: 'page-1' }),
    });
    assert.equal(upgrade.status, 200);
    const upgraded = await upgrade.json();
    assert.equal(typeof upgraded.bindingId, 'string');
    assert.equal(upgraded.snapshot.protocolVersion, 3);
    assert.equal(upgraded.snapshot.messages.length, 8);
    assert.equal(upgraded.snapshot.bindingId, upgraded.bindingId);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('v3 re-pair returns only the direct previous binding and rejects the old page credentials', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'oddenova-service-rebind-'));
  const adminToken = 'admin-rebind-token';
  const child = spawn(process.execPath, [servicePath, cacheDir], {
    stdio: 'ignore', env: { ...process.env, ODDENOVA_BRIDGE_ADMIN_TOKEN: adminToken },
  });
  try {
    const runtime = await waitForRuntime(cacheDir);
    const root = `http://127.0.0.1:${runtime.port}`;
    const adminHeaders = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' };
    const identity = { projectId: 'rebind-project', baseUrl: 'https://www.oddenova.com' };
    const submission = async (turnId, baseRevision) => {
      const response = await fetch(`${root}/v3/submit`, {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({
          protocolVersion: 3,
          source: 'oddenova-strudel-skill',
          ...identity,
          turnId,
          baseRevision,
          title: 'Rebind piece',
          code: `note("${turnId}")`,
          messages: [{ role: 'user', content: turnId }],
        }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };

    const first = await submission('turn-1', 0);
    const firstBootstrap = JSON.parse(Buffer.from(new URL(first.bootstrapUrl).hash.split('=')[1], 'base64url').toString('utf8'));
    const firstPair = await fetch(`${root}/v3/pair?${new URLSearchParams(identity)}`, {
      method: 'POST',
      headers: { origin: identity.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, pairingToken: firstBootstrap.pairingToken }),
    });
    assert.equal(firstPair.status, 200);
    const firstPairBody = await firstPair.json();
    const firstPageToken = firstPairBody.pageToken;
    const firstBindingId = firstPairBody.bindingId;
    assert.equal(firstPairBody.pairingKind, 'initial');
    assert.equal(firstPairBody.previousBindingId, undefined);

    const reopened = await fetch(`${root}/v3/reopen`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(identity),
    });
    assert.equal(reopened.status, 200);
    const reopenBootstrap = JSON.parse(Buffer.from(new URL((await reopened.json()).bootstrapUrl).hash.split('=')[1], 'base64url').toString('utf8'));
    const secondPair = await fetch(`${root}/v3/pair?${new URLSearchParams(identity)}`, {
      method: 'POST',
      headers: { origin: identity.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, pairingToken: reopenBootstrap.pairingToken }),
    });
    assert.equal(secondPair.status, 200);
    const secondPairBody = await secondPair.json();
    assert.equal(secondPairBody.pairingKind, 'rebind');
    assert.equal(secondPairBody.previousBindingId, firstBindingId);
    assert.notEqual(secondPairBody.bindingId, firstBindingId);
    assert.equal(JSON.stringify(secondPairBody).includes(firstPageToken), false);

    const reopenedAgain = await fetch(`${root}/v3/reopen`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(identity),
    });
    const reopenAgainBootstrap = JSON.parse(Buffer.from(new URL((await reopenedAgain.json()).bootstrapUrl).hash.split('=')[1], 'base64url').toString('utf8'));
    const thirdPair = await fetch(`${root}/v3/pair?${new URLSearchParams(identity)}`, {
      method: 'POST',
      headers: { origin: identity.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, pairingToken: reopenAgainBootstrap.pairingToken }),
    });
    assert.equal(thirdPair.status, 200);
    const thirdPairBody = await thirdPair.json();
    assert.equal(thirdPairBody.pairingKind, 'rebind');
    assert.equal(thirdPairBody.previousBindingId, secondPairBody.bindingId);
    assert.notEqual(thirdPairBody.previousBindingId, firstBindingId);

    const oldPoll = await fetch(`${root}/v3/poll?${new URLSearchParams({ ...identity, clientId: 'old-page', bindingId: firstBindingId, after: '0' })}`, {
      headers: { origin: identity.baseUrl, authorization: `Bearer ${firstPageToken}` },
    });
    assert.equal(oldPoll.status, 401);

    const replacedPoll = await fetch(`${root}/v3/poll?${new URLSearchParams({ ...identity, clientId: 'replaced-page', bindingId: secondPairBody.bindingId, after: '0' })}`, {
      headers: { origin: identity.baseUrl, authorization: `Bearer ${secondPairBody.pageToken}` },
    });
    assert.equal(replacedPoll.status, 401);
    const currentPoll = await fetch(`${root}/v3/poll?${new URLSearchParams({ ...identity, clientId: 'new-page', bindingId: thirdPairBody.bindingId, after: '0' })}`, {
      headers: { origin: identity.baseUrl, authorization: `Bearer ${thirdPairBody.pageToken}` },
    });
    assert.equal(currentPoll.status, 200);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('v3 round trip flushes page state before read and fences late page content behind a skill revision', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'oddenova-service-v3-'));
  const adminToken = 'admin-v3-token';
  const child = spawn(process.execPath, [servicePath, cacheDir], {
    stdio: 'ignore', env: { ...process.env, ODDENOVA_BRIDGE_ADMIN_TOKEN: adminToken },
  });
  try {
    const runtime = await waitForRuntime(cacheDir);
    const root = `http://127.0.0.1:${runtime.port}`;
    const adminHeaders = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' };
    const identity = { projectId: 'v3-project', baseUrl: 'https://www.oddenova.com' };
    const submit = async (turnId, baseRevision, code) => {
      const response = await fetch(`${root}/v3/submit`, {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ protocolVersion: 3, source: 'oddenova-strudel-skill', ...identity, turnId, baseRevision, title: `Skill ${turnId}`, code, locale: 'en', messages: [{ role: 'user', content: turnId }, { role: 'assistant', content: `done ${turnId}` }] }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const first = await submit('turn-1', 0, 'skill one');
    const bootstrap = JSON.parse(Buffer.from(new URL(first.bootstrapUrl).hash.split('=')[1], 'base64url').toString('utf8'));
    await assertPreflight(root, '/v3/pair', identity, identity.baseUrl, 'POST', 'content-type');
    const pair = await fetch(`${root}/v3/pair?${new URLSearchParams(identity)}`, {
      method: 'POST', headers: { origin: identity.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, pairingToken: bootstrap.pairingToken }),
    });
    assert.equal(pair.status, 200);
    const { pageToken, bindingId } = await pair.json();
    const pageHeaders = { origin: identity.baseUrl, authorization: `Bearer ${pageToken}`, 'content-type': 'application/json' };
    const query = new URLSearchParams({ ...identity, clientId: 'page-1', bindingId, after: '0' });
    await assertPreflight(root, '/v3/poll', identity, identity.baseUrl, 'GET', 'authorization');
    const initialPoll = await fetch(`${root}/v3/poll?${query}`, { headers: pageHeaders });
    assert.equal(initialPoll.status, 200);

    await assertPreflight(root, '/v3/page-change', identity, identity.baseUrl);
    const pageChangeQuery = new URLSearchParams({ ...identity, bindingId, clientId: 'page-1' });
    const pageChange = await fetch(`${root}/v3/page-change?${pageChangeQuery}`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', changeId: 'page-1', baseRevision: 1, baseSkillRevision: 1, title: 'Page title', code: 'page code', upsertMessages: [{ id: 'page-message', role: 'user', content: 'page request', createdAt: 2 }] }),
    });
    assert.equal(pageChange.status, 200);
    assert.equal((await pageChange.json()).acceptedRevision, 2);

    const readPromise = fetch(`${root}/v3/read`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(identity) });
    const refreshQuery = new URLSearchParams({ ...identity, clientId: 'page-1', bindingId, after: '2' });
    const refreshPoll = await fetch(`${root}/v3/poll?${refreshQuery}`, { headers: pageHeaders });
    const refreshPacket = await refreshPoll.json();
    assert.equal(refreshPacket.refreshRequestIds.length, 1);
    await assertPreflight(root, '/v3/read-response', identity, identity.baseUrl);
    const readResponseQuery = new URLSearchParams({ ...identity, bindingId, clientId: 'page-1' });
    const invalidReadResponse = await fetch(`${root}/v3/read-response?${readResponseQuery}`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', requestId: refreshPacket.refreshRequestIds[0], status: 'not-ready' }),
    });
    assert.equal(invalidReadResponse.status, 400);
    const readResponse = await fetch(`${root}/v3/read-response?${readResponseQuery}`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', requestId: refreshPacket.refreshRequestIds[0], status: 'ready' }),
    });
    assert.equal(readResponse.status, 200);
    const read = await (await readPromise).json();
    assert.equal(read.status, 'ready');
    assert.equal(read.freshness, 'page_confirmed');
    assert.equal(read.snapshot.code, 'page code');

    await assertPreflight(root, '/v3/ack', identity, identity.baseUrl);
    const ackQuery = new URLSearchParams({ ...identity, bindingId, clientId: 'page-1' });
    const v3Ack = await fetch(`${root}/v3/ack?${ackQuery}`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', appliedRevision: 2, appliedSkillRevision: 1, sessionId: 'session-1', outcome: 'updated', persistent: true }),
    });
    assert.equal(v3Ack.status, 200);

    const second = await submit('turn-2', 2, 'skill two');
    assert.equal(second.skillRevision, 3);
    const late = await fetch(`${root}/v3/page-change?${pageChangeQuery}`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', changeId: 'late-page', baseRevision: 2, baseSkillRevision: 1, code: 'old page code', upsertMessages: [{ id: 'late-message', role: 'assistant', content: 'late summary', createdAt: 3 }] }),
    });
    const lateBody = await late.json();
    assert.equal(lateBody.staleContent, true);
    assert.equal(lateBody.snapshot.code, 'skill two');
    assert.equal(lateBody.snapshot.messages.some((message) => message.id === 'late-message'), true);

    await assertPreflight(root, '/v3/disconnect', identity, identity.baseUrl);
    const disconnect = await fetch(`${root}/v3/disconnect?${pageChangeQuery}`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1' }),
    });
    assert.equal(disconnect.status, 200);
    const third = await submit('turn-3', 4, 'skill three');
    assert.equal(third.paired, false);
    assert.equal(third.bootstrapUrl, undefined);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
