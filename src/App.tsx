import { useCallback, useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import CodePanel from './components/CodePanel';
import Sidebar from './components/Sidebar';
import VizPlaceholder from './components/VizPlaceholder';
import { useStrudel } from './hooks/useStrudel';
import { useSessions } from './hooks/useSessions';
import { useSuggestions } from './hooks/useSuggestions';
import { useIsMobile } from './hooks/useIsMobile';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import { runAgent } from './services/llm';
import { fetchMoodContext } from './services/airjelly';
import type { ProgressEvent } from './services/llm';
import { parseNextSteps } from './services/suggestions';
import { isDemoMode, getActiveDemoSet, DEMO_PREFILL } from './demo/demo-config';
import ApiKeyModal from './components/ApiKeyModal';
import { hasApiKeyConfigured, getActiveModelConfig } from './services/llm-config';
import { resetClient } from './services/llm';
import { HistoryIcon, PlusIcon } from './components/icons';
import { parseScore } from './agent/parser';
import { useImportShare } from './hooks/useImportShare';
import { useReplay } from './hooks/useReplay';
import ConversationView from './components/ConversationView';
import HistoryPanel from './components/HistoryPanel';
import ChatInput from './components/ChatInput';
import TopActionBar from './components/TopActionBar';
import { trackAgentRun, trackAgentError, trackAgentAbort } from './lib/analytics';
import { zh, t } from './lib/i18n';
import { getEngineUnavailableMessage } from './lib/engine-status';

const SIDEBAR_RATIO_DEFAULT = 0.22;
const SIDEBAR_RATIO_MIN = 0.15;
const SIDEBAR_RATIO_MAX = 0.45;

/** Strip the "next steps" suggestion paragraph from the end of the agent explanation to avoid duplicate display in chat history */
function stripNextSteps(explanation: string): string {
  return explanation.replace(/\n\n接下来可以[：:][^]*$/, '').trim();
}

const VIZ_RATIO_DEFAULT = 1 / (1 + 1.55); // ≈ 0.392, derived from top:bottom = 1.55
const VIZ_RATIO_MIN = 0.15;
const VIZ_RATIO_MAX = 0.45;

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
  // [video] Simulated conversation list pushed frame-by-frame by Remotion via VIDEO_DEMO_MESSAGES; when null, App displays real messages normally
  const [videoDemoMsgs, setVideoDemoMsgs] = useState<import('./hooks/useChat').ChatMessage[] | null>(null);
  // [video] Remotion emits scrollBottom:true on scene transitions to scroll ConversationView to the bottom
  const [videoConvScrollBottom, setVideoConvScrollBottom] = useState(false);
  // [video] Title override — only active when isVideoMode; no effect on normal app usage
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [rollbackPrefill, setRollbackPrefill] = useState('');
  const [inputFocusTrigger, setInputFocusTrigger] = useState(1);
  // [video] Detects whether running inside a Remotion iframe; always false in normal browser access, has no effect on any logic
  const [isVideoMode, setIsVideoMode] = useState(() => {
    try { return window.self !== window.top; } catch { return true; }
  });
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const currentIdRef = useRef<string | null>(sessions.currentId);
  const prevLoadingRef = useRef<Set<string>>(new Set());
  // Use ref to prevent the postMessage handler from capturing a stale strudel closure
  const strudelRef = useRef(strudel);
  useEffect(() => { strudelRef.current = strudel; }, [strudel]);

  // [video] Receive VIDEO_* control messages pushed per-frame by Remotion MyVideo.tsx to drive the in-video App state
  // Normal users never send these messages; the handler is completely silent during regular browser access
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'VIDEO_DEMO_MESSAGES') {
        setVideoDemoMsgs(e.data.messages.length > 0 ? e.data.messages : null);
        setIsVideoMode(true);
        if (e.data.scrollBottom) setVideoConvScrollBottom(true);
        if (e.data.sessionTitle) setVideoTitle(e.data.sessionTitle);
      }
if (e.data?.type === 'VIDEO_SET_CODE' && typeof e.data.code === 'string') {
        strudelRef.current.setCode(e.data.code);
        if (e.data.fadeIn) strudelRef.current.triggerFadeIn();
        if (e.data.scrollToBottom) setTimeout(() => strudelRef.current.scrollCodeToBottom(), 300);
      }
      if (e.data?.type === 'VIDEO_SET_SCROLL_POSITION' && typeof e.data.position === 'number') {
        strudelRef.current.scrollCodeToPosition(e.data.position);
      }
      if (e.data?.type === 'VIDEO_SCROLL_EASED' && typeof e.data.durationMs === 'number') {
        strudelRef.current.scrollCodeToBottomEased(e.data.durationMs);
      }
      // [video] Frame-driven scroll, only sent by Remotion MyVideo.tsx: eased progress is
      // pushed per frame so the scroll speed follows video time (wall-clock easing gets
      // compressed in render); normal users never trigger this
      if (e.data?.type === 'VIDEO_SCROLL_PROGRESS' && typeof e.data.progress === 'number') {
        strudelRef.current.scrollCodeToBottomProgress(e.data.progress);
      }
      if (e.data?.type === 'VIDEO_STOP') {
        strudelRef.current.stop();
      }
      if (e.data?.type === 'VIDEO_TIME' && typeof e.data.time === 'number') {
        strudelRef.current.setVideoTime(e.data.time);
      }
      if (e.data?.type === 'VIDEO_AUDIO_SIM') {
        const galaxy = document.querySelector<HTMLIFrameElement>('iframe[title="galaxy visualizer"]');
        galaxy?.contentWindow?.postMessage({ type: 'AUDIO_SIM', low: e.data.low, mid: e.data.mid, high: e.data.high, chaos: e.data.chaos }, '*');
      }
      if (e.data?.type === 'VIDEO_GALAXY_TIME' && typeof e.data.time === 'number') {
        const galaxy = document.querySelector<HTMLIFrameElement>('iframe[title="galaxy visualizer"]');
        galaxy?.contentWindow?.postMessage({ type: 'GALAXY_TIME', time: e.data.time }, '*');
      }
      if (e.data?.type === 'VIDEO_SET_TITLE' && typeof e.data.title === 'string') {
        setVideoTitle(e.data.title);
      }
      if (e.data?.type === 'VIDEO_PLAY') {
        // Set code in the same tick first, preventing the session init effect from clearing code between messages
        if (typeof e.data.code === 'string') {
          strudelRef.current.setCode(e.data.code);
        }
        // Call play() → evaluate() directly, identical to the agent's code-update path, for seamless playback
        strudelRef.current.play();
        // The ._scope() widget is asynchronously added to the CodeMirror DOM by evaluate(),
        // using scrollDOM directly avoids CSS selector dependency; 2000ms fallback guards against first-load soundfont delay
        // skipScroll: scenes whose scroll is driven per-frame via VIDEO_SCROLL_PROGRESS
        // opt out, so these wall-clock snaps don't fight the eased animation
        if (!e.data.skipScroll) {
          const scrollBottom = () => strudelRef.current.scrollCodeToBottom();
          setTimeout(scrollBottom, 500);
          setTimeout(scrollBottom, 2000);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFocusedArea, setMobileFocusedArea] = useState<'chat' | 'code' | null>(null);
  const shouldLiftBottomBar = mobileFocusedArea === 'chat' && keyboardHeight > 0;
  const mobileDrawerHeight = !drawerOpen
    ? 0
    : mobileFocusedArea === 'code'
      ? '50dvh'
      : '33dvh';
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);

  useEffect(() => {
    if (!isMobile || keyboardHeight > 0) return;
    setMobileFocusedArea(null);
  }, [isMobile, keyboardHeight]);

  const handleChatFocusChange = useCallback((focused: boolean) => {
    setMobileFocusedArea((current) => {
      if (focused) return 'chat';
      return current === 'chat' ? null : current;
    });
  }, []);

  const handleCodeFocusChange = useCallback((focused: boolean) => {
    setMobileFocusedArea((current) => {
      if (focused) return 'code';
      return current === 'code' ? null : current;
    });
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState(() => window.innerWidth * SIDEBAR_RATIO_DEFAULT);
  const [vizHeight, setVizHeight] = useState(() => window.innerHeight * VIZ_RATIO_DEFAULT);
  const [isDragging, setIsDragging] = useState<'h' | 'v' | null>(null);
  const hDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const vDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const topActionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    currentIdRef.current = sessions.currentId;
  }, [sessions.currentId]);

  useEffect(() => {
    if (mainRef.current) {
      setVizHeight(mainRef.current.offsetHeight * VIZ_RATIO_DEFAULT);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const h = mainRef.current?.offsetHeight ?? window.innerHeight;
      setSidebarWidth(w => Math.max(window.innerWidth * SIDEBAR_RATIO_MIN, Math.min(window.innerWidth * SIDEBAR_RATIO_MAX, w)));
      setVizHeight(v => Math.max(h * VIZ_RATIO_MIN, Math.min(h * VIZ_RATIO_MAX, v)));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const isUserAbort = useCallback((error: unknown, signal?: AbortSignal) => {
    if (signal?.aborted) return true;
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof Error) {
      return /abort(ed)?/i.test(error.name) || /request was aborted\.?/i.test(error.message);
    }
    return false;
  }, []);

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

  // Drop the session's abort controller and clear its loading flag.
  const cleanupLoadingSession = useCallback((sessionId: string) => {
    abortControllersRef.current.delete(sessionId);
    setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sessionId); return next; });
  }, []);

  // Surface a non-abort agent error to the user + analytics.
  const reportAgentError = useCallback(
    (e: unknown, sessionId: string, provider: string, model: string) => {
      const errMsg = e instanceof Error ? e.message : t('requestFailed');
      sessions.addAssistantMessage(zh ? `出错了: ${errMsg}` : `Error: ${errMsg}`, undefined, sessionId);
      strudel.setError(errMsg);
      trackAgentError({ provider, model, error_type: e instanceof Error ? e.name : 'unknown' });
    },
    [sessions, strudel]
  );

  const handleInstruction = useCallback(
    async (text: string, options?: { skipAddMessage?: boolean; initialCode?: string }) => {
      const engineUnavailableMessage = getEngineUnavailableMessage(strudel.engineStatus);
      if (engineUnavailableMessage) {
        strudel.setError(engineUnavailableMessage);
        return;
      }

      setCommitSuggestions(null); // reset on each new instruction
      setRollbackPrefill(''); // message sent — rollback prefill content consumed
      if (!options?.skipAddMessage) {
        sessions.addUserMessage(text);
      }
      const sessionId = sessions.currentId;
      if (!sessionId) return;
      setLoadingSessions((prev) => new Set(prev).add(sessionId));

      // In demo mode, if the sent text matches the current step's prompt, advance to the next step
      if (isDemoMode() && activeSet[demoStep]?.prompt === text) {
        setDemoStep((s) => s + 1);
      }

      const controller = new AbortController();
      abortControllersRef.current.set(sessionId, controller);
      const signal = controller.signal;
      const _analyticsStart = Date.now();
      const { provider: _analyticsProvider, model: _analyticsModel } = getActiveModelConfig();

      try {
        const onProgress = makeAgentProgressHandler(sessionId);

        const result = await runAgent(text, options?.initialCode ?? currentCode, onProgress, undefined, signal);
        if (signal.aborted) {
          if (abortControllersRef.current.get(sessionId) === controller) {
            sessions.addAssistantMessage(t('interrupted'), undefined, sessionId);
          }
          trackAgentAbort();
          return;
        }
        trackAgentRun({
          provider: _analyticsProvider,
          model: _analyticsModel,
          iterations: result.iterations,
          durationMs: Date.now() - _analyticsStart,
          committed: result.committed,
        });
        if (result.tokenUsage) {
          sessions.updateTokenStats({
            ...result.tokenUsage,
            modelId: _analyticsModel,
          }, sessionId);
        }
        if (result.code) {
          if (sessionId === currentIdRef.current) {
            const success = await strudel.play(result.code);
            if (success) {
              const nextSteps = parseNextSteps(result.explanation);
              if (nextSteps.length > 0) setCommitSuggestions(nextSteps);
              sessions.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
              sessions.setCurrentCode(result.code, sessionId);
            } else {
              sessions.addAssistantMessage(
                zh ? `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}` : `Agent generated code but it failed to run: ${strudel.error || 'unknown error'}`,
                result.code,
                sessionId
              );
            }
          } else {
            // Background session completed; only save the result, do not update the editor or play audio
            sessions.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
            sessions.setCurrentCode(result.code, sessionId);
          }
        } else {
          sessions.addAssistantMessage(result.explanation || t('agentNoCode'), undefined, sessionId);
        }
      } catch (e: unknown) {
        if (isUserAbort(e, signal)) {
          if (abortControllersRef.current.get(sessionId) === controller) {
            sessions.addAssistantMessage(t('interrupted'), undefined, sessionId);
          }
          trackAgentAbort();
        } else {
          reportAgentError(e, sessionId, _analyticsProvider, _analyticsModel);
        }
      } finally {
        if (abortControllersRef.current.get(sessionId) === controller) {
          cleanupLoadingSession(sessionId);
        }
      }
    },
    [strudel, sessions, currentCode, demoStep, activeSet, isUserAbort, makeAgentProgressHandler, reportAgentError, cleanupLoadingSession]
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

      // Roll back strudel state to before this message was sent
      if (previousCode) {
        await strudel.play(previousCode);
      } else {
        strudel.stop();
        strudel.setCode('');
      }
      if (sessions.currentId) {
        sessions.setCurrentCode(previousCode, sessions.currentId);
      }

      return { target, previousCode };
    },
    [sessions, strudel]
  );

  const handleResend = useCallback(
    async (messageId: string, newContent: string) => {
      const rewound = await rewindBeforeMessage(messageId);
      if (!rewound) return;

      sessions.truncateAndEdit(messageId, newContent);
      await handleInstruction(newContent, { skipAddMessage: true, initialCode: rewound.previousCode });
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
    const instruction = '根据我的心情生成音乐';

    setCommitSuggestions(null);
    setRollbackPrefill(''); // message sent — rollback prefill content consumed
    sessions.addUserMessage(instruction);
    const sessionId = sessions.currentId;
    if (!sessionId) return;
    setLoadingSessions((prev) => new Set(prev).add(sessionId));

    abortControllersRef.current.set(sessionId, new AbortController());
    const signal = abortControllersRef.current.get(sessionId)!.signal;
    const _analyticsStart = Date.now();
    const { provider: _analyticsProvider, model: _analyticsModel } = getActiveModelConfig();

    try {
      const onProgress = makeAgentProgressHandler(sessionId);

      const result = await runAgent(instruction, currentCode, onProgress, moodContext ?? undefined, signal);
      if (signal.aborted) {
        sessions.addAssistantMessage(t('interrupted'), undefined, sessionId);
        trackAgentAbort();
        return;
      }
      trackAgentRun({
        provider: _analyticsProvider,
        model: _analyticsModel,
        iterations: result.iterations,
        durationMs: Date.now() - _analyticsStart,
        committed: result.committed,
      });
      if (result.tokenUsage) {
        sessions.updateTokenStats({
          ...result.tokenUsage,
          modelId: _analyticsModel,
        }, sessionId);
      }
      if (result.code) {
        if (sessionId === currentIdRef.current) {
          const success = await strudel.play(result.code);
          if (success) {
            const nextSteps = parseNextSteps(result.explanation);
            if (nextSteps.length > 0) setCommitSuggestions(nextSteps);
            sessions.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
            sessions.setCurrentCode(result.code, sessionId);
          } else {
            sessions.addAssistantMessage(
              zh ? `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}` : `Agent generated code but it failed to run: ${strudel.error || 'unknown error'}`,
              result.code,
              sessionId
            );
          }
        } else {
          // Background session completed; only save the result, do not update the editor or play audio
          sessions.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
          sessions.setCurrentCode(result.code, sessionId);
        }
      } else {
        sessions.addAssistantMessage(result.explanation || t('agentNoCode'), undefined, sessionId);
      }
    } catch (e: unknown) {
      if (isUserAbort(e, signal)) {
        sessions.addAssistantMessage(t('interrupted'), undefined, sessionId);
        trackAgentAbort();
      } else {
        reportAgentError(e, sessionId, _analyticsProvider, _analyticsModel);
      }
    } finally {
      cleanupLoadingSession(sessionId);
    }
  }, [strudel, sessions, currentCode, isUserAbort, makeAgentProgressHandler, reportAgentError, cleanupLoadingSession]);

  const handleNewSession = useCallback(() => {
    strudel.stop();
    sessions.newSession();
    if (isDemoMode()) setDemoStep(0);
  }, [strudel, sessions]);

  const handleSwitchSession = useCallback((id: string) => {
    setCommitSuggestions(null);
    setUnreadSessions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    sessions.switchTo(id);
  }, [sessions]);

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
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          hDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
          setIsDragging('h');
        }}
        onPointerMove={(e) => {
          if (!hDragRef.current) return;
          const delta = e.clientX - hDragRef.current.startX;
          setSidebarWidth(Math.max(window.innerWidth * SIDEBAR_RATIO_MIN, Math.min(window.innerWidth * SIDEBAR_RATIO_MAX, hDragRef.current.startWidth + delta)));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          hDragRef.current = null;
          setIsDragging(null);
        }}
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
            onResetExportState={strudel.resetExportState}
            session={sessions.currentSession}
            messages={messages}
            topActionsContainer={topActionsRef}
            onOpenSettings={() => setShowApiKeyModal(true)}
          />
        </div>

        {/* Vertical resize handle */}
        <div
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            vDragRef.current = { startY: e.clientY, startHeight: vizHeight };
            setIsDragging('v');
          }}
          onPointerMove={(e) => {
            if (!vDragRef.current) return;
            const delta = e.clientY - vDragRef.current.startY;
            const h = mainRef.current?.offsetHeight ?? window.innerHeight;
            setVizHeight(Math.max(h * VIZ_RATIO_MIN, Math.min(h * VIZ_RATIO_MAX, vDragRef.current.startHeight - delta)));
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            vDragRef.current = null;
            setIsDragging(null);
          }}
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
