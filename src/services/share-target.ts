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

export async function shareUrl(url: string): Promise<ShareTargetResult> {
  const nav = globalThis.navigator;

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return 'copied';
    } catch {
      // Fall through to the legacy path for insecure localhost/IP previews.
    }
  }

  if (legacyCopy(url)) return 'copied';

  if (nav?.share) {
    await nav.share({ url });
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
