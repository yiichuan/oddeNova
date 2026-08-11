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
import { HistoryIcon, PlayIcon, PlusIcon, StopIcon } from './components/icons';
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
import OddeNovaImportNotice from './components/OddeNovaImportNotice';
import PrimaryNav, { type PrimaryNavItem } from './components/PrimaryNav';
import ProviderSidebar from './components/ProviderSidebar';
import ModelSettingsPanel from './components/ModelSettingsPanel';
import { zh, t } from './lib/i18n';
import { getEngineUnavailableMessage } from './lib/engine-status';
import { hasSeenCommunityInvite, markCommunityInviteSeen, shouldAutoOpenApiKeyModal } from './lib/community-invite';
import type { AgentEntryPoint } from './lib/analytics';
import { useModelSettingsDraft } from './hooks/useModelSettingsDraft';
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
  const [primaryNavItem, setPrimaryNavItem] = useState<PrimaryNavItem>('home');
  const modelSettings = useModelSettingsDraft(resetClient);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestImportSessions, setGuestImportSessions] = useState<Session[] | null>(null);
  const [guestImportError, setGuestImportError] = useState('');
  const [importingGuestHistory, setImportingGuestHistory] = useState(false);
  const guestImportRunningRef = useRef(false);
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
    hDragHandlers,
    vDragHandlers,
    historyOpen,
    setHistoryOpen,
    drawerOpen,
    setDrawerOpen,
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

  // Mobile transport toggle next to the code pill. Mirrors CodePanel's footer
  // play button, which mobile no longer renders.
  const handleMobileTransportClick = useCallback(() => {
    if (strudel.isPlaying) {
      strudel.stop();
    } else if (strudel.engineReady && strudel.code) {
      void strudel.play();
    }
  }, [strudel]);
  // Dimmed until there's something to play — but never while playing, or the
  // stop action would become unreachable.
  const mobileTransportDisabled = !strudel.isPlaying && (!strudel.engineReady || !strudel.code);

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

  const handlePrimaryNavSelect = useCallback((item: PrimaryNavItem) => {
    if (item === 'account') {
      setAccountOpen(true);
      return;
    }
    setPrimaryNavItem(item);
  }, []);

  useEffect(() => {
    const userId = auth.user?.id;
    // Wait for the account's own sessions to finish loading, like the share and
    // oddeNova import entry points do: importing into a half-loaded account
    // drops the imported session when the in-flight load replaces the list.
    if (
      !userId
      || auth.loading
      || auth.recoveringPassword
      || sessions.isLoading
      || importPromptUserRef.current === userId
    ) return;
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
  }, [auth.user, auth.loading, auth.recoveringPassword, sessions.isLoading]);

  const importGuestHistory = useCallback(async () => {
    // The cloud save keeps the dialog up for as long as the request takes. A
    // second click would import the same history again under a fresh id, so
    // guard on a ref: it is set before the first await, unlike the state the
    // disabled button reads.
    if (guestImportRunningRef.current) return;
    guestImportRunningRef.current = true;
    setImportingGuestHistory(true);
    const items = guestImportSessions ?? [];
    setGuestImportError('');
    try {
      const result = await importGuestSessions(
        items,
        (item) => sessions.importSession(item, { activate: false }),
        (id) => deleteSession(id, 'guest'),
      );
      setGuestImportSessions(result.remaining.length > 0 ? result.remaining : null);
      if (result.error) {
        console.warn('[account] failed to import guest sessions to cloud.', result.error);
        setGuestImportError(t('accountActionFailed'));
      }
    } finally {
      guestImportRunningRef.current = false;
      setImportingGuestHistory(false);
    }
  }, [guestImportSessions, sessions]);

  const current = sessions.currentSession;
  const visibleSyncStatus = !sessions.isPersistent
    && sessions.currentManualSyncStatus === 'offline'
    ? 'retrying'
    : sessions.currentManualSyncStatus;
  const messages = isReplaying ? replayMessages : (current?.messages ?? []);
  // Session code = last committed/played code (used as agent context)
  // Fall back to live editor code so manually-pasted code is visible to the agent.
  const currentCode = strudel.code || (current?.code ?? '');
  const currentBpm = parseScore(currentCode).bpm ?? 120;
  const isLoading = !!current?.id && loadingSessions.has(current.id);
  const showSessionSyncStatus = Boolean(
    auth.user
    && current
    && !isLoading
    && visibleSyncStatus,
  );

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
                disabled={importingGuestHistory}
                className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('notNow')}
              </button>
              <button
                onClick={() => void importGuestHistory()}
                disabled={importingGuestHistory}
                className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      entryPoint?: AgentEntryPoint;
      skipAddMessage?: boolean;
      initialCode?: string;
      history?: ConversationTurn[];
    }) => {
      if (isDemoMode() && activeSet[demoStep]?.prompt === text) {
        setDemoStep((s) => s + 1);
      }

      return runTurn({
        text,
        entryPoint: options?.entryPoint ?? 'text',
        includeHistory: true,
        skipAddMessage: options?.skipAddMessage,
        initialCode: options?.initialCode,
        suppliedHistory: options?.history,
      });
    },
    [runTurn, demoStep, activeSet]
  );

  const handleChatInstruction = useCallback(
    (text: string, entryPoint: Extract<AgentEntryPoint, 'text' | 'suggestion'>) =>
      handleInstruction(text, { entryPoint }),
    [handleInstruction],
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
        entryPoint: 'retry',
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
      entryPoint: 'mood',
      moodContext: moodContext ?? undefined,
      includeHistory: false,
    });
  }, [strudel, runTurn]);

  const persistAndFlushOutgoingSession = useCallback(async (id: string, code: string) => {
    try {
      await setManualCode(code, id);
      await flushCloudSaves(id);
    } catch (error) {
      // Local persistence and the durable pending marker remain authoritative;
      // the coordinator will retry while the user continues navigating.
      console.warn('[sessions] outgoing session flush failed.', error);
    }
  }, [flushCloudSaves, setManualCode]);

  const handlePlay = useCallback(async () => {
    if (sessions.currentId) {
      await setManualCode(strudel.code, sessions.currentId);
      await flushCloudSaves(sessions.currentId);
    }
    await strudel.play();
  }, [flushCloudSaves, sessions.currentId, setManualCode, strudel]);

  const handleNewSession = useCallback(async () => {
    if (sessions.currentId) {
      await persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
    }
    strudel.stop();
    sessions.newSession();
    if (isDemoMode()) setDemoStep(0);
  }, [strudel, sessions, persistAndFlushOutgoingSession]);

  const handleSwitchSession = useCallback(async (id: string) => {
    if (sessions.currentId !== id) {
      if (sessions.currentId) {
        await persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
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
        {/* mb-3 keeps the stream from clipping flush against the rule below —
            this is where messages get cut off as they scroll, so butting it
            straight up to the line read as cramped. */}
        <div className="flex-1 min-h-0 overflow-hidden mb-5">
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
        {/* No border of its own: CodePanel already draws a full border, and a
            border-t here would survive the 0-height collapsed state as a stray
            line 6px below the rule. */}
        <div
          className="shrink-0 overflow-hidden"
          style={{
            height: mobileDrawerHeight,
            // Lands CodePanel's bottom border exactly on the rule the bottom bar
            // draws at -6px, so the two are the same row of pixels and read as
            // one line. The border sits in the last 1px *inside* the drawer's
            // box, so the box has to stop at -5, not -6.
            //
            // Constant, never animated: while this transitioned alongside height
            // the border travelled from 0 to its resting place and showed as a
            // second line for the length of the animation. Only height moves now,
            // so the border stays pinned to the rule throughout. The conversation
            // above is flex-1, so it gives up the 5px and the bar doesn't move.
            marginBottom: 5,
            transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <CodePanel
                code={strudel.code}
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                engineReady={strudel.engineReady}
                onMount={strudel.setRoot}
                onPlay={handlePlay}
                onStop={strudel.stop}
                onEditorFocusChange={handleCodeFocusChange}
                syncStatus={visibleSyncStatus}
                showSyncStatus={showSessionSyncStatus}
              />
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          className="relative shrink-0 px-3 pt-3"
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            transform: shouldLiftBottomBar ? `translateY(-${keyboardHeight}px)` : undefined,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {/* The rule the row below straddles, drawn 6px above this bar rather
              than as its border-t so it lands on the row's centre line in both
              drawer states. Kept inside the bar so it still rides along when the
              keyboard lifts it; a sibling of the drawer would stay behind. */}
          <div className="absolute -top-1.5 left-0 right-0 border-t border-border" />

          {/* Transport and code pill both ride the rule above, positioned
              independently: the transport flush left, the pill centred in the
              bar. Both are 28px tall so they straddle the rule and hide the
              stretch behind them with their own background. The transport lives
              here rather than in CodePanel's footer so it stays reachable
              whether or not the code drawer is open.

              Only the pill is centred; the transport hangs off its left edge via
              right-full rather than an offset of its own, so the 20px gap holds
              when the label swaps between 查看代码 / 收起代码 and changes width. */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 -translate-y-1/2 h-7">
            <button
              onClick={handleMobileTransportClick}
              disabled={mobileTransportDisabled}
              // Dimmed by darkening the glyph itself, not by opacity: the icons
              // fill from currentColor, so only the triangle/square goes down in
              // brightness while the ring and background stay put.
              className={`absolute right-full top-0 mr-3 flex w-7 h-7 items-center justify-center rounded-full border border-border bg-bg-primary disabled:cursor-not-allowed ${
                mobileTransportDisabled ? 'text-[#591C06]' : 'text-[#B2370C]'
              }`}
              aria-label={strudel.isPlaying ? t('stop') : t('play')}
              title={strudel.isPlaying ? t('stop') : t('play')}
            >
              {/* Stop renders smaller: Square fills its viewBox while Play's
                  triangle is narrower, so equal sizes look unbalanced */}
              {strudel.isPlaying ? <StopIcon size={12} /> : <PlayIcon size={14} />}
            </button>
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="flex h-7 items-center rounded-full border border-border bg-bg-primary px-4 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
            >
              {drawerOpen ? t('collapseCode') : t('viewCode')}
            </button>
          </div>

          {/* Input. Suggestions ride inside it as the animated placeholder, same
              as desktop — mobile adopts one by focusing the field rather than
              with Tab, so no separate chip row. */}
          <div className="mt-3">
            <ChatInput
              isLoading={isLoading}
              engineReady={strudel.engineReady}
              engineStatus={strudel.engineStatus}
              onSendText={handleChatInstruction}
              onStop={handleStop}
              onReinitEngine={strudel.reinit}
              prefill={rollbackPrefill}
              focusTrigger={inputFocusTrigger}
              onFocusChange={handleChatFocusChange}
              inputMode={current?.inputMode ?? 'normal'}
              suggestions={isVideoMode ? [] : visibleSuggestions}
              isVideoMode={isVideoMode}
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
      className="flex h-full w-full overflow-hidden bg-bg-primary p-region"
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
      <PrimaryNav selectedItem={primaryNavItem} onSelect={handlePrimaryNavSelect} />

      <>
        {/* Primary content keeps its width while non-home destinations are blank.
            The Sidebar stays mounted so drafts and local UI state survive a switch. */}
        <div style={{ width: sidebarWidth, flexShrink: 0 }} className="h-full">
          <div className={primaryNavItem === 'home' ? 'h-full' : 'hidden'}>
            <Sidebar
              title={isVideoMode && videoTitle ? videoTitle : (isReplaying && !replayMessages.some((m) => m.role === 'user') ? t('newSessionTitle') : (current?.title ?? t('newSessionTitle')))}
              messages={videoDemoMsgs ?? messages}
              revisions={current?.revisions}
              isLoading={isLoading || isReplaying}
              engineReady={strudel.engineReady}
              engineStatus={strudel.engineStatus}
              sessions={sessions.sessions}
              currentId={sessions.currentId}
              inputMode={current?.inputMode ?? 'normal'}
              suggestions={isVideoMode ? [] : visibleSuggestions}  // [video] Hide suggestion chips in video mode to avoid obscuring the frame
              isVideoMode={isVideoMode}
              scrollBottom={videoConvScrollBottom}  // [video] Forward the scene-change scroll-to-bottom signal
              onSendText={handleChatInstruction}
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
          <div className={primaryNavItem === 'settings' ? 'h-full' : 'hidden'}>
            <ProviderSidebar
              activeProvider={modelSettings.activeProvider}
              onSelect={modelSettings.selectProvider}
              selectedProvider={modelSettings.selectedProvider}
            />
          </div>
        </div>

        {/* Horizontal resize handle */}
        <div
          {...hDragHandlers}
          data-resize-handle="horizontal"
          className="h-full w-divider shrink-0"
          style={{ cursor: 'col-resize' }}
        />

        <main ref={mainRef} className="flex min-w-0 flex-1 flex-col">
          <div className={primaryNavItem === 'settings' ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
            <div className="flex-1 min-h-0">
              <CodePanel
                code={strudel.code}
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                engineReady={strudel.engineReady}
                onMount={strudel.setRoot}
                onPlay={handlePlay}
                onStop={strudel.stop}
                syncStatus={visibleSyncStatus}
                showSyncStatus={showSessionSyncStatus}
              />
            </div>

            {/* Vertical resize handle */}
            <div
              {...vDragHandlers}
              data-resize-handle="vertical"
              className="h-divider shrink-0"
              style={{ cursor: 'row-resize' }}
            />

            <div style={{ height: vizHeight, flexShrink: 0 }}>
              <VizPlaceholder isPlaying={strudel.isPlaying} />
            </div>
          </div>
          <div className={primaryNavItem === 'settings' ? 'h-full min-h-0' : 'hidden'}>
            <ModelSettingsPanel
              key={modelSettings.selectedProvider}
              draft={modelSettings.draft}
              isDirty={modelSettings.selectedIsDirty}
              onSave={modelSettings.saveSelectedProvider}
              onUpdate={(patch) => modelSettings.updateDraft(modelSettings.selectedProvider, patch)}
              provider={modelSettings.selectedProvider}
              saveStatus={modelSettings.saveStatus}
            />
          </div>
        </main>
      </>
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
