// src/components/MessageContextMenu.tsx
import { CopyIcon, EditIcon } from './icons';

interface MessageContextMenuProps {
  timestamp: number;
  onCopy: () => void;
  onEdit: () => void;
  onClose: () => void;
  isLoading: boolean;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (isToday) return `今天，${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

export function MessageContextMenu({
  timestamp,
  onCopy,
  onEdit,
  onClose,
  isLoading,
}: MessageContextMenuProps) {
  return (
    <>
      {/* Transparent backdrop — tap anywhere outside to close */}
      <div
        className="fixed inset-0 z-40"
        onTouchStart={onClose}
        onClick={onClose}
      />
      {/* Menu card — positioned above the bubble, right-aligned */}
      <div className="absolute bottom-full right-0 mb-1 z-50 min-w-[160px] rounded-xl bg-[#2a2a2a] border border-white/5 shadow-xl overflow-hidden">
        <div className="px-4 py-2.5 text-xs text-text-muted border-b border-white/5">
          {formatTimestamp(timestamp)}
        </div>
        <button
          onClick={() => { onCopy(); onClose(); }}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-text-primary hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <span>复制</span>
          <CopyIcon size={15} />
        </button>
        <button
          disabled={isLoading}
          onClick={() => { if (!isLoading) { onEdit(); onClose(); } }}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-text-primary hover:bg-white/5 active:bg-white/10 transition-colors border-t border-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>编辑</span>
          <EditIcon size={15} />
        </button>
      </div>
    </>
  );
}
