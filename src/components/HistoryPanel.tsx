import type { Session } from '../hooks/useSessions';
import { TrashIcon } from './icons';
import { t } from '../lib/i18n';
import EditableSessionTitle from './EditableSessionTitle';

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
  // Newest first (by start time). Exclude empty sessions (no messages).
  const ordered = [...sessions]
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2 shrink-0">
        <h3 className="text-base font-semibold text-text-primary">{t('history')}</h3>
      </div>
      <div>
        {isLoading ? (
          <div className="px-4 pb-4 text-xs text-text-muted">{t('loading')}</div>
        ) : ordered.length === 0 ? (
          <div className="px-4 pb-4 text-xs text-text-muted">{t('noSessions')}</div>
        ) : (
          <ul className="pt-1 pb-3 space-y-1">
            {ordered.map((s) => {
              const active = s.id === currentId;
              return (
                <li key={s.id} className="px-2">
                  <div
                    className={`group flex items-stretch gap-2 px-2 cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#1e2d3d] text-text-secondary'
                        : 'text-text-secondary hover:bg-[#2a2a2a]'
                    }`}
                    onClick={() => onSwitch(s.id)}
                  >
                    <EditableSessionTitle
                      title={s.title || t('newSessionTitle')}
                      canEdit={true}
                      className="flex-1 flex items-center py-[8px] text-left min-w-0"
                      titleTextClassName="block w-full text-xs leading-none truncate"
                      inputClassName="flex-1 min-w-0 my-[5px] bg-transparent border border-border px-1 py-0.5 text-xs leading-none text-text-primary outline-none focus:border-accent/60"
                      onRename={(title) => onRename(s.id, title)}
                    />
                    {/* Status indicator + delete button */}
                    <span className="flex items-center gap-2 shrink-0">
                      {loadingSessions.has(s.id) ? (
                        <span className="w-1.5 h-1.5 rounded-full animate-spin shrink-0" style={{ border: '1.5px solid transparent', borderTopColor: 'var(--color-text-primary)', display: 'inline-block' }} />
                      ) : unreadSessions.has(s.id) ? (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-success)' }} />
                      ) : null}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        className="self-stretch flex items-center opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity"
                        title={t('delete')}
                      >
                        <TrashIcon size={20} />
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
