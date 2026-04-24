import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';

interface ConversationViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export default function ConversationView({
  messages,
  isLoading,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());

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

  // Find the last progress message — used as the "subtitle" line under
  // the "思考中..." indicator (matches the design reference).
  const lastProgress = isLoading
    ? [...messages].reverse().find((m) => m.role === 'progress')
    : undefined;

  return (
    <div ref={scrollRef} className="conversation-scroll flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
      {messages.length === 0 && !isLoading && (
        <div className="h-full flex items-center justify-center text-text-muted text-xs">
          <span>说点什么开始创作</span>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.role === 'progress') {
          // Skip progress lines while loading — they collapse into the
          // single "思考中" + subtitle indicator below.
          if (isLoading && msg === lastProgress) return null;
          if (msg.progressKind === 'thinking') {
            return (
              <div key={msg.id} className="flex justify-start animate-fade-in-up">
                <div className="text-xs text-text-secondary px-1 flex items-start gap-1.5 italic">
                  <span className="opacity-70 mt-0.5">{progressIcon(msg)}</span>
                  <span>{msg.content}</span>
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

        return (
          <div
            key={msg.id}
            className={`flex animate-fade-in-up ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-bg-tertiary border border-border text-text-primary'
                  : 'bg-transparent text-text-secondary'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              {msg.code && (() => {
                const isExpanded = expandedCode.has(msg.id);
                const lineCount = msg.code.split('\n').length;
                return (
                  <div className="mt-2 rounded-md border border-warning/10 overflow-hidden">
                    <button
                      onClick={() => toggleCode(msg.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-bg-primary/60 text-[11px] text-warning/70 hover:text-warning/90 hover:bg-bg-primary/80 transition-colors text-left"
                    >
                      <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span>Strudel 代码</span>
                      <span className="text-text-muted/50">· {lineCount} 行</span>
                    </button>
                    {isExpanded && (
                      <pre className="p-2 bg-bg-primary/60 text-[11px] text-warning/90 font-mono overflow-x-auto whitespace-pre-wrap">
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
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-error mt-2 animate-pulse" />
            <div>
              <div className="text-sm text-text-primary">思考中...</div>
              {lastProgress && (
                <div className="text-[11px] text-text-muted mt-0.5">
                  {lastProgress.content}
                </div>
              )}
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
