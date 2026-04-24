import { useEffect, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { PlusIcon } from './icons';
import ConversationView from './ConversationView';
import ChatInput from './ChatInput';
import { checkAirJellyAvailable } from '../services/airjelly';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
  onNewSession: () => void;
  onMoodGenerate: () => void;
}

export default function Sidebar({
  title,
  messages,
  isLoading,
  engineReady,
  onSendText,
  onNewSession,
  onMoodGenerate,
}: SidebarProps) {
  const [airjellyAvailable, setAirjellyAvailable] = useState(false);

  useEffect(() => {
    checkAirJellyAvailable().then(setAirjellyAvailable);
  }, []);

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

      <div className="flex justify-center px-4 pb-4">
        <div className="w-full max-w-[500px]">
          <div className="flex flex-wrap gap-2 pb-2">
            <button
              type="button"
              onClick={() => onSendText('下一步动作的提示')}
              className="rounded-[8px] bg-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e0e0e0] transition hover:bg-[#4a4a4a]"
            >
              下一步动作的提示
            </button>
            <button
              type="button"
              onClick={() => onSendText('加一些贝斯？')}
              className="rounded-[8px] bg-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e0e0e0] transition hover:bg-[#4a4a4a]"
            >
              加一些贝斯？
            </button>
            <button
              type="button"
              onClick={onMoodGenerate}
              disabled={!airjellyAvailable || isLoading}
              title={airjellyAvailable ? '根据你最近的活动感知心情生成音乐' : '需要运行 AirJelly Desktop'}
              className="rounded-[8px] bg-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e0e0e0] transition hover:bg-[#4a4a4a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🎭 根据心情生成
            </button>
          </div>

          <ChatInput isLoading={isLoading} engineReady={engineReady} onSendText={onSendText} />
        </div>
      </div>
    </aside>
  );
}
