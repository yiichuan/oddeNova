#!/usr/bin/env node

import { spawn as spawnProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ODDENOVA_IMPORT_PROTOCOL_VERSION = 1;
export const ODDENOVA_IMPORT_SOURCE = 'oddenova-strudel-skill';
export const DEFAULT_BASE_URL = 'https://www.oddenova.com';
export const MAX_IMPORT_URL_BYTES = 32 * 1024;

export function buildImportUrl(payload, baseUrl = DEFAULT_BASE_URL) {
  const root = baseUrl.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${root}/#oddenova=${encoded}`;
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
    const { url } = fitPayloadToUrl(payload, baseUrl);
    stdout.write(`${url}\n`);

    if (!printOnly) {
      launchImportUrl(url, {
        platform,
        spawn,
        warn: (message) => stderr.write(`${message}\n`),
      });
    }
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
