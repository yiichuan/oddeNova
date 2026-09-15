import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const SECTIONS = [
  'scope',
  'account',
  'content',
  'ai',
  'integrations',
  'analytics',
  'processors',
  'sharing',
  'retention',
  'choices',
  'security',
  'minors',
];

describe('privacy policy page', () => {
  it('registers a shared route middleware on both dev and preview servers', async () => {
    const source = await readFile('vite.config.ts', 'utf8');
    const middleware = await readFile('server/privacy-route.ts', 'utf8');

    expect(source).toContain("privacy: resolve(__dirname, 'privacy.html')");
    expect(source).toContain('privacyRouteMiddleware');
    // The dev/preview alias exists for both servers Vercel rewrites do not reach.
    expect(source).toContain('configureServer');
    expect(source).toContain('configurePreviewServer');
    // The alias middleware itself must always call next(); the regression test
    // exercises the behaviour directly, this only guards against regressions
    // that remove the shared implementation from the config.
    expect(middleware).toContain('next()');
    expect(middleware).toContain('/privacy.html');
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
    // Both language blocks carry the full section list, numbered alike, and
    // every section has non-empty content after its heading.
    for (const anchor of SECTIONS) {
      expect(source).toContain(`id="zh-${anchor}"`);
      expect(source).toContain(`id="en-${anchor}"`);
      expect(source).toContain(`href="#zh-${anchor}"`);
      expect(source).toContain(`href="#en-${anchor}"`);
    }
    for (const match of source.matchAll(/<h2 id="(?:zh|en)-[a-z]+">[\s\S]*?<\/h2>([\s\S]*?)(?=<h2 |<\/section>)/g)) {
      expect(match[1].trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps contact and date fields present in the visible body', async () => {
    const source = await readFile('privacy.html', 'utf8');

    // The date fields must appear as readable text, not only inside comments.
    expect(source).toContain('oddenova@gmail.com');
    expect(source).toContain('href="mailto:oddenova@gmail.com"');
    expect(source).toContain('生效日期：2026年9月15日 · 最后更新：2026年9月15日');
    expect(source).not.toContain('【正式生效日期】');
    expect(source).not.toContain('【最后更新日期】');
    expect(source).not.toMatch(/airjelly/i);
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
