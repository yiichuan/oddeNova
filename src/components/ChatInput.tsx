import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, StopIcon } from './icons';
import type { TokenStats } from '../hooks/useSessions';
import { t } from '../lib/i18n';

interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  engineStatus?: 'initializing' | 'ready' | 'failed';
  onSendText: (text: string) => void;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  focusTrigger?: number;
  replayValue?: string;
  isVideoMode?: boolean;
  tokenStats?: TokenStats;
  onFocusChange?: (focused: boolean) => void;
}

export default function ChatInput({
  isLoading,
  engineReady,
  engineStatus = engineReady ? 'ready' : 'initializing',
  onSendText,
  onReinitEngine,
  onStop,
  prefill,
  focusTrigger,
  replayValue,
  isVideoMode = false,
  tokenStats: _tokenStats,
  onFocusChange,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefill) setText(prefill);
  }, [prefill, focusTrigger]);

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
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        onKeyDown={(e) => {
          if (replayValue !== undefined) return;
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder={t('inputPlaceholder')}
        rows={1}
        disabled={isLoading && replayValue === undefined}
        className="w-full min-h-[108px] resize-none overflow-hidden rounded-[12px] bg-[#111111] px-4 pt-4 pb-12 text-base md:text-sm text-[#cccccc] placeholder:text-[#888888] outline-none transition duration-200 focus:ring-1 focus:ring-[#323232] focus:text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={isVideoMode ? { caretColor: 'transparent' } : undefined}  // [video] Hide cursor blink during video rendering
      />

      {engineStatus !== 'ready' && (
        <div className="absolute left-4 bottom-3 flex items-center gap-2 text-[12px] text-[#888888]">
          <span className={`inline-flex h-2 w-2 rounded-full ${engineStatus === 'failed' ? 'bg-[#B2370C]' : 'bg-[#666666]'}`} />
          <span>{engineStatus === 'failed' ? t('engineFailed') : t('engineInitializing')}</span>
          {engineStatus === 'failed' && (
            <button
              type="button"
              onClick={onReinitEngine}
              className="text-[18px] font-thin text-[#e0e0e0]/60 hover:text-[#e0e0e0] transition-colors leading-none relative -top-[2px]"
              title={t('restartEngine')}
            >
              ↺
            </button>
          )}
        </div>
      )}

      {/* Context window indicator hidden for now — still far from the limit; kept for future prompt optimisation review*/
      /* {engineReady && tokenStats && (
        <div className="absolute left-3 bottom-3">
          <ContextWindowIndicator tokenStats={tokenStats} />
        </div>
      )} */}

      <div className="absolute right-2 bottom-2 flex items-center gap-2">
        {replayValue !== undefined ? (
          <button
            type="button"
            disabled={!replayValue.trim()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 disabled:cursor-not-allowed disabled:opacity-30"
            title={t('send')}
          >
            <ArrowUpIcon size={18} />
          </button>
        ) : isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80"
            title={t('stop')}
          >
            <StopIcon size={18} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80 disabled:cursor-not-allowed disabled:opacity-30"
            title={t('send')}
          >
            <ArrowUpIcon size={18} />
          </button>
        )}
      </div>
    </form>
  );
}
