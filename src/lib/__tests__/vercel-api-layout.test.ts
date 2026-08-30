import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vercel API layout', () => {
  it('keeps test files out of the serverless function directory', async () => {
    const files = await readdir('api', { recursive: true });

    expect(files.filter((file) => file.endsWith('.test.ts'))).toEqual([]);
  });

  it('stays within the intentional Hobby function budget', async () => {
    const files = (await readdir('api', { recursive: true }))
      .filter((file) => file.endsWith('.ts'));

    expect(files.sort()).toHaveLength(7);
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
        source: '/api/favorites/:id/continue',
        destination: '/api/sessions?resource=favorites&id=:id&action=continue',
      },
      {
        source: '/api/favorites/:id',
        destination: '/api/sessions?resource=favorites&id=:id',
      },
      {
        source: '/api/favorites',
        destination: '/api/sessions?resource=favorites',
      },
      {
        source: '/api/sessions/:id',
        destination: '/api/sessions?id=:id',
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
        source: '/api/daily-suggestions-generate',
        destination: '/api/daily-suggestions-maintain?trigger=primary',
      },
      {
        source: '/api/daily-suggestions-repair',
        destination: '/api/daily-suggestions-maintain?trigger=repair',
      },
      {
        source: '/((?!api/).*)',
        destination: '/index.html',
      },
    ]);
  });

  it('rewrites session routes before PostHog and SPA routes', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const continueIndex = config.rewrites.findIndex((rewrite) => rewrite.source === '/api/favorites/:id/continue');
    const favoriteItemIndex = config.rewrites.findIndex((rewrite) => rewrite.source === '/api/favorites/:id');
    const favoriteCollectionIndex = config.rewrites.findIndex((rewrite) => rewrite.source === '/api/favorites');
    const sessionIndex = config.rewrites.findIndex((rewrite) => rewrite.source === '/api/sessions/:id');
    const postHogIndex = config.rewrites.findIndex((rewrite) => rewrite.source === '/_nova/static/:path(.*)');
    const spaIndex = config.rewrites.findIndex((rewrite) => rewrite.destination === '/index.html');

    expect(continueIndex).toBeGreaterThanOrEqual(0);
    expect(favoriteItemIndex).toBeGreaterThan(continueIndex);
    expect(favoriteCollectionIndex).toBeGreaterThan(favoriteItemIndex);
    expect(sessionIndex).toBeGreaterThan(favoriteCollectionIndex);
    expect(postHogIndex).toBeGreaterThan(sessionIndex);
    expect(spaIndex).toBeGreaterThan(sessionIndex);
  });

  it('keeps public Cron windows routed to the single maintenance adapter', async () => {
    const apiFiles = await readdir('api');
    const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(apiFiles).toContain('daily-suggestions-maintain.ts');
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

  it('keeps the SPA fallback from rewriting API requests', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const spaFallback = config.rewrites.find((rewrite) => rewrite.destination === '/index.html');

    expect(spaFallback?.source).toBe('/((?!api/).*)');
  });

  it('parses collection, detail, favorite, and continue paths for the dev adapter', async () => {
    const { parseSessionApiRequest } = await import('../../../vite.config');

    expect(parseSessionApiRequest('/api/sessions', '/?limit=20')).toEqual({
      resource: 'sessions',
      query: { limit: '20', resource: 'sessions' },
    });
    expect(parseSessionApiRequest('/api/sessions', '/00000000-0000-4000-8000-000000000001')).toEqual({
      resource: 'sessions',
      query: { id: '00000000-0000-4000-8000-000000000001', resource: 'sessions' },
    });
    expect(parseSessionApiRequest('/api/favorites', '/?limit=20')).toEqual({
      resource: 'favorites',
      query: { limit: '20', resource: 'favorites' },
    });
    expect(parseSessionApiRequest('/api/favorites', '/00000000-0000-4000-8000-000000000001')).toEqual({
      resource: 'favorites',
      query: { id: '00000000-0000-4000-8000-000000000001', resource: 'favorites' },
    });
    expect(parseSessionApiRequest('/api/favorites', '/00000000-0000-4000-8000-000000000001/continue')).toEqual({
      resource: 'favorites',
      query: {
        id: '00000000-0000-4000-8000-000000000001',
        resource: 'favorites',
        action: 'continue',
      },
    });
  });

  it('keeps shared implementation outside the function directory', async () => {
    const files = (await readdir('api', { recursive: true }))
      .filter((file) => file.endsWith('.ts'));

    for (const file of files) {
      const source = await readFile(`api/${file}`, 'utf8');
      expect(source, `${file} is not an HTTP adapter`).toMatch(/export\s+default\s+/);
    }
  });
});
