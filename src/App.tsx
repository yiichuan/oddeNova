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
import { useAgentRunner } from './hooks/useAgentRunner';
import { fetchMoodContext } from './services/airjelly';
import { isDemoMode, getActiveDemoSet, DEMO_PREFILL } from './demo/demo-config';
import ApiKeyModal from './components/ApiKeyModal';
import { hasApiKeyConfigured } from './services/llm-config';
import { resetClient } from './services/llm';
import { HistoryIcon, PlusIcon, SettingsIcon } from './components/icons';
import { useImportShare } from './hooks/useImportShare';
import ConversationView from './components/ConversationView';
import HistoryPanel from './components/HistoryPanel';
import ChatInput from './components/ChatInput';

const SIDEBAR_RATIO_DEFAULT = 0.22;
const SIDEBAR_RATIO_MIN = 0.15;
const SIDEBAR_RATIO_MAX = 0.45;

const VIZ_RATIO_DEFAULT = 1 / (1 + 1.55); // ≈ 0.392，由上:下=1.55推导
const VIZ_RATIO_MIN = 0.15;
const VIZ_RATIO_MAX = 0.45;

export default function App() {
  const strudel = useStrudel();
  const sessions = useSessions();
  const importStatus = useImportShare(sessions.importSession, !sessions.isLoading);
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [commitSuggestions, setCommitSuggestions] = useState<string[] | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const currentIdRef = useRef<string | null>(sessions.currentId);
  const prevLoadingRef = useRef<Set<string>>(new Set());
  const { loadingSessions, runAgentSession, stop: agentRunnerStop } = useAgentRunner({
    sessions,
    strudel,
    currentIdRef,
    setCommitSuggestions,
  });

  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);

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
    // 找出本轮从 loading 消失的 id（即生成完成的会话）
    const completed = [...prev].filter((id) => !curr.has(id));
    if (completed.length > 0) {
      setUnreadSessions((prevUnread) => {
        const next = new Set(prevUnread);
        for (const id of completed) {
          // 只有非当前会话才标为未读
          if (id !== currentIdRef.current) {
            next.add(id);
          }
        }
        return next;
      });
    }
    prevLoadingRef.current = curr;
  }, [loadingSessions]);

  const handleStop = agentRunnerStop;

  const [showApiKeyModal, setShowApiKeyModal] = useState(() => !hasApiKeyConfigured());
  const [importErrorDismissed, setImportErrorDismissed] = useState(false);

  const current = sessions.currentSession;
  const messages = current?.messages ?? [];
  // editorCode: strudel.code is the live editor content (authoritative).
  // Falls back to session.code for the brief window after a session switch
  // before the sync effect runs (strudel.setCode hasn't fired yet).
  const editorCode = strudel.code || (current?.code ?? '');
  const hasUserMessages = messages.some((m) => m.role === 'user');
  const isLoading = !!current?.id && loadingSessions.has(current.id);

  const { suggestions, loading: suggestionsLoading } = useSuggestions({
    key: current?.id ?? '',
    currentCode: current?.code ?? '',
    // demo 模式下不需要真实 LLM suggestions，跳过 buildSuggestions 调用
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
  const strudelRef = useRef(strudel);
  strudelRef.current = strudel;
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

  const handleInstruction = useCallback(
    async (text: string, options?: { skipAddMessage?: boolean; initialCode?: string }) => {
      if (!strudel.engineReady) {
        strudel.setError('音频引擎启动中，请稍后再试');
        return;
      }
      if (!options?.skipAddMessage) {
        sessions.addUserMessage(text);
      }
      const sessionId = sessions.currentId;
      if (!sessionId) return;
      // 在 demo 模式下，若发送的是当前步骤的提示词，则推进到下一步
      if (isDemoMode() && activeSet[demoStep]?.prompt === text) {
        setDemoStep((s) => s + 1);
      }
      await runAgentSession({
        instruction: text,
        sessionId,
        currentCode: options?.initialCode ?? editorCode,
      });
    },
    [strudel, sessions, editorCode, runAgentSession, demoStep, activeSet]
  );

  const handleResend = useCallback(
    async (messageId: string, newContent: string) => {
      // Abort any in-progress run before resending
      handleStop();
      // 找到该消息之前最后一条有代码的 assistant 消息，作为回退目标
      const allMessages = sessions.currentSession?.messages ?? [];
      const idx = allMessages.findIndex((m) => m.id === messageId);
      const before = idx >= 0 ? allMessages.slice(0, idx) : [];
      const prevAssistant = [...before].reverse().find((m) => m.role === 'assistant' && m.code != null);
      const previousCode = prevAssistant?.code ?? '';

      // 回退 strudel 状态到该消息发出前
      if (previousCode) {
        await strudel.play(previousCode);
      } else {
        strudel.stop();
        strudel.setCode('');
      }
      if (sessions.currentId) {
        sessions.setCurrentCode(previousCode, sessions.currentId);
      }

      sessions.truncateAndEdit(messageId, newContent);
      await handleInstruction(newContent, { skipAddMessage: true, initialCode: previousCode });
    },
    [sessions, handleInstruction, strudel, handleStop]
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
    if (!strudel.engineReady) {
      strudel.setError('音频引擎启动中，请稍后再试');
      return;
    }
    let moodContext: string | null = null;
    if (!isDemoMode()) {
      setIsMoodLoading(true);
      moodContext = await fetchMoodContext();
      setIsMoodLoading(false);
    }
    const instruction = '根据我的心情生成音乐';
    sessions.addUserMessage(instruction);
    const sessionId = sessions.currentId;
    if (!sessionId) return;
    await runAgentSession({
      instruction,
      sessionId,
      currentCode: editorCode,
      moodContext: moodContext ?? undefined,
    });
  }, [strudel, sessions, editorCode, runAgentSession]);

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
              aria-label="新建会话"
              title="新建会话"
            >
              <PlusIcon size={18} />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              aria-label="会话历史"
              title="会话历史"
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
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            aria-label="设置"
            title="设置"
          >
            <SettingsIcon size={18} />
          </button>
        </div>

        {/* ── Conversation ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConversationView key={sessions.currentId ?? 'default'} messages={messages} isLoading={isLoading} onResend={handleResend} onBranch={sessions.branchFromMessage} onRetry={handleRetry} />
        </div>

        {/* ── Code Drawer ── */}
        <div
          className="shrink-0 overflow-hidden border-t border-border"
          style={{
            height: drawerOpen ? '33dvh' : 0,
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
              />
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          className="relative shrink-0 px-3 pt-3 border-t border-border"
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : undefined,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {/* Code pill toggle — rides on the border-t line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="rounded-full border border-border bg-bg-primary px-4 py-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
            >
              {drawerOpen ? '收起代码 ↓' : '查看代码 ↑'}
            </button>
          </div>

          {/* Suggestion chips — horizontal scroll */}
          {!isLoading && !suggestionsLoading && demoSuggestions.length > 0 && (
            <div className="suggestion-chips flex overflow-x-auto gap-2 pb-2 mt-3 no-scrollbar">
              {demoSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleInstruction(s)}
                  className="rounded-[8px] bg-transparent border border-border px-3 py-1.5 text-[11px] text-[#cccccc] whitespace-nowrap shrink-0 transition hover:border-accent/50 hover:text-text-primary"
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
            onSendText={handleInstruction}
            onStop={handleStop}
            onReinitEngine={strudel.reinit}
            focusTrigger={1}
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
            <span className="text-text-secondary text-sm">正在载入分享内容…</span>
          </div>
        )}
        {importStatus === 'error' && !importErrorDismissed && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/90">
            <span className="text-red-400 text-sm">分享内容加载失败</span>
            <div className="flex gap-3">
              <button
                onClick={() => { handleNewSession(); setImportErrorDismissed(true); }}
                className="px-4 py-1.5 text-sm rounded border border-border text-text-primary hover:border-accent/50 transition-colors"
              >
                新建会话
              </button>
              <button
                onClick={() => setImportErrorDismissed(true)}
                className="px-4 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
              >
                关闭
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
          title={current?.title ?? '新会话'}
          messages={messages}
          isLoading={isLoading}
          isMoodLoading={isMoodLoading}
          engineReady={strudel.engineReady}
          sessions={sessions.sessions}
          currentId={sessions.currentId}
          suggestions={demoSuggestions}
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
          onResend={handleResend}
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
          <span className="text-text-secondary text-sm">正在载入分享内容…</span>
        </div>
      )}
      {importStatus === 'error' && !importErrorDismissed && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/90">
          <span className="text-red-400 text-sm">分享内容加载失败</span>
          <div className="flex gap-3">
            <button
              onClick={() => { handleNewSession(); setImportErrorDismissed(true); }}
              className="px-4 py-1.5 text-sm rounded border border-border text-text-primary hover:border-accent/50 transition-colors"
            >
              新建会话
            </button>
            <button
              onClick={() => setImportErrorDismissed(true)}
              className="px-4 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
