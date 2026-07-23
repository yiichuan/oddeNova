import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vercel API layout', () => {
  it('keeps test files out of the serverless function directory', async () => {
    const files = await readdir('api', { recursive: true });

    expect(files.filter((file) => file.endsWith('.test.ts'))).toEqual([]);
  });

  it('uses Node ESM-resolvable relative imports in TypeScript functions', async () => {
    const files = (await readdir('api', { recursive: true }))
      .filter((file) => file.endsWith('.ts'));

    for (const file of files) {
      const source = await readFile(`api/${file}`, 'utf8');
      const relativeImports = source.matchAll(/from\s+['"](\.[^'"]+)['"]/g);

      for (const [, specifier] of relativeImports) {
        expect(specifier, `${file} has a non-ESM import`).toMatch(/\.js$/);
      }
    }
  });
  it('keeps the SPA fallback from rewriting API requests', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const spaFallback = config.rewrites.find((rewrite) => rewrite.destination === '/index.html');

    expect(spaFallback?.source).toBe('/((?!api/).*)');
  });
});
