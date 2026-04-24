import type { ChatMessage } from '../hooks/useChat';
import { PlusIcon } from './icons';
import ConversationView from './ConversationView';
import ChatInput from './ChatInput';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
  onNewSession: () => void;
  onReinitEngine: () => void;
}

export default function Sidebar({
  title,
  messages,
  isLoading,
  engineReady,
  onSendText,
  onNewSession,
  onReinitEngine,
}: SidebarProps) {
  return (
    <aside className="w-[320px] lg:w-[28%] lg:min-w-[300px] lg:max-w-[400px] shrink-0 flex flex-col bg-bg-primary">
      {/* Logo */}
      <div className="px-5 pt-5 pb-2">
        <h1 className="text-2xl font-bold tracking-wider text-text-primary">
          *LOGO*
        </h1>
      </div>

      {/* Title row */}
      <div className="pl-5 pr-0 pt-[32px] pb-3 flex items-center justify-between">
        <span className="text-base font-medium text-text-primary truncate" title={title} style={{ fontFamily: '"GenWanMin TW", serif' }}>
          {title}
        </span>
        <button
          onClick={onNewSession}
          className="w-7 h-7 rounded-full border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center shrink-0"
          title="新建会话"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Conversation flow */}
      <div className="flex-1 min-h-0 flex flex-col pt-[10px] pb-[30px]">
        <ConversationView
          messages={messages}
          isLoading={isLoading}
        />
      </div>

      <div className="flex justify-center pl-4 pr-0 pb-4">
        <div className="w-full max-w-[500px]">
          <div className="flex flex-wrap gap-2 pb-2">
            <button
              type="button"
              onClick={() => onSendText('下一步动作的提示')}
              className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#e0e0e0] transition hover:border-accent/50 hover:text-text-primary"
              style={{ fontFamily: '"GenWanMin TW", serif' }}
            >
              下一步动作的提示
            </button>
            <button
              type="button"
              onClick={() => onSendText('加一些贝斯？')}
              className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#e0e0e0] transition hover:border-accent/50 hover:text-text-primary"
              style={{ fontFamily: '"GenWanMin TW", serif' }}
            >
              加一些贝斯？
            </button>
          </div>

          <ChatInput isLoading={isLoading} engineReady={engineReady} onSendText={onSendText} onReinitEngine={onReinitEngine} />
        </div>
      </div>
    </aside>
  );
}
