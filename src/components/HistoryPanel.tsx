import type { Session } from '../hooks/useSessions';

interface HistoryPanelProps {
  sessions: Session[];
  currentId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function HistoryPanel({
  sessions,
  currentId,
  onSwitch,
  onDelete,
}: HistoryPanelProps) {
  // Newest first.
  const ordered = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="h-full flex flex-col bg-bg-primary border border-border overflow-hidden">
      <div className="px-4 py-2.5 shrink-0">
        <h3 className="text-base font-semibold text-text-primary">历史</h3>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ fontFamily: '"GenWanMin TW", serif' }}>
        {ordered.length === 0 ? (
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error text-base transition-opacity shrink-0 leading-none"
                      title="删除"
                    >
                      ×
                    </button>
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
