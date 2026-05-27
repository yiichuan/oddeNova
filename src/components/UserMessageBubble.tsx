// src/components/UserMessageBubble.tsx
import { useState } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { ArrowUpIcon, EditIcon, XIcon } from './icons';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLongPress } from '../hooks/useLongPress';
import { MessageContextMenu } from './MessageContextMenu';

interface UserMessageBubbleProps {
  msg: ChatMessage;
  isLoading: boolean;
  isEditing: boolean;
  editText: string;
  editTextareaRef: RefObject<HTMLTextAreaElement>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditTextChange: (text: string) => void;
  onResend: (messageId: string, content: string) => void;
}

export function UserMessageBubble({
  msg,
  isLoading,
  isEditing,
  editText,
  editTextareaRef,
  onStartEdit,
  onCancelEdit,
  onEditTextChange,
  onResend,
}: UserMessageBubbleProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const longPress = useLongPress(() => setIsMenuOpen(true));

  if (isEditing) {
    return (
      <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary w-full">
        <textarea
          ref={editTextareaRef}
          autoFocus
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (editText.trim()) {
                onResend(msg.id, editText.trim());
                onCancelEdit();
              }
            }
            if (e.key === 'Escape') {
              onCancelEdit();
            }
          }}
          className="w-full bg-transparent text-text-primary resize-none outline-none text-sm whitespace-pre-wrap break-words min-h-[1.5rem] max-h-[30vh] overflow-y-auto"
          rows={1}
        />
        <div className="flex gap-1.5 mt-1.5 justify-end">
          <button
            onClick={onCancelEdit}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-text-muted/50 hover:text-text-muted hover:bg-white/5 transition-colors"
            title="取消"
          >
            <XIcon size={13} />
          </button>
          <button
            disabled={!editText.trim()}
            onClick={() => {
              if (editText.trim()) {
                onResend(msg.id, editText.trim());
                onCancelEdit();
              }
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition-colors hover:bg-[#d0d0d0]/80 disabled:opacity-30 disabled:cursor-not-allowed"
            title="发送"
          >
            <ArrowUpIcon size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary"
      {...(isMobile ? longPress : {})}
    >
      {isMobile && isMenuOpen && (
        <MessageContextMenu
          timestamp={msg.timestamp}
          onCopy={() => navigator.clipboard.writeText(msg.content)}
          onEdit={onStartEdit}
          onClose={() => setIsMenuOpen(false)}
          isLoading={isLoading}
        />
      )}
      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      {!isMobile && (
        <button
          disabled={isLoading}
          onClick={onStartEdit}
          className="absolute -bottom-5 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-white/60 hover:text-white disabled:opacity-0 disabled:cursor-not-allowed p-1"
          title="重新编辑"
        >
          <EditIcon size={13} />
        </button>
      )}
    </div>
  );
}
