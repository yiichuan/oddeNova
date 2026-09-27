import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const LEGACY_BRIDGE_PROTOCOL_VERSION = 2;
export const BRIDGE_PROTOCOL_VERSION = 3;
export const BRIDGE_SOURCE = 'oddenova-strudel-skill';
export const MAX_BRIDGE_BODY_BYTES = 16 * 1024 * 1024;

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

export function projectCacheKey(baseUrl, projectId) {
  return sha256(`${normalizeBaseUrl(baseUrl)}\0${projectId}`);
}

export function validateSubmission(value, protocolVersion = BRIDGE_PROTOCOL_VERSION) {
  if (!value || typeof value !== 'object') throw new Error('Submission must be a JSON object');
  if (value.protocolVersion !== protocolVersion) throw new Error(`protocolVersion must be ${protocolVersion}`);
  if (value.source !== BRIDGE_SOURCE) throw new Error(`source must be ${BRIDGE_SOURCE}`);
  for (const field of ['projectId', 'turnId', 'title', 'code']) {
    if (typeof value[field] !== 'string' || !value[field]) throw new Error(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    throw new Error('messages must contain this turn\'s creative messages');
  }
  if (!value.messages.every((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')) {
    throw new Error('messages must contain only user/assistant role and string content');
  }
  if (value.locale !== undefined && value.locale !== 'zh-CN' && value.locale !== 'en') {
    throw new Error('locale must be zh-CN or en');
  }
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (bytes > MAX_BRIDGE_BODY_BYTES) throw new Error('Submission exceeds the 16 MiB limit');
  return value;
}

export function validateLegacySubmission(value) {
  return validateSubmission(value, LEGACY_BRIDGE_PROTOCOL_VERSION);
}

export function snapshotContent(project) {
  const content = {
    projectId: project.projectId,
    revision: project.revision,
    title: project.title,
    code: project.code,
    messages: project.messages,
  };
  if (project.locale !== undefined) content.locale = project.locale;
  return content;
}

export function makeSnapshot(project) {
  const content = snapshotContent(project);
  return {
    protocolVersion: LEGACY_BRIDGE_PROTOCOL_VERSION,
    source: BRIDGE_SOURCE,
    ...content,
    contentHash: sha256(content),
  };
}

export function appendSubmission(existing, submission, now = Date.now()) {
  validateLegacySubmission(submission);
  const submissionHash = sha256(submission);
  const previousTurn = existing?.turns?.[submission.turnId];
  if (previousTurn) {
    if (previousTurn !== submissionHash) throw new Error('turnId was already used with different content');
    return { project: existing, repeated: true, snapshot: makeSnapshot(existing) };
  }

  const baseUrl = normalizeBaseUrl(submission.baseUrl);
  if (existing && (existing.projectId !== submission.projectId || existing.baseUrl !== baseUrl)) {
    throw new Error('Project cache identity does not match this submission');
  }
  const receivedMessages = submission.messages.map((message, index) => ({
    id: randomUUID(),
    role: message.role,
    content: message.content,
    receivedAt: now + index,
  }));
  const project = {
    schemaVersion: 1,
    projectId: submission.projectId,
    baseUrl,
    targetOrigin: new URL(baseUrl).origin,
    title: submission.title,
    code: submission.code,
    locale: submission.locale,
    messages: [...(existing?.messages ?? []), ...receivedMessages],
    turns: { ...(existing?.turns ?? {}), [submission.turnId]: submissionHash },
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    pageToken: existing?.pageToken,
    pairedAt: existing?.pairedAt,
    openedAt: existing?.openedAt,
    pairTokenHash: existing?.pairTokenHash,
    pairTokenExpiresAt: existing?.pairTokenExpiresAt,
    lastAck: existing?.lastAck,
    lastDeliveryAt: existing?.lastDeliveryAt,
  };
  return { project, repeated: false, snapshot: makeSnapshot(project) };
}

function canonicalMessage(message, revision) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    order: message.order,
    updatedRevision: revision,
  };
}

function assertCreativeMessage(message, { requireId = true } = {}) {
  if (!message || typeof message !== 'object') throw new Error('Message must be an object');
  if (requireId && (typeof message.id !== 'string' || !message.id)) throw new Error('Message id must be a non-empty string');
  if (message.role !== 'user' && message.role !== 'assistant') throw new Error('Message role must be user or assistant');
  if (typeof message.content !== 'string') throw new Error('Message content must be a string');
  if (message.createdAt !== undefined && !Number.isFinite(message.createdAt)) throw new Error('Message createdAt must be a number');
}

export function migrateProjectToV3(existing, now = Date.now()) {
  if (!existing) return undefined;
  if (existing.schemaVersion === 2) return existing;
  let order = 0;
  const revision = Number.isInteger(existing.revision) ? existing.revision : 0;
  const messages = (existing.messages ?? []).map((message) => canonicalMessage({
    id: message.id || randomUUID(),
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? message.receivedAt ?? now,
    order: ++order,
  }, revision));
  const operations = {};
  for (const [turnId, hash] of Object.entries(existing.turns ?? {})) {
    operations[`skill:${turnId}`] = { hash, acceptedRevision: revision, repeated: true };
  }
  return {
    ...existing,
    schemaVersion: 2,
    revision,
    skillRevision: revision,
    messages,
    deletedMessages: {},
    nextMessageOrder: order + 1,
    operations,
    bindingId: existing.bindingId,
    updatedAt: existing.updatedAt ?? now,
  };
}

export function snapshotContentV3(project) {
  const content = {
    projectId: project.projectId,
    baseUrl: project.baseUrl,
    revision: project.revision,
    skillRevision: project.skillRevision,
    title: project.title,
    code: project.code,
    messages: [...project.messages].sort((left, right) => left.order - right.order),
  };
  if (project.locale !== undefined) content.locale = project.locale;
  return content;
}

export function makeSnapshotV3(project) {
  const content = snapshotContentV3(project);
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    source: BRIDGE_SOURCE,
    ...content,
    ...(project.bindingId !== undefined ? { bindingId: project.bindingId } : {}),
    contentHash: sha256(content),
  };
}

function ensureV3Identity(existing, input) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (existing && (existing.projectId !== input.projectId || existing.baseUrl !== baseUrl)) {
    throw new Error('Project cache identity does not match this operation');
  }
  return baseUrl;
}

function assertSnapshotSize(project) {
  if (Buffer.byteLength(JSON.stringify(makeSnapshotV3(project)), 'utf8') > MAX_BRIDGE_BODY_BYTES) {
    throw new Error('Resulting project snapshot exceeds the 16 MiB limit');
  }
}

export function applySkillSubmission(existingValue, submission, now = Date.now()) {
  validateSubmission(submission);
  if (!Number.isInteger(submission.baseRevision) || submission.baseRevision < 0) {
    throw new Error('baseRevision must be a non-negative integer');
  }
  const baseUrl = ensureV3Identity(existingValue, submission);
  const existing = migrateProjectToV3(existingValue, now);
  const operationKey = `skill:${submission.turnId}`;
  const operationHash = sha256(submission);
  const previous = existing?.operations?.[operationKey];
  if (previous) {
    if (previous.hash !== operationHash) throw new Error('turnId was already used with different content');
    return {
      project: existing,
      repeated: true,
      acceptedRevision: previous.acceptedRevision,
      overwroteConcurrentPageChange: previous.overwroteConcurrentPageChange,
      snapshot: makeSnapshotV3(existing),
    };
  }

  const revision = (existing?.revision ?? 0) + 1;
  let nextOrder = existing?.nextMessageOrder ?? 1;
  const messages = [...(existing?.messages ?? [])];
  submission.messages.forEach((message, index) => {
    assertCreativeMessage(message, { requireId: false });
    const id = `skill:${submission.turnId}:${index}`;
    if (existing?.deletedMessages?.[id]) return;
    messages.push(canonicalMessage({
      id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt ?? now + index,
      order: nextOrder++,
    }, revision));
  });
  const overwroteConcurrentPageChange = Boolean(existing && (submission.baseRevision ?? 0) < existing.revision);
  const project = {
    ...(existing ?? {}),
    schemaVersion: 2,
    projectId: submission.projectId,
    baseUrl,
    targetOrigin: new URL(baseUrl).origin,
    title: submission.title,
    code: submission.code,
    locale: submission.locale ?? existing?.locale,
    messages,
    deletedMessages: { ...(existing?.deletedMessages ?? {}) },
    nextMessageOrder: nextOrder,
    revision,
    skillRevision: revision,
    operations: {
      ...(existing?.operations ?? {}),
      [operationKey]: { hash: operationHash, acceptedRevision: revision, overwroteConcurrentPageChange },
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  assertSnapshotSize(project);
  return { project, repeated: false, acceptedRevision: revision, overwroteConcurrentPageChange, snapshot: makeSnapshotV3(project) };
}

export function applyPageChange(existingValue, change, now = Date.now()) {
  const existing = migrateProjectToV3(existingValue, now);
  if (!existing) throw new Error('Project cache not found');
  ensureV3Identity(existing, change);
  for (const field of ['bindingId', 'clientId', 'changeId']) {
    if (typeof change[field] !== 'string' || !change[field]) throw new Error(`${field} must be a non-empty string`);
  }
  if (change.bindingId !== existing.bindingId) throw Object.assign(new Error('Binding is no longer active'), { status: 409 });
  if (!Number.isInteger(change.baseRevision) || change.baseRevision < 0) throw new Error('baseRevision must be a non-negative integer');
  if (!Number.isInteger(change.baseSkillRevision) || change.baseSkillRevision < 0) throw new Error('baseSkillRevision must be a non-negative integer');
  if (change.baseSkillRevision > existing.skillRevision) throw Object.assign(new Error('Page skill revision is ahead of the service'), { status: 409 });
  const operationKey = `page:${change.changeId}`;
  const { bindingId: _bindingId, clientId: _clientId, ...semanticChange } = change;
  const operationHash = sha256(semanticChange);
  const previous = existing.operations?.[operationKey];
  if (previous) {
    if (previous.hash !== operationHash) throw new Error('changeId was already used with different content');
    return { project: existing, repeated: true, ...previous, snapshot: makeSnapshotV3(existing) };
  }

  const staleContent = change.baseSkillRevision < existing.skillRevision;
  const messagesById = new Map(existing.messages.map((message) => [message.id, message]));
  const deletedMessages = { ...existing.deletedMessages };
  let nextOrder = existing.nextMessageOrder;
  let messageChanged = false;
  for (const id of change.deleteMessageIds ?? []) {
    if (typeof id !== 'string' || !id) throw new Error('deleteMessageIds must contain non-empty strings');
    if (messagesById.delete(id)) messageChanged = true;
    if (!deletedMessages[id]) { deletedMessages[id] = now; messageChanged = true; }
  }
  for (const incoming of change.upsertMessages ?? []) {
    assertCreativeMessage(incoming);
    if (deletedMessages[incoming.id]) continue;
    const current = messagesById.get(incoming.id);
    if (!current) {
      messagesById.set(incoming.id, canonicalMessage({ ...incoming, createdAt: incoming.createdAt ?? now, order: nextOrder++ }, existing.revision + 1));
      messageChanged = true;
    } else if (current.role !== incoming.role || current.content !== incoming.content) {
      messagesById.set(incoming.id, canonicalMessage({ ...incoming, createdAt: current.createdAt, order: current.order }, existing.revision + 1));
      messageChanged = true;
    }
  }
  const titleChanged = !staleContent && Object.prototype.hasOwnProperty.call(change, 'title') && change.title !== existing.title;
  const codeChanged = !staleContent && Object.prototype.hasOwnProperty.call(change, 'code') && change.code !== existing.code;
  if (change.title !== undefined && typeof change.title !== 'string') throw new Error('title must be a string');
  if (change.code !== undefined && typeof change.code !== 'string') throw new Error('code must be a string');
  const changed = titleChanged || codeChanged || messageChanged;
  const acceptedRevision = changed ? existing.revision + 1 : existing.revision;
  const project = {
    ...existing,
    title: titleChanged ? change.title : existing.title,
    code: codeChanged ? change.code : existing.code,
    messages: [...messagesById.values()].sort((left, right) => left.order - right.order).map((message) =>
      message.updatedRevision === existing.revision + 1 ? { ...message, updatedRevision: acceptedRevision } : message),
    deletedMessages,
    nextMessageOrder: nextOrder,
    revision: acceptedRevision,
    operations: {
      ...existing.operations,
      [operationKey]: { hash: operationHash, acceptedRevision, staleContent, contentApplied: titleChanged || codeChanged, messageChanged },
    },
    updatedAt: changed ? now : existing.updatedAt,
  };
  assertSnapshotSize(project);
  return { project, repeated: false, acceptedRevision, staleContent, contentApplied: titleChanged || codeChanged, messageChanged, snapshot: makeSnapshotV3(project) };
}

export function projectPath(cacheDir, baseUrl, projectId) {
  return join(cacheDir, 'projects', `${projectCacheKey(baseUrl, projectId)}.json`);
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}
