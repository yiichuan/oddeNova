import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { useIsMobile } from '../hooks/useIsMobile';
import { CheckIcon, CopyIcon, GitBranchIcon, RetryIcon, RollbackIcon } from './icons';
import { t } from '../lib/i18n';

type MobileNoSelectStyle = CSSProperties & {
  WebkitTouchCallout?: 'none';
};

const mobileRollbackBubbleStyle: MobileNoSelectStyle = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')          // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold (underscore)
    .replace(/_(.+?)_/g, '$1')          // italic (underscore)
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '').trim()) // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '')         // unordered lists
    .replace(/^\d+\.\s+/gm, '')         // ordered lists
    .replace(/^>\s+/gm, '')             // blockquotes
    .replace(/~~(.+?)~~/g, '$1')        // strikethrough
    .trim();
}

interface ConversationViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isVideoMode?: boolean;
  scrollBottom?: boolean;
  /**
   * [video] Frame-driven scroll position as a fraction of the maximum scrollTop.
   * null keeps video mode pinned to the top.
   */
  scrollProgress?: number | null;
  onRollback: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRetry: (messageId: string) => void;
}

export default function ConversationView({
  messages,
  isLoading,
  isVideoMode = false,
  scrollBottom = false,
  scrollProgress = null,
  onRollback,
  onBranch,
  onRetry,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const reasoningPreRef = useRef<HTMLPreElement>(null);
  const reasoningUserScrolledRef = useRef(false);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  // On mobile, long-pressing a message reveals the rollback button (no real hover state on touch screens)
  const [longPressedId, setLongPressedId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect manual user scroll: stop auto-following when more than 80px from the bottom, resume when scrolled back
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

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const startLongPress = (id: string) => {
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setLongPressedId(id);
    }, 500);
  };
  const getMobileRollbackBubbleProps = (id: string): HTMLAttributes<HTMLDivElement> => (
    isMobile
      ? {
        onTouchStart: () => {
          window.getSelection()?.removeAllRanges();
          startLongPress(id);
        },
        onTouchEnd: cancelLongPress,
        onTouchMove: cancelLongPress,
        onContextMenu: (e) => e.preventDefault(),
        onSelect: (e) => {
          e.preventDefault();
          window.getSelection()?.removeAllRanges();
        },
        style: mobileRollbackBubbleStyle,
      }
      : {}
  );

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  // After long-press reveals the rollback button, tapping outside the bubble dismisses it
  useEffect(() => {
    if (!isMobile || !longPressedId) return;
    const container = scrollRef.current;
    if (!container) return;
    const handler = (e: TouchEvent) => {
      const bubble = (e.target as HTMLElement).closest('[data-rollback-bubble]') as HTMLElement | null;
      if (!bubble || bubble.dataset.rollbackBubble !== longPressedId) {
        setLongPressedId(null);
      }
    };
    container.addEventListener('touchstart', handler);
    return () => container.removeEventListener('touchstart', handler);
  }, [isMobile, longPressedId]);

  useEffect(() => {
    if (isVideoMode && !scrollBottom) {
      // [video] Video mode: display from the top; only scroll to bottom when scrollBottom=true.
      // scrollProgress, when the renderer drives it, positions the scroll per frame so the
      // scroll speed follows video time instead of wall-clock easing.
      const el = scrollRef.current;
      if (el) {
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = scrollProgress === null ? 0 : maxScrollTop * scrollProgress;
      }
    } else {
      if (!userScrolledRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }
      // Auto-scroll the reasoning <pre> to the bottom (follow content during streaming output)
      const preEl = reasoningPreRef.current;
      if (preEl && !reasoningUserScrolledRef.current) {
        preEl.scrollTop = preEl.scrollHeight;
      }
      // Reset the user-scrolled flag for the reasoning area when isLoading ends
      if (!isLoading) {
        reasoningUserScrolledRef.current = false;
      }
    }
  }, [messages, isLoading, isVideoMode, scrollBottom, scrollProgress]);

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

  // The reasoning currently being streamed (not yet absorbed by an assistant message).
  // Use findLast to get the most recent one, preventing the previous round's reasoning from being
  // cut off by a tool_call message across multiple iterations and causing reasoningPhaseActive to malfunction.
  const streamingReasoningMsg = useMemo(
    () => messages.findLast(
      (m) => m.role === 'progress' && m.progressKind === 'reasoning' && !absorbedReasoningIds.has(m.id),
    ),
    [messages, absorbedReasoningIds],
  );

  // Determine whether the reasoning phase is still in progress: if there are non-reasoning messages
  // after the reasoning message (e.g. streaming text output), thinking is complete and
  // the reasoning content should no longer be displayed expanded.
  const streamingReasoningIdx = streamingReasoningMsg
    ? messages.findIndex((m) => m.id === streamingReasoningMsg.id)
    : -1;
  const reasoningPhaseActive =
    streamingReasoningMsg !== undefined &&
    messages
      .slice(streamingReasoningIdx + 1)
      .every((m) => m.role === 'progress' && m.progressKind === 'reasoning');

  // An assistant reply that is still arriving shows no retry/branch actions —
  // they only make sense once there is a finished answer to act on. A live turn
  // is the trailing message while isLoading; the video renderer, which has no
  // real turn, marks the message it is still typing out itself.
  const lastMsgId = messages[messages.length - 1]?.id;
  const isReplyStreaming = (msg: ChatMessage) =>
    msg.streaming === true || (isLoading && msg.id === lastMsgId);

  return (
    <div ref={scrollRef} className="conversation-scroll h-full overflow-y-auto px-4 py-[10px] space-y-[22px] relative" style={{ scrollbarGutter: 'stable' }}>
      {messages.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
          <span>{t('startCreating')}</span>
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
          const rollbackButtonEnabled = !isMobile || longPressedId === msg.id;
          return (
            <div key={msg.id} className="flex justify-end items-end gap-1.5 animate-fade-in-up group">
              <div
                className={`relative max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary${
                  isMobile ? ' mobile-rollback-bubble-no-select' : ''
                }`}
                data-rollback-bubble={msg.id}
                {...getMobileRollbackBubbleProps(msg.id)}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                {/* Rollback button — top-right of bubble. Desktop: visible on group-hover. Mobile: visible on long-press (no real hover state on touch). */}
                <div className={`absolute -top-2.5 -right-2.5 transition-opacity ${
                  isMobile
                    ? (rollbackButtonEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
                    : 'opacity-0 group-hover:opacity-100'
                }`}>
                  <button
                    onClick={() => { onRollback(msg.id); setLongPressedId(null); }}
                    disabled={!rollbackButtonEnabled}
                    className="w-6 h-6 rounded-full border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
                    title={t('rollbackHere')}
                  >
                    <RollbackIcon size={12} />
                  </button>
                </div>
              </div>
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
                const code = msg.code;
                const lineCount = code.split('\n').length;
                return (
                  <div className="mt-2 rounded-md border border-[#93C2FF]/10 overflow-hidden">
                    <div className="w-full flex items-center bg-bg-primary/60 text-[11px] text-[#93C2FF]/70">
                      <button
                        onClick={() => toggleCode(msg.id)}
                        className="flex-1 flex items-center gap-1.5 px-2 py-1.5 hover:text-[#93C2FF]/90 hover:bg-bg-primary/80 transition-colors text-left"
                      >
                        <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        <span>{t('strudelCode')}</span>
                        <span className="text-text-muted/50">· {lineCount} {t('lines')}</span>
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(code).then(() => {
                            setCopiedId(msg.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          });
                        }}
                        className="px-2 py-1.5 text-white/60 hover:text-white hover:bg-bg-primary/80 transition-colors"
                        title={t('copyCode')}
                      >
                        {copiedId === msg.id ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                      </button>
                    </div>
                    {isExpanded && (
                      <pre className="p-2 bg-bg-primary/60 text-[11px] text-[#93C2FF]/90 font-mono overflow-x-auto whitespace-pre-wrap">
                        {code}
                      </pre>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons — bottom-left, visible once the reply is complete */}
              {!isReplyStreaming(msg) && (
                <div className="absolute -bottom-5 left-0 flex items-center">
                  <button
                    onClick={() => onRetry(msg.id)}
                    className="text-white/60 hover:text-white p-1"
                    title={t('retry')}
                  >
                    <RetryIcon size={13} />
                  </button>
                  <button
                    onClick={() => onBranch(msg.id)}
                    className="text-white/60 hover:text-white p-1"
                    title={t('branchFrom')}
                  >
                    <GitBranchIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isLoading && (
        <div className="flex justify-start animate-fade-in-up">
          <div className="flex items-start gap-1.5 px-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#93C2FF] mt-2 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm text-text-primary">{t('thinking')}</div>
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
