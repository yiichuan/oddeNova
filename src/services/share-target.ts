export type ShareTargetResult = 'copied';

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

  throw new Error('Share target unavailable');
}
