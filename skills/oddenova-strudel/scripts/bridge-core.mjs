import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const BRIDGE_PROTOCOL_VERSION = 2;
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

export function validateSubmission(value) {
  if (!value || typeof value !== 'object') throw new Error('Submission must be a JSON object');
  if (value.protocolVersion !== BRIDGE_PROTOCOL_VERSION) throw new Error('protocolVersion must be 2');
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
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    source: BRIDGE_SOURCE,
    ...content,
    contentHash: sha256(content),
  };
}

export function appendSubmission(existing, submission, now = Date.now()) {
  validateSubmission(submission);
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
