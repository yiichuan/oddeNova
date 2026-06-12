import { describe, expect, it } from 'vitest';
import { renderShareHtml } from '../share-page-meta';

const baseHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta
      name="description"
      content="old description"
    />
    <meta property="og:title" content="old title" />
    <meta
      property="og:description"
      content="old og description"
    />
    <meta property="og:url" content="https://oddenova.com/" />
    <meta name="twitter:title" content="old twitter title" />
    <meta
      name="twitter:description"
      content="old twitter description"
    />
    <title>old page title</title>
  </head>
  <body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>
</html>`;

describe('renderShareHtml', () => {
  it('uses Chinese share metadata for zh-CN payloads', () => {
    const html = renderShareHtml(baseHtml, {
      locale: 'zh-CN',
      url: 'https://oddenova.com/s/abc123',
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('content="oddeNova | Vibe Your Live Music"');
    expect(html).toContain('content="即兴 vibe 音乐，让灵感，自由发声"');
    expect(html).toContain('property="og:url" content="https://oddenova.com/s/abc123"');
    expect(html).toContain('<title>oddeNova | Vibe Your Live Music</title>');
  });

  it('uses English share metadata for en payloads', () => {
    const html = renderShareHtml(baseHtml, {
      locale: 'en',
      url: 'https://oddenova.com/s/abc123',
    });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('content="oddeNova | Vibe Your Live Music"');
    expect(html).toContain('name="description"\n      content="Vibes in your head -&gt; Music in your ears"');
    expect(html).toContain('property="og:description"\n      content="Vibes in your head -&gt; Music in your ears"');
    expect(html).toContain('name="twitter:description"\n      content="Vibes in your head -&gt; Music in your ears"');
    expect(html).toContain('property="og:url" content="https://oddenova.com/s/abc123"');
  });

  it('defaults old payloads without locale to Chinese metadata', () => {
    const html = renderShareHtml(baseHtml, {
      url: 'https://oddenova.com/s/old123',
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('content="即兴 vibe 音乐，让灵感，自由发声"');
  });
});
