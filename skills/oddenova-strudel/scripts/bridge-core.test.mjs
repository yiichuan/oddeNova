import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyPageChange, applySkillSubmission, appendSubmission, atomicWriteJson, makeSnapshot, makeSnapshotV3, readJson } from './bridge-core.mjs';

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

function v3Turn(number, baseRevision = number - 1) {
  return {
    ...turn(number),
    protocolVersion: 3,
    baseRevision,
  };
}

test('v3 merges page messages but rejects stale page title and code after a skill submission', () => {
  const first = applySkillSubmission(undefined, v3Turn(1), 1_000);
  first.project.bindingId = 'binding-1';
  const page = applyPageChange(first.project, {
    projectId: 'p-1', baseUrl: 'https://www.oddenova.com', bindingId: 'binding-1', clientId: 'page-1',
    changeId: 'change-1', baseRevision: 1, baseSkillRevision: 1, title: 'Page title', code: 'page code',
    upsertMessages: [{ id: 'page-message', role: 'user', content: 'page request', createdAt: 1_500 }],
  }, 2_000);
  const skill = applySkillSubmission(page.project, { ...v3Turn(2, 1), title: 'Skill title', code: 'skill code' }, 3_000);
  assert.equal(skill.overwroteConcurrentPageChange, true);
  const late = applyPageChange(skill.project, {
    projectId: 'p-1', baseUrl: 'https://www.oddenova.com', bindingId: 'binding-1', clientId: 'page-1',
    changeId: 'change-late', baseRevision: 2, baseSkillRevision: 1, title: 'Old page title', code: 'old page code',
    upsertMessages: [{ id: 'late-message', role: 'assistant', content: 'page summary', createdAt: 2_500 }],
  }, 4_000);
  assert.equal(late.staleContent, true);
  assert.equal(late.project.title, 'Skill title');
  assert.equal(late.project.code, 'skill code');
  assert.deepEqual(late.project.messages.map(({ id }) => id), [
    'skill:turn-1:0', 'skill:turn-1:1', 'page-message', 'skill:turn-2:0', 'skill:turn-2:1', 'late-message',
  ]);
});

test('v3 retries retain their original accepted revision and deleted messages stay deleted', () => {
  const first = applySkillSubmission(undefined, v3Turn(1), 1_000);
  first.project.bindingId = 'binding-1';
  const change = {
    projectId: 'p-1', baseUrl: 'https://www.oddenova.com', bindingId: 'binding-1', clientId: 'page-1',
    changeId: 'change-1', baseRevision: 1, baseSkillRevision: 1,
    deleteMessageIds: ['skill:turn-1:0'],
  };
  const applied = applyPageChange(first.project, change, 2_000);
  const retry = applyPageChange(applied.project, change, 3_000);
  assert.equal(retry.repeated, true);
  assert.equal(retry.acceptedRevision, 2);
  assert.equal(retry.project.revision, 2);
  const skillRetry = applySkillSubmission(retry.project, v3Turn(1), 4_000);
  assert.equal(skillRetry.repeated, true);
  assert.equal(skillRetry.acceptedRevision, 1);
  assert.equal(skillRetry.project.messages.some(({ id }) => id === 'skill:turn-1:0'), false);
});

test('changing the page binding does not change the content hash at the same revision', () => {
  const { project } = applySkillSubmission(undefined, v3Turn(1), 1_000);
  project.bindingId = 'binding-1';
  const first = makeSnapshotV3(project);
  project.bindingId = 'binding-2';
  const second = makeSnapshotV3(project);
  assert.equal(first.contentHash, second.contentHash);
  assert.notEqual(first.bindingId, second.bindingId);
});
