#!/usr/bin/env node

import { spawn as spawnProcess } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

export const ODDENOVA_IMPORT_PROTOCOL_VERSION = 1;
export const ODDENOVA_IMPORT_SOURCE = 'oddenova-strudel-skill';
export const DEFAULT_BASE_URL = 'https://www.oddenova.com';
export const MAX_IMPORT_URL_BYTES = 32 * 1024;

// `z:` marks a deflate-raw compressed payload; the app also accepts the legacy
// uncompressed base64url form for links minted by older helper versions.
export function buildImportUrl(payload, baseUrl = DEFAULT_BASE_URL) {
  const root = baseUrl.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
  return `${root}/#oddenova=z:${compressed.toString('base64url')}`;
}

export function fitPayloadToUrl(payload, baseUrl = DEFAULT_BASE_URL) {
  const fitted = structuredClone(payload);
  while (
    Buffer.byteLength(buildImportUrl(fitted, baseUrl), 'utf8') > MAX_IMPORT_URL_BYTES
    && fitted.messages.length > 2
  ) {
    fitted.messages.shift();
  }

  const url = buildImportUrl(fitted, baseUrl);
  if (Buffer.byteLength(url, 'utf8') > MAX_IMPORT_URL_BYTES) {
    throw new Error('Import URL exceeds 32 KiB without truncating Strudel code');
  }
  return { payload: fitted, url };
}

function browserCommand(url, platform) {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

export function launchImportUrl(
  url,
  {
    platform = process.platform,
    spawn = spawnProcess,
    warn = (message) => process.stderr.write(`${message}\n`),
  } = {},
) {
  try {
    const [command, args] = browserCommand(url, platform);
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once?.('error', (error) => {
      warn(`Warning: Could not open browser: ${error.message}`);
    });
    child.unref();
  } catch (error) {
    warn(`Warning: Could not open browser: ${error.message}`);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// The full import URL is several KiB of encoded text, so the CLI keeps it out
// of the terminal by default and stores it in a clickable redirect file the
// user can open when the automatic browser launch fails.
export function writeFallbackLinkFile(url, projectId, { directory = tmpdir(), writeFile = writeFileSync } = {}) {
  const safeId = projectId.replace(/[^A-Za-z0-9._-]/g, '-');
  const path = join(directory, `oddenova-import-${safeId}.html`);
  const escaped = escapeHtml(url);
  writeFile(
    path,
    `<!doctype html>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0;url=${escaped}">\n<title>oddeNova import</title>\n<p><a href="${escaped}">Open in oddeNova</a></p>\n`,
    'utf8',
  );
  return path;
}

function parseArguments(argv) {
  let baseUrl = DEFAULT_BASE_URL;
  let printOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-only') {
      printOnly = true;
    } else if (argument === '--base-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--base-url requires a value');
      baseUrl = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { baseUrl, printOnly };
}

async function readInput(stream) {
  let input = '';
  for await (const chunk of stream) input += chunk;
  return input;
}

export async function runCli(
  argv = process.argv.slice(2),
  {
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    platform = process.platform,
    spawn = spawnProcess,
  } = {},
) {
  try {
    const { baseUrl, printOnly } = parseArguments(argv);
    const payload = JSON.parse(await readInput(stdin));
    const { payload: fitted, url } = fitPayloadToUrl(payload, baseUrl);

    if (printOnly) {
      stdout.write(`${url}\n`);
      return 0;
    }

    const fallbackPath = writeFallbackLinkFile(url, fitted.projectId);
    const sizeKiB = (Buffer.byteLength(url, 'utf8') / 1024).toFixed(1);
    stdout.write(`Opening oddeNova import in the browser (project ${fitted.projectId}, URL ${sizeKiB} KiB).\n`);
    stdout.write(`If the browser did not open, open this file: ${fallbackPath}\n`);
    launchImportUrl(url, {
      platform,
      spawn,
      warn: (message) => stderr.write(`${message}\n`),
    });
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

// Compare real filesystem paths, not the raw URL/argv strings: the skill is
// installed under ~/.claude/skills via a symlink, so `import.meta.url` is the
// symlink-resolved real path while `process.argv[1]` keeps the symlink path.
// Resolving both sides makes the check hold whichever path Node reports.
export function isMainModule(metaUrl, entryPath = process.argv[1]) {
  if (!entryPath) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entryPath);
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await runCli();
}
