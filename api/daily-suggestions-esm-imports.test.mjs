import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const entrypoints = [
  'api/daily-suggestions.ts',
  'api/daily-suggestions-generate.ts',
  'api/cleanup.ts',
];

test('daily suggestion function entrypoints use Node ESM-resolvable core imports', async () => {
  for (const entrypoint of entrypoints) {
    const source = await readFile(entrypoint, 'utf8');
    assert.match(source, /from ['"]\.\/daily-suggestions-core\.js['"]/);
  }
});
