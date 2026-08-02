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

  it('proxies PostHog ingestion before the SPA fallback without breaking share pages', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(config.rewrites).toEqual([
      {
        source: '/s/:id',
        destination: '/api/share-page?id=:id',
      },
      {
        source: '/_nova/static/:path(.*)',
        destination: 'https://us-assets.i.posthog.com/static/:path',
      },
      {
        source: '/_nova/array/:path(.*)',
        destination: 'https://us-assets.i.posthog.com/array/:path',
      },
      {
        source: '/_nova/:path(.*)',
        destination: 'https://us.i.posthog.com/:path',
      },
      {
        source: '/(.*)',
        destination: '/index.html',
      },
    ]);
  });

  it('registers independent primary and repair daily-suggestion cron windows', async () => {
    const apiFiles = await readdir('api');
    const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(apiFiles).toContain('daily-suggestions-repair.ts');
    expect(vercelConfig.crons).toEqual(expect.arrayContaining([
      {
        path: '/api/daily-suggestions-generate',
        schedule: '0 13 * * *',
      },
      {
        path: '/api/daily-suggestions-repair',
        schedule: '0 16 * * *',
      },
    ]));
  });
});
