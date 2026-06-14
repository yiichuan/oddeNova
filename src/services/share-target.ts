import { t } from '../lib/i18n';

export type ShareTargetResult = 'copied' | 'shared' | 'shown';

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

async function nativeShare(url: string): Promise<boolean> {
  const nav = globalThis.navigator;
  if (!nav?.share) return false;
  try {
    await nav.share({ url });
    return true;
  } catch {
    // Fall through to copy/prompt fallbacks when native sharing is unavailable
    // for the current browser context.
    return false;
  }
}

export async function shareUrl(url: string): Promise<ShareTargetResult> {
  const nav = globalThis.navigator;
  const shouldPreferNativeShare = prefersNativeShare();
  let triedNativeShare = false;

  if (shouldPreferNativeShare) {
    triedNativeShare = true;
    if (await nativeShare(url)) {
      return 'shared';
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return 'copied';
    } catch {
      // Fall through to the legacy path for insecure localhost/IP previews.
    }
  }

  if (legacyCopy(url)) return 'copied';

  if (!triedNativeShare && await nativeShare(url)) {
    return 'shared';
  }

  if (typeof globalThis.prompt === 'function') {
    globalThis.prompt(t('copyShareLink'), url);
    return 'shown';
  }

  throw new Error(
    `Share target unavailable: clipboard=${Boolean(nav?.clipboard?.writeText)}, nativeShare=${Boolean(nav?.share)}, prompt=false`
  );
}
