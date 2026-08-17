import { useEffect, useRef, useState } from 'react';
import type { Session } from '../hooks/useSessions';
import { EditIcon, TrashIcon } from './icons';
import { t } from '../lib/i18n';

interface HistoryPanelProps {
  sessions: Session[];
  currentId: string | null;
  isLoading?: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
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
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
}: HistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

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

  // Newest first (by start time). Exclude empty sessions (no messages).
  const ordered = [...sessions]
    .filter((s) => s.messages.length > 0)
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
              const displayTitle = s.title || t('newSessionTitle');
              return (
                <li key={s.id} className="px-2">
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
                    {/* Status indicator + delete button */}
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                          active ? 'text-white/75 hover:text-[#B42F2F]' : 'text-text-muted hover:text-error'
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
