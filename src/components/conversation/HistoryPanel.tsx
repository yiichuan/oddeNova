import { useEffect, useRef, useState } from 'react';
import type { Session } from '../../hooks/useSessions';
import { EditIcon, StarIcon, TrashIcon } from '../icons';
import { t } from '../../lib/i18n';

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
  sessions: Session[];
  currentId: string | null;
  isLoading?: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Keep this conversation: it leaves the list and turns up in Favorites. */
  onFavorite?: (id: string) => void;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
}

export default function HistoryPanel({
  sessions,
  currentId,
  isLoading = false,
  onSwitch,
  onDelete,
  onRename,
  onFavorite,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
}: HistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
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
  const keep = (session: Session) => {
    if (!onFavorite || keepingId) return;
    setKeepingId(session.id);
    keepingTimerRef.current = setTimeout(() => {
      keepingTimerRef.current = null;
      setKeepingId(null);
      onFavorite(session.id);
    }, KEEPING_MS);
  };

  const startEditing = (session: Session) => {
    cancelRef.current = false;
    setEditingId(session.id);
    setDraft(session.title || t('newSessionTitle'));
  };

  const save = (session: Session) => {
    const nextTitle = draft.trim();
    setEditingId(null);
    if (!nextTitle || nextTitle === session.title) return;
    onRename(session.id, nextTitle);
  };

  const cancel = (session: Session) => {
    cancelRef.current = true;
    setDraft(session.title || t('newSessionTitle'));
    setEditingId(null);
  };

  // Newest first (by start time). Empty sessions (no messages) are left out,
  // and so are the kept ones — a favorite is this same conversation living on
  // the Favorites page, and an entry standing in both lists would make undoing
  // either move impossible to see.
  const ordered = [...sessions]
    .filter((s) => s.messages.length > 0 && s.favoritedAt === undefined)
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex flex-col">
      <div>
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">{t('loading')}</div>
        ) : ordered.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">{t('noSessions')}</div>
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
                  <div
                    className={`group flex items-stretch gap-2 rounded-[4px] border px-2 cursor-pointer transition-colors ${
                      active
                        ? 'border-transparent bg-[var(--color-selected-item-bg)] text-text-primary'
                        : 'border-transparent bg-[#0D0D0D] text-text-secondary hover:text-text-primary'
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
                        className="my-[5px] min-w-0 flex-1 rounded-region border border-border bg-[#0D0D0D] px-1 py-0.5 text-xs leading-none text-text-primary outline-none focus:border-accent/60"
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
                    {/* Status indicator, then rename / keep / delete */}
                    <span className="flex items-center gap-1.5 shrink-0">
                      {loadingSessions.has(s.id) ? (
                        <span className="w-1.5 h-1.5 rounded-full animate-spin shrink-0" style={{ border: '1.5px solid transparent', borderTopColor: 'var(--color-text-primary)', display: 'inline-block' }} />
                      ) : unreadSessions.has(s.id) ? (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-success)' }} />
                      ) : null}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(s);
                        }}
                        className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                          active ? 'text-white/75 hover:text-white' : 'text-text-muted hover:text-text-primary'
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
                          /* The one control here that stays put once used: the
                             filled star is the entry saying where it has gone,
                             so it has to outlast the pointer leaving. It fills
                             in the orange the Favorites list marks its open
                             entry with — the colour of the place it is on its
                             way to — except on the open row, whose own fill is
                             already that orange and would swallow it. */
                          className={`self-stretch flex items-center transition-[opacity,color] ${
                            keeping
                              ? `opacity-100 ${active ? 'text-white' : 'text-[#f05a28]'}`
                              : `opacity-0 group-hover:opacity-100 ${
                                active ? 'text-white/75 hover:text-white' : 'text-text-muted hover:text-[#f05a28]'
                              }`
                          }`}
                          title={t('favorite')}
                          aria-label={t('favorite')}
                          aria-pressed={keeping}
                        >
                          {/* A point higher than the pencil beside it, and
                              level with the bin: a star is a spiked outline
                              where those two are solid shapes, so at the same
                              nominal size it reads as the smaller mark. */}
                          <StarIcon size={16} filled={keeping} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        /* A red apiece, because the two rows are not the same
                           ground. On the page's own dark the diff's own
                           #E01A1A carries — it is the red this app already
                           means "removed" with. On the open row, whose fill is
                           #BC4E2D, that red is a near neighbour of the fill
                           and stops reading as a warning, so it steps down to
                           the deeper #B42F2F to keep its distance. */
                        className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                          active ? 'text-white/75 hover:text-[#B42F2F]' : 'text-text-muted hover:text-[#E01A1A]'
                        }`}
                        title={t('delete')}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
