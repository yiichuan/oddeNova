import { useState, type FormEvent } from 'react';
import { ArrowUpIcon } from './icons';

interface ChatInputProps {
  isLoading: boolean;
  onSendText: (text: string) => void;
}

export default function ChatInput({ isLoading, onSendText }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || isLoading) return;
    onSendText(v);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="relative flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="输入文字描述音乐..."
          rows={2}
          disabled={isLoading}
          className="w-full resize-none bg-bg-tertiary/60 text-text-primary text-sm rounded-xl px-3 py-2.5 pr-10 outline-none border border-border focus:border-accent/50 placeholder:text-text-muted/60 disabled:opacity-50 transition-colors min-h-[60px]"
        />
        <button
          type="submit"
          disabled={!text.trim() || isLoading}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          title="发送"
        >
          <ArrowUpIcon size={14} />
        </button>
      </div>
    </form>
  );
}
