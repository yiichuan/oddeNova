// Tracks only the one-time first-entry welcome exposure.
// Chat/session data is persisted separately and must not depend on this flag.
export const WELCOME_SEEN_KEY = 'oddenova_welcome_seen';

interface AutoOpenWelcomeModalInput {
  isTopWindow: boolean;
  hasSeenWelcome: boolean;
}

/**
 * Decided on the very first paint, which is why the visitor's own sign-in state
 * is not part of it: the Supabase session resolves asynchronously and would not
 * be known yet. Whether someone already signed in is checked where the window
 * renders instead.
 */
export function shouldAutoOpenWelcomeModal({
  isTopWindow,
  hasSeenWelcome,
}: AutoOpenWelcomeModalInput): boolean {
  // Embedded/share contexts should never surprise-open a sign-up prompt.
  if (!isTopWindow) return false;

  return !hasSeenWelcome;
}

export function hasSeenWelcome(storage: Storage = localStorage): boolean {
  return storage.getItem(WELCOME_SEEN_KEY) === '1';
}

export function markWelcomeSeen(storage: Storage = localStorage): void {
  storage.setItem(WELCOME_SEEN_KEY, '1');
}
