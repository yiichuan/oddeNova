export type GoogleOAuthErrorKey =
  | 'authErrorGoogleCancelled'
  | 'authErrorGoogleFailed'
  | 'authErrorGoogleIdentityConflict';

const PENDING_KEY = 'oddenova_google_oauth_pending_at';
const PENDING_TTL_MS = 15 * 60_000;
const OAUTH_ERROR_KEYS = ['error', 'error_code', 'error_description'] as const;

export function markGoogleOAuthPending(): void {
  window.sessionStorage.setItem(PENDING_KEY, String(Date.now()));
}

export function clearGoogleOAuthPending(): void {
  window.sessionStorage.removeItem(PENDING_KEY);
}

function getHashSegmentKey(segment: string): string {
  const rawKey = segment.split('=', 1)[0].replace(/\+/g, ' ');
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
}

function hasFreshPendingMarker(): boolean {
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  const startedAt = raw ? Number(raw) : Number.NaN;

  if (!Number.isFinite(startedAt) || Date.now() - startedAt > PENDING_TTL_MS) {
    clearGoogleOAuthPending();
    return false;
  }

  return true;
}

export function consumeGoogleOAuthReturn(): GoogleOAuthErrorKey | null {
  if (!hasFreshPendingMarker()) return null;

  const url = new URL(window.location.href);
  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(rawHash);
  const error = hashParams.get('error');
  const errorCode = hashParams.get('error_code');
  if (!error && !errorCode) return null;

  clearGoogleOAuthPending();
  const remainingHash = rawHash
    .split('&')
    .filter((segment) => {
      const key = getHashSegmentKey(segment);
      return !OAUTH_ERROR_KEYS.some((oauthKey) => oauthKey === key);
    })
    .join('&');
  url.hash = remainingHash ? `#${remainingHash}` : '';
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );

  const code = errorCode ?? error;
  if (code === 'access_denied') return 'authErrorGoogleCancelled';
  if (code === 'identity_already_exists' || code === 'email_exists') {
    return 'authErrorGoogleIdentityConflict';
  }
  return 'authErrorGoogleFailed';
}
