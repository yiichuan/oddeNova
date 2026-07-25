import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import CodePanel from './components/CodePanel';
import Sidebar from './components/Sidebar';
import VizPlaceholder from './components/VizPlaceholder';
import { useStrudel } from './hooks/useStrudel';
import { useSessions } from './hooks/useSessions';
import { useSuggestions } from './hooks/useSuggestions';
import { useDailySuggestions } from './hooks/useDailySuggestions';
import { fetchMoodContext } from './services/airjelly';
import { generateSongTitle } from './services/song-title';
import type { ConversationTurn } from './services/llm';
import { conversationHistoryBefore } from './lib/conversation-history';
import { createAgentProgressHandler } from './lib/agent-progress-handler';
import { isDemoMode, getActiveDemoSet } from './demo/demo-config';
import ApiKeyModal from './components/ApiKeyModal';
import { hasApiKeyConfigured } from './services/llm-config';
import { resetClient } from './services/llm';
import { HistoryIcon, PlusIcon } from './components/icons';
import { parseScore } from './agent/parser';
import { useImportShare } from './hooks/useImportShare';
import { useOddeNovaImport } from './hooks/useOddeNovaImport';
import { useReplay } from './hooks/useReplay';
import { useAgentRunner } from './hooks/useAgentRunner';
import { useVideoDemo } from './hooks/useVideoDemo';
import { useLayout } from './hooks/useLayout';
import ConversationView from './components/ConversationView';
import HistoryPanel from './components/HistoryPanel';
import ChatInput from './components/ChatInput';
import TopActionBar from './components/TopActionBar';
import AccountModal from './components/AccountModal';
import PersonaModal from './components/PersonaModal';
import OddeNovaImportNotice from './components/OddeNovaImportNotice';
import { t, zh } from './lib/i18n';
import { getEngineUnavailableMessage } from './lib/engine-status';
import { hasSeenCommunityInvite, markCommunityInviteSeen, shouldAutoOpenApiKeyModal } from './lib/community-invite';
import { useAuth } from './hooks/useAuth';
import { deleteCloudSession, listCloudSessions, saveCloudSession } from './services/cloud-session-repository';
import { deleteSession, getAllSessions } from './lib/session-storage';
import {
  collectImportableGuestSessions,
  getNextImportPromptUserMarker,
  importGuestSessions,
} from './lib/session-import';
import type { Session } from './hooks/useSessions';

export default function App() {
  const strudel = useStrudel();
  const auth = useAuth();
  const cloudRepository = useMemo(() => ({
    listSessions: listCloudSessions,
    saveSession: saveCloudSession,
    deleteSession: deleteCloudSession,
  }), []);
  const ownerKey = auth.user ? `user:${auth.user.id}` : 'guest';
  const [accountStartToken, setAccountStartToken] = useState(0);
  const lastAuthUserIdRef = useRef<string | null>(null);
  const { isReplaying, replayMessages, replayInputText, startReplay } = useReplay(
    (code) => { strudel.play(code); }
  );
  const sessions = useSessions({
    ownerKey,
    syncEnabled: !!auth.user,
    cloud: cloudRepository,
    startNewSessionToken: accountStartToken,
  });
  const dailySuggestionDefaults = useDailySuggestions(zh);
  const importStatus = useImportShare(sessions.importSession, !sessions.isLoading);
  const oddeNovaImportResult = useOddeNovaImport(
    sessions.importOddeNovaSession,
    !sessions.isLoading,
    sessions.isPersistent,
  );
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const [commitSuggestions, setCommitSuggestions] = useState<string[] | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const [rollbackPrefill, setRollbackPrefill] = useState('');
  const [inputFocusTrigger, setInputFocusTrigger] = useState(1);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestImportSessions, setGuestImportSessions] = useState<Session[] | null>(null);
  const [guestImportError, setGuestImportError] = useState('');
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const currentIdRef = useRef<string | null>(sessions.currentId);
  const skipNextManualSyncSessionRef = useRef<string | null>(null);
  const prevLoadingRef = useRef<Set<string>>(new Set());
  const importPromptUserRef = useRef<string | null>(null);
  const latestGuestSessionsRef = useRef<Session[]>([]);
  // Use ref to prevent the postMessage handler from capturing a stale strudel closure
  const strudelRef = useRef(strudel);
  useEffect(() => { strudelRef.current = strudel; }, [strudel]);
  useEffect(() => {
    if (auth.recoveringPassword) setAccountOpen(true);
  }, [auth.recoveringPassword]);
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
    const userId = auth.user?.id ?? null;
    if (userId && userId !== lastAuthUserIdRef.current) {
      setAccountStartToken((token) => token + 1);
    }
    lastAuthUserIdRef.current = userId;
  }, [auth.user?.id]);

  useEffect(() => {
    if (!auth.user && !sessions.isLoading) {
      latestGuestSessionsRef.current = sessions.sessions;
    }
  }, [auth.user, sessions.isLoading, sessions.sessions]);

  useEffect(() => {
    const nextMarker = getNextImportPromptUserMarker(auth.user?.id ?? null, importPromptUserRef.current);
    if (nextMarker !== importPromptUserRef.current) {
      importPromptUserRef.current = nextMarker;
      setGuestImportError('');
      setGuestImportSessions(null);
    }
  }, [auth.user]);

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

  const openPersonaModal = useCallback(() => {
    setShowPersonaModal(true);
  }, []);

  const [apiKeyModalState, setApiKeyModalState] = useState(() => {
    let isTopWindow = true;
    try {
      isTopWindow = window.self === window.top;
    } catch {
      // Cross-origin frame access can throw; treat it as embedded and stay quiet.
      isTopWindow = false;
    }
    const shouldOpen = shouldAutoOpenApiKeyModal({
      isTopWindow,
      hasApiKeyConfigured: hasApiKeyConfigured(),
      hasSeenCommunityInvite: hasSeenCommunityInvite(),
    });
    // autoOpened distinguishes first-entry/required prompts from manual settings opens,
    // so closing the Settings button path does not mark the invite as seen.
    return { open: shouldOpen, autoOpened: shouldOpen };
  });
  const [importErrorDismissed, setImportErrorDismissed] = useState(false);

  const closeApiKeyModal = useCallback(() => {
    if (apiKeyModalState.autoOpened) {
      // Dismissal counts as exposure; avoid showing the QR invite again next visit.
      markCommunityInviteSeen();
    }
    setApiKeyModalState({ open: false, autoOpened: false });
  }, [apiKeyModalState.autoOpened]);

  const openSettings = useCallback(() => {
    setApiKeyModalState({ open: true, autoOpened: false });
  }, []);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId || auth.loading || auth.recoveringPassword || importPromptUserRef.current === userId) return;
    let cancelled = false;
    getAllSessions('guest').then((guestSessions) => {
      if (cancelled) return;
      const importable = collectImportableGuestSessions(guestSessions, latestGuestSessionsRef.current);
      if (importable.length > 0) {
        setGuestImportError('');
        setGuestImportSessions(importable);
      }
      importPromptUserRef.current = userId;
    }).catch((err) => {
      console.warn('[account] failed to inspect guest sessions for import.', err);
    });
    return () => { cancelled = true; };
  }, [auth.user, auth.loading, auth.recoveringPassword]);

  const importGuestHistory = useCallback(async () => {
    const items = guestImportSessions ?? [];
    setGuestImportError('');
    const result = await importGuestSessions(
      items,
      (item) => sessions.importSession(item),
      (id) => deleteSession(id, 'guest'),
    );
    setGuestImportSessions(result.remaining.length > 0 ? result.remaining : null);
    if (result.error) {
      console.warn('[account] failed to import guest sessions to cloud.', result.error);
      setGuestImportError(t('accountActionFailed'));
    }
  }, [guestImportSessions, sessions]);

  const current = sessions.currentSession;
  const messages = isReplaying ? replayMessages : (current?.messages ?? []);
  // Session code = last committed/played code (used as agent context)
  // Fall back to live editor code so manually-pasted code is visible to the agent.
  const currentCode = strudel.code || (current?.code ?? '');
  const currentBpm = parseScore(currentCode).bpm ?? 120;
  const isLoading = !!current?.id && loadingSessions.has(current.id);

  const { suggestions } = useSuggestions({
    key: current?.id ?? '',
    currentCode: current?.code ?? '',
    defaults: dailySuggestionDefaults,
    commitSuggestions: commitSuggestions ?? undefined,
    persisted: current?.suggestions,
    onSuggestions: (items, forCode) => sessions.setSuggestions(items, forCode, current?.id),
  });
  const activeSet = getActiveDemoSet();
  const demoSuggestions = isDemoMode()
    ? (demoStep < activeSet.length ? [activeSet[demoStep].prompt] : [])
    : suggestions;
  const visibleSuggestions = demoSuggestions;
  const showMobileCreateSuggestions =
    !isLoading && visibleSuggestions.length > 0 && !isVideoMode && mobileFocusedArea !== 'code';

  const accountLabel = auth.user?.email || (auth.user ? t('account') : t('signIn'));

  const accountOverlays = (
    <>
      {(accountOpen || auth.oauthErrorKey) && (
        <AccountModal
          user={auth.user}
          configured={auth.configured}
          recoveringPassword={auth.recoveringPassword}
          oauthErrorKey={auth.oauthErrorKey}
          beforeSignOut={sessions.flushCloudSaves}
          onClose={() => {
            auth.dismissOAuthError();
            setAccountOpen(false);
          }}
        />
      )}
      {guestImportSessions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl">
            <h2 className="text-lg font-semibold text-text-primary mb-2">{t('importLocalHistory')}</h2>
            <p className="text-xs text-text-muted mb-5">{t('importLocalHistoryDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setGuestImportError('');
                  setGuestImportSessions(null);
                }}
                className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
              >
                {t('notNow')}
              </button>
              <button
                onClick={() => void importGuestHistory()}
                className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors"
              >
                {t('importNow')}
              </button>
            </div>
            {guestImportError && <div className="text-xs text-red-300 mt-3">{guestImportError}</div>}
          </div>
        </div>
      )}
    </>
  );

  // When the session switches, restore its code into the editor and stop audio
  useEffect(() => {
    if (!current) return;
    skipNextManualSyncSessionRef.current = current.id;
    strudel.setCode(current.code);
    strudel.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when session ID changes
  }, [current?.id]);

  const setManualCode = sessions.setManualCode;
  const flushCloudSaves = sessions.flushCloudSaves;
  useEffect(() => {
    if (!current?.id || isLoading || isReplaying || isVideoMode) return;
    if (skipNextManualSyncSessionRef.current === current.id) {
      skipNextManualSyncSessionRef.current = null;
      return;
    }
    if (strudel.code === current.code) return;
    void setManualCode(strudel.code, current.id);
  }, [
    current?.id,
    current?.code,
    isLoading,
    isReplaying,
    isVideoMode,
    setManualCode,
    strudel.code,
  ]);

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
    (sessionId: string) => createAgentProgressHandler(sessions, sessionId),
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
    async (text: string, options?: {
      skipAddMessage?: boolean;
      initialCode?: string;
      history?: ConversationTurn[];
    }) => {
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
    [runTurn, demoStep, activeSet]
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

      // Restore the rollback target as the session truth without auto-playing:
      // stop current audio (it belongs to the rolled-away version), put the
      // code back in the editor, and persist it. Playback stays a user action.
      strudel.stop();
      strudel.setCode(previousCode);
      if (sessions.currentId) sessions.setCurrentCode(previousCode, sessions.currentId);

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
      const currentSessionId = sessions.currentId;
      const rewound = await rewindBeforeMessage(messageId);
      if (!rewound) return;

      sessions.truncate(messageId);
      if (currentSessionId) {
        await sessions.checkpointSession(currentSessionId);
      }

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
    // fire the mood request when audio is unavailable.
    const engineUnavailableMessage = getEngineUnavailableMessage(strudel.engineStatus);
    if (engineUnavailableMessage) {
      strudel.setError(engineUnavailableMessage);
      return;
    }

    let moodContext: string | null = null;
    if (!isDemoMode()) {
      moodContext = await fetchMoodContext();
    }

    // Mood generation is a one-off creation: deliberately no conversation history.
    await runTurn({
      text: '根据我的心情生成音乐',
      moodContext: moodContext ?? undefined,
      includeHistory: false,
    });
  }, [strudel, runTurn]);

  const persistAndFlushOutgoingSession = useCallback((id: string, code: string) => {
    void setManualCode(code, id)
      .then(() => flushCloudSaves(id))
      .catch((error) => {
        console.warn('[sessions] outgoing session flush failed.', error);
      });
  }, [flushCloudSaves, setManualCode]);

  const handlePlay = useCallback(async () => {
    if (sessions.currentId) {
      await setManualCode(strudel.code, sessions.currentId);
      await flushCloudSaves(sessions.currentId);
    }
    await strudel.play();
  }, [flushCloudSaves, sessions.currentId, setManualCode, strudel]);

  const handleNewSession = useCallback(() => {
    if (sessions.currentId) {
      persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
    }
    strudel.stop();
    sessions.newSession();
    if (isDemoMode()) setDemoStep(0);
  }, [strudel, sessions, persistAndFlushOutgoingSession]);

  const handleSwitchSession = useCallback((id: string) => {
    if (sessions.currentId !== id) {
      if (sessions.currentId) {
        persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
      }
    }
    setCommitSuggestions(null);
    setUnreadSessions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    sessions.switchTo(id);
  }, [sessions, persistAndFlushOutgoingSession, strudel.code]);

  const responsiveLayout = isMobile ? (
      <div className="flex flex-col bg-bg-primary overflow-hidden" style={{ height: '100%', width: '100%' }}>
        {apiKeyModalState.open && (
          <ApiKeyModal
            onClose={closeApiKeyModal}
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
            onOpenSettings={openSettings}
            onOpenAccount={() => setAccountOpen(true)}
            accountLabel={accountLabel}
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
          <ConversationView
            key={sessions.currentId ?? 'default'}
            messages={messages}
            revisions={sessions.currentSession?.revisions}
            isLoading={isLoading}
            onRollback={handleRollback}
            onBranch={sessions.branchFromMessage}
            onRetry={handleRetry}
          />
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
                onPlay={handlePlay}
                onStop={strudel.stop}
                exportState={strudel.exportState}
                onExport={strudel.exportWav}
                onGenerateTitle={generateSongTitle}
                onResetExportState={strudel.resetExportState}
                session={sessions.currentSession}
                messages={messages}
                onOpenSettings={openSettings}
                onOpenAccount={() => setAccountOpen(true)}
                accountLabel={accountLabel}
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

          {/* Suggestion chips — horizontal scroll. Desktop rotates through the full
              set as placeholder hints; mobile shows just two quick-action buttons. */}
          {showMobileCreateSuggestions && (
            <div className="suggestion-chips flex overflow-x-auto gap-2 pb-2 mt-3 no-scrollbar">
              {visibleSuggestions.slice(0, 2).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleInstruction(s)}
                  disabled={strudel.engineStatus !== 'ready'}
                  className="rounded-lg bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#cccccc] whitespace-nowrap shrink-0 transition hover:border-accent/50 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className={showMobileCreateSuggestions ? '' : 'mt-3'}>
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
        {accountOverlays}
      </div>
    ) : (
    <div
      className="flex h-full w-full bg-bg-primary overflow-hidden"
      style={{ cursor: isDragging === 'h' ? 'col-resize' : isDragging === 'v' ? 'row-resize' : undefined, userSelect: isDragging ? 'none' : undefined }}
    >
      {apiKeyModalState.open && (
        <ApiKeyModal
          onClose={closeApiKeyModal}
          onSaved={resetClient}
          required={!hasApiKeyConfigured()}
        />
      )}
      {accountOverlays}
      {showPersonaModal && (
        <PersonaModal onClose={() => setShowPersonaModal(false)} />
      )}

      {/* Sidebar with dynamic width */}
      <div style={{ width: sidebarWidth, flexShrink: 0 }} className="h-full">
        <Sidebar
          title={isVideoMode && videoTitle ? videoTitle : (isReplaying && !replayMessages.some((m) => m.role === 'user') ? t('newSessionTitle') : (current?.title ?? t('newSessionTitle')))}
          messages={videoDemoMsgs ?? messages}
          revisions={current?.revisions}
          isLoading={isLoading || isReplaying}
          engineReady={strudel.engineReady}
          engineStatus={strudel.engineStatus}
          sessions={sessions.sessions}
          currentId={sessions.currentId}
          suggestions={isVideoMode ? [] : visibleSuggestions}  // [video] Hide suggestion chips in video mode to avoid obscuring the frame
          isVideoMode={isVideoMode}
          scrollBottom={videoConvScrollBottom}  // [video] Forward the scene-change scroll-to-bottom signal
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
          onOpenPersonaModal={openPersonaModal}
          tokenStats={current?.tokenStats}
        />
      </div>

      {/* Horizontal resize handle */}
      <div
        {...hDragHandlers}
        className="w-5.5 h-full shrink-0 group flex items-center justify-center pt-20 pb-3"
        style={{ cursor: 'col-resize' }}
      >
        <div className={`w-1.5 h-full transition-colors duration-150 ${isDragging === 'h' ? 'bg-white/40' : 'bg-transparent group-hover:bg-white/40'}`} />
      </div>

      <main ref={mainRef} className="flex-1 flex flex-col pr-3 pb-0 min-w-0">
        <div ref={topActionsRef} className="h-20 self-stretch relative" />
        <div className="flex-1 min-h-0">
          <CodePanel
            error={strudel.error}
            isPlaying={strudel.isPlaying}
            engineReady={strudel.engineReady}
            hasCode={!!strudel.code}
            onMount={strudel.setRoot}
            onPlay={handlePlay}
            onStop={strudel.stop}
            exportState={strudel.exportState}
            onExport={strudel.exportWav}
            onGenerateTitle={generateSongTitle}
            onResetExportState={strudel.resetExportState}
            session={sessions.currentSession}
            messages={messages}
            topActionsContainer={topActionsRef}
            onOpenSettings={openSettings}
            onOpenAccount={() => setAccountOpen(true)}
            accountLabel={accountLabel}
          />
        </div>

        {/* Vertical resize handle */}
        <div
          {...vDragHandlers}
          className="h-2.5 shrink-0 group flex items-center justify-center"
          style={{ cursor: 'row-resize' }}
        >
          <div className={`h-1.5 w-full transition-colors duration-150 ${isDragging === 'v' ? 'bg-white/40' : 'bg-transparent group-hover:bg-white/40'}`} />
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

  return (
    <>
      <OddeNovaImportNotice result={oddeNovaImportResult} />
      {responsiveLayout}
    </>
  );
}
