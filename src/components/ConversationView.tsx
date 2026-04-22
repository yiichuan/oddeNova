import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useChat';

interface ConversationViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isListening: boolean;
}

export default function ConversationView({
  messages,
  isLoading,
  isListening,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isListening]);

  // Find the last progress message — used as the "subtitle" line under
  // the "思考中..." indicator (matches the design reference).
  const lastProgress = isLoading
    ? [...messages].reverse().find((m) => m.role === 'progress')
    : undefined;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
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
              {msg.code && (
                <pre className="mt-2 p-2 bg-bg-primary/60 rounded-md text-[11px] text-warning/90 font-mono overflow-x-auto whitespace-pre-wrap border border-warning/10">
                  {msg.code}
                </pre>
              )}
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

      {isListening && (
        <div className="flex justify-end animate-fade-in-up">
          <div className="bg-red-500/15 text-red-400 rounded-xl px-3 py-1.5 text-xs flex items-center gap-2 border border-red-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            正在聆听...
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
