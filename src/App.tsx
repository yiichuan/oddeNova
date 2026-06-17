import { useCallback, useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import CodePanel from './components/CodePanel';
import Sidebar from './components/Sidebar';
import VizPlaceholder from './components/VizPlaceholder';
import { useStrudel } from './hooks/useStrudel';
import { useSessions } from './hooks/useSessions';
import { useSuggestions } from './hooks/useSuggestions';
import { fetchMoodContext } from './services/airjelly';
import { generateSongTitle } from './services/song-title';
import type { ConversationTurn, ProgressEvent } from './services/llm';
import { conversationHistoryBefore } from './lib/conversation-history';
import { commitPlayback } from './lib/playback-commit';
import { isDemoMode, getActiveDemoSet, DEMO_PREFILL } from './demo/demo-config';
import ApiKeyModal from './components/ApiKeyModal';
import { hasApiKeyConfigured } from './services/llm-config';
import { resetClient } from './services/llm';
import { HistoryIcon, PlusIcon } from './components/icons';
import { parseScore } from './agent/parser';
import { useImportShare } from './hooks/useImportShare';
import { useReplay } from './hooks/useReplay';
import { useAgentRunner } from './hooks/useAgentRunner';
import { useVideoDemo } from './hooks/useVideoDemo';
import { useLayout } from './hooks/useLayout';
import ConversationView from './components/ConversationView';
import HistoryPanel from './components/HistoryPanel';
import ChatInput from './components/ChatInput';
import TopActionBar from './components/TopActionBar';
import { zh, t } from './lib/i18n';
import { getEngineUnavailableMessage } from './lib/engine-status';

export default function App() {
  const strudel = useStrudel();
  const { isReplaying, replayMessages, replayInputText, startReplay } = useReplay(
    (code) => { strudel.play(code); }
  );
  const sessions = useSessions();
  const importStatus = useImportShare(sessions.importSession, !sessions.isLoading);
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [commitSuggestions, setCommitSuggestions] = useState<string[] | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const [rollbackPrefill, setRollbackPrefill] = useState('');
  const [inputFocusTrigger, setInputFocusTrigger] = useState(1);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const currentIdRef = useRef<string | null>(sessions.currentId);
  const prevLoadingRef = useRef<Set<string>>(new Set());
  // Use ref to prevent the postMessage handler from capturing a stale strudel closure
  const strudelRef = useRef(strudel);
  useEffect(() => { strudelRef.current = strudel; }, [strudel]);
  const { isVideoMode, videoDemoMsgs, videoConvScrollBottom, videoTitle } = useVideoDemo(strudelRef);

  const {
    isMobile,
    keyboardHeight,
    sidebarWidth,
    vizHeight,
    isDragging,
    mainRef,
    topActionsRef,
    hDragHandlers,
    vDragHandlers,
    historyOpen,
    setHistoryOpen,
    drawerOpen,
    setDrawerOpen,
    mobileFocusedArea,
    shouldLiftBottomBar,
    mobileDrawerHeight,
    handleChatFocusChange,
    handleCodeFocusChange,
  } = useLayout();
  useEffect(() => {
    currentIdRef.current = sessions.currentId;
  }, [sessions.currentId]);

  useEffect(() => {
    const prev = prevLoadingRef.current;
    const curr = loadingSessions;
    // Find IDs that disappeared from loading in this round (i.e. sessions that finished generating)
    const completed = [...prev].filter((id) => !curr.has(id));
    if (completed.length > 0) {
      setUnreadSessions((prevUnread) => {
        const next = new Set(prevUnread);
        for (const id of completed) {
          // Only mark as unread if it is not the current session
          if (id !== currentIdRef.current) {
            next.add(id);
          }
        }
        return next;
      });
    }
    prevLoadingRef.current = curr;
  }, [loadingSessions]);

  const handleStop = useCallback(() => {
    const id = sessions.currentId;
    if (id) {
      abortControllersRef.current.get(id)?.abort();
    }
  }, [sessions]);

  const [showApiKeyModal, setShowApiKeyModal] = useState(() => {
    try { if (window.self !== window.top) return false; } catch { return false; }
    return !hasApiKeyConfigured();
  });
  const [importErrorDismissed, setImportErrorDismissed] = useState(false);

  const current = sessions.currentSession;
  const messages = isReplaying ? replayMessages : (current?.messages ?? []);
  // Session code = last committed/played code (used as agent context)
  // Fall back to live editor code so manually-pasted code is visible to the agent.
  const currentCode = strudel.code || (current?.code ?? '');
  const currentBpm = parseScore(currentCode).bpm ?? 120;
  const hasUserMessages = messages.some((m) => m.role === 'user');
  const isLoading = !!current?.id && loadingSessions.has(current.id);

  const { suggestions, loading: suggestionsLoading } = useSuggestions({
    key: current?.id ?? '',
    currentCode: current?.code ?? '',
    // In demo mode real LLM suggestions are not needed; skip the buildSuggestions call
    hasUserMessages: isDemoMode() ? false : hasUserMessages,
    messages,
    commitSuggestions: commitSuggestions ?? undefined,
  });
  const activeSet = getActiveDemoSet();
  const demoSuggestions = isDemoMode()
    ? (demoStep < activeSet.length ? [activeSet[demoStep].prompt] : [])
    : suggestions;

  // When the session switches, restore its code into the editor and stop audio
  useEffect(() => {
    if (!current) return;
    strudel.setCode(current.code);
    strudel.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when session ID changes
  }, [current?.id]);

  // Option+. (Alt+.) global play/stop toggle — matches strudel's Alt+. keybinding
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Period' && e.key !== '.') {
        e.preventDefault();
        if (strudelRef.current.isPlaying) {
          strudelRef.current.stop();
        } else if (strudelRef.current.engineReady) {
          void strudelRef.current.play();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Build the agent progress→UI handler for a given session. Shared verbatim by
  // handleInstruction and handleMoodInstruction.
  const makeAgentProgressHandler = useCallback(
    (sessionId: string) => (e: ProgressEvent) => {
      if (e.kind === 'iteration') return;
      if (e.kind === 'tool_call') {
        if (e.name !== 'validate' && e.name !== 'commit') {
          sessions.addProgress('tool_call', formatToolCall(e.name, e.args), { toolName: e.name, sessionId });
        }
        return;
      }
      if (e.kind === 'tool_result') {
        if (!e.ok) console.error(`[agent] ❌ tool "${e.name}" failed:`, e.error || 'unknown error');
        return;
      }
      if (e.kind === 'commit') { sessions.addProgress('commit', t('preparingToPlay'), { sessionId }); return; }
      if (e.kind === 'warn') { sessions.addProgress('warn', e.message, { sessionId }); return; }
      if (e.kind === 'reasoning_delta') { sessions.appendToLastReasoning(e.delta, sessionId); return; }
      if (e.kind === 'assistant_text_delta') { sessions.appendToLastThinking(e.delta, sessionId); return; }
      if (e.kind === 'assistant_text') { sessions.addProgress('thinking', e.text, { sessionId }); return; }
    },
    [sessions]
  );

  // One Agent turn (instruction → generation → playback + persistence), shared by
  // the text and mood entry points below. See src/hooks/useAgentRunner.ts.
  const runTurn = useAgentRunner({
    strudel,
    sessions,
    currentCode,
    abortControllersRef,
    currentIdRef,
    setLoadingSessions,
    setCommitSuggestions,
    setRollbackPrefill,
    makeProgressHandler: makeAgentProgressHandler,
  });

  const handleInstruction = useCallback(
    (text: string, options?: {
      skipAddMessage?: boolean;
      initialCode?: string;
      history?: ConversationTurn[];
    }) => {
      // In demo mode, if the sent text matches the current step's prompt, advance to the next step.
      if (isDemoMode() && activeSet[demoStep]?.prompt === text) {
        setDemoStep((s) => s + 1);
      }
      return runTurn({
        text,
        includeHistory: true,
        skipAddMessage: options?.skipAddMessage,
        initialCode: options?.initialCode,
        suppliedHistory: options?.history,
      });
    },
    [runTurn, activeSet, demoStep]
  );

  // Abort any in-progress run and rewind strudel/session code state to before messageId was sent.
  // Shared by handleResend (edit + resend) and handleRollback (rewind only);
  // they diverge only in what they do after the rewind (overwrite + resend vs. prefill input).
  const rewindBeforeMessage = useCallback(
    async (messageId: string) => {
      const currentSessionId = sessions.currentId;
      if (currentSessionId) {
        abortControllersRef.current.get(currentSessionId)?.abort();
      }
      // Find the last assistant message with code before this message, as the rollback target

      const allMessages = sessions.currentSession?.messages ?? [];
      const idx = allMessages.findIndex((m) => m.id === messageId);
      if (idx < 0) return null;
      const target = allMessages[idx];

      // Find the last assistant message with code before this message, as the rollback target
      const prevAssistant = [...allMessages.slice(0, idx)].reverse().find((m) => m.role === 'assistant' && m.code != null);
      const previousCode = prevAssistant?.code ?? '';

      // Roll back to the rollback target and commit it as the session truth.
      // A non-empty target plays + persists via commitPlayback; an empty one clears.
      if (previousCode) {
        if (sessions.currentId) {
          await commitPlayback(previousCode, sessions.currentId, {
            play: strudel.play,
            setCurrentCode: sessions.setCurrentCode,
          });
        } else {
          await strudel.play(previousCode);
        }
      } else {
        strudel.stop();
        strudel.setCode('');
        if (sessions.currentId) sessions.setCurrentCode('', sessions.currentId);
      }

      return { target, previousCode };
    },
    [sessions, strudel]
  );

  const handleResend = useCallback(
    async (messageId: string, newContent: string) => {
      const allMsgs = sessions.currentSession?.messages ?? [];
      const history = conversationHistoryBefore(allMsgs, messageId);

      const rewound = await rewindBeforeMessage(messageId);
      if (!rewound) return;

      sessions.truncateAndEdit(messageId, newContent);
      await handleInstruction(newContent, {
        skipAddMessage: true,
        initialCode: rewound.previousCode,
        history,
      });
    },
    [sessions, handleInstruction, rewindBeforeMessage]
  );

  const handleRollback = useCallback(
    async (messageId: string) => {
      const rewound = await rewindBeforeMessage(messageId);
      if (!rewound) return;

      sessions.truncate(messageId);

      // Prefill the input with the message content and focus
      setRollbackPrefill(rewound.target.content);
      setInputFocusTrigger((n) => n + 1);
    },
    [sessions, rewindBeforeMessage]
  );

  const handleRetry = useCallback(
    async (assistantMessageId: string) => {
      const allMessages = sessions.currentSession?.messages ?? [];
      const idx = allMessages.findIndex((m) => m.id === assistantMessageId);
      if (idx < 0) return;
      const userMsg = [...allMessages.slice(0, idx)].reverse().find((m) => m.role === 'user');
      if (!userMsg) return;
      await handleResend(userMsg.id, userMsg.content);
    },
    [sessions, handleResend]
  );

  const handleMoodInstruction = useCallback(async () => {
    // Pre-flight engine check before the (potentially slow) mood fetch, so we don't
    // fire the mood request when audio is unavailable. runTurn re-checks internally.
    const engineUnavailableMessage = getEngineUnavailableMessage(strudel.engineStatus);
    if (engineUnavailableMessage) {
      strudel.setError(engineUnavailableMessage);
      return;
    }

    let moodContext: string | null = null;
    if (!isDemoMode()) {
      setIsMoodLoading(true);
      moodContext = await fetchMoodContext();
      setIsMoodLoading(false);
    }

    // Mood generation is a one-off creation: deliberately no conversation history.
    await runTurn({
      text: '根据我的心情生成音乐',
      moodContext: moodContext ?? undefined,
      includeHistory: false,
    });
  }, [strudel, runTurn]);

  // Persist any unsaved manual edits in the editor to the outgoing session
  // before switching/creating, so they aren't overwritten by the next
  // session's code. Skip when strudel.code is empty or unchanged to avoid
  // clobbering a session's stored code with stale/empty editor state
  // (e.g. before the editor has synced on initial mount) and to avoid
  // redundant writes when nothing changed.
  const persistLiveCodeToCurrentSession = useCallback(() => {
    if (sessions.currentId && strudel.code && strudel.code !== current?.code) {
      sessions.setCurrentCode(strudel.code, sessions.currentId);
    }
  }, [sessions, strudel, current?.code]);

  const handleNewSession = useCallback(() => {
    persistLiveCodeToCurrentSession();
    strudel.stop();
    sessions.newSession();
    if (isDemoMode()) setDemoStep(0);
  }, [strudel, sessions, persistLiveCodeToCurrentSession]);

  const handleSwitchSession = useCallback((id: string) => {
    if (sessions.currentId !== id) {
      persistLiveCodeToCurrentSession();
    }
    setCommitSuggestions(null);
    setUnreadSessions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    sessions.switchTo(id);
  }, [sessions, persistLiveCodeToCurrentSession]);

  if (isMobile) {
    return (
      <div className="flex flex-col bg-bg-primary overflow-hidden" style={{ height: '100%', width: '100%' }}>
        {showApiKeyModal && (
          <ApiKeyModal
            onClose={() => setShowApiKeyModal(false)}
            onSaved={resetClient}
            required={!hasApiKeyConfigured()}
          />
        )}

        {/* ── Top Nav ── */}
        <div
          className="relative flex items-center justify-between px-2 shrink-0"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '12px' }}
        >
          <div className="flex items-center">
            <button
              onClick={handleNewSession}
              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t('newSession')}
              title={t('newSession')}
            >
              <PlusIcon size={18} />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t('sessionHistory')}
              title={t('sessionHistory')}
            >
              <HistoryIcon size={18} />
            </button>
          </div>
          <h1 className="text-[24px] absolute left-1/2 -translate-x-1/2" style={{
            background: 'linear-gradient(to bottom, #F5F5F5, #333333)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            <span style={{ fontFamily: "'Baskervville', serif", fontStyle: 'italic' }}>odde</span>
            <span style={{ fontFamily: "'42dot Sans', sans-serif", fontWeight: 800 }}>Nova</span>
          </h1>
          <TopActionBar
            onOpenSettings={() => setShowApiKeyModal(true)}
            session={sessions.currentSession}
            code={strudel.code}
            messages={messages}
            engineReady={strudel.engineReady}
            hasCode={!!strudel.code}
            exportState={strudel.exportState}
            onExport={strudel.exportWav}
            onGenerateTitle={generateSongTitle}
            onResetExportState={strudel.resetExportState}
            bpm={currentBpm}
          />
        </div>

        {/* ── Conversation ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConversationView key={sessions.currentId ?? 'default'} messages={messages} isLoading={isLoading} onRollback={handleRollback} onBranch={sessions.branchFromMessage} onRetry={handleRetry} />
        </div>

        {/* ── Code Drawer ── */}
        <div
          className="shrink-0 overflow-hidden border-t border-border"
          style={{
            height: mobileDrawerHeight,
            transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <CodePanel
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                engineReady={strudel.engineReady}
                hasCode={!!strudel.code}
                onMount={strudel.setRoot}
                onPlay={() => strudel.play()}
                onStop={strudel.stop}
                exportState={strudel.exportState}
                onExport={strudel.exportWav}
                onGenerateTitle={generateSongTitle}
                onResetExportState={strudel.resetExportState}
                session={sessions.currentSession}
                messages={messages}
                onOpenSettings={() => setShowApiKeyModal(true)}
                onEditorFocusChange={handleCodeFocusChange}
              />
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          className="relative shrink-0 px-3 pt-3 border-t border-border"
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            transform: shouldLiftBottomBar ? `translateY(-${keyboardHeight}px)` : undefined,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {/* Code pill toggle — rides on the border-t line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="rounded-full border border-border bg-bg-primary px-4 py-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
            >
              {drawerOpen ? t('collapseCode') : t('viewCode')}
            </button>
          </div>

          {/* Suggestion chips — horizontal scroll */}
          {!isLoading && !suggestionsLoading && demoSuggestions.length > 0 && !isVideoMode && mobileFocusedArea !== 'code' && (
            <div className="suggestion-chips flex overflow-x-auto gap-2 pb-2 mt-3 no-scrollbar">
              {demoSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleInstruction(s)}
                  disabled={strudel.engineStatus !== 'ready'}
                  className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#cccccc] whitespace-nowrap shrink-0 transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <ChatInput
            isLoading={isLoading}
            engineReady={strudel.engineReady}
            engineStatus={strudel.engineStatus}
            onSendText={handleInstruction}
            onStop={handleStop}
            onReinitEngine={strudel.reinit}
            prefill={rollbackPrefill}
            focusTrigger={inputFocusTrigger}
            onFocusChange={handleChatFocusChange}
          />
        </div>

        {/* ── History Dropdown ── */}
        {historyOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setHistoryOpen(false)} />
            <div
              className="fixed z-40 bg-bg-primary overflow-hidden flex flex-col shadow-lg"
              style={{
                top: 'calc(max(12px, env(safe-area-inset-top)) + 44px)',
                left: '12px',
                width: '200px',
                maxHeight: '40dvh',
                border: '0.5px solid var(--color-border)',
              }}
            >
              <div className="flex-1 overflow-y-auto min-h-0">
                <HistoryPanel
                  sessions={sessions.sessions}
                  currentId={sessions.currentId}
                  isLoading={sessions.isLoading}
                  onSwitch={(id) => { handleSwitchSession(id); setHistoryOpen(false); }}
                  onDelete={sessions.deleteSession}
                  onRename={sessions.renameSession}
                  loadingSessions={loadingSessions}
                  unreadSessions={unreadSessions}
                />
              </div>
            </div>
          </>
        )}
        {importStatus === 'loading' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-primary/80">
            <span className="text-text-secondary text-sm">{t('loadingShare')}</span>
          </div>
        )}
        {importStatus === 'error' && !importErrorDismissed && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/90">
            <span className="text-red-400 text-sm">{t('shareLoadFailed')}</span>
            <div className="flex gap-3">
              <button
                onClick={() => { handleNewSession(); setImportErrorDismissed(true); }}
                className="px-4 py-1.5 text-sm rounded border border-border text-text-primary hover:border-accent/50 transition-colors"
              >
                {t('newSession')}
              </button>
              <button
                onClick={() => setImportErrorDismissed(true)}
                className="px-4 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full bg-bg-primary overflow-hidden"
      style={{ cursor: isDragging === 'h' ? 'col-resize' : isDragging === 'v' ? 'row-resize' : undefined, userSelect: isDragging ? 'none' : undefined }}
    >
      {showApiKeyModal && (
        <ApiKeyModal
          onClose={() => setShowApiKeyModal(false)}
          onSaved={resetClient}
          required={!hasApiKeyConfigured()}
        />
      )}

      {/* Sidebar with dynamic width */}
      <div style={{ width: sidebarWidth, flexShrink: 0 }} className="h-full">
        <Sidebar
          title={isVideoMode && videoTitle ? videoTitle : (isReplaying && !replayMessages.some((m) => m.role === 'user') ? t('newSessionTitle') : (current?.title ?? t('newSessionTitle')))}
          messages={videoDemoMsgs ?? messages}
          isLoading={isLoading || isReplaying}
          isMoodLoading={isMoodLoading}
          engineReady={strudel.engineReady}
          engineStatus={strudel.engineStatus}
          sessions={sessions.sessions}
          currentId={sessions.currentId}
          suggestions={isVideoMode ? [] : demoSuggestions}  // [video] Hide suggestion chips in video mode to avoid obscuring the frame
          isVideoMode={isVideoMode}
          scrollBottom={videoConvScrollBottom}  // [video] Forward the scene-change scroll-to-bottom signal
          suggestionsLoading={!isDemoMode() && suggestionsLoading}
          fillSuggestion={isDemoMode() ? DEMO_PREFILL : undefined}
          onSendText={handleInstruction}
          onStop={handleStop}
          onNewSession={handleNewSession}
          onMoodGenerate={handleMoodInstruction}
          onReinitEngine={strudel.reinit}
          loadingSessions={loadingSessions}
          unreadSessions={unreadSessions}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={sessions.deleteSession}
          onRenameSession={sessions.renameSession}
          isHistoryLoading={sessions.isLoading}
          onReplay={current ? () => { strudel.stop(); strudel.setCode(''); startReplay(current); } : undefined}
          isReplaying={isReplaying}
          replayInputText={replayInputText}
          prefill={rollbackPrefill}
          prefillTrigger={inputFocusTrigger}
          onRollback={handleRollback}
          onBranch={sessions.branchFromMessage}
          onRetry={handleRetry}
          tokenStats={current?.tokenStats}
        />
      </div>

      {/* Horizontal resize handle */}
      <div
        {...hDragHandlers}
        className="w-[22px] h-full shrink-0 group flex items-center justify-center pt-[80px] pb-3"
        style={{ cursor: 'col-resize' }}
      >
        <div className={`w-[6px] h-full transition-colors duration-150 ${isDragging === 'h' ? 'bg-white/40' : 'bg-transparent group-hover:bg-white/40'}`} />
      </div>

      <main ref={mainRef} className="flex-1 flex flex-col pr-3 pb-0 min-w-0">
        <div ref={topActionsRef} className="h-[80px] self-stretch relative" />
        <div className="flex-1 min-h-0">
          <CodePanel
            error={strudel.error}
            isPlaying={strudel.isPlaying}
            engineReady={strudel.engineReady}
            hasCode={!!strudel.code}
            onMount={strudel.setRoot}
            onPlay={() => strudel.play()}
            onStop={strudel.stop}
            exportState={strudel.exportState}
            onExport={strudel.exportWav}
            onGenerateTitle={generateSongTitle}
            onResetExportState={strudel.resetExportState}
            session={sessions.currentSession}
            messages={messages}
            topActionsContainer={topActionsRef}
            onOpenSettings={() => setShowApiKeyModal(true)}
          />
        </div>

        {/* Vertical resize handle */}
        <div
          {...vDragHandlers}
          className="h-[10px] shrink-0 group flex items-center justify-center"
          style={{ cursor: 'row-resize' }}
        >
          <div className={`h-[6px] w-full transition-colors duration-150 ${isDragging === 'v' ? 'bg-white/40' : 'bg-transparent group-hover:bg-white/40'}`} />
        </div>

        <div style={{ height: vizHeight, flexShrink: 0 }} className="pb-3">
          <VizPlaceholder isPlaying={strudel.isPlaying} />
        </div>
      </main>
      {importStatus === 'loading' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-primary/80">
          <span className="text-text-secondary text-sm">{t('loadingShare')}</span>
        </div>
      )}
      {importStatus === 'error' && !importErrorDismissed && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/90">
          <span className="text-red-400 text-sm">{t('shareLoadFailed')}</span>
          <div className="flex gap-3">
            <button
              onClick={() => { handleNewSession(); setImportErrorDismissed(true); }}
              className="px-4 py-1.5 text-sm rounded border border-border text-text-primary hover:border-accent/50 transition-colors"
            >
              {t('newSession')}
            </button>
            <button
              onClick={() => setImportErrorDismissed(true)}
              className="px-4 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  const s = (key: string): string => {
    const v = args[key];
    return v == null ? '' : String(v);
  };
  switch (name) {
    case 'getScore':
      return t('readScore');

    case 'applyEffect':
      return zh ? `给 ${s('layer')} 加效果 ${s('chain')}` : `Apply effect ${s('chain')} to ${s('layer')}`;
    case 'setTempo':
      return zh ? `设速度 ${s('bpm')} BPM` : `Set tempo ${s('bpm')} BPM`;
    case 'validate':
      return t('validateCode');
    case 'commit':
      return t('commitAndPlay');
    default:
      return `${name}(${JSON.stringify(args).slice(0, 60)})`;
  }
}
