import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

import {
  buildImportUrl,
  defaultCacheDir,
  fitPayloadToUrl,
  isMainModule,
  launchImportUrl,
  runCli,
  writeFallbackLinkFile,
} from './open-in-oddenova.mjs';

const scriptPath = fileURLToPath(new URL('./open-in-oddenova.mjs', import.meta.url));
const payload = {
  protocolVersion: 2,
  source: 'oddenova-strudel-skill',
  projectId: 'project-1',
  turnId: 'turn-1',
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
  assert.equal(encoded.startsWith('z:'), true);
  return JSON.parse(inflateRawSync(Buffer.from(encoded.slice(2), 'base64url')).toString('utf8'));
}

test('explicit v1 link preserves all messages and Unicode', () => {
  const legacy = { ...payload, protocolVersion: 1 };
  delete legacy.turnId;
  const { payload: fitted, url } = fitPayloadToUrl(legacy);
  assert.deepEqual(fitted, legacy);
  assert.deepEqual(decodeImportUrl(url), legacy);
});

test('explicit link refuses oversized content instead of truncating history', () => {
  const oversized = { ...payload, messages: [{ role: 'user', content: Buffer.from(crypto.getRandomValues(new Uint8Array(40_000))).toString('base64') }] };
  assert.throws(() => fitPayloadToUrl(oversized), /use the local v2 connection/);
});

test('launchImportUrl selects a detached platform command', () => {
  const calls = [];
  let unref = false;
  launchImportUrl('https://example.com', {
    platform: 'darwin',
    spawn: (...args) => ({ once() { calls.push(args); }, unref() { unref = true; } }),
  });
  assert.deepEqual(calls, [['open', ['https://example.com'], { detached: true, stdio: 'ignore' }]]);
  assert.equal(unref, true);
});

test('--print-only is an explicit legacy link and never launches a browser', async () => {
  let stdout = '';
  let stderr = '';
  let launched = false;
  const exitCode = await runCli(['--print-only'], {
    stdin: Readable.from([JSON.stringify(payload)]),
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } },
    spawn() { launched = true; },
  });
  assert.equal(exitCode, 0);
  assert.equal(decodeImportUrl(stdout.trim()).protocolVersion, 1);
  assert.equal(stderr, '');
  assert.equal(launched, false);
});

test('fallback files sanitize project ids and escape credentials', () => {
  const writes = [];
  const path = writeFallbackLinkFile('https://example.com/#secret="<>&', 'a/b:c', {
    directory: '/fake',
    writeFile: (...args) => writes.push(args),
  });
  assert.equal(path, join('/fake', 'oddenova-import-a-b-c.html'));
  assert.match(writes[0][1], /&quot;&lt;&gt;&amp;/);
});

test('cache locations are OS user-cache directories', () => {
  assert.equal(defaultCacheDir('darwin', '/Users/me', {}), '/Users/me/Library/Caches/oddenova-strudel');
  assert.equal(defaultCacheDir('linux', '/home/me', {}), '/home/me/.cache/oddenova-strudel');
  assert.equal(defaultCacheDir('linux', '/home/me', { XDG_CACHE_HOME: '/cache' }), '/cache/oddenova-strudel');
});

test('main-module detection works through installed symlinks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'oddenova-symlink-'));
  const link = join(directory, 'open-in-oddenova.mjs');
  try {
    symlinkSync(scriptPath, link);
    assert.equal(isMainModule(new URL(`file://${scriptPath}`).href, link), true);
    const stdout = execFileSync('node', [link, '--print-only'], { input: JSON.stringify(payload), encoding: 'utf8' });
    assert.equal(decodeImportUrl(stdout.trim()).protocolVersion, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SKILL example is a valid v2 incremental turn with parseable code', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const block = skill.match(/<<'JSON'\n([\s\S]*?)\nJSON/);
  assert.ok(block);
  const example = JSON.parse(block[1]);
  assert.equal(example.protocolVersion, 2);
  assert.equal(example.messages.length, 2);
  assert.equal(typeof example.turnId, 'string');
  assert.doesNotThrow(() => new Function(example.code));
});
