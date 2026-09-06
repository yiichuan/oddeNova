import { useEffect, useRef, useState } from 'react';
import type { SessionSummary } from '../../../shared/session-api';
import type { ChatMessage, InputMode } from '../../hooks/useChat';
import { t } from '../../lib/i18n';
import type { CodeRevision, Session } from '../../hooks/useSessions';
import { MessageCirclePlusIcon, HistoryIcon, PlayIcon } from '../icons';
import ConversationView from './ConversationView';
import ChatInput from './ChatInput';
import { isPresentationMode } from '../../demo/demo-config';
import HistoryPanel from './HistoryPanel';
import EditableSessionTitle from './EditableSessionTitle';
import type { AgentEntryPoint } from '../../lib/analytics';

interface SidebarProps {
  title: string;
  messages: ChatMessage[];
  revisions?: CodeRevision[];
  isLoading: boolean;
  engineReady: boolean;
  engineStatus?: 'initializing' | 'ready' | 'failed';
  sessions: readonly (Session | SessionSummary)[];
  currentId: string | null;
  inputMode?: InputMode;
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
  onFavoriteSession?: (id: string) => void;
  isHistoryLoading?: boolean;
  historyInitialError?: Error | null;
  onRetryHistory?: () => void;
  historyHasMore?: boolean;
  historyLoadingMore?: boolean;
  historyLoadMoreError?: Error | null;
  onLoadMoreHistory?: () => void;
  onRetryLoadMoreHistory?: () => void;
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
  inputMode = 'normal',
  suggestions,
  onSendText,
  onStop,
  onNewSession,
  onMoodGenerate,
  onReinitEngine,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
  onFavoriteSession,
  isHistoryLoading = false,
  historyInitialError = null,
  onRetryHistory,
  historyHasMore = false,
  historyLoadingMore = false,
  historyLoadMoreError = null,
  onLoadMoreHistory,
  onRetryLoadMoreHistory,
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

  /* The list is a way into another conversation, not a place to stand: once the
     studio is showing a different session it has done its job and folds away.
     That covers the session it never sent you to itself — keeping the
     conversation you are in starts a fresh one behind the notice, and a list
     still hanging over an empty studio would be pointing at where you were.
     Keeping some *other* conversation is the case this deliberately misses:
     the studio stays where it is, and so does the list, because undoing has to
     have a row to put back. */
  useEffect(() => {
    setShowHistory(false);
  }, [currentId]);

  // When a rollback prefill arrives (prefillTrigger changes), trigger input prefill + focus
  useEffect(() => {
    if (prefillTrigger !== undefined && prefillTrigger !== prevPrefillTriggerRef.current) {
      prevPrefillTriggerRef.current = prefillTrigger;
      setFocusTrigger((v) => v + 1);
    }
  }, [prefillTrigger]);

  return (
    <aside className="w-full h-full flex flex-col overflow-hidden rounded-region bg-conversation-surface">
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
              className={`flex h-7 w-7 items-center justify-center rounded-[6px] text-text-secondary transition-colors ${
                showHistory ? 'bg-surface-selected' : 'hover:bg-surface-hover'
              }`}
              title={t('viewHistory')}
            >
              <HistoryIcon size={18} />
            </button>
            <button
              /* Also closed here, not only by the effect above: an empty
                 session is reused rather than replaced, so starting a new one
                 twice over leaves the id — and the effect — unmoved. */
              onClick={() => { onNewSession(); setShowHistory(false); setFocusTrigger(v => v + 1); }}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-text-secondary transition-colors hover:bg-surface-hover"
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
              <div className="history-panel-surface absolute top-0 left-3 right-3 max-h-[33.333%] z-10 overflow-y-auto rounded-region border border-border bg-conversation-surface">
                <HistoryPanel
                  sessions={sessions}
                  currentId={currentId}
                  isLoading={isHistoryLoading}
                  initialError={historyInitialError}
                  onRetryInitial={onRetryHistory}
                  onSwitch={(id) => { onSwitchSession(id); setShowHistory(false); }}
                  onDelete={onDeleteSession}
                  onRename={onRenameSession}
                  /* The list stays open behind the dialog on purpose: undoing
                     puts the row back, and a panel that shut on the way out
                     would have nowhere to put it back to. */
                  onFavorite={onFavoriteSession}
                  loadingSessions={loadingSessions}
                  unreadSessions={unreadSessions}
                  hasMore={historyHasMore}
                  isLoadingMore={historyLoadingMore}
                  loadMoreError={historyLoadMoreError}
                  onLoadMore={onLoadMoreHistory}
                  onRetryLoadMore={onRetryLoadMoreHistory}
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
        <ChatInput isLoading={isLoading} engineReady={engineReady} engineStatus={engineStatus} onSendText={onSendText} onStop={onStop} onReinitEngine={onReinitEngine} prefill={prefill} focusTrigger={focusTrigger} replayValue={replayInputText} isVideoMode={isVideoMode} inputMode={inputMode} suggestions={suggestions} onMoodGenerate={onMoodGenerate} />
      </div>
    </aside>
  );
}
