import { useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowUpIcon } from './icons';

interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
}

export default function ChatInput({ isLoading, engineReady, onSendText }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || isLoading) return;
    onSendText(value);
    setText('');
  };

  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    textareaRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} onClick={handleCardClick} className="relative w-full">
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
        rows={4}
        disabled={isLoading}
        className="w-full min-h-[128px] resize-none rounded-[12px] bg-[#2a2a2a] px-4 pt-4 pb-12 pr-16 text-sm text-white placeholder:text-[#888888] outline-none transition duration-200 focus:ring-1 focus:ring-[#ff4500]/15 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div className="pointer-events-none absolute left-4 bottom-3 flex items-center gap-2 text-[12px] text-[#888888]">
        <span className="inline-flex h-2 w-2 rounded-full bg-[#ff4500]" />
        <span>{engineReady ? '引擎就绪' : '未初始化'}</span>
      </div>

      <button
        type="submit"
        disabled={!text.trim() || isLoading}
        className="absolute right-4 bottom-3 inline-flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-[#bbb] bg-transparent text-white transition duration-200 hover:shadow-[0_0_8px_rgba(255,255,255,0.2)] disabled:cursor-not-allowed disabled:opacity-30"
        title="发送"
      >
        <ArrowUpIcon size={20} />
      </button>
    </form>
  );
}
