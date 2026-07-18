import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

import {
  buildImportUrl,
  fitPayloadToUrl,
  isMainModule,
  launchImportUrl,
  runCli,
  writeFallbackLinkFile,
} from './open-in-oddenova.mjs';

const scriptPath = fileURLToPath(new URL('./open-in-oddenova.mjs', import.meta.url));

const payload = {
  protocolVersion: 1,
  source: 'oddenova-strudel-skill',
  projectId: 'project-1',
  title: '雨夜 Lo-fi',
  code: 'setcps(0.375)\nstack(s("bd"))',
  messages: [
    { role: 'user', content: '做一段雨夜 lo-fi' },
    { role: 'assistant', content: '加入轻鼓、温暖贝斯和 Rhodes 和弦' },
  ],
  locale: 'zh-CN',
};

function decodeImportUrl(url) {
  const encoded = new URL(url).hash.slice('#oddenova='.length);
  assert.equal(encoded.startsWith('z:'), true, 'expected a compressed z: fragment');
  return JSON.parse(inflateRawSync(Buffer.from(encoded.slice(2), 'base64url')).toString('utf8'));
}

test('buildImportUrl compresses Unicode protocol payloads behind the z: marker', () => {
  const url = buildImportUrl(payload);

  assert.match(url, /^https:\/\/www\.oddenova\.com\/#oddenova=z:[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeImportUrl(url), payload);
});

test('buildImportUrl normalizes an overridden base URL', () => {
  const url = buildImportUrl(payload, 'http://127.0.0.1:5173/preview///?ignored=true#old');

  assert.equal(url.startsWith('http://127.0.0.1:5173/preview/#oddenova='), true);
  assert.deepEqual(decodeImportUrl(url), payload);
});

// Random base64 keeps the fixtures incompressible so they still overflow the
// URL budget now that buildImportUrl deflates the payload.
test('fitPayloadToUrl trims oldest messages but retains the latest two', () => {
  const messages = Array.from({ length: 4 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `${index}:${randomBytes(12_000).toString('base64')}`,
  }));
  const original = { ...payload, messages };

  const fitted = fitPayloadToUrl(original);

  assert.deepEqual(fitted.payload.messages, messages.slice(-2));
  assert.deepEqual(original.messages, messages);
  assert.equal(Buffer.byteLength(fitted.url, 'utf8') <= 32 * 1024, true);
  assert.deepEqual(decodeImportUrl(fitted.url), fitted.payload);
});

test('fitPayloadToUrl refuses to truncate oversized Strudel code', () => {
  const code = randomBytes(30_000).toString('base64');
  const oversized = { ...payload, code, messages: [] };

  assert.throws(
    () => fitPayloadToUrl(oversized),
    new Error('Import URL exceeds 32 KiB without truncating Strudel code'),
  );
  assert.equal(oversized.code, code);
});

test('launchImportUrl selects the platform browser command and detaches it', () => {
  const url = buildImportUrl(payload);
  const expected = {
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
    win32: ['cmd', ['/c', 'start', '', url]],
  };

  for (const [platform, [expectedCommand, expectedArgs]] of Object.entries(expected)) {
    const calls = [];
    let unrefCalled = false;
    const spawn = (...args) => {
      calls.push(args);
      return {
        once() {},
        unref() { unrefCalled = true; },
      };
    };

    launchImportUrl(url, { platform, spawn });

    assert.deepEqual(calls, [[
      expectedCommand,
      expectedArgs,
      { detached: true, stdio: 'ignore' },
    ]]);
    assert.equal(unrefCalled, true);
  }
});

test('runCli prints the overridden URL and print-only skips browser launch', async () => {
  let stdout = '';
  let stderr = '';
  let spawnCalled = false;

  const exitCode = await runCli(
    ['--base-url', 'http://127.0.0.1:5173/', '--print-only'],
    {
      stdin: Readable.from([JSON.stringify(payload)]),
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      spawn() { spawnCalled = true; },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(stdout.startsWith('http://127.0.0.1:5173/#oddenova='), true);
  assert.deepEqual(decodeImportUrl(stdout.trim()), payload);
  assert.equal(stderr, '');
  assert.equal(spawnCalled, false);
});

test('runCli default output is a summary with a fallback file, never the full URL', async () => {
  let stdout = '';
  let stderr = '';

  const exitCode = await runCli([], {
    stdin: Readable.from([JSON.stringify(payload)]),
    stdout: { write(chunk) { stdout += chunk; } },
    stderr: { write(chunk) { stderr += chunk; } },
    platform: 'linux',
    spawn() { throw new Error('launcher unavailable'); },
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.includes('#oddenova='), false);
  assert.match(stdout, /Opening oddeNova import in the browser \(project project-1, URL [\d.]+ KiB\)\./);
  assert.match(stdout, /If the browser did not open, open this file: .*oddenova-import-project-1\.html/);
  assert.match(stderr, /Warning: Could not open browser: launcher unavailable/);

  const fallbackPath = stdout.match(/open this file: (.*)\n/)[1];
  const html = readFileSync(fallbackPath, 'utf8');
  const href = html.match(/<a href="([^"]+)">/)[1];
  assert.deepEqual(decodeImportUrl(href), payload);
  rmSync(fallbackPath, { force: true });
});

test('writeFallbackLinkFile sanitizes the project id and escapes the URL', () => {
  const writes = [];
  const path = writeFallbackLinkFile('https://example.com/#oddenova=z:abc"<>&', 'a/b:c', {
    directory: '/fake',
    writeFile: (...args) => writes.push(args),
  });

  assert.equal(path, join('/fake', 'oddenova-import-a-b-c.html'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], path);
  assert.equal(writes[0][1].includes('z:abc&quot;&lt;&gt;&amp;'), true);
  assert.equal(writes[0][1].includes('z:abc"'), false);
});

test('isMainModule matches through a symlinked entry path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddenova-symlink-'));
  const link = join(dir, 'open-in-oddenova.mjs');
  try {
    symlinkSync(scriptPath, link);

    // Node resolves the symlink for import.meta.url but leaves argv[1] as the
    // symlink path — the exact mismatch that used to make the CLI a silent no-op.
    assert.equal(isMainModule(new URL(`file://${scriptPath}`).href, link), true);
    assert.equal(isMainModule(new URL(`file://${scriptPath}`).href, scriptPath), true);
    assert.equal(isMainModule(new URL(`file://${scriptPath}`).href, undefined), false);
    assert.equal(isMainModule(new URL(`file://${scriptPath}`).href, join(dir, 'missing.mjs')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI runs end-to-end when invoked through a symlinked path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddenova-symlink-cli-'));
  const link = join(dir, 'open-in-oddenova.mjs');
  try {
    symlinkSync(scriptPath, link);

    const stdout = execFileSync('node', [link, '--print-only'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });

    assert.equal(stdout.startsWith('https://www.oddenova.com/#oddenova='), true);
    assert.deepEqual(decodeImportUrl(stdout.trim()), payload);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SKILL creation example is a valid protocol payload with parseable JavaScript', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const exampleBlock = skill.match(/<<'JSON'\n([\s\S]*?)\nJSON/);

  assert.ok(exampleBlock, 'expected a JSON here-document in SKILL.md');
  const example = JSON.parse(exampleBlock[1]);
  assert.equal(example.protocolVersion, 1);
  assert.equal(example.source, 'oddenova-strudel-skill');
  assert.doesNotThrow(() => new Function(example.code));
});
