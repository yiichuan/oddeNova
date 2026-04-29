import type { Session } from '../hooks/useSessions';

interface HistoryPanelProps {
  sessions: Session[];
  currentId: string | null;
  isLoading?: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
}

export default function HistoryPanel({
  sessions,
  currentId,
  isLoading = false,
  onSwitch,
  onDelete,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
}: HistoryPanelProps) {
  // Newest first.
  const ordered = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="h-full flex flex-col bg-bg-primary border border-border overflow-hidden">
      <div className="px-4 py-2.5 shrink-0">
        <h3 className="text-base font-semibold text-text-primary">历史</h3>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ fontFamily: '"GenWanMin TW", serif' }}>
        {isLoading ? (
          <div className="p-4 text-xs text-text-muted">加载中…</div>
        ) : ordered.length === 0 ? (
          <div className="p-4 text-xs text-text-muted">暂无会话</div>
        ) : (
          <ul className="py-1">
            {ordered.map((s) => {
              const active = s.id === currentId;
              return (
                <li key={s.id} className="px-3.5">
                  <div
                    className={`group flex items-center gap-2 px-2 py-[3px] cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#2A2A2A] text-text-secondary'
                        : 'text-text-secondary hover:bg-bg-tertiary/50'
                    }`}
                    onClick={() => onSwitch(s.id)}
                  >
                    <span className="flex-1 text-xs truncate" title={s.title}>
                      {s.title || '新会话'}
                    </span>
                    {/* 状态指示器 + 删除按钮 */}
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error text-base transition-opacity leading-none"
                        title="删除"
                      >
                        ×
                      </button>
                      {loadingSessions.has(s.id) ? (
                        <span className="w-1.5 h-1.5 rounded-full animate-spin" style={{ border: '1.5px solid transparent', borderTopColor: 'var(--color-accent)', display: 'inline-block' }} />
                      ) : unreadSessions.has(s.id) ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      ) : (
                        <span className="w-1.5 h-1.5 shrink-0" />
                      )}
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
