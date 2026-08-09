import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { t } from '../lib/i18n';
import type { CodeRevision, Session, TokenStats } from '../hooks/useSessions';
import { MessageCirclePlusIcon, HistoryIcon, PlayIcon } from './icons';
import ConversationView from './ConversationView';
import ChatInput from './ChatInput';
import { isPresentationMode } from '../demo/demo-config';
import HistoryPanel from './HistoryPanel';
import EditableSessionTitle from './EditableSessionTitle';
import type { AgentEntryPoint } from '../lib/analytics';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  revisions?: CodeRevision[];
  isLoading: boolean;
  engineReady: boolean;
  engineStatus?: 'initializing' | 'ready' | 'failed';
  sessions: Session[];
  currentId: string | null;
  suggestions: string[];
  onSendText: (
    text: string,
    entryPoint: Extract<AgentEntryPoint, 'text' | 'suggestion'>,
  ) => void;
  onStop?: () => void;
  onNewSession: () => void;
  onMoodGenerate?: () => Promise<void> | void;
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
  tokenStats?: TokenStats;
}

export default function Sidebar({
  title,
  messages,
  revisions,
  isLoading,
  engineReady,
  engineStatus = engineReady ? 'ready' : 'initializing',
  sessions,
  currentId,
  suggestions,
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
  tokenStats,
}: SidebarProps) {
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

  // When a rollback prefill arrives (prefillTrigger changes), trigger input prefill + focus
  useEffect(() => {
    if (prefillTrigger !== undefined && prefillTrigger !== prevPrefillTriggerRef.current) {
      prevPrefillTriggerRef.current = prefillTrigger;
      setFocusTrigger((v) => v + 1);
    }
  }, [prefillTrigger]);

  return (
    <aside className="w-full h-full flex flex-col bg-conversation-surface">
      <div
        data-sidebar-message-region
        className="w-full flex-1 min-h-0 flex flex-col overflow-hidden rounded-t-region rounded-b-none border border-border"
      >
        {/* Title row */}
        <div className="pl-2 pr-2 pt-[10px] pb-3 flex items-center justify-between gap-3">
          <EditableSessionTitle
            title={title}
            canEdit={!!currentId && messages.length > 0}
            className="min-w-0 flex-1 text-left"
            titleTextClassName="text-base font-bold text-text-primary"
            inputClassName="text-base font-bold text-text-primary"
            onRename={(nextTitle) => {
              if (currentId) onRenameSession(currentId, nextTitle);
            }}
          />
          <div className="flex items-center gap-2 shrink-0">
            {isPresentationMode() && onReplay && !isReplaying && (
              <button
                onClick={onReplay}
                className="w-7 h-7 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center"
                title={t('replaySession')}
              >
                <PlayIcon size={18} />
              </button>
            )}
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`w-7 h-7 transition-colors flex items-center justify-center ${
                showHistory ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
              title={t('viewHistory')}
            >
              <HistoryIcon size={18} />
            </button>
            <button
              onClick={() => { onNewSession(); setFocusTrigger(v => v + 1); }}
              className="w-7 h-7 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center"
              title={t('newSession')}
            >
              <MessageCirclePlusIcon size={18} />
            </button>
          </div>
        </div>

        {/* Conversation flow + history overlay */}
        <div className="flex-1 min-h-0 flex flex-col pt-[10px] pb-[20px] relative">
          {showHistory && (
            <>
              <div className="fixed inset-0 z-[9]" onClick={() => setShowHistory(false)} />
              <div className="history-panel-surface absolute top-0 left-3 right-3 max-h-[33.333%] z-10 overflow-y-auto rounded-region border border-border bg-[#0D0D0D]">
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
            revisions={revisions}
            isLoading={isLoading && !isReplaying}
            isVideoMode={isVideoMode}
            scrollBottom={scrollBottom}
            onRollback={onRollback}
            onBranch={onBranch}
            onRetry={onRetry}
          />
        </div>
      </div>

      <div className="-mt-px w-full shrink-0">
        <ChatInput isLoading={isLoading} engineReady={engineReady} engineStatus={engineStatus} onSendText={onSendText} onStop={onStop} onReinitEngine={onReinitEngine} prefill={prefill} focusTrigger={focusTrigger} replayValue={replayInputText} isVideoMode={isVideoMode} tokenStats={tokenStats} suggestions={suggestions} onMoodGenerate={onMoodGenerate} />
      </div>
    </aside>
  );
}
