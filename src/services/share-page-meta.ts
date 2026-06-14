import type { ShareLocale } from './share';

const SHARE_TITLE = 'oddeNova | Vibe Your Music, Live';
const SHARE_IMAGE = 'https://www.oddenova.com/oddenova-og.png?v=c1189f30';

const SHARE_DESCRIPTIONS: Record<ShareLocale, string> = {
  'zh-CN': '即兴 vibe 音乐，让灵感，自由发声',
  en: 'Plain text → Rich music',
};

interface RenderShareHtmlOptions {
  locale?: ShareLocale;
  url: string;
}

function normalizeLocale(locale: unknown): ShareLocale {
  return locale === 'en' ? 'en' : 'zh-CN';
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceMeta(html: string, selector: string, value: string): string {
  const escaped = escapeHtmlAttr(value);
  const pattern = new RegExp(`(<meta\\b(?=[^>]*${selector})[^>]*\\bcontent=")[^"]*("[^>]*>)`, 'i');
  const replaced = html.replace(pattern, `$1${escaped}$2`);
  if (replaced !== html) {
    return replaced;
  }
  return html.replace(/<\/head>/i, `    <meta ${selector} content="${escaped}" />\n  </head>`);
}

export function renderShareHtml(html: string, options: RenderShareHtmlOptions): string {
  const locale = normalizeLocale(options.locale);
  const description = SHARE_DESCRIPTIONS[locale];

  let out = html.replace(/<html\b[^>]*>/i, `<html lang="${locale}">`);
  out = out.replace(/<title>.*?<\/title>/i, `<title>${SHARE_TITLE}</title>`);
  out = replaceMeta(out, 'name="description"', description);
  out = replaceMeta(out, 'property="og:title"', SHARE_TITLE);
  out = replaceMeta(out, 'property="og:description"', description);
  out = replaceMeta(out, 'property="og:url"', options.url);
  out = replaceMeta(out, 'property="og:image"', SHARE_IMAGE);
  out = replaceMeta(out, 'name="twitter:title"', SHARE_TITLE);
  out = replaceMeta(out, 'name="twitter:description"', description);
  out = replaceMeta(out, 'name="twitter:image"', SHARE_IMAGE);
  return out;
}
