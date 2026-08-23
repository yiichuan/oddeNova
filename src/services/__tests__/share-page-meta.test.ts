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
      title: '雨夜里的松弛 Lo-fi',
      url: 'https://oddenova.com/s/abc123',
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('property="og:title" content="雨夜里的松弛 Lo-fi"');
    expect(html).toContain('name="twitter:title" content="雨夜里的松弛 Lo-fi"');
    expect(html).toContain('content="oddeNova 即兴 vibe 音乐，让灵感，自由发声"');
    expect(html).toContain('property="og:url" content="https://oddenova.com/s/abc123"');
    expect(html).toContain('property="og:image" content="https://www.oddenova.com/oddenova-og.png?v=c1189f30"');
    expect(html).toContain('name="twitter:image" content="https://www.oddenova.com/oddenova-og.png?v=c1189f30"');
    expect(html).toContain('<title>雨夜里的松弛 Lo-fi</title>');
  });

  it('uses English share metadata for en payloads', () => {
    const html = renderShareHtml(baseHtml, {
      locale: 'en',
      title: 'Rainy Night Lo-fi',
      url: 'https://oddenova.com/s/abc123',
    });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('property="og:title" content="Rainy Night Lo-fi"');
    expect(html).toContain('name="twitter:title" content="Rainy Night Lo-fi"');
    expect(html).toContain('name="description"\n      content="oddeNova Plain text → Rich music"');
    expect(html).toContain('property="og:description"\n      content="oddeNova Plain text → Rich music"');
    expect(html).toContain('name="twitter:description"\n      content="oddeNova Plain text → Rich music"');
    expect(html).toContain('property="og:url" content="https://oddenova.com/s/abc123"');
    expect(html).toContain('<title>Rainy Night Lo-fi</title>');
  });

  it('uses the brand fallback title when share metadata has no title', () => {
    const html = renderShareHtml(baseHtml, {
      url: 'https://oddenova.com/s/old123',
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('property="og:title" content="oddeNova | Vibe Your Music, Live"');
    expect(html).toContain('content="oddeNova 即兴 vibe 音乐，让灵感，自由发声"');
  });
});
