import type { Session } from '../hooks/useSessions';
import { normalizeGuestSessionForImport } from './session-storage';

function hasImportableContent(session: Session): boolean {
  return session.messages.some((message) => !message.isGreeting) || Boolean(session.code);
}

export function collectImportableGuestSessions(
  persisted: Session[],
  inMemory: Session[],
): Session[] {
  const seen = new Set<string>();
  const out: Session[] = [];

  for (const session of [...persisted, ...inMemory]) {
    if (seen.has(session.id) || !hasImportableContent(session)) continue;
    seen.add(session.id);
    out.push(session);
  }

  return out;
}

/**
 * Move every guest session into the signed-in account, one at a time.
 *
 * Every item is attempted, in order, whether or not an earlier one failed.
 * The first version of this stopped at the first failure and left the rest of
 * the list untried — one item a server would never accept (a payload it
 * rejects outright, say) then stood in front of everything behind it, and the
 * caller's own retry re-ran the same doomed item forever. `remaining` now
 * means exactly what it says: the sessions that did not make it in, in their
 * original relative order, not "the failed one and everything after it."
 *
 * A session is deleted from guest storage only once it is actually in the
 * account — the same guarantee as before, just no longer gated on being the
 * first thing tried.
 */
export async function importGuestSessions(
  items: Session[],
  importSession: (session: Session) => Promise<void>,
  deleteGuestSession: (id: string) => Promise<void>,
  normalizeGuestSession: (session: Session) => Promise<Session> = normalizeGuestSessionForImport,
): Promise<{ remaining: Session[]; error: unknown | null }> {
  const remaining: Session[] = [];
  let error: unknown | null = null;

  for (const item of items) {
    let normalized = item;
    try {
      normalized = await normalizeGuestSession(item);
      await importSession(normalized);
      await deleteGuestSession(normalized.id);
    } catch (err) {
      // The normalized id is what has to be retried under, not the original
      // guest id — a second attempt must not re-normalize an id that has
      // already been claimed.
      remaining.push(normalized);
      error = err;
    }
  }

  return { remaining, error };
}

export function getNextImportPromptUserMarker(
  currentUserId: string | null,
  checkedUserId: string | null,
): string | null {
  return currentUserId ? checkedUserId : null;
}
