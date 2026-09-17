import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { appendSubmission, atomicWriteJson, makeSnapshot, readJson } from './bridge-core.mjs';

function turn(number) {
  return {
    protocolVersion: 2,
    source: 'oddenova-strudel-skill',
    baseUrl: 'https://www.oddenova.com',
    projectId: 'p-1',
    turnId: `turn-${number}`,
    title: 'Piece',
    code: `stack(s("bd*${number}"))`,
    messages: [
      { role: 'user', content: `request ${number}` },
      { role: 'assistant', content: `summary ${number}` },
    ],
    locale: 'en',
  };
}

test('three incremental turns produce one six-message revisioned snapshot', () => {
  let project;
  for (let number = 1; number <= 3; number += 1) project = appendSubmission(project, turn(number), 1000 * number).project;
  const snapshot = makeSnapshot(project);
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.messages.length, 6);
  assert.equal(new Set(snapshot.messages.map((message) => message.id)).size, 6);
  assert.equal(snapshot.code, turn(3).code);
});

test('same turn retry is idempotent and changed reuse is rejected', () => {
  const first = appendSubmission(undefined, turn(1));
  const retry = appendSubmission(first.project, turn(1));
  assert.equal(retry.repeated, true);
  assert.equal(retry.project.revision, 1);
  assert.equal(retry.project.messages.length, 2);
  assert.throws(() => appendSubmission(first.project, { ...turn(1), code: 'changed' }), /different content/);
});

test('atomic JSON writes leave a parseable latest cache', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'oddenova-cache-'));
  const path = join(directory, 'projects', 'p.json');
  try {
    await atomicWriteJson(path, { revision: 1 });
    await atomicWriteJson(path, { revision: 2, messages: ['ok'] });
    assert.deepEqual(await readJson(path), { revision: 2, messages: ['ok'] });
    assert.doesNotThrow(() => JSON.parse(readFileSync(path, 'utf8')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
