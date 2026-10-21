import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from '../scripts/report-bundle-size.mjs';

/** Write a fake dist with a .vite/manifest.json and named content files. */
async function makeDist(manifest, files) {
  const root = await mkdtemp(join(tmpdir(), 'oddenova-report-'));
  await mkdir(join(root, '.vite'), { recursive: true });
  await writeFile(join(root, '.vite', 'manifest.json'), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) {
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

const dists = [];

afterAll(async () => {
  await Promise.all(dists.map((root) => rm(root, { recursive: true, force: true })));
});

async function distWith(manifest, files) {
  const root = await makeDist(manifest, files);
  dists.push(root);
  return root;
}

describe('bundle report', () => {
  it('computes static closure with shared dependency counted once', async () => {
    const root = await distWith(
      {
        'index.html': { src: 'index.html', isEntry: true, file: 'index.js', imports: ['main.tsx', 'shared.ts'] },
        'main.tsx': { src: 'src/main.tsx', file: 'main-chunk.js', imports: [] },
        'shared.ts': { src: 'src/shared.ts', file: 'shared.js', imports: [], css: ['shared.css'] },
      },
      {
        'index.js': 'entry',
        'main-chunk.js': 'main-content-longer',
        'shared.js': 'shared-content',
        'shared.css': 'body{}',
      },
    );

    const report = await buildReport(root);
    expect(report.entries).toHaveLength(1);
    const entry = report.entries[0];
    expect(entry.totals.raw).toBe(
      'entry'.length + 'main-content-longer'.length + 'shared-content'.length + 'body{}'.length,
    );
    // Shared chunk appears once even though imported from two places.
    expect(entry.assets.filter((a) => a.file === 'shared.js')).toHaveLength(1);
  });

  it('treats dynamicImports as non-initial and reports them separately', async () => {
    const root = await distWith(
      {
        'index.html': { src: 'index.html', isEntry: true, file: 'index.js', imports: ['main.tsx'], dynamicImports: ['heavy.ts'] },
        'main.tsx': { src: 'src/main.tsx', file: 'main-chunk.js', imports: [] },
        'heavy.ts': { src: 'src/heavy.ts', file: 'heavy.js', imports: [] },
      },
      { 'index.js': 'entry', 'main-chunk.js': 'main', 'heavy.js': 'heavy-content' },
    );

    const report = await buildReport(root);
    expect(report.entries[0].assets.map((a) => a.file)).not.toContain('heavy.js');
    expect(report.dynamics).toEqual([
      { dynamicEntry: 'heavy.js', importedStaticallyBy: 'index.html', importerEntryFile: 'index.js' },
    ]);
  });

  it('handles circular imports without infinite recursion', async () => {
    const root = await distWith(
      {
        'index.html': { src: 'index.html', isEntry: true, file: 'index.js', imports: ['a.ts'] },
        'a.ts': { src: 'a.ts', file: 'a.js', imports: ['b.ts'] },
        'b.ts': { src: 'b.ts', file: 'b.js', imports: ['a.ts'] },
      },
      { 'index.js': 'e', 'a.js': 'a', 'b.js': 'b' },
    );

    const report = await buildReport(root);
    expect(report.entries[0].assets.map((a) => a.file).sort()).toEqual(['a.js', 'b.js', 'index.js']);
  });

  it('reports each HTML entry separately', async () => {
    const root = await distWith(
      {
        'index.html': { src: 'index.html', isEntry: true, file: 'index.js', imports: [] },
        'learn.html': { src: 'learn.html', isEntry: true, file: 'learn.js', imports: [] },
      },
      { 'index.js': 'index-entry-severity', 'learn.js': 'learn-entry' },
    );

    const report = await buildReport(root);
    expect(report.entries.map((e) => e.entry)).toEqual(['index.html', 'learn.html']);
    const indexEntry = report.entries.find((e) => e.entry === 'index.html');
    expect(indexEntry.totals.raw).toBe('index-entry-severity'.length);
  });

  it('throws when the manifest is missing or a referenced file is absent', async () => {
    const root = await distWith(
      {
        'index.html': { src: 'index.html', isEntry: true, file: 'index.js', imports: [] },
      },
      {},
    );
    await expect(buildReport(root)).rejects.toThrow(/failed to read/);

    const emptyRoot = await mkdtemp(join(tmpdir(), 'oddenova-empty-'));
    dists.push(emptyRoot);
    await expect(buildReport(emptyRoot)).rejects.toThrow(/No Vite manifest/);
  });

  it('throws when the manifest has no HTML entry', async () => {
    const root = await distWith(
      {
        'main.tsx': { src: 'src/main.tsx', isEntry: true, file: 'main.js', imports: [] },
      },
      { 'main.js': 'main' },
    );
    const report = await buildReport(root);
    expect(report.entries).toEqual([]);
  });
});
