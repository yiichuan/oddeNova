import type { ShareLocale } from './share';

const SHARE_TITLE = 'oddeNova | Vibe Your Live Music';
const SHARE_IMAGE = 'https://oddenova.com/oddenova-og.png';

const SHARE_DESCRIPTIONS: Record<ShareLocale, string> = {
  'zh-CN': '即兴 vibe 音乐，让灵感，自由发声',
  en: 'Vibes in your head -> Music in your ears',
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
  return html.replace(pattern, `$1${escaped}$2`);
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
