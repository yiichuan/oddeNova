import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('privacy policy page', () => {
  it('is registered as a Vite build entry alongside the app pages', async () => {
    const source = await readFile('vite.config.ts', 'utf8');

    expect(source).toContain("privacy: resolve(__dirname, 'privacy.html')");
    // The dev/preview alias exists for both servers Vercel rewrites do not reach.
    expect(source).toContain('configureServer');
    expect(source).toContain('configurePreviewServer');
  });

  it('serves the complete bilingual body as plain HTML without the app bundle', async () => {
    const source = await readFile('privacy.html', 'utf8');

    expect(source).toContain('href="/src/legal/privacy.css"');
    // No React root, no app entry, no analytics: the policy must render with
    // JavaScript disabled and must not start Supabase, PostHog or WebAudio.
    expect(source).not.toMatch(/<script/i);
    expect(source).not.toContain('src/main.tsx');
    expect(source).not.toContain('posthog');
    expect(source).toContain('https://oddenova.com/privacy');
    expect(source).toContain('id="privacy-zh"');
    expect(source).toContain('id="privacy-en"');
    // Both language blocks carry the full section list, numbered alike.
    for (const anchor of ['scope', 'data', 'google', 'uses', 'ai', 'processors', 'local', 'sharing', 'retention', 'choices', 'security', 'minors']) {
      expect(source).toContain(`id="zh-${anchor}"`);
      expect(source).toContain(`id="en-${anchor}"`);
    }
  });

  it('is rewritten by the exact production rules ahead of the SPA fallback', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(config.rewrites.slice(0, 2)).toEqual([
      { source: '/privacy', destination: '/privacy.html' },
      { source: '/privacy/', destination: '/privacy.html' },
    ]);
  });
});
