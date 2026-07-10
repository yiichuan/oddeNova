import type { Session } from '../hooks/useSessions';

function hasImportableContent(session: Session): boolean {
  return session.messages.length > 0 || Boolean(session.code);
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

export function getNextImportPromptUserMarker(
  currentUserId: string | null,
  checkedUserId: string | null,
): string | null {
  return currentUserId ? checkedUserId : null;
}
