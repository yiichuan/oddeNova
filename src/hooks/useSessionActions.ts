import { useCallback, useEffect, useMemo, useRef } from 'react';
import { deleteCloudSession } from '../services/cloud-session-repository';
import type { SessionSummary } from '../../shared/session-api';
import type { useCloudSessionLibrary } from './useCloudSessionLibrary';
import type { useSessions } from './useSessions';

type ActionErrorHandler = (error: unknown) => void;

interface SessionActionsOptions {
  ownerId?: string;
  sessions: Pick<ReturnType<typeof useSessions>,
    'sessions' | 'deleteSession' | 'renameSession' | 'flushCloudSaves'>;
  library: Pick<ReturnType<typeof useCloudSessionLibrary>,
    'history' | 'historySearch' | 'openSession' | 'removeSummary'
    | 'upsertHistorySummary' | 'refreshSearches'>;
  onError: ActionErrorHandler;
  /**
   * How a conversation is brought into working state before its name is
   * written. Opening it is the default, and opening it is also activating it,
   * which is right where the rename happens in the conversation you are
   * already in. The phone renames rows from a list it is not leaving, so it
   * hands down a read that loads the session without making it the current
   * one.
   */
  prepareForRename?: (summary: SessionSummary) => Promise<unknown>;
}

/** Owns the ordering between working Sessions, cloud summaries and search.
 * Loaded deletes are accepted immediately and keep the existing durable retry
 * queue; only its cloud-completion callback refreshes search. A delete call is
 * deliberately not a promise that could be mistaken for durable completion.
 */
export function useSessionActions({
  ownerId,
  sessions,
  library,
  onError,
  prepareForRename,
}: SessionActionsOptions) {
  // A new scope even when an account leaves and later returns. Comparing only
  // owner IDs would let a result from the previous visit affect the new one.
  const scope = useMemo(() => Symbol(ownerId), [ownerId]);
  const activeScope = useRef<symbol | null>(scope);
  useEffect(() => {
    activeScope.current = scope;
    return () => { activeScope.current = null; };
  }, [scope]);

  const deleteSession = useCallback((id: string, reportError = onError): void => {
    if (activeScope.current !== scope) return;
    if (!ownerId) {
      sessions.deleteSession(id);
      return;
    }
    if (sessions.sessions.some((session) => session.id === id)) {
      library.removeSummary(id);
      sessions.deleteSession(id, () => {
        if (activeScope.current === scope) library.refreshSearches();
      });
      return;
    }
    void deleteCloudSession(id, ownerId).then(() => {
      if (activeScope.current !== scope) return;
      library.removeSummary(id);
      library.refreshSearches();
    }).catch((error: unknown) => {
      if (activeScope.current === scope) reportError(error);
    });
  }, [library, onError, ownerId, scope, sessions]);

  const renameSession = useCallback(async (id: string, title: string): Promise<void> => {
    if (activeScope.current !== scope) return;
    if (!ownerId) {
      await sessions.renameSession(id, title);
      return;
    }
    const summary = (library.historySearch.active
      ? library.historySearch.collection.items.find((item) => item.id === id)
      : undefined)
      ?? library.history.items.find((item) => item.id === id);
    if (!summary) return;
    try {
      await (prepareForRename ?? library.openSession)(summary);
      if (activeScope.current !== scope) return;
      await sessions.renameSession(id, title);
      if (activeScope.current !== scope) return;
      library.upsertHistorySummary({ ...summary, title }, 0);
      await sessions.flushCloudSaves(id);
      if (activeScope.current === scope) library.refreshSearches();
    } catch (error) {
      if (activeScope.current === scope) onError(error);
    }
  }, [library, onError, ownerId, prepareForRename, scope, sessions]);

  return { deleteSession, renameSession };
}
