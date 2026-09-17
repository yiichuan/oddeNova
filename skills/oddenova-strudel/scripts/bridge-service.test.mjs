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
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
