import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')          // 标题
    .replace(/\*\*(.+?)\*\*/g, '$1')    // 粗体
    .replace(/\*(.+?)\*/g, '$1')        // 斜体
    .replace(/__(.+?)__/g, '$1')        // 粗体（下划线）
    .replace(/_(.+?)_/g, '$1')          // 斜体（下划线）
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '').trim()) // 代码
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接
    .replace(/^[-*+]\s+/gm, '')         // 无序列表
    .replace(/^\d+\.\s+/gm, '')         // 有序列表
    .replace(/^>\s+/gm, '')             // 引用
    .replace(/~~(.+?)~~/g, '$1')        // 删除线
    .trim();
}

interface ConversationViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onResend: (messageId: string, content: string) => void;
}

export default function ConversationView({
  messages,
  isLoading,
  onResend,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const toggleCode = (id: string) => {
    setExpandedCode((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div ref={scrollRef} className="conversation-scroll h-full overflow-y-auto px-4 py-[10px] space-y-[22px] relative">
      {messages.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
          <span>说点什么开始创作</span>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.role === 'progress') {
          // All progress messages always stay in the list — never suppress
          // them, to avoid the flash of disappearing from indicator then
          // reappearing in the list.
          if (msg.progressKind === 'thinking') {
            return (
              <div key={msg.id} className="flex justify-start animate-fade-in-up">
                <div className="text-xs text-text-secondary px-1 flex items-start gap-1.5">
                  <span className="opacity-70 mt-0.5">{progressIcon(msg)}</span>
                  <span>{stripMarkdown(msg.content)}</span>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex justify-start animate-fade-in-up">
              <div className="text-[11px] text-text-muted/70 px-1 flex items-center gap-1.5">
                <span className="opacity-60">{progressIcon(msg)}</span>
                <span>{msg.content}</span>
              </div>
            </div>
          );
        }

        if (msg.role === 'user') {
          const isEditing = editingId === msg.id;
          return (
            <div key={msg.id} className="flex justify-end items-end gap-1.5 animate-fade-in-up group">
              {/* Edit button — left of bubble, visible on group-hover */}
              {!isEditing && (
                <button
                  disabled={isLoading}
                  onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted/50 hover:text-text-muted disabled:opacity-0 disabled:cursor-not-allowed text-xs p-1 self-center"
                  title="重新编辑"
                >
                  ✏
                </button>
              )}
              {isEditing ? (
                <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary w-full">
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (editText.trim()) {
                          onResend(msg.id, editText.trim());
                          setEditingId(null);
                        }
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    className="w-full bg-transparent text-text-primary resize-none outline-none text-sm whitespace-pre-wrap break-words min-h-[1.5rem]"
                    rows={Math.max(1, editText.split('\n').length)}
                  />
                  <div className="flex gap-2 mt-1.5 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-text-muted/60 hover:text-text-muted px-2 py-0.5"
                    >
                      取消
                    </button>
                    <button
                      disabled={!editText.trim()}
                      onClick={() => {
                        if (editText.trim()) {
                          onResend(msg.id, editText.trim());
                          setEditingId(null);
                        }
                      }}
                      className="text-xs text-[#93C2FF]/70 hover:text-[#93C2FF] disabled:opacity-40 disabled:cursor-not-allowed px-2 py-0.5"
                    >
                      发送
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary">
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              )}
            </div>
          );
        }

        // assistant message:
        return (
          <div
            key={msg.id}
            className="flex justify-start animate-fade-in-up"
          >
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs bg-transparent text-text-primary">
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              {msg.code && (() => {
                const isExpanded = expandedCode.has(msg.id);
                const lineCount = msg.code.split('\n').length;
                return (
                  <div className="mt-2 rounded-md border border-[#93C2FF]/10 overflow-hidden">
                    <button
                      onClick={() => toggleCode(msg.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-bg-primary/60 text-[11px] text-[#93C2FF]/70 hover:text-[#93C2FF]/90 hover:bg-bg-primary/80 transition-colors text-left"
                    >
                      <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span>Strudel 代码</span>
                      <span className="text-text-muted/50">· {lineCount} 行</span>
                    </button>
                    {isExpanded && (
                      <pre className="p-2 bg-bg-primary/60 text-[11px] text-[#93C2FF]/90 font-mono overflow-x-auto whitespace-pre-wrap">
                        {msg.code}
                      </pre>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="flex justify-start animate-fade-in-up">
          <div className="flex items-start gap-1.5 px-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#93C2FF] mt-2 animate-pulse" />
            <div>
              <div className="text-sm text-text-primary">思考中...</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function progressIcon(msg: ChatMessage): string {
  switch (msg.progressKind) {
    case 'thinking':
      return '💭';
    case 'tool_call':
      return '⚙';
    case 'tool_result':
      return msg.ok === false ? '✗' : '✓';
    case 'commit':
      return '▶';
    case 'warn':
      return '⚠';
    default:
      return '·';
  }
}
