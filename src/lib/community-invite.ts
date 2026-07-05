// Tracks only the one-time automatic community invite exposure.
// Chat/session data is persisted separately and must not depend on this flag.
export const COMMUNITY_INVITE_SEEN_KEY = 'oddenova_community_invite_seen';

interface AutoOpenApiKeyModalInput {
  isTopWindow: boolean;
  hasApiKeyConfigured: boolean;
  hasSeenCommunityInvite: boolean;
}

export function shouldAutoOpenApiKeyModal({
  isTopWindow,
  hasApiKeyConfigured,
  hasSeenCommunityInvite,
}: AutoOpenApiKeyModalInput): boolean {
  // Embedded/share contexts should never surprise-open the settings modal.
  if (!isTopWindow) return false;

  // Missing API configuration still owns the first-run setup path; otherwise
  // configured users see the existing settings modal once for the QR invite.
  return !hasApiKeyConfigured || !hasSeenCommunityInvite;
}

export function hasSeenCommunityInvite(storage: Storage = localStorage): boolean {
  return storage.getItem(COMMUNITY_INVITE_SEEN_KEY) === '1';
}

export function markCommunityInviteSeen(storage: Storage = localStorage): void {
  storage.setItem(COMMUNITY_INVITE_SEEN_KEY, '1');
}
