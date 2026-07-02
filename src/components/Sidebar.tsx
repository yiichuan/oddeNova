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
import EditableSessionTitle from './EditableSessionTitle';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  showThinkingIndicator?: boolean;
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
  onRenameSession: (id: string, title: string) => void;
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
  onOpenPersonaModal: () => void;
  tokenStats?: TokenStats;
}

export default function Sidebar({
  title,
  messages,
  isLoading,
  showThinkingIndicator = true,
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
  onRenameSession,
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
  onOpenPersonaModal,
  tokenStats,
}: SidebarProps) {
  const [airjellyAvailable, setAirjellyAvailable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(1);
  const prevIsLoadingRef = useRef(false);
  const prevPrefillTriggerRef = useRef(prefillTrigger);
  const canShowMoodButton = !navigator.userAgent.includes('Windows') && (airjellyAvailable || isDemoMode());
  const canShowActionRow = suggestions.length > 0 || Boolean(fillSuggestion) || canShowMoodButton;

  useEffect(() => {
    if (prevIsLoadingRef.current && !isLoading) {
      setFocusTrigger((v) => v + 1);
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // When a rollback prefill arrives (prefillTrigger changes), trigger input prefill + focus
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
        <button
          type="button"
          onClick={onOpenPersonaModal}
          aria-label={t('choosePersona')}
          className="text-left text-[32px]"
          style={{
            background: 'linear-gradient(to bottom, #F5F5F5, #333333)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          <span style={{ fontFamily: "'Baskervville', serif", fontStyle: 'italic' }}>odde</span><span style={{ fontFamily: "'42dot Sans', sans-serif", fontWeight: 800 }}>Nova</span>
        </button>
      </div>

      {/* Title row */}
      <div className="pl-5 pr-0 pt-[20px] pb-3 flex items-center justify-between gap-3">
        <EditableSessionTitle
          title={title}
          canEdit={!!currentId && messages.length > 0}
          className="min-w-0 flex-1 text-left"
          titleTextClassName="block min-w-0 text-base font-bold text-text-muted truncate"
          inputClassName="min-w-0 flex-1 bg-transparent border border-border px-1 py-0.5 text-base font-bold text-text-primary outline-none focus:border-accent/60"
          onRename={(nextTitle) => {
            if (currentId) onRenameSession(currentId, nextTitle);
          }}
        />
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
                onRename={onRenameSession}
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
          showThinkingIndicator={showThinkingIndicator}
          isVideoMode={isVideoMode}
          scrollBottom={scrollBottom}
          onRollback={onRollback}
          onBranch={onBranch}
          onRetry={onRetry}
        />
      </div>

      <div className="pl-4 pr-0 pb-2">
        {/* [video] In video mode, hide suggestion chips and the mood button to avoid obscuring the CodePanel view */}
        {!isLoading && !suggestionsLoading && !isVideoMode && canShowActionRow && (
          <div className="suggestion-chips flex flex-wrap gap-2 pb-2">
            <SuggestionChips suggestions={suggestions} disabled={engineStatus !== 'ready'} onPick={onSendText} />
            {fillSuggestion && (
              <button
                key="fill-suggestion"
                type="button"
                onClick={() => onSendText(fillSuggestion)}
                disabled={engineStatus !== 'ready'}
                className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-text-secondary transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('playSong')}
              </button>
            )}
            {canShowMoodButton && (
              <button
                type="button"
                onClick={onMoodGenerate}
                disabled={isMoodLoading || engineStatus !== 'ready'}
                title={t('moodTooltip')}
                className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-text-secondary transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
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
