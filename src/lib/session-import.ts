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

export async function importGuestSessions(
  items: Session[],
  importSession: (session: Session) => Promise<void>,
  deleteGuestSession: (id: string) => Promise<void>,
  normalizeGuestSession: (session: Session) => Promise<Session> = normalizeGuestSessionForImport,
): Promise<{ remaining: Session[]; error: unknown | null }> {
  for (const [index, item] of items.entries()) {
    let normalized = item;
    try {
      normalized = await normalizeGuestSession(item);
      await importSession(normalized);
      await deleteGuestSession(normalized.id);
    } catch (error) {
      return { remaining: [normalized, ...items.slice(index + 1)], error };
    }
  }

  return { remaining: [], error: null };
}

export function getNextImportPromptUserMarker(
  currentUserId: string | null,
  checkedUserId: string | null,
): string | null {
  return currentUserId ? checkedUserId : null;
}
