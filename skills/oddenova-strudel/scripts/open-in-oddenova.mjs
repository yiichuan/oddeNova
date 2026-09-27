#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawn as spawnProcess } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform as osPlatform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SOURCE,
  normalizeBaseUrl,
  readJson,
  validateSubmission,
} from './bridge-core.mjs';

export const ODDENOVA_IMPORT_PROTOCOL_VERSION = 1;
export const ODDENOVA_IMPORT_SOURCE = BRIDGE_SOURCE;
export const DEFAULT_BASE_URL = 'https://www.oddenova.com';
export const MAX_IMPORT_URL_BYTES = 32 * 1024;
export const AUTO_RECONNECT_TIMEOUT_MS = 30_000;
export const AUTO_RECONNECT_RETRY_INTERVAL_MS = 1_000;

export function buildImportUrl(payload, baseUrl = DEFAULT_BASE_URL) {
  const root = normalizeBaseUrl(baseUrl);
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
  return `${root}/#oddenova=z:${compressed.toString('base64url')}`;
}

export function fitPayloadToUrl(payload, baseUrl = DEFAULT_BASE_URL) {
  const url = buildImportUrl(payload, baseUrl);
  if (Buffer.byteLength(url, 'utf8') > MAX_IMPORT_URL_BYTES) {
    throw new Error('Import URL exceeds 32 KiB; use the local v3 connection instead');
  }
  return { payload: structuredClone(payload), url };
}

function browserCommand(url, platform) {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

export function launchImportUrl(url, {
  platform = process.platform,
  spawn = spawnProcess,
  warn = (message) => process.stderr.write(`${message}\n`),
} = {}) {
  try {
    const [command, args] = browserCommand(url, platform);
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once?.('error', (error) => warn(`Warning: Could not open browser: ${error.message}`));
    child.unref();
  } catch (error) {
    warn(`Warning: Could not open browser: ${error.message}`);
  }
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function writeFallbackLinkFile(url, projectId, { directory = tmpdir(), writeFile = writeFileSync } = {}) {
  const safeId = projectId.replace(/[^A-Za-z0-9._-]/g, '-');
  const path = join(directory, `oddenova-import-${safeId}.html`);
  const escaped = escapeHtml(url);
  writeFile(path, `<!doctype html>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0;url=${escaped}">\n<title>oddeNova import</title>\n<p><a href="${escaped}">Open in oddeNova</a></p>\n`, 'utf8');
  return path;
}

export function defaultCacheDir(platform = osPlatform(), home = homedir(), env = process.env) {
  if (env.ODDENOVA_STRUDEL_CACHE_DIR) return env.ODDENOVA_STRUDEL_CACHE_DIR;
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'oddenova-strudel');
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'oddenova-strudel');
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'oddenova-strudel');
}

function parseArguments(argv) {
  const options = { baseUrl: DEFAULT_BASE_URL, command: 'submit', link: false, printOnly: false, autoReconnect: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--base-url') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--base-url requires a value');
      options.baseUrl = value;
    } else if (argument === '--link') options.link = true;
    else if (argument === '--print-only') { options.link = true; options.printOnly = true; }
    else if (argument === '--auto-reconnect') options.autoReconnect = true;
    else if (['--pull', '--status', '--retry', '--reopen', '--stop', '--clear'].includes(argument)) options.command = argument.slice(2);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.autoReconnect && (options.command !== 'pull' || options.link)) {
    throw new Error('--auto-reconnect can only be used with --pull');
  }
  return options;
}

async function readInput(stream) {
  let input = '';
  for await (const chunk of stream) input += chunk;
  return input.trim() ? JSON.parse(input) : {};
}

async function bridgeRequest(runtime, path, { method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${runtime.port}${path}`, {
    method,
    headers: { authorization: `Bearer ${runtime.adminToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `Bridge request failed (${response.status})`);
  return value;
}

function isConfirmedRead(result) {
  return result?.status === 'ready' && result?.freshness === 'page_confirmed';
}

function isSuccessfulPull(result) {
  return isConfirmedRead(result) || result?.status === 'not_found';
}

async function openPairingEntry(runtime, identity, dependencies) {
  const result = await dependencies.request(runtime, '/v3/reopen', { method: 'POST', body: identity });
  const startedAt = dependencies.now();
  const fallbackPath = dependencies.writeFallback(result.bootstrapUrl, identity.projectId);
  try {
    dependencies.launch(result.bootstrapUrl, {
      platform: dependencies.platform,
      spawn: dependencies.spawn,
      warn: (message) => dependencies.stderr.write(`${message}\n`),
    });
  } catch (error) {
    dependencies.stderr.write(`Warning: Could not open browser: ${error.message}\n`);
  }
  return { fallbackPath, startedAt };
}

export async function pullWithOptionalReconnect(runtime, identity, options = {}, dependencies = {}) {
  const deps = {
    stderr: process.stderr,
    platform: process.platform,
    spawn: spawnProcess,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    request: bridgeRequest,
    launch: launchImportUrl,
    writeFallback: writeFallbackLinkFile,
    ...dependencies,
  };
  let result = await deps.request(runtime, '/v3/read', { method: 'POST', body: identity });
  if (!options.autoReconnect || result?.status !== 'page_unavailable') return result;

  deps.stderr.write('Page unavailable; attempting one automatic reconnect.\n');
  const pairing = await openPairingEntry(runtime, identity, deps);
  deps.stderr.write('Opening a new connection entry page.\n');
  if (pairing.fallbackPath) deps.stderr.write(`If the browser did not open, use this file: ${pairing.fallbackPath}\n`);
  const deadline = pairing.startedAt + AUTO_RECONNECT_TIMEOUT_MS;

  while (true) {
    const remaining = deadline - deps.now();
    if (remaining <= 0) {
      deps.stderr.write('Automatic reconnect timed out before the page was confirmed.\n');
      return result;
    }
    await deps.sleep(Math.min(AUTO_RECONNECT_RETRY_INTERVAL_MS, remaining));
    if (deps.now() >= deadline) {
      deps.stderr.write('Automatic reconnect timed out before the page was confirmed.\n');
      return result;
    }
    result = await deps.request(runtime, '/v3/read', { method: 'POST', body: identity });
    if (result?.status !== 'page_unavailable') return result;
  }
}

async function healthyRuntime(cacheDir) {
  const runtime = await readJson(join(cacheDir, 'runtime.json'));
  if (!runtime?.port || !runtime?.adminToken) return undefined;
  try {
    const health = await bridgeRequest(runtime, '/v2/health');
    return health.service === 'oddenova-strudel-bridge' ? { ...runtime, capabilities: health.capabilities ?? [], protocols: health.protocols ?? [2] } : undefined;
  } catch {
    return undefined;
  }
}

async function ensureBridge(cacheDir, { spawn = spawnProcess, retried = false } = {}) {
  const existing = await healthyRuntime(cacheDir);
  if (existing) return existing;
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const lock = join(cacheDir, 'start.lock');
  try {
    mkdirSync(lock);
    const adminToken = randomBytes(32).toString('base64url');
    const servicePath = fileURLToPath(new URL('./bridge-service.mjs', import.meta.url));
    const child = spawn(process.execPath, [servicePath, cacheDir], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ODDENOVA_BRIDGE_ADMIN_TOKEN: adminToken },
    });
    child.unref();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const runtime = await healthyRuntime(cacheDir);
    if (runtime) { rmSync(lock, { recursive: true, force: true }); return runtime; }
  }
  rmSync(lock, { recursive: true, force: true });
  if (!retried) return ensureBridge(cacheDir, { spawn, retried: true });
  throw new Error('Could not start the oddeNova local bridge');
}

function v1Payload(payload) {
  return {
    protocolVersion: 1,
    source: ODDENOVA_IMPORT_SOURCE,
    projectId: payload.projectId,
    title: payload.title,
    code: payload.code,
    messages: payload.messages,
    locale: payload.locale,
  };
}

async function runLink(payload, options, dependencies) {
  const { url } = fitPayloadToUrl(v1Payload(payload), options.baseUrl);
  if (options.printOnly) { dependencies.stdout.write(`${url}\n`); return 0; }
  const fallbackPath = writeFallbackLinkFile(url, payload.projectId);
  dependencies.stdout.write(`Opening an explicit oddeNova import link for project ${payload.projectId}.\n`);
  dependencies.stdout.write(`If the browser did not open, open this file: ${fallbackPath}\n`);
  launchImportUrl(url, { platform: dependencies.platform, spawn: dependencies.spawn, warn: (message) => dependencies.stderr.write(`${message}\n`) });
  return 0;
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const deps = {
    stdin: process.stdin, stdout: process.stdout, stderr: process.stderr,
    platform: process.platform, spawn: spawnProcess, cacheDir: undefined,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    request: bridgeRequest,
    launch: launchImportUrl,
    writeFallback: writeFallbackLinkFile,
    ensureBridge,
    ...dependencies,
  };
  try {
    const options = parseArguments(argv);
    const input = await readInput(deps.stdin);
    const baseUrl = normalizeBaseUrl(input.baseUrl ?? options.baseUrl);
    if (options.link) return runLink(input, options, deps);
    const cacheDir = deps.cacheDir ?? defaultCacheDir();
    const runtime = await deps.ensureBridge(cacheDir, { spawn: deps.spawn });

    if (options.command === 'stop') {
      await bridgeRequest(runtime, '/v2/stop', { method: 'POST' });
      deps.stdout.write('Stopped the oddeNova local bridge. Pending project caches were kept.\n');
      return 0;
    }
    if (!runtime.protocols?.includes(3)) {
      if (options.command === 'pull') {
        deps.stdout.write(`${JSON.stringify({ status: 'upgrade_required', freshness: 'none' })}\n`);
        return 2;
      }
      throw new Error('The running oddeNova bridge is outdated. Run --stop, then retry to start the v3 bridge.');
    }
    if (!input.projectId) throw new Error(`${options.command} requires projectId on stdin`);
    const identity = { projectId: input.projectId, baseUrl };
    if (options.command === 'status') {
      const query = new URLSearchParams(identity).toString();
      const status = await bridgeRequest(runtime, `/v3/status?${query}`);
      deps.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return 0;
    }
    if (options.command === 'retry') {
      const status = await bridgeRequest(runtime, '/v3/retry', { method: 'POST', body: identity });
      deps.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return 0;
    }
    if (options.command === 'clear') {
      await bridgeRequest(runtime, '/v3/clear', { method: 'POST', body: identity });
      deps.stdout.write(`Cleared cached project ${input.projectId}.\n`);
      return 0;
    }
    if (options.command === 'reopen') {
      const { fallbackPath } = await openPairingEntry(runtime, identity, deps);
      deps.stdout.write(`Opening a new connection entry page for project ${input.projectId}.\n`);
      deps.stdout.write(`If the browser did not open, open this file: ${fallbackPath}\n`);
      return 0;
    }

    if (options.command === 'pull') {
      const result = await pullWithOptionalReconnect(runtime, identity, options, deps);
      deps.stdout.write(`${JSON.stringify(result)}\n`);
      return isSuccessfulPull(result) ? 0 : 2;
    }

    const submission = { ...input, protocolVersion: BRIDGE_PROTOCOL_VERSION, source: BRIDGE_SOURCE, baseUrl };
    validateSubmission(submission);
    const result = await bridgeRequest(runtime, '/v3/submit', { method: 'POST', body: submission });
    if (result.bootstrapUrl) {
      const fallbackPath = writeFallbackLinkFile(result.bootstrapUrl, input.projectId);
      deps.stdout.write(`Saved revision ${result.acceptedRevision}; opening oddeNova to connect this project.\n`);
      deps.stdout.write(`If the browser did not open, open this file: ${fallbackPath}\n`);
      launchImportUrl(result.bootstrapUrl, { platform: deps.platform, spawn: deps.spawn, warn: (message) => deps.stderr.write(`${message}\n`) });
    } else if (result.acknowledged) {
      deps.stdout.write(`Revision ${result.acceptedRevision} is already applied in the connected oddeNova page.\n`);
    } else if (!result.paired) {
      deps.stdout.write(`Saved revision ${result.acceptedRevision}; no page is paired. Run --reopen to reconnect explicitly.\n`);
    } else {
      deps.stdout.write(`Saved revision ${result.acceptedRevision}; it is queued for the connected oddeNova page.\n`);
    }
    if (runtime.portChanged) {
      deps.stdout.write('The previous local port could not be reused. Run --reopen for this project to pair a page with the new port.\n');
    }
    return 0;
  } catch (error) {
    deps.stderr.write(`${error.message}\n`);
    return 1;
  }
}

export function isMainModule(metaUrl, entryPath = process.argv[1]) {
  if (!entryPath) return false;
  try { return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entryPath); } catch { return false; }
}

if (isMainModule(import.meta.url)) process.exitCode = await runCli();
