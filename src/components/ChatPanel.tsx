import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import VoiceButton from './VoiceButton';

const QUICK_PROMPTS = [
  '来一段 lo-fi 鼓点',
  '加一个 808 贝斯',
  '来点空灵的 pad',
  '节奏加快一点',
  '加些混响效果',
  '换成 house 风格',
];

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isListening: boolean;
  speechSupported: boolean;
  onSendText: (text: string) => void;
  onToggleVoice: () => void;
}

export default function ChatPanel({
  messages,
  isLoading,
  isListening,
  speechSupported,
  onSendText,
  onToggleVoice,
}: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isLoading) {
      onSendText(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-sm text-text-secondary font-medium">对话</span>
        <span className="text-xs text-text-muted">空格键 = 语音</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm space-y-4 animate-fade-in-up">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent/20 to-accent-light/10 flex items-center justify-center text-3xl border border-accent/20">
              🎵
            </div>
            <div className="text-center space-y-1">
              <p className="text-text-secondary font-medium">Vibe Live Music</p>
              <p className="text-xs">按住麦克风说话，或点击下方快捷指令开始</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-[300px]">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onSendText(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full bg-bg-tertiary text-text-secondary hover:bg-accent/20 hover:text-accent-light transition-colors border border-border hover:border-accent/30"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'progress') {
            const icon = progressIcon(msg);
            const tone = progressTone(msg);
            return (
              <div key={msg.id} className="flex justify-start animate-fade-in-up">
                <div
                  className={`text-xs font-mono px-3 py-1 rounded-md border flex items-center gap-2 ${tone}`}
                >
                  <span className="opacity-80">{icon}</span>
                  <span className="opacity-90">{msg.content}</span>
                </div>
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className={`flex animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent text-white rounded-br-md'
                    : 'bg-bg-tertiary text-text-primary rounded-bl-md'
                }`}
              >
                <p>{msg.content}</p>
                {msg.code && (
                  <pre className="mt-2 p-2.5 bg-bg-primary/60 rounded-lg text-xs text-warning font-mono overflow-x-auto whitespace-pre-wrap border border-warning/10">
                    {msg.code}
                  </pre>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start animate-fade-in-up">
            <div className="bg-bg-tertiary rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted mr-2">生成中</span>
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {isListening && (
          <div className="flex justify-end animate-fade-in-up">
            <div className="bg-red-500/20 text-red-400 rounded-2xl rounded-br-md px-4 py-2.5 text-sm flex items-center gap-2 border border-red-500/20">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              正在聆听...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-border flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="输入文字描述音乐..."
          disabled={isLoading}
          className="flex-1 bg-bg-tertiary text-text-primary text-sm rounded-full px-4 py-2.5 outline-none border border-transparent focus:border-accent/50 placeholder:text-text-muted disabled:opacity-50 transition-colors"
        />
        <VoiceButton
          isListening={isListening}
          supported={speechSupported}
          onToggle={onToggleVoice}
        />
      </form>
    </div>
  );
}

function progressIcon(msg: ChatMessage): string {
  switch (msg.progressKind) {
    case 'tool_call':
      return '⚙';
    case 'tool_result':
      return msg.ok === false ? '✗' : '✓';
    case 'commit':
      return '▶';
    case 'warn':
      return '⚠';
    case 'iteration':
      return '·';
    default:
      return '·';
  }
}

function progressTone(msg: ChatMessage): string {
  if (msg.progressKind === 'commit') {
    return 'bg-accent/15 text-accent-light border-accent/30';
  }
  if (msg.progressKind === 'warn' || msg.ok === false) {
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  }
  if (msg.progressKind === 'tool_result' && msg.ok) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  }
  return 'bg-bg-tertiary/60 text-text-muted border-border';
}
