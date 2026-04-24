import { useEffect, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import type { Session } from '../hooks/useSessions';
import { PlusIcon, HistoryIcon } from './icons';
import ConversationView from './ConversationView';
import ChatInput from './ChatInput';
import { checkAirJellyAvailable } from '../services/airjelly';
import { isDemoMode } from '../demo/demo-config';
import HistoryPanel from './HistoryPanel';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  isMoodLoading?: boolean;
  engineReady: boolean;
  sessions: Session[];
  currentId: string | null;
  suggestions: string[];
  prefill?: string;
  fillSuggestion?: string;
  onFill?: (text: string) => void;
  onSendText: (text: string) => void;
  onNewSession: () => void;
  onMoodGenerate: () => void;
  onReinitEngine: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
}

export default function Sidebar({
  title,
  messages,
  isLoading,
  isMoodLoading = false,
  engineReady,
  sessions,
  currentId,
  suggestions,
  prefill,
  fillSuggestion,
  onFill,
  onSendText,
  onNewSession,
  onMoodGenerate,
  onReinitEngine,
  onSwitchSession,
  onDeleteSession,
}: SidebarProps) {
  const [airjellyAvailable, setAirjellyAvailable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    checkAirJellyAvailable().then(setAirjellyAvailable);
  }, []);

  return (
    <aside className="w-[320px] lg:w-[28%] lg:min-w-[300px] lg:max-w-[400px] shrink-0 flex flex-col bg-bg-primary">
      {/* Logo */}
      <div className="px-5 pt-[5px] pb-2">
        <h1 className="text-[32px]" style={{
          background: 'linear-gradient(to bottom, #F5F5F5, #333333)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          <span style={{ fontFamily: "'Baskervville', serif", fontStyle: 'italic' }}>odde</span><span style={{ fontFamily: "'42dot Sans', sans-serif", fontWeight: 800 }}>Nova</span>
        </h1>
      </div>

      {/* Title row */}
      <div className="pl-5 pr-0 pt-[32px] pb-3 flex items-center justify-between">
        <span className="text-base font-bold text-text-muted truncate" title={title}>
          {title}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`w-7 h-7 rounded-full border border-border transition-colors flex items-center justify-center ${
              showHistory ? 'text-text-primary border-accent/50' : 'text-text-secondary hover:text-text-primary hover:border-accent/50'
            }`}
            title="查看历史"
          >
            <HistoryIcon size={14} />
          </button>
          <button
            onClick={onNewSession}
            className="w-7 h-7 rounded-full border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
            title="新建会话"
          >
            <PlusIcon size={14} />
          </button>
        </div>
      </div>

      {/* Conversation flow + history overlay */}
      <div className="flex-1 min-h-0 flex flex-col pt-[10px] pb-[30px] relative">
        {showHistory && (
          <>
            <div className="fixed inset-0 z-[9]" onClick={() => setShowHistory(false)} />
            <div className="absolute top-0 left-4 right-0 h-1/2 z-10">
              <HistoryPanel
                sessions={sessions}
                currentId={currentId}
                onSwitch={(id) => { onSwitchSession(id); setShowHistory(false); }}
                onDelete={onDeleteSession}
              />
            </div>
          </>
        )}
        <ConversationView
          messages={messages}
          isLoading={isLoading}
        />
      </div>

      <div className="flex justify-center pl-4 pr-0 pb-4">
        <div className="w-full max-w-[500px]">
          {!isLoading && (
            <div className="flex flex-wrap gap-2 pb-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSendText(s)}
                  className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#cccccc] transition hover:border-accent/50 hover:text-text-primary"
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  {s}
                </button>
              ))}
              {fillSuggestion && onFill && (
                <button
                  key="fill-suggestion"
                  type="button"
                  onClick={() => onFill(fillSuggestion)}
                  className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#e0e0e0] transition hover:border-accent/50 hover:text-text-primary"
                  style={{ fontFamily: '"GenWanMin TW", serif' }}
                >
                  灵感一下…
                </button>
              )}
              <button
                type="button"
                onClick={onMoodGenerate}
                disabled={(!airjellyAvailable && !isDemoMode()) || isMoodLoading}
                title={airjellyAvailable || isDemoMode() ? '根据你最近的活动感知心情生成音乐' : '需要运行 AirJelly Desktop'}
                className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#e0e0e0] transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: '"GenWanMin TW", serif' }}

              >
                <img src="/airjelly-icon.png" alt="AirJelly" className="inline-block w-3.5 h-3.5 mr-1 align-[-3px]" /> 根据心情生成
              </button>
            </div>
          )}

          <ChatInput isLoading={isLoading} engineReady={engineReady} onSendText={onSendText} onReinitEngine={onReinitEngine} prefill={prefill} />
        </div>
      </div>
    </aside>
  );
}
