import type { Session } from '../hooks/useSessions';

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
  importSession: (
    payload: Pick<Session, 'title' | 'code' | 'messages' | 'revisions'>,
  ) => Promise<void>,
  deleteGuestSession: (id: string) => Promise<void>,
): Promise<{ remaining: Session[]; error: unknown | null }> {
  for (const [index, item] of items.entries()) {
    try {
      await importSession({
        title: item.title,
        code: item.code,
        messages: item.messages,
        // Without these the imported turns lose their diffs: a message points
        // at a revision by id, and an unresolved id falls back to a plain
        // code badge.
        revisions: item.revisions,
      });
      await deleteGuestSession(item.id);
    } catch (error) {
      return { remaining: items.slice(index), error };
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
