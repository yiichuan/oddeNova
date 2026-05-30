import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, StopIcon } from './icons';
import type { TokenStats } from '../hooks/useSessions';

interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  focusTrigger?: number;
  replayValue?: string;
  tokenStats?: TokenStats;
}

export default function ChatInput({ isLoading, engineReady, onSendText, onReinitEngine, onStop, prefill, focusTrigger, replayValue, tokenStats: _tokenStats }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefill) setText(prefill);
  }, [prefill]);

  useEffect(() => {
    if (focusTrigger) textareaRef.current?.focus();
  }, [focusTrigger]);

  const prevReplayRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (replayValue !== undefined && prevReplayRef.current === undefined) {
      textareaRef.current?.focus();
    }
    prevReplayRef.current = replayValue;
  }, [replayValue]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const recalc = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  const doSubmit = () => {
    if (replayValue !== undefined) return;
    const value = text.trim();
    if (!value || isLoading) return;
    onSendText(value);
    setText('');
  };

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    doSubmit();
  };

  const handleCardClick = (e: React.MouseEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    textareaRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} onClick={handleCardClick} className="relative w-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <textarea
        ref={textareaRef}
        value={replayValue !== undefined ? replayValue : text}
        onChange={replayValue !== undefined ? undefined : (e) => setText(e.target.value)}
        readOnly={replayValue !== undefined}
        onKeyDown={(e) => {
          if (replayValue !== undefined) return;
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="输入文字描述音乐..."
        rows={1}
        disabled={isLoading && replayValue === undefined}
        className="w-full min-h-[108px] resize-none overflow-hidden rounded-[12px] bg-[#111111] px-4 pt-4 pb-12 pr-16 text-base md:text-sm text-[#cccccc] placeholder:text-[#888888] outline-none transition duration-200 focus:ring-1 focus:ring-[#323232] focus:text-white disabled:cursor-not-allowed disabled:opacity-50"
      />

      {!engineReady && (
        <div className="absolute left-4 bottom-3 flex items-center gap-2 text-[12px] text-[#888888]">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#B2370C]" />
          <span>未初始化</span>
          <button
            type="button"
            onClick={onReinitEngine}
            className="text-[18px] font-thin text-[#e0e0e0]/60 hover:text-[#e0e0e0] transition-colors leading-none relative -top-[2px]"
            title="重启引擎"
          >
            ↺
          </button>
        </div>
      )}

      {/* 隐藏上下文窗口指示器，现在距离上限还差很多，只用于后续提示词优化查看*/
      /* {engineReady && tokenStats && (
        <div className="absolute left-3 bottom-3">
          <ContextWindowIndicator tokenStats={tokenStats} />
        </div>
      )} */}

      {replayValue !== undefined ? (
        <button
          type="button"
          disabled={!replayValue.trim()}
          className="absolute right-2 bottom-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 disabled:cursor-not-allowed disabled:opacity-30"
          title="发送"
        >
          <ArrowUpIcon size={18} />
        </button>
      ) : isLoading ? (
        <button
          type="button"
          onClick={onStop}
          className="absolute right-2 bottom-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80"
          title="停止"
        >
          <StopIcon size={18} />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!text.trim()}
          className="absolute right-2 bottom-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80 disabled:cursor-not-allowed disabled:opacity-30"
          title="发送"
        >
          <ArrowUpIcon size={18} />
        </button>
      )}
    </form>
  );
}
