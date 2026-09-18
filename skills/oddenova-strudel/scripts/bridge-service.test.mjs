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
    const pairResponse = await fetch(`${root}/v2/pair?${identity}`, {
      method: 'POST',
      headers: { origin: 'https://www.oddenova.com', 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: base.projectId, baseUrl: base.baseUrl, pairingToken: bootstrap.pairingToken }),
    });
    assert.equal(pairResponse.status, 200);
    const { pageToken } = await pairResponse.json();

    const second = await submit(2);
    assert.equal(second.bootstrapUrl, undefined);
    const pollQuery = new URLSearchParams({ projectId: base.projectId, baseUrl: base.baseUrl, clientId: 'page-1', after: '0' });
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

    const upgrade = await fetch(`${root}/v3/upgrade`, {
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
    const pair = await fetch(`${root}/v3/pair`, {
      method: 'POST', headers: { origin: identity.baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ ...identity, pairingToken: bootstrap.pairingToken }),
    });
    assert.equal(pair.status, 200);
    const { pageToken, bindingId } = await pair.json();
    const pageHeaders = { origin: identity.baseUrl, authorization: `Bearer ${pageToken}`, 'content-type': 'application/json' };
    const query = new URLSearchParams({ ...identity, clientId: 'page-1', bindingId, after: '0' });
    const initialPoll = await fetch(`${root}/v3/poll?${query}`, { headers: pageHeaders });
    assert.equal(initialPoll.status, 200);

    const pageChange = await fetch(`${root}/v3/page-change`, {
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
    const readResponse = await fetch(`${root}/v3/read-response`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', requestId: refreshPacket.refreshRequestIds[0], status: 'ready' }),
    });
    assert.equal(readResponse.status, 200);
    const read = await (await readPromise).json();
    assert.equal(read.status, 'ready');
    assert.equal(read.snapshot.code, 'page code');

    const second = await submit('turn-2', 2, 'skill two');
    assert.equal(second.skillRevision, 3);
    const late = await fetch(`${root}/v3/page-change`, {
      method: 'POST', headers: pageHeaders,
      body: JSON.stringify({ ...identity, bindingId, clientId: 'page-1', changeId: 'late-page', baseRevision: 2, baseSkillRevision: 1, code: 'old page code', upsertMessages: [{ id: 'late-message', role: 'assistant', content: 'late summary', createdAt: 3 }] }),
    });
    const lateBody = await late.json();
    assert.equal(lateBody.staleContent, true);
    assert.equal(lateBody.snapshot.code, 'skill two');
    assert.equal(lateBody.snapshot.messages.some((message) => message.id === 'late-message'), true);

    const disconnect = await fetch(`${root}/v3/disconnect`, {
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
