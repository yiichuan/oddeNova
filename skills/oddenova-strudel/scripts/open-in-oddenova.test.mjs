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
  pullWithOptionalReconnect,
  runCli,
  writeFallbackLinkFile,
} from './open-in-oddenova.mjs';

const scriptPath = fileURLToPath(new URL('./open-in-oddenova.mjs', import.meta.url));
const payload = {
  protocolVersion: 3,
  source: 'oddenova-strudel-skill',
  projectId: 'project-1',
  turnId: 'turn-1',
  baseRevision: 0,
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

function makeWriter() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; } },
    read: () => value,
  };
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
  assert.throws(() => fitPayloadToUrl(oversized), /use the local v3 connection/);
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

test('pull requires page-confirmed freshness and keeps ordinary pull read-only', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  let launched = false;
  let fallbackWritten = false;
  const result = await runCli(['--pull'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1', baseUrl: 'https://example.com/' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    request: async () => ({ status: 'ready', freshness: 'cached', snapshot: { revision: 1 } }),
    launch() { launched = true; },
    writeFallback() { fallbackWritten = true; return '/tmp/fallback.html'; },
  });

  assert.equal(result, 2);
  assert.deepEqual(JSON.parse(stdout.read().trim()), { status: 'ready', freshness: 'cached', snapshot: { revision: 1 } });
  assert.equal(stderr.read(), '');
  assert.equal(launched, false);
  assert.equal(fallbackWritten, false);
});

test('ordinary pull returns page_unavailable without reopening or launching', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  const calls = [];
  const exitCode = await runCli(['--pull'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      return { status: 'page_unavailable', freshness: 'cached' };
    },
    launch() { throw new Error('launch should not be called'); },
    writeFallback() { throw new Error('fallback should not be written'); },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(JSON.parse(stdout.read().trim()), { status: 'page_unavailable', freshness: 'cached' });
  assert.equal(stderr.read(), '');
  assert.deepEqual(calls.map(({ path }) => path), ['/v3/read']);
});

test('a page-confirmed pull returns immediately without opening a pairing entry', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  const calls = [];
  const exitCode = await runCli(['--pull', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      return { status: 'ready', freshness: 'page_confirmed', confirmedAt: 42 };
    },
    launch() { throw new Error('launch should not be called'); },
    writeFallback() { throw new Error('fallback should not be written'); },
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.read(), '{"status":"ready","freshness":"page_confirmed","confirmedAt":42}\n');
  assert.equal(stderr.read(), '');
  assert.deepEqual(calls.map(({ path }) => path), ['/v3/read']);
});

test('auto reconnect reopens once and waits for a page-confirmed pull', async () => {
  const runtime = { protocols: [3] };
  const identity = { projectId: 'project-1', baseUrl: 'https://example.com' };
  const confirmed = { status: 'ready', freshness: 'page_confirmed', confirmedAt: 42, snapshot: { revision: 1 } };
  const responses = [
    { status: 'page_unavailable', freshness: 'cached', snapshot: { revision: 1 } },
    confirmed,
  ];
  const calls = [];
  const sleeps = [];
  const launches = [];
  const fallbacks = [];
  const stderr = makeWriter();
  let now = 0;
  const result = await pullWithOptionalReconnect(runtime, identity, { autoReconnect: true }, {
    stderr: stderr.stream,
    now: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    request: async (_runtime, path, options) => {
      calls.push({ path, method: options.method, body: structuredClone(options.body) });
      if (path === '/v3/reopen') return { bootstrapUrl: 'https://example.com/#pairing-secret' };
      return responses.shift();
    },
    launch: (url) => launches.push(url),
    writeFallback: (url, projectId) => {
      fallbacks.push({ url, projectId });
      return '/tmp/oddenova-import-project-1.html';
    },
  });

  assert.deepEqual(result, confirmed);
  assert.deepEqual(calls, [
    { path: '/v3/read', method: 'POST', body: identity },
    { path: '/v3/reopen', method: 'POST', body: identity },
    { path: '/v3/read', method: 'POST', body: identity },
  ]);
  assert.deepEqual(sleeps, [1_000]);
  assert.deepEqual(launches, ['https://example.com/#pairing-secret']);
  assert.deepEqual(fallbacks, [{ url: 'https://example.com/#pairing-secret', projectId: 'project-1' }]);
  assert.match(stderr.read(), /automatic reconnect/i);
  assert.match(stderr.read(), /oddenova-import-project-1\.html/);
  assert.doesNotMatch(stderr.read(), /pairing-secret/);
});

test('auto reconnect pull accepts either flag order and emits one normalized JSON result', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  const calls = [];
  const exitCode = await runCli(['--auto-reconnect', '--pull'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1', baseUrl: 'https://example.com/bridge///?ignored=yes#ignored' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      return { status: 'not_found', freshness: 'none' };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.read(), '{"status":"not_found","freshness":"none"}\n');
  assert.equal(stderr.read(), '');
  assert.deepEqual(calls, [{ path: '/v3/read', body: { projectId: 'project-1', baseUrl: 'https://example.com/bridge' } }]);
});

test('--auto-reconnect rejects non-pull commands before starting the bridge', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  let started = false;
  const exitCode = await runCli(['--status', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => { started = true; return { protocols: [3] }; },
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.read(), '');
  assert.equal(stderr.read(), '--auto-reconnect can only be used with --pull\n');
  assert.equal(started, false);
});

test('--auto-reconnect cannot be combined with legacy link mode', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  let started = false;
  let launched = false;
  const exitCode = await runCli(['--link', '--pull', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify(payload)]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => { started = true; return { protocols: [3] }; },
    spawn() { launched = true; },
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.read(), '');
  assert.equal(stderr.read(), '--auto-reconnect can only be used with --pull\n');
  assert.equal(started, false);
  assert.equal(launched, false);
});

test('auto reconnect stops immediately when the page reports busy', async () => {
  const identity = { projectId: 'project-1', baseUrl: 'https://example.com' };
  const calls = [];
  let now = 0;
  const stderr = makeWriter();
  const result = await pullWithOptionalReconnect({ protocols: [3] }, identity, { autoReconnect: true }, {
    stderr: stderr.stream,
    now: () => now,
    sleep: async (ms) => { now += ms; },
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      if (path === '/v3/reopen') return { bootstrapUrl: 'https://example.com/#pairing-secret' };
      return calls.length === 1
        ? { status: 'page_unavailable', freshness: 'cached' }
        : { status: 'busy', freshness: 'cached' };
    },
    launch() {},
    writeFallback: () => '/tmp/fallback.html',
  });

  assert.deepEqual(result, { status: 'busy', freshness: 'cached' });
  assert.deepEqual(calls.map(({ path }) => path), ['/v3/read', '/v3/reopen', '/v3/read']);
  assert.equal(stderr.read().includes('timed out'), false);
});

test('auto reconnect does not accept a cached ready response as confirmation', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  const calls = [];
  let now = 0;
  const exitCode = await runCli(['--pull', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    now: () => now,
    sleep: async (ms) => { now += ms; },
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      if (path === '/v3/reopen') return { bootstrapUrl: 'https://example.com/#pairing-secret' };
      return calls.length === 1
        ? { status: 'page_unavailable', freshness: 'cached' }
        : { status: 'ready', freshness: 'cached' };
    },
    launch() {},
    writeFallback: () => '/tmp/fallback.html',
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.read(), '{"status":"ready","freshness":"cached"}\n');
  assert.doesNotMatch(stderr.read(), /timed out/);
  assert.deepEqual(calls.map(({ path }) => path), ['/v3/read', '/v3/reopen', '/v3/read']);
});

test('browser launch failure is best effort and does not stop confirmation polling', async () => {
  const identity = { projectId: 'project-1', baseUrl: 'https://example.com' };
  const stderr = makeWriter();
  let now = 0;
  let readCount = 0;
  const result = await pullWithOptionalReconnect({ protocols: [3] }, identity, { autoReconnect: true }, {
    stderr: stderr.stream,
    now: () => now,
    sleep: async (ms) => { now += ms; },
    request: async (_runtime, path) => {
      if (path === '/v3/reopen') return { bootstrapUrl: 'https://example.com/#pairing-secret' };
      readCount += 1;
      return readCount === 1
        ? { status: 'page_unavailable', freshness: 'cached' }
        : { status: 'ready', freshness: 'page_confirmed' };
    },
    launch() { throw new Error('spawn denied'); },
    writeFallback: () => '/tmp/oddenova-import-project-1.html',
  });

  assert.deepEqual(result, { status: 'ready', freshness: 'page_confirmed' });
  assert.match(stderr.read(), /Warning: Could not open browser: spawn denied/);
  assert.match(stderr.read(), /oddenova-import-project-1\.html/);
  assert.doesNotMatch(stderr.read(), /pairing-secret/);
});

test('auto reconnect returns the last unavailable result at the fake 30 second deadline', async () => {
  const identity = { projectId: 'project-1', baseUrl: 'https://example.com' };
  const calls = [];
  const sleeps = [];
  let now = 0;
  const stderr = makeWriter();
  const result = await pullWithOptionalReconnect({ protocols: [3] }, identity, { autoReconnect: true }, {
    stderr: stderr.stream,
    now: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      if (path === '/v3/reopen') return { bootstrapUrl: 'https://example.com/#pairing-secret' };
      return { status: 'page_unavailable', freshness: 'cached', snapshot: { revision: 1 } };
    },
    launch() {},
    writeFallback: () => '/tmp/fallback.html',
  });

  assert.deepEqual(result, { status: 'page_unavailable', freshness: 'cached', snapshot: { revision: 1 } });
  assert.equal(calls.filter(({ path }) => path === '/v3/reopen').length, 1);
  assert.equal(calls.filter(({ path }) => path === '/v3/read').length, 30);
  assert.equal(sleeps.length, 30);
  assert.equal(Math.max(...sleeps), 1_000);
  assert.match(stderr.read(), /timed out/i);
});

test('reopen failure returns an error without launching or emitting a pull result', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  let launched = false;
  let fallbackWritten = false;
  const exitCode = await runCli(['--pull', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    request: async (_runtime, path) => {
      if (path === '/v3/read') return { status: 'page_unavailable', freshness: 'cached' };
      throw new Error('reopen failed');
    },
    launch() { launched = true; },
    writeFallback() { fallbackWritten = true; return '/tmp/fallback.html'; },
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.read(), '');
  assert.equal(stderr.read(), 'Page unavailable; attempting one automatic reconnect.\nreopen failed\n');
  assert.equal(launched, false);
  assert.equal(fallbackWritten, false);
});

test('read failure after reopening returns an error without a cached success result', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  let readStarted = false;
  let now = 0;
  const exitCode = await runCli(['--pull', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    now: () => now,
    sleep: async (ms) => { now += ms; },
    request: async (_runtime, path) => {
      if (path === '/v3/reopen') return { bootstrapUrl: 'https://example.com/#pairing-secret' };
      if (path === '/v3/read') {
        if (readStarted) throw new Error('read failed');
        readStarted = true;
        return { status: 'page_unavailable', freshness: 'cached' };
      }
      return undefined;
    },
    launch() {},
    writeFallback: () => '/tmp/fallback.html',
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.read(), '');
  assert.match(stderr.read(), /read failed/);
});

test('an old bridge reports upgrade_required without attempting reconnect', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  let requested = false;
  const exitCode = await runCli(['--pull', '--auto-reconnect'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [2] }),
    request: async () => { requested = true; return {}; },
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.read(), '{"status":"upgrade_required","freshness":"none"}\n');
  assert.equal(stderr.read(), '');
  assert.equal(requested, false);
});

test('explicit reopen keeps its existing human-readable output contract', async () => {
  const stdout = makeWriter();
  const stderr = makeWriter();
  const calls = [];
  const launches = [];
  const exitCode = await runCli(['--reopen'], {
    stdin: Readable.from([JSON.stringify({ projectId: 'project-1' })]),
    stdout: stdout.stream,
    stderr: stderr.stream,
    ensureBridge: async () => ({ protocols: [3] }),
    request: async (_runtime, path, options) => {
      calls.push({ path, body: structuredClone(options.body) });
      return { bootstrapUrl: 'https://example.com/#pairing-secret' };
    },
    launch: (url) => launches.push(url),
    writeFallback: () => '/tmp/oddenova-import-project-1.html',
  });

  assert.equal(exitCode, 0);
  assert.equal(stdout.read(), 'Opening a new connection entry page for project project-1.\nIf the browser did not open, open this file: /tmp/oddenova-import-project-1.html\n');
  assert.equal(stderr.read(), '');
  assert.deepEqual(calls, [{ path: '/v3/reopen', body: { projectId: 'project-1', baseUrl: 'https://www.oddenova.com' } }]);
  assert.deepEqual(launches, ['https://example.com/#pairing-secret']);
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

test('SKILL example is a valid v3 incremental turn with parseable code', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /open-in-oddenova\.mjs" --pull --auto-reconnect/);
  assert.match(skill, /printf [^\n]*projectId[^\n]*\| node/);
  const block = skill.match(/<<'JSON'\n([\s\S]*?)\nJSON/);
  assert.ok(block);
  const example = JSON.parse(block[1]);
  assert.equal(example.protocolVersion, 3);
  assert.equal(example.baseRevision, 0);
  assert.equal(example.messages.length, 2);
  assert.equal(typeof example.turnId, 'string');
  assert.doesNotThrow(() => new Function(example.code));
});
