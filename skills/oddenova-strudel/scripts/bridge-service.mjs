#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAX_BRIDGE_BODY_BYTES,
  applyPageChange,
  applySkillSubmission,
  appendSubmission,
  atomicWriteJson,
  makeSnapshot,
  makeSnapshotV3,
  migrateProjectToV3,
  normalizeBaseUrl,
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
const readRequests = new Map();
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
function identityKey(baseUrl, projectId) {
  return `${normalizeBaseUrl(baseUrl)}\0${projectId}`;
}
function notify(key) {
  for (const resolve of waiters.get(key) ?? []) resolve();
  waiters.delete(key);
}
function waitForUpdate(key, timeoutMs = 25_000) {
  return new Promise((resolve) => {
    const set = waiters.get(key) ?? new Set();
    waiters.set(key, set);
    const done = () => { clearTimeout(timer); set.delete(done); resolve(); };
    const timer = setTimeout(done, timeoutMs);
    set.add(done);
  });
}
function bootstrapUrl(project, port, pairingToken) {
  const payload = Buffer.from(JSON.stringify({
    protocolVersion: project.schemaVersion === 2 ? 3 : 2,
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

async function backupLegacyProject(path, project) {
  if (!project || project.schemaVersion === 2) return;
  const backupPath = `${path}.schema1.backup.json`;
  if (!await readJson(backupPath)) await atomicWriteJson(backupPath, project);
}

async function readV3ProjectLocked(projectId, baseUrl, { delivery = false } = {}) {
  const key = identityKey(baseUrl, projectId);
  return withProjectLock(key, async () => {
    const { path, project: raw } = await findProject(projectId, baseUrl);
    if (!raw) return { key, path, project: undefined };
    await backupLegacyProject(path, raw);
    const project = migrateProjectToV3(raw);
    if (delivery) project.lastDeliveryAt = Date.now();
    if (raw.schemaVersion !== 2 || delivery) await atomicWriteJson(path, project);
    return { key, path, project };
  });
}

function authorizedPage(project, request, bodyOrUrl, { requireLease = true } = {}) {
  const clientId = bodyOrUrl instanceof URLSearchParams ? bodyOrUrl.get('clientId') : bodyOrUrl.clientId;
  if (!project || request.headers.origin !== project.targetOrigin || bearer(request) !== project.pageToken) return false;
  if (project.schemaVersion === 2 && bodyOrUrl.bindingId !== project.bindingId) return false;
  if (!requireLease) return true;
  const lease = leases.get(identityKey(project.baseUrl, project.projectId));
  return Boolean(clientId && lease?.clientId === clientId && lease.expiresAt > Date.now());
}

function waitForReadResponse(requestId, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const request = readRequests.get(requestId);
    if (!request) return resolve(false);
    const timer = setTimeout(() => {
      if (readRequests.delete(requestId)) resolve(false);
    }, timeoutMs);
    request.resolve = (status = 'ready') => { clearTimeout(timer); readRequests.delete(requestId); resolve(status); };
  });
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
      return send(response, 200, { service: 'oddenova-strudel-bridge', pid: process.pid, protocols: [2, 3], capabilities: ['bidirectional-sync', 'read-barrier'] });
    }

    if (url.pathname === '/v3/submit' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const submission = await readBody(request);
      const key = identityKey(submission.baseUrl, submission.projectId);
      const result = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(submission.projectId, submission.baseUrl);
        await backupLegacyProject(path, raw);
        const appended = applySkillSubmission(raw, submission);
        let pairingToken;
        if (!appended.project.pageToken && !appended.project.openedAt) {
          pairingToken = token();
          appended.project.pairTokenHash = sha256(pairingToken);
          appended.project.pairTokenExpiresAt = Date.now() + 10 * 60_000;
          appended.project.openedAt = Date.now();
        }
        await atomicWriteJson(path, appended.project);
        notify(key);
        return { ...appended, pairingToken };
      });
      return send(response, 200, {
        accepted: true,
        repeated: result.repeated,
        acceptedRevision: result.acceptedRevision,
        skillRevision: result.project.skillRevision,
        overwroteConcurrentPageChange: result.overwroteConcurrentPageChange,
        paired: Boolean(result.project.pageToken),
        acknowledged: result.project.lastAck?.appliedRevision >= result.acceptedRevision,
        bootstrapUrl: result.pairingToken ? bootstrapUrl(result.project, server.address().port, result.pairingToken) : undefined,
      });
    }

    if (url.pathname === '/v3/pair' && request.method === 'POST') {
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const result = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(body.projectId, body.baseUrl);
        if (!raw || request.headers.origin !== raw.targetOrigin) throw Object.assign(new Error('Pairing origin does not match'), { status: 403 });
        if (!raw.pairTokenHash || raw.pairTokenExpiresAt < Date.now() || sha256(body.pairingToken ?? '') !== raw.pairTokenHash) {
          throw Object.assign(new Error('Pairing token is invalid or expired'), { status: 401 });
        }
        await backupLegacyProject(path, raw);
        const project = migrateProjectToV3(raw);
        project.pageToken = token();
        project.bindingId = token();
        project.pairedAt = Date.now();
        project.pairTokenHash = undefined;
        project.pairTokenExpiresAt = undefined;
        await atomicWriteJson(path, project);
        leases.delete(key);
        return project;
      });
      return send(response, 200, { pageToken: result.pageToken, bindingId: result.bindingId, revision: result.revision, skillRevision: result.skillRevision }, cors(result, request));
    }

    if (url.pathname === '/v3/upgrade' && request.method === 'POST') {
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const project = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(body.projectId, body.baseUrl);
        if (!raw || request.headers.origin !== raw.targetOrigin || bearer(request) !== raw.pageToken) {
          throw Object.assign(new Error('Connection is not authorized'), { status: 401 });
        }
        await backupLegacyProject(path, raw);
        const migrated = migrateProjectToV3(raw);
        migrated.bindingId ||= token();
        await atomicWriteJson(path, migrated);
        leases.set(key, { clientId: body.clientId, expiresAt: Date.now() + 35_000 });
        return migrated;
      });
      return send(response, 200, { bindingId: project.bindingId, revision: project.revision, skillRevision: project.skillRevision, snapshot: makeSnapshotV3(project) }, cors(project, request));
    }

    if (url.pathname === '/v3/poll' && request.method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const baseUrl = url.searchParams.get('baseUrl');
      const clientId = url.searchParams.get('clientId');
      const bindingId = url.searchParams.get('bindingId');
      const after = Number(url.searchParams.get('after') ?? 0);
      const key = identityKey(baseUrl, projectId);
      let found = await readV3ProjectLocked(projectId, baseUrl);
      let project = found.project;
      if (!project || request.headers.origin !== project.targetOrigin || bearer(request) !== project.pageToken || bindingId !== project.bindingId) {
        return send(response, 401, { error: 'Connection is not authorized' }, project ? cors(project, request) : {});
      }
      const lease = leases.get(key);
      if (lease && lease.clientId !== clientId && lease.expiresAt > Date.now()) {
        return send(response, 409, { error: 'Another page is receiving this project' }, cors(project, request));
      }
      leases.set(key, { clientId, expiresAt: Date.now() + 35_000 });
      const pendingReads = [...readRequests.entries()].filter(([, item]) => item.key === key && item.bindingId === bindingId).map(([requestId]) => requestId);
      if (project.revision <= after && pendingReads.length === 0) {
        activePolls += 1;
        try { await waitForUpdate(key); } finally { activePolls -= 1; }
        found = await readV3ProjectLocked(projectId, baseUrl);
        project = found.project;
      }
      if (!project || request.headers.origin !== project.targetOrigin || bearer(request) !== project.pageToken || bindingId !== project.bindingId) {
        return send(response, 401, { error: 'Connection is no longer authorized' }, project ? cors(project, request) : {});
      }
      const refreshRequestIds = [...readRequests.entries()].filter(([, item]) => item.key === key && item.bindingId === bindingId).map(([requestId]) => requestId);
      if (project.revision <= after && refreshRequestIds.length === 0) return send(response, 204, undefined, cors(project, request));
      found = await readV3ProjectLocked(projectId, baseUrl, { delivery: true });
      project = found.project;
      if (!project || bindingId !== project.bindingId) return send(response, 409, { error: 'Binding changed while polling' });
      return send(response, 200, { snapshot: makeSnapshotV3(project), refreshRequestIds }, cors(project, request));
    }

    if (url.pathname === '/v3/page-change' && request.method === 'POST') {
      const change = await readBody(request);
      const key = identityKey(change.baseUrl, change.projectId);
      const result = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(change.projectId, change.baseUrl);
        const project = migrateProjectToV3(raw);
        if (!authorizedPage(project, request, change)) throw Object.assign(new Error('Connection is not authorized or active'), { status: 401 });
        const changed = applyPageChange(project, change);
        await atomicWriteJson(path, changed.project);
        notify(key);
        return changed;
      });
      return send(response, 200, {
        accepted: true,
        repeated: result.repeated,
        acceptedRevision: result.acceptedRevision,
        staleContent: result.staleContent,
        contentApplied: result.contentApplied,
        messageChanged: result.messageChanged,
        snapshot: result.snapshot,
      }, cors(result.project, request));
    }

    if (url.pathname === '/v3/read' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const found = await readV3ProjectLocked(body.projectId, body.baseUrl);
      const project = found.project;
      if (!project) return send(response, 200, { status: 'not_found', freshness: 'none' });
      const lease = leases.get(key);
      if (!project.pageToken || !lease || lease.expiresAt <= Date.now()) {
        return send(response, 200, { status: 'page_unavailable', freshness: 'cached', snapshot: makeSnapshotV3(project) });
      }
      const requestId = token();
      readRequests.set(requestId, { key, bindingId: project.bindingId });
      notify(key);
      const confirmed = await waitForReadResponse(requestId);
      const latest = (await readV3ProjectLocked(body.projectId, body.baseUrl)).project;
      return send(response, 200, confirmed === 'ready'
        ? { status: 'ready', freshness: 'page_confirmed', confirmedAt: Date.now(), snapshot: makeSnapshotV3(latest) }
        : { status: confirmed === 'busy' ? 'busy' : 'page_unavailable', freshness: 'cached', snapshot: makeSnapshotV3(latest) });
    }

    if (url.pathname === '/v3/read-response' && request.method === 'POST') {
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const { project: raw } = await findProject(body.projectId, body.baseUrl);
      const project = migrateProjectToV3(raw);
      if (!authorizedPage(project, request, body)) return send(response, 401, { error: 'Connection is not authorized or active' }, project ? cors(project, request) : {});
      const pending = readRequests.get(body.requestId);
      if (!pending || pending.key !== key || pending.bindingId !== body.bindingId) return send(response, 409, { error: 'Read request is no longer active' }, cors(project, request));
      if (body.status === 'busy') {
        pending.resolve?.('busy');
        return send(response, 200, { completed: true, busy: true }, cors(project, request));
      }
      pending.resolve?.('ready');
      return send(response, 200, { completed: true }, cors(project, request));
    }

    if (url.pathname === '/v3/ack' && request.method === 'POST') {
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const project = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(body.projectId, body.baseUrl);
        const current = migrateProjectToV3(raw);
        if (!authorizedPage(current, request, body)) throw Object.assign(new Error('Connection is not authorized or active'), { status: 401 });
        if (!Number.isInteger(body.appliedRevision) || body.appliedRevision < 0 || body.appliedRevision > current.revision) throw new Error('Invalid appliedRevision');
        if (!current.lastAck || body.appliedRevision >= (current.lastAck.appliedRevision ?? current.lastAck.revision ?? 0)) {
          current.lastAck = { appliedRevision: body.appliedRevision, appliedSkillRevision: body.appliedSkillRevision, sessionId: body.sessionId, outcome: body.outcome, persistent: body.persistent, at: Date.now() };
          await atomicWriteJson(path, current);
        }
        return current;
      });
      return send(response, 200, { acknowledged: true }, cors(project, request));
    }

    if (url.pathname === '/v3/disconnect' && request.method === 'POST') {
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const project = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(body.projectId, body.baseUrl);
        const current = migrateProjectToV3(raw);
        if (!authorizedPage(current, request, body)) throw Object.assign(new Error('Connection is not authorized or active'), { status: 401 });
        current.pageToken = undefined;
        current.bindingId = undefined;
        current.pairedAt = undefined;
        await atomicWriteJson(path, current);
        return current;
      });
      leases.delete(key);
      notify(key);
      return send(response, 200, { disconnected: true }, cors(project, request));
    }

    if (url.pathname === '/v3/status' && request.method === 'GET') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const { project } = await readV3ProjectLocked(url.searchParams.get('projectId'), url.searchParams.get('baseUrl'));
      if (!project) return send(response, 404, { error: 'Project cache not found' });
      const lease = leases.get(identityKey(project.baseUrl, project.projectId));
      return send(response, 200, {
        projectId: project.projectId, revision: project.revision, skillRevision: project.skillRevision,
        paired: Boolean(project.pageToken), messageCount: project.messages.length, lastAck: project.lastAck,
        pageConnected: Boolean(lease && lease.expiresAt > Date.now()),
        pending: !project.lastAck || (project.lastAck.appliedRevision ?? 0) < project.revision,
      });
    }

    if (url.pathname === '/v3/retry' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      const { project } = await readV3ProjectLocked(body.projectId, body.baseUrl);
      if (!project) return send(response, 404, { error: 'Project cache not found' });
      notify(identityKey(project.baseUrl, project.projectId));
      return send(response, 200, { projectId: project.projectId, revision: project.revision, pending: !project.lastAck || (project.lastAck.appliedRevision ?? 0) < project.revision });
    }

    if (url.pathname === '/v3/reopen' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      const result = await withProjectLock(key, async () => {
        const { path, project: raw } = await findProject(body.projectId, body.baseUrl);
        await backupLegacyProject(path, raw);
        const project = migrateProjectToV3(raw);
        if (!project) throw Object.assign(new Error('Project cache not found'), { status: 404 });
        const pairingToken = token();
        project.pairTokenHash = sha256(pairingToken);
        project.pairTokenExpiresAt = Date.now() + 10 * 60_000;
        project.openedAt = Date.now();
        await atomicWriteJson(path, project);
        return { project, pairingToken };
      });
      return send(response, 200, { bootstrapUrl: bootstrapUrl(result.project, server.address().port, result.pairingToken) });
    }

    if (url.pathname === '/v3/clear' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const body = await readBody(request);
      const key = identityKey(body.baseUrl, body.projectId);
      await rm(projectPath(cacheDir, body.baseUrl, body.projectId), { force: true });
      leases.delete(key);
      notify(key);
      return send(response, 200, { cleared: true });
    }

    if (url.pathname === '/v2/submit' && request.method === 'POST') {
      if (!admin(request)) return send(response, 401, { error: 'Unauthorized' });
      const submission = await readBody(request);
      const key = identityKey(submission.baseUrl, submission.projectId);
      const result = await withProjectLock(key, async () => {
        const { path, project: existing } = await findProject(submission.projectId, submission.baseUrl);
        if (existing?.schemaVersion === 2) throw Object.assign(new Error('Project requires protocol v3'), { status: 409 });
        const appended = appendSubmission(existing, submission);
        let pairingToken;
        if (!appended.project.pageToken && !appended.project.openedAt) {
          pairingToken = token();
          appended.project.pairTokenHash = sha256(pairingToken);
          appended.project.pairTokenExpiresAt = Date.now() + 10 * 60_000;
          appended.project.openedAt = Date.now();
        }
        await atomicWriteJson(path, appended.project);
        notify(key);
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
      if (project.schemaVersion === 2) return send(response, 426, { error: 'Project requires protocol v3' }, cors(project, request));
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
      const key = identityKey(baseUrl, projectId);
      let found = await findProject(projectId, baseUrl);
      const project = found.project;
      if (!project || request.headers.origin !== project.targetOrigin || bearer(request) !== project.pageToken) {
        return send(response, 401, { error: 'Connection is not authorized' }, project ? cors(project, request) : {});
      }
      if (project.schemaVersion === 2) return send(response, 426, { error: 'Project requires protocol v3' }, cors(project, request));
      const lease = leases.get(key);
      if (lease && lease.clientId !== clientId && lease.expiresAt > Date.now()) {
        return send(response, 409, { error: 'Another page is receiving this project' }, cors(project, request));
      }
      leases.set(key, { clientId, expiresAt: Date.now() + 35_000 });
      if (project.revision <= after) {
        activePolls += 1;
        try { await waitForUpdate(key); } finally { activePolls -= 1; }
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
      if (project.schemaVersion === 2) return send(response, 426, { error: 'Project requires protocol v3' }, cors(project, request));
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
      notify(identityKey(project.baseUrl, project.projectId));
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
      const key = identityKey(body.baseUrl, body.projectId);
      leases.delete(key);
      notify(key);
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
