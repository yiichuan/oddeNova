import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { t } from '../lib/i18n';
import type { Session, TokenStats } from '../hooks/useSessions';
import { PlusIcon, HistoryIcon, PlayIcon } from './icons';
import SuggestionChips from './SuggestionChips';
import ConversationView from './ConversationView';
import ChatInput from './ChatInput';
import { checkAirJellyAvailable } from '../services/airjelly';
import { isDemoMode, isPresentationMode } from '../demo/demo-config';
import HistoryPanel from './HistoryPanel';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  isMoodLoading?: boolean;
  engineReady: boolean;
  engineStatus?: 'initializing' | 'ready' | 'failed';
  sessions: Session[];
  currentId: string | null;
  suggestions: string[];
  suggestionsLoading?: boolean;
  fillSuggestion?: string;
  onSendText: (text: string) => void;
  onStop?: () => void;
  onNewSession: () => void;
  onMoodGenerate: () => void;
  onReinitEngine: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isHistoryLoading?: boolean;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
  onReplay?: () => void;
  isReplaying?: boolean;
  replayInputText?: string;
  isVideoMode?: boolean;
  scrollBottom?: boolean;
  prefill?: string;
  prefillTrigger?: number;
  onRollback: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  tokenStats?: TokenStats;
}

export default function Sidebar({
  title,
  messages,
  isLoading,
  isMoodLoading = false,
  engineReady,
  engineStatus = engineReady ? 'ready' : 'initializing',
  sessions,
  currentId,
  suggestions,
  suggestionsLoading = false,
  fillSuggestion,
  onSendText,
  onStop,
  onNewSession,
  onMoodGenerate,
  onReinitEngine,
  onSwitchSession,
  onDeleteSession,
  isHistoryLoading = false,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
  onReplay,
  isReplaying = false,
  replayInputText,
  isVideoMode = false,
  scrollBottom = false,
  prefill,
  prefillTrigger,
  onRollback,
  onBranch,
  onRetry,
  tokenStats,
}: SidebarProps) {
  const [airjellyAvailable, setAirjellyAvailable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(1);
  const prevIsLoadingRef = useRef(false);
  const prevPrefillTriggerRef = useRef(prefillTrigger);

  useEffect(() => {
    if (prevIsLoadingRef.current && !isLoading) {
      setFocusTrigger((v) => v + 1);
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // 回滚回填到来时（prefillTrigger 变化）一并触发输入框的回填 + 聚焦
  useEffect(() => {
    if (prefillTrigger !== undefined && prefillTrigger !== prevPrefillTriggerRef.current) {
      prevPrefillTriggerRef.current = prefillTrigger;
      setFocusTrigger((v) => v + 1);
    }
  }, [prefillTrigger]);

  useEffect(() => {
    checkAirJellyAvailable().then(setAirjellyAvailable);
  }, []);

  return (
    <aside className="w-full h-full flex flex-col">
      {/* Logo */}
      <div className="pl-5 pr-0 pt-[5px] pb-2 flex items-center">
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
      <div className="pl-5 pr-0 pt-[20px] pb-3 flex items-center justify-between ">
        <span className="text-base font-bold text-text-muted truncate" title={title}>
          {title}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {isPresentationMode() && onReplay && !isReplaying && (
            <button
              onClick={onReplay}
              className="w-7 h-7 rounded-full border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
              title={t('replaySession')}
            >
              <PlayIcon size={14} />
            </button>
          )}
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`w-7 h-7 rounded-full border border-border transition-colors flex items-center justify-center ${
              showHistory ? 'text-text-primary border-accent/50' : 'text-text-secondary hover:text-text-primary hover:border-accent/50'
            }`}
            title={t('viewHistory')}
          >
            <HistoryIcon size={14} />
          </button>
          <button
            onClick={() => { onNewSession(); setFocusTrigger(v => v + 1); }}
            className="w-7 h-7 rounded-full border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
            title={t('newSession')}
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
            <div className="absolute top-0 left-5 right-0 max-h-[33.333%] z-10 bg-bg-primary border border-border overflow-y-auto">
              <HistoryPanel
                sessions={sessions}
                currentId={currentId}
                isLoading={isHistoryLoading}
                onSwitch={(id) => { onSwitchSession(id); setShowHistory(false); }}
                onDelete={onDeleteSession}
                loadingSessions={loadingSessions}
                unreadSessions={unreadSessions}
              />
            </div>
          </>
        )}
        <ConversationView
          key={currentId ?? 'default'}
          messages={messages}
          isLoading={isLoading && !isReplaying}
          isVideoMode={isVideoMode}
          scrollBottom={scrollBottom}
          onRollback={onRollback}
          onBranch={onBranch}
          onRetry={onRetry}
        />
      </div>

      <div className="pl-4 pr-0 pb-2">
        {/* [video] In video mode, hide suggestion chips and the mood button to avoid obscuring the CodePanel view */}
        {!isLoading && !suggestionsLoading && !isVideoMode && (
          <div className="suggestion-chips flex flex-wrap gap-2 pb-2">
            <SuggestionChips suggestions={suggestions} disabled={engineStatus !== 'ready'} onPick={onSendText} />
            {fillSuggestion && (
              <button
                key="fill-suggestion"
                type="button"
                onClick={() => onSendText(fillSuggestion)}
                disabled={engineStatus !== 'ready'}
                className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#e0e0e0] transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: '"GenWanMin TW", serif' }}
              >
                {t('playSong')}
              </button>
            )}
            {!navigator.userAgent.includes('Windows') && (airjellyAvailable || isDemoMode()) && (
              <button
                type="button"
                onClick={onMoodGenerate}
                disabled={isMoodLoading || engineStatus !== 'ready'}
                title={t('moodTooltip')}
                className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#e0e0e0] transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: '"GenWanMin TW", serif' }}
              >
                <img src="/airjelly-icon.png" alt="AirJelly" className="inline-block w-3.5 h-3.5 mr-1 align-[-3px]" /> {t('moodGenerate')}
              </button>
            )}
          </div>
        )}
        <ChatInput isLoading={isLoading} engineReady={engineReady} engineStatus={engineStatus} onSendText={onSendText} onStop={onStop} onReinitEngine={onReinitEngine} prefill={prefill} focusTrigger={focusTrigger} replayValue={replayInputText} isVideoMode={isVideoMode} tokenStats={tokenStats} />
      </div>
    </aside>
  );
}
