import type { Session } from '../hooks/useSessions';
import { t } from './i18n';

function conversationHead(session: Session): string | undefined {
  return session.messages.findLast(message =>
    message.role !== 'progress' && !message.isGreeting && !message.id.startsWith('interrupted-'),
  )?.id;
}

export async function withSessionTurnLock<T>(
  ownerKey: string,
  session: Session | null,
  readStored: (id: string) => Promise<Session | null>,
  run: () => Promise<T>,
  locks: Pick<LockManager, 'request'> | undefined = globalThis.navigator?.locks,
): Promise<T> {
  if (!session || !locks) return run();
  const name = `oddenova:agent-turn:${JSON.stringify([ownerKey, session.id])}`;
  return locks.request(name, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error(t('agentTurnBusyInAnotherTab'));
    const stored = await readStored(session.id);
    if (stored && (
      stored.code !== session.code
      || conversationHead(stored) !== conversationHead(session)
      || stored.revisions?.at(-1)?.id !== session.revisions?.at(-1)?.id
    )) throw new Error(t('agentTurnChangedInAnotherTab'));
    return run();
  });
}
