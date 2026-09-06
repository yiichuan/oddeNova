import { useEffect, useRef, useState } from 'react';
import type { SessionSummary } from '../../../shared/session-api';
import type { Session } from '../../hooks/useSessions';
import { EditIcon, SearchIcon, StarIcon, TrashIcon, XIcon } from '../icons';
import { t } from '../../lib/i18n';
import InfiniteScrollSentinel from '../common/InfiniteScrollSentinel';

/**
 * How long a kept entry stays on the list after its star fills in.
 *
 * The star is the answer to the click, and the row leaving is the consequence
 * of it. Fire both in the same frame and the row is gone before the fill can
 * be seen, which reads as the entry having been deleted rather than moved. So
 * the star fills, the row fades out under it, and only then does the entry
 * leave — long enough to read as one movement and short enough not to be a
 * wait.
 */
const KEEPING_MS = 380;

interface HistoryPanelProps {
  sessions: readonly (Session | SessionSummary)[];
  currentId: string | null;
  isLoading?: boolean;
  initialError?: Error | null;
  onRetryInitial?: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Keep this conversation: it leaves the list and turns up in Favorites. */
  onFavorite?: (id: string) => void;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  onRetryLoadMore?: () => void;
}

type HistoryItem = Session | SessionSummary;

function isCompleteSession(item: HistoryItem): item is Session {
  return 'messages' in item;
}

function compareByUpdatedAt(a: HistoryItem, b: HistoryItem): number {
  const updatedAtDifference = b.updatedAt - a.updatedAt;
  if (updatedAtDifference !== 0) return updatedAtDifference;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export default function HistoryPanel({
  sessions,
  currentId,
  isLoading = false,
  initialError = null,
  onRetryInitial,
  onSwitch,
  onDelete,
  onRename,
  onFavorite,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
  onLoadMore = () => {},
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = null,
  onRetryLoadMore = () => {},
}: HistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [keepingId, setKeepingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const keepingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  useEffect(() => () => {
    if (keepingTimerRef.current !== null) clearTimeout(keepingTimerRef.current);
  }, []);

  /* The star fills where it was clicked, the row goes with it, and the entry
     is handed over once both have been seen. */
  const keep = (session: HistoryItem) => {
    if (!onFavorite || keepingId) return;
    setKeepingId(session.id);
    keepingTimerRef.current = setTimeout(() => {
      keepingTimerRef.current = null;
      setKeepingId(null);
      onFavorite(session.id);
    }, KEEPING_MS);
  };

  const startEditing = (session: HistoryItem) => {
    cancelRef.current = false;
    setEditingId(session.id);
    setDraft(session.title || t('newSessionTitle'));
  };

  const save = (session: HistoryItem) => {
    const nextTitle = draft.trim();
    setEditingId(null);
    if (!nextTitle || nextTitle === session.title) return;
    onRename(session.id, nextTitle);
  };

  const cancel = (session: HistoryItem) => {
    cancelRef.current = true;
    setDraft(session.title || t('newSessionTitle'));
    setEditingId(null);
  };

  // Keep the presentation invariant even when a local session's updatedAt
  // changes in place after the initial load.
  const listed = [...sessions]
    .filter((session) => !isCompleteSession(session)
      || (session.messages.length > 0 && session.favoritedAt === undefined))
    .sort(compareByUpdatedAt);

  /* Titles, and the placeholder an untitled row is actually showing — the
     reader searches what is on the list, not what is behind it. Cloud rows
     arrive as summaries with no messages, so matching conversation text would
     find things in the sessions held locally and quietly miss the same words
     in the ones that are not, which is worse than a narrower search that is
     the same everywhere. */
  const needle = query.trim().toLowerCase();
  const ordered = needle
    ? listed.filter((s) => (s.title || t('newSessionTitle')).toLowerCase().includes(needle))
    : listed;
  const searchable = listed.length > 0 || needle !== '';

  return (
    <div className="flex flex-col">
      {/* The list's own head, and the one line here the reader writes rather
          than picks: a field set in the rows' 12px, on the rows' own left
          edge, sitting directly over the first of them so what is typed and
          what answers line up. Nothing is drawn around it: it is set apart by
          a fill instead, in a row's own 4px box and running a row's own width,
          so it reads as the list's first line rather than as a control parked
          on top of it. That fill is a wash over whatever ground the panel is
          standing on, and it is one value throughout — see
          `.history-search-field` in index.css. It stays put while the list
          scrolls under it — a short panel can hold a long history, and a
          filter that scrolls away stops saying why the list is short. The
          band it holds still on is opaque in the host panel's own ground: the
          sidebar overlay is drawn on the conversation surface, the top-bar
          dropdown on the page ground, and either sets --history-search-bg to
          say which. */}
      {!isLoading && !initialError && searchable && (
        <div
          className="sticky top-0 z-20 px-2 pt-2.5 pb-1.5"
          style={{ background: 'var(--history-search-bg, var(--color-conversation-surface))' }}
        >
          <div className="history-search-field flex items-center gap-1.5 rounded-[4px] px-2 py-1.5">
            <SearchIcon size={12} className="shrink-0 text-text-muted" />
            <input
              type="text"
              value={query}
              aria-label={t('historySearch')}
              data-testid="history-search-input"
              placeholder={t('historySearchHint')}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onClick={(e) => e.stopPropagation()}
              /* Escape empties the field rather than reaching the panel that
                 listens for it — while there is something in it to clear. */
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape' && query !== '') {
                  e.preventDefault();
                  setQuery('');
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-xs leading-none text-text-primary outline-none placeholder:text-text-muted"
            />
            {query !== '' && (
              <button
                type="button"
                aria-label={t('historySearchClear')}
                data-testid="history-search-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery('');
                }}
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        </div>
      )}
      <div>
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">{t('loading')}</div>
        ) : initialError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-text-muted">
            <span>{t('sessionListNetworkError')}</span>
            {onRetryInitial && (
              <button
                type="button"
                onClick={onRetryInitial}
                className="text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                {t('retry')}
              </button>
            )}
          </div>
        ) : ordered.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {needle ? t('historySearchEmpty') : t('noSessions')}
          </div>
        ) : (
          <ul className="space-y-1 py-2">
            {ordered.map((s) => {
              const active = s.id === currentId;
              const isEditing = editingId === s.id;
              const keeping = keepingId === s.id;
              const displayTitle = s.title || t('newSessionTitle');
              return (
                <li
                  key={s.id}
                  /* Fades where it stands. Nothing here is going anywhere the
                     eye can follow — the Favorites page is a whole page away —
                     so a row sliding off to one side is a direction that leads
                     nowhere, and the star filling in has already said what
                     happened. */
                  className={`px-2 transition-opacity duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
                    keeping ? 'opacity-0' : ''
                  }`}
                  data-session-keeping={keeping || undefined}
                >
                  {/* Only the selected row carries a fill. An unselected one
                      used to paint `bg-conversation-surface`, which in the
                      sidebar overlay is the panel's own ground and so was
                      never visible — but the top-bar dropdown stands on the
                      page ground, and there the same fill drew a rounded
                      plate under every row and left the selected one with
                      nothing to stand out against. Nothing scrolls under
                      these rows (the search band above is sticky and opaque
                      in the host's ground, see --history-search-bg), so they
                      have no reason to be opaque at all. */}
                  <div
                    className={`group flex items-stretch gap-2 rounded-[4px] border px-2 cursor-pointer transition-colors ${
                      active
                        ? 'border-transparent bg-[var(--color-selected-item-bg)] text-on-accent'
                        : 'border-transparent text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => onSwitch(s.id)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        aria-label="Edit session title"
                        value={draft}
                        maxLength={60}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.currentTarget.value)}
                        onBlur={() => {
                          if (cancelRef.current) {
                            cancelRef.current = false;
                            return;
                          }
                          save(s);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            save(s);
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancel(s);
                          }
                        }}
                        className="my-[5px] min-w-0 flex-1 rounded-region border border-border bg-conversation-surface px-1 py-0.5 text-xs leading-none text-text-primary outline-none focus:border-accent/60"
                      />
                    ) : (
                      <button
                        type="button"
                        data-session-title-edit
                        className="flex-1 flex items-center py-[8px] text-left min-w-0"
                        title={displayTitle}
                      >
                        <span className="block w-full text-xs leading-none truncate">{displayTitle}</span>
                      </button>
                    )}
                    {/* While a row is still being answered it has nothing to
                        rename, keep or delete yet, so the spinner takes the
                        whole control strip on its own — same 14px box as the
                        pencil, in the colour the pencil takes under the
                        pointer, standing where the last of the three buttons
                        will stand once the answer lands. The unread dot keeps
                        its own place ahead of them. */}
                    <span className="flex items-center gap-1.5 shrink-0">
                      {loadingSessions.has(s.id) ? (
                        <span className="self-stretch flex items-center shrink-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full animate-spin"
                            style={{
                              border: '1.5px solid transparent',
                              borderTopColor: active ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                              display: 'inline-block',
                            }}
                          />
                        </span>
                      ) : (
                        <>
                          {unreadSessions.has(s.id) && (
                            <span className="self-stretch flex items-center shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(s);
                            }}
                            className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                              active ? 'text-on-accent/75 hover:text-on-accent' : 'text-text-muted hover:text-text-primary'
                            }`}
                            title={t('edit')}
                          >
                            <EditIcon size={14} />
                          </button>
                          {onFavorite && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                keep(s);
                              }}
                              /* The one control here that stays put once used:
                                 the filled star is the entry saying where it
                                 has gone, so it has to outlast the pointer
                                 leaving. It fills in the orange the Favorites
                                 list marks its open entry with — the colour of
                                 the place it is on its way to — except on the
                                 open row, whose own fill is already that orange
                                 and would swallow it. */
                              className={`self-stretch flex items-center transition-[opacity,color] ${
                                keeping
                                  ? `opacity-100 ${active ? 'text-on-accent' : 'text-brand-accent'}`
                                  : `opacity-0 group-hover:opacity-100 ${
                                    active ? 'text-on-accent/75 hover:text-on-accent' : 'text-text-muted hover:text-brand-accent'
                                  }`
                              }`}
                              title={t('favorite')}
                              aria-label={t('favorite')}
                              aria-pressed={keeping}
                            >
                              {/* A point higher than the pencil beside it, and
                                  level with the bin: a star is a spiked outline
                                  where those two are solid shapes, so at the
                                  same nominal size it reads as the smaller
                                  mark. */}
                              <StarIcon size={16} filled={keeping} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(s.id);
                            }}
                            /* A red apiece, because the two rows are not the
                               same ground. On the page's own dark the diff's own
                               #E01A1A carries — it is the red this app already
                               means "removed" with. On the open row, whose fill
                               is #BC4E2D, that red is a near neighbour of the
                               fill and stops reading as a warning, so it steps
                               down to the deeper #B42F2F to keep its
                               distance. */
                            className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                              active ? 'text-on-accent/75 hover:text-danger-on-selected' : 'text-text-muted hover:text-diff-remove'
                            }`}
                            title={t('delete')}
                          >
                            <TrashIcon size={16} />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {!isLoading && !initialError && ordered.length > 0 && (
        <InfiniteScrollSentinel
          enabled
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={onLoadMore}
          onRetryLoadMore={onRetryLoadMore}
        />
      )}
    </div>
  );
}
