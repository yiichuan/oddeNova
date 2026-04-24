import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon } from './icons';

interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
  onReinitEngine: () => void;
  prefill?: string;
}

export default function ChatInput({ isLoading, engineReady, onSendText, onReinitEngine, prefill }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefill) setText(prefill);
  }, [prefill]);

  const doSubmit = () => {
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
    <form onSubmit={handleSubmit} onClick={handleCardClick} className="relative w-full" style={{ fontFamily: '"GenWanMin TW", serif' }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="输入文字描述音乐..."
        rows={3}
        disabled={isLoading}
        className="w-full min-h-[108px] resize-none rounded-[12px] bg-[#1a1a1a] px-4 pt-4 pb-12 pr-16 text-sm text-[#cccccc] placeholder:text-[#888888] outline-none transition duration-200 focus:ring-1 focus:ring-[#ff4500]/15 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div className="absolute left-4 bottom-3 flex items-center gap-2 text-[12px] text-[#e0e0e0]" style={{ pointerEvents: engineReady ? 'none' : 'auto' }}>
        <span className="inline-flex h-2 w-2 rounded-full bg-[#ff4500]" />
        <span>{engineReady ? '引擎就绪' : '未初始化'}</span>
        {!engineReady && (
          <button
            type="button"
            onClick={onReinitEngine}
            className="text-[18px] font-thin text-[#e0e0e0]/60 hover:text-[#e0e0e0] transition-colors leading-none relative -top-[2px]"
            title="重启引擎"
          >
            ↺
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={!text.trim() || isLoading}
        className="absolute right-2 bottom-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80 disabled:cursor-not-allowed disabled:opacity-30"
        title="发送"
      >
        <ArrowUpIcon size={18} />
      </button>
    </form>
  );
}
