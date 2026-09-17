#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAX_BRIDGE_BODY_BYTES,
  appendSubmission,
  atomicWriteJson,
  makeSnapshot,
  projectPath,
  readJson,
  sha256,
} from './bridge-core.mjs';

const cacheDir = process.argv[2];
const adminToken = process.env.ODDENOVA_BRIDGE_ADMIN_TOKEN;
if (!cacheDir || !adminToken) throw new Error('Bridge service requires its cache directory and admin token');

const runtimePath = join(cacheDir, 'runtime.json');
const portPath = join(cacheDir, 'port.json');
const serial = new Map();
const waiters = new Map();
const leases = new Map();
let activePolls = 0;
let lastActivityAt = Date.now();

function touch() { lastActivityAt = Date.now(); }
function token() { return randomBytes(32).toString('base64url'); }
function send(response, status, value, headers = {}) {
  const body = value === undefined ? '' : JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(body);
}
function cors(project, request) {
  return request.headers.origin === project.targetOrigin
    ? { 'access-control-allow-origin': project.targetOrigin, vary: 'Origin' }
    : {};
}
function bearer(request) { return request.headers.authorization?.replace(/^Bearer\s+/i, ''); }
function admin(request) { return bearer(request) === adminToken; }
function withProjectLock(key, operation) {
  const prior = serial.get(key) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(operation);
  serial.set(key, next.finally(() => { if (serial.get(key) === next) serial.delete(key); }));
  return next;
}
async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BRIDGE_BODY_BYTES) throw Object.assign(new Error('Request exceeds the 16 MiB limit'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function notify(projectId) {
  for (const resolve of waiters.get(projectId) ?? []) resolve();
  waiters.delete(projectId);
}
function waitForUpdate(projectId, timeoutMs = 25_000) {
  return new Promise((resolve) => {
    const set = waiters.get(projectId) ?? new Set();
    waiters.set(projectId, set);
    const done = () => { clearTimeout(timer); set.delete(done); resolve(); };
    const timer = setTimeout(done, timeoutMs);
    set.add(done);
  });
}
function bootstrapUrl(project, port, pairingToken) {
  const payload = Buffer.from(JSON.stringify({
    protocolVersion: 2,
    projectId: project.projectId,
    baseUrl: project.baseUrl,
    serviceOrigin: `http://127.0.0.1:${port}`,
    pairingToken,
  })).toString('base64url');
  return `${project.baseUrl}/#oddenova-connect=${payload}`;
}
async function findProject(projectId, baseUrl) {
  if (!baseUrl) throw new Error('baseUrl is required');
  const path = projectPath(cacheDir, baseUrl, projectId);
  return { path, project: await readJson(path) };
}

const server = createServer(async (request, response) => {
  touch();
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  try {
    const address = server.address();
    if (!address || request.headers.host !== `127.0.0.1:${address.port}`) {
      return send(response, 400, { error: 'Invalid local service Host header' });
    }
    if (request.method === 'OPTIONS') {
      const projectId = url.searchParams.get('projectId');
      const baseUrl = url.searchParams.get('baseUrl');
      const { project } = await findProject(projectId, baseUrl);
      if (!project || request.headers.origin !== project.targetOrigin) return send(response, 403, { error: 'Origin is not paired' });
      response.writeHead(204, {
        ...cors(project, request),
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-max-age': '600',
      });
      return response.end();
    }

    if (url.pathname === '/v2/health' && request.method === 'GET') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      return send(response, 200, { service: 'oddenova-strudel-bridge', pid: process.pid });
    }

    if (url.pathname === '/v2/submit' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const submission = await readBody(request);
      const key = `${submission.baseUrl}\0${submission.projectId}`;
      const result = await withProjectLock(key, async () => {
        const { path, project: existing } = await findProject(submission.projectId, submission.baseUrl);
        const appended = appendSubmission(existing, submission);
        let pairingToken;
        if (!appended.project.pageToken && !appended.project.openedAt) {
          pairingToken = token();
          appended.project.pairTokenHash = sha256(pairingToken);
          appended.project.pairTokenExpiresAt = Date.now() + 10 * 60_000;
          appended.project.openedAt = Date.now();
        }
        await atomicWriteJson(path, appended.project);
        notify(appended.project.projectId);
        return { ...appended, pairingToken };
      });
      return send(response, 200, {
        accepted: true,
        repeated: result.repeated,
        revision: result.project.revision,
        paired: Boolean(result.project.pageToken),
        acknowledged: result.project.lastAck?.revision >= result.project.revision,
        bootstrapUrl: result.pairingToken ? bootstrapUrl(result.project, server.address().port, result.pairingToken) : undefined,
      });
    }

    if (url.pathname === '/v2/pair' && request.method === 'POST') {
      const body = await readBody(request);
      const { path, project } = await findProject(body.projectId, body.baseUrl);
      if (!project || request.headers.origin !== project.targetOrigin) return send(response, 403, { error: 'Pairing origin does not match' });
      if (!project.pairTokenHash || project.pairTokenExpiresAt < Date.now() || sha256(body.pairingToken ?? '') !== project.pairTokenHash) {
        return send(response, 401, { error: 'Pairing token is invalid or expired' }, cors(project, request));
      }
      project.pageToken = token();
      project.pairedAt = Date.now();
      project.pairTokenHash = undefined;
      project.pairTokenExpiresAt = undefined;
      await atomicWriteJson(path, project);
      return send(response, 200, { pageToken: project.pageToken, revision: project.revision }, cors(project, request));
    }

    if (url.pathname === '/v2/poll' && request.method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const baseUrl = url.searchParams.get('baseUrl');
      const clientId = url.searchParams.get('clientId');
      const after = Number(url.searchParams.get('after') ?? 0);
      let found = await findProject(projectId, baseUrl);
      const project = found.project;
      if (!project || request.headers.origin !== project.targetOrigin || bearer(request) !== project.pageToken) {
        return send(response, 401, { error: 'Connection is not authorized' }, project ? cors(project, request) : {});
      }
      const lease = leases.get(projectId);
      if (lease && lease.clientId !== clientId && lease.expiresAt > Date.now()) {
        return send(response, 409, { error: 'Another page is receiving this project' }, cors(project, request));
      }
      leases.set(projectId, { clientId, expiresAt: Date.now() + 35_000 });
      if (project.revision <= after) {
        activePolls += 1;
        try { await waitForUpdate(projectId); } finally { activePolls -= 1; }
        found = await findProject(projectId, baseUrl);
      }
      const latest = found.project;
      if (latest.revision <= after) return send(response, 204, undefined, cors(latest, request));
      latest.lastDeliveryAt = Date.now();
      await atomicWriteJson(found.path, latest);
      return send(response, 200, makeSnapshot(latest), cors(latest, request));
    }

    if (url.pathname === '/v2/ack' && request.method === 'POST') {
      const body = await readBody(request);
      const { path, project } = await findProject(body.projectId, body.baseUrl);
      if (!project || request.headers.origin !== project.targetOrigin || bearer(request) !== project.pageToken) {
        return send(response, 401, { error: 'Connection is not authorized' }, project ? cors(project, request) : {});
      }
      if (!Number.isInteger(body.revision) || body.revision < 1 || body.revision > project.revision) {
        return send(response, 400, { error: 'Invalid revision' }, cors(project, request));
      }
      if (!project.lastAck || body.revision >= project.lastAck.revision) {
        project.lastAck = { revision: body.revision, sessionId: body.sessionId, outcome: body.outcome, persistent: body.persistent, at: Date.now() };
        await atomicWriteJson(path, project);
      }
      return send(response, 200, { acknowledged: true }, cors(project, request));
    }

    if (url.pathname === '/v2/status' && request.method === 'GET') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const { project } = await findProject(url.searchParams.get('projectId'), url.searchParams.get('baseUrl'));
      if (!project) return send(response, 404, { error: 'Project cache not found' });
      return send(response, 200, {
        projectId: project.projectId,
        revision: project.revision,
        paired: Boolean(project.pageToken),
        messageCount: project.messages.length,
        lastAck: project.lastAck,
        pending: !project.lastAck || project.lastAck.revision < project.revision,
      });
    }

    if (url.pathname === '/v2/retry' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      const { project } = await findProject(body.projectId, body.baseUrl);
      if (!project) return send(response, 404, { error: 'Project cache not found' });
      notify(project.projectId);
      return send(response, 200, {
        projectId: project.projectId,
        revision: project.revision,
        pending: !project.lastAck || project.lastAck.revision < project.revision,
      });
    }

    if (url.pathname === '/v2/reopen' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      const { path, project } = await findProject(body.projectId, body.baseUrl);
      if (!project) return send(response, 404, { error: 'Project cache not found' });
      const pairingToken = token();
      project.pairTokenHash = sha256(pairingToken);
      project.pairTokenExpiresAt = Date.now() + 10 * 60_000;
      project.openedAt = Date.now();
      await atomicWriteJson(path, project);
      return send(response, 200, { bootstrapUrl: bootstrapUrl(project, server.address().port, pairingToken) });
    }

    if (url.pathname === '/v2/clear' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      await rm(projectPath(cacheDir, body.baseUrl, body.projectId), { force: true });
      leases.delete(body.projectId);
      notify(body.projectId);
      return send(response, 200, { cleared: true });
    }

    if (url.pathname === '/v2/stop' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      send(response, 200, { stopping: true });
      return setImmediate(() => {
        for (const projectId of waiters.keys()) notify(projectId);
        server.close();
      });
    }
    return send(response, 404, { error: 'Not found' });
  } catch (error) {
    return send(response, error.status ?? 400, { error: error.message });
  }
});

await mkdir(cacheDir, { recursive: true, mode: 0o700 });
const preferredPort = (await readJson(portPath))?.port ?? 0;
let portChanged = false;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && preferredPort !== 0 && !portChanged) {
    portChanged = true;
    server.listen(0, '127.0.0.1');
    return;
  }
  throw error;
});
server.listen(preferredPort, '127.0.0.1', async () => {
  const address = server.address();
  await atomicWriteJson(portPath, { port: address.port });
  await atomicWriteJson(runtimePath, {
    service: 'oddenova-strudel-bridge',
    pid: process.pid,
    port: address.port,
    adminToken,
    startedAt: Date.now(),
    portChanged,
  });
});

const idleTimer = setInterval(() => {
  if (activePolls === 0 && Date.now() - lastActivityAt >= 10 * 60_000) server.close();
}, 30_000);
idleTimer.unref();
server.on('close', async () => {
  clearInterval(idleTimer);
  await rm(runtimePath, { force: true });
  process.exitCode = 0;
});
