import { t } from '../lib/i18n';

export type ShareTargetResult = 'cancelled' | 'copied' | 'shared' | 'shown';

type NativeShareResult = 'cancelled' | 'failed' | 'shared';

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';

  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function prefersNativeShare(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;
}

async function nativeShare(url: string, title: string): Promise<NativeShareResult> {
  const nav = globalThis.navigator;
  if (!nav?.share) return 'failed';
  try {
    await nav.share({ title, url });
    return 'shared';
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      return 'cancelled';
    }
    // Fall through to copy/prompt fallbacks when native sharing is unavailable
    // for the current browser context.
    return 'failed';
  }
}

export async function shareUrl(url: string, title: string): Promise<ShareTargetResult> {
  const nav = globalThis.navigator;
  const shareText = `${url}\n${title}`;
  const shouldPreferNativeShare = prefersNativeShare();
  let triedNativeShare = false;

  if (shouldPreferNativeShare) {
    triedNativeShare = true;
    const result = await nativeShare(url, title);
    if (result !== 'failed') return result;
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(shareText);
      return 'copied';
    } catch {
      // Fall through to the legacy path for insecure localhost/IP previews.
    }
  }

  if (legacyCopy(shareText)) return 'copied';

  if (!triedNativeShare) {
    const result = await nativeShare(url, title);
    if (result !== 'failed') return result;
  }

  if (typeof globalThis.prompt === 'function') {
    globalThis.prompt(t('copyShareLink'), shareText);
    return 'shown';
  }

  throw new Error(
    `Share target unavailable: clipboard=${Boolean(nav?.clipboard?.writeText)}, nativeShare=${Boolean(nav?.share)}, prompt=false`
  );
}
