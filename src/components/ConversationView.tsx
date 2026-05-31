import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { ArrowUpIcon, CheckIcon, CopyIcon, EditIcon, GitBranchIcon, RetryIcon, XIcon } from './icons';

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
  onBranch: (messageId: string) => void;
  onRetry: (messageId: string) => void;
}

export default function ConversationView({
  messages,
  isLoading,
  onResend,
  onBranch,
  onRetry,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledRef = useRef(false);
  const reasoningPreRef = useRef<HTMLPreElement>(null);
  const reasoningUserScrolledRef = useRef(false);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const el = editTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editText]);

  useEffect(() => {
    const el = editTextareaRef.current;
    if (!el || !editingId) return;
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingId]);

  // 检测用户手动滚动：距底部 > 80px 时停止自动跟随，滚回底部时恢复
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledRef.current = distFromBottom > 80;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleCode = (id: string) => {
    setExpandedCode((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
    // 自动滚动 reasoning <pre> 到底部（流式输出时跟随内容）
    const preEl = reasoningPreRef.current;
    if (preEl && !reasoningUserScrolledRef.current) {
      preEl.scrollTop = preEl.scrollHeight;
    }
    // isLoading 结束时重置 reasoning 区域的用户滚动标记
    if (!isLoading) {
      reasoningUserScrolledRef.current = false;
    }
  }, [messages, isLoading]);

  // Pre-process: attach each reasoning progress message to the next assistant message.
  const { absorbedReasoningIds } = useMemo(() => {
    const absorbedReasoningIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'progress' && m.progressKind === 'reasoning') {
        for (let j = i + 1; j < messages.length; j++) {
          if (messages[j].role === 'assistant') {
            absorbedReasoningIds.add(m.id);
            break;
          }
        }
      }
    }
    return { absorbedReasoningIds };
  }, [messages]);

  // 当前正在流式输出的 reasoning（尚未被 assistant 消息吸收）
  // 使用 findLast 取最新一条，避免多轮迭代时前一轮的 reasoning 被 tool_call 消息隔断导致 reasoningPhaseActive 失效
  const streamingReasoningMsg = useMemo(
    () => messages.findLast(
      (m) => m.role === 'progress' && m.progressKind === 'reasoning' && !absorbedReasoningIds.has(m.id),
    ),
    [messages, absorbedReasoningIds],
  );

  // 判断推理阶段是否仍在进行：若 reasoning 消息之后已有其他非 reasoning 消息（如文字流式输出），
  // 说明思考已完成，不应继续展开显示推理内容。
  const streamingReasoningIdx = streamingReasoningMsg
    ? messages.findIndex((m) => m.id === streamingReasoningMsg.id)
    : -1;
  const reasoningPhaseActive =
    streamingReasoningMsg !== undefined &&
    messages
      .slice(streamingReasoningIdx + 1)
      .every((m) => m.role === 'progress' && m.progressKind === 'reasoning');

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
          // Reasoning messages: hide from list (shown below blue dot during streaming,
          // or in assistant bubble after completion).
          if (msg.progressKind === 'reasoning') {
            return null;
          }
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
              {isEditing ? (
                <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary w-full">
                  <textarea
                    ref={editTextareaRef}
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
                    className="w-full bg-transparent text-text-primary resize-none outline-none text-sm whitespace-pre-wrap break-words min-h-[1.5rem] max-h-[30vh] overflow-y-auto"
                    rows={1}
                  />
                  <div className="flex gap-1.5 mt-1.5 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
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
                          setEditingId(null);
                        }
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition-colors hover:bg-[#d0d0d0]/80 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="发送"
                    >
                      <ArrowUpIcon size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary">
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  {/* Action buttons — bottom-right of bubble, visible on group-hover */}
                  <div className="absolute -bottom-5 right-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content).then(() => {
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        });
                      }}
                      className="text-white/60 hover:text-white p-1"
                      title="复制"
                    >
                      {copiedId === msg.id ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                    </button>
                    <button
                      onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                      className="text-white/60 hover:text-white p-1"
                      title="编辑"
                    >
                      <EditIcon size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }

        // assistant message:
        return (
          <div
            key={msg.id}
            className="flex justify-start animate-fade-in-up group mb-6"
          >
            <div className="relative max-w-[85%] rounded-xl px-3 py-2 text-xs bg-transparent text-text-primary">
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

              {/* Action buttons — bottom-left, always visible */}
              <div className="absolute -bottom-5 left-0 flex items-center">
                <button
                  onClick={() => onRetry(msg.id)}
                  className="text-white/60 hover:text-white p-1"
                  title="重试"
                >
                  <RetryIcon size={13} />
                </button>
                <button
                  onClick={() => onBranch(msg.id)}
                  className="text-white/60 hover:text-white p-1"
                  title="从此处创建分支对话"
                >
                  <GitBranchIcon size={13} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="flex justify-start animate-fade-in-up">
          <div className="flex items-start gap-1.5 px-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#93C2FF] mt-2 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm text-text-primary">思考中...</div>
              {streamingReasoningMsg && streamingReasoningMsg.content && reasoningPhaseActive && (
                <pre
                  ref={reasoningPreRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    reasoningUserScrolledRef.current = distFromBottom > 20;
                  }}
                  className="mt-1.5 text-[11px] text-text-muted/60 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed"
                >
                  {streamingReasoningMsg.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} className="h-6" />
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
