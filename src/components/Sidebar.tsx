import type { ChatMessage } from '../hooks/useChat';
import { PlusIcon } from './icons';
import ConversationView from './ConversationView';
import SuggestionChips from './SuggestionChips';
import ChatInput from './ChatInput';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  engineReady: boolean;
  suggestions: string[];
  onSendText: (text: string) => void;
  onNewSession: () => void;
}

export default function Sidebar({
  title,
  messages,
  isLoading,
  engineReady,
  suggestions,
  onSendText,
  onNewSession,
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
      <div className="px-5 py-3 flex items-center justify-between">
        <span className="text-base font-medium text-text-primary truncate" title={title}>
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
      <ConversationView
        messages={messages}
        isLoading={isLoading}
      />

      {/* Suggestions + input + status */}
      <div className="px-4 py-3 space-y-3">
        <SuggestionChips suggestions={suggestions} onPick={onSendText} disabled={isLoading} />
        <ChatInput
          isLoading={isLoading}
          onSendText={onSendText}
        />
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              engineReady ? 'bg-success' : 'bg-text-muted'
            }`}
          />
          <span className="text-text-muted">{engineReady ? '引擎就绪' : '未初始化'}</span>
        </div>
      </div>
    </aside>
  );
}
