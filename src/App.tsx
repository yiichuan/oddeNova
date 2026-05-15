import { useCallback, useEffect, useRef, useState } from 'react';
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
import { isDemoMode, getActiveDemoSet, DEMO_PREFILL } from './demo/demo-config';
import ApiKeyModal from './components/ApiKeyModal';
import { hasApiKeyConfigured } from './services/llm-config';
import { resetClient } from './services/llm';
import { HistoryIcon, PlusIcon, SettingsIcon } from './components/icons';
import ConversationView from './components/ConversationView';
import HistoryPanel from './components/HistoryPanel';
import ChatInput from './components/ChatInput';

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 320;
const VIZ_MIN = 120;
const VIZ_MAX = 500;
const VIZ_DEFAULT = 280;

export default function App() {
  const strudel = useStrudel();
  const sessions = useSessions();
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const currentIdRef = useRef<string | null>(sessions.currentId);
  const prevLoadingRef = useRef<Set<string>>(new Set());

  const isMobile = useIsMobile();
  const keyboardHeight = useKeyboardHeight();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [vizHeight, setVizHeight] = useState(VIZ_DEFAULT);
  const [isDragging, setIsDragging] = useState<'h' | 'v' | null>(null);
  const hDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const vDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  useEffect(() => {
    currentIdRef.current = sessions.currentId;
  }, [sessions.currentId]);

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

  const [showApiKeyModal, setShowApiKeyModal] = useState(() => !hasApiKeyConfigured());

  const current = sessions.currentSession;
  const messages = current?.messages ?? [];
  // Session code = last committed/played code (used as agent context)
  // Fall back to live editor code so manually-pasted code is visible to the agent.
  const currentCode = strudel.code || (current?.code ?? '');
  const hasUserMessages = messages.some((m) => m.role === 'user');
  const isLoading = !!current?.id && loadingSessions.has(current.id);

  const { suggestions, loading: suggestionsLoading } = useSuggestions({
    key: current?.id ?? '',
    currentCode,
    // demo 模式下不需要真实 LLM suggestions，跳过 buildSuggestions 调用
    hasUserMessages: isDemoMode() ? false : hasUserMessages,
    messages,
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

  const handleInstruction = useCallback(
    async (text: string) => {
      if (!strudel.engineReady) {
        strudel.setError('音频引擎启动中，请稍后再试');
        return;
      }

      sessions.addUserMessage(text);
      const sessionId = sessions.currentId;
      if (!sessionId) return;
      setLoadingSessions((prev) => new Set(prev).add(sessionId));

      // 在 demo 模式下，若发送的是当前步骤的提示词，则推进到下一步
      if (isDemoMode() && activeSet[demoStep]?.prompt === text) {
        setDemoStep((s) => s + 1);
      }

      abortControllersRef.current.set(sessionId, new AbortController());
      const signal = abortControllersRef.current.get(sessionId)!.signal;

      try {
        // Track layer names already shown in this agent run to prevent
        // duplicate progress entries when the LLM calls addLayer/removeLayer/
        // replaceLayer for the same layer across different iterations.
        const shownLayerOps = new Set<string>();

        const onProgress = (e: ProgressEvent) => {
          if (e.kind === 'iteration') return;
          if (e.kind === 'tool_call') {
            if (e.name !== 'validate' && e.name !== 'commit') {
              // Dedup layer operations across iterations: same tool + same layer
              // name means the LLM is retrying something it already attempted
              // (addLayer will fail at the tool level anyway since the layer
              // exists). Skip the duplicate progress line to avoid confusing UI.
              const layerKey = (e.name === 'addLayer' || e.name === 'removeLayer' || e.name === 'replaceLayer')
                ? `${e.name}:${String(e.args.name ?? '')}`
                : e.name === 'improvise'
                  ? `improvise:${String(e.args.role ?? '')}`
                  : null;
              if (layerKey !== null) {
                if (shownLayerOps.has(layerKey)) return;
                shownLayerOps.add(layerKey);
              }
              sessions.addProgress('tool_call', formatToolCall(e.name, e.args), {
                toolName: e.name,
                sessionId,
              });
            }
            return;
          }
          if (e.kind === 'tool_result') {
            if (e.ok) {
              return;
            }
            console.error(
              `[agent] ❌ tool "${e.name}" 失败:`, e.error || 'unknown error'
            );
            return;
          }
          if (e.kind === 'commit') {
            sessions.addProgress('commit', '准备播放…', { sessionId });
            return;
          }
          if (e.kind === 'warn') {
            sessions.addProgress('warn', e.message, { sessionId });
            return;
          }
          if (e.kind === 'assistant_text_delta') {
            sessions.appendToLastThinking(e.delta, sessionId);
            return;
          }
          if (e.kind === 'assistant_text') {
            sessions.addProgress('thinking', e.text, { sessionId });
            return;
          }
        };

        const result = await runAgent(text, currentCode, onProgress, undefined, signal);
        if (signal.aborted) {
          sessions.addAssistantMessage('已中断', undefined, sessionId);
          return;
        }
        if (result.code) {
          if (sessionId === currentIdRef.current) {
            const success = await strudel.play(result.code);
            if (success) {
              sessions.addAssistantMessage(result.explanation, result.code, sessionId);
              sessions.setCurrentCode(result.code, sessionId);
            } else {
              sessions.addAssistantMessage(
                `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}`,
                result.code,
                sessionId
              );
            }
          } else {
            // 后台会话完成，仅保存结果，不更新编辑器也不播放音频
            sessions.addAssistantMessage(result.explanation, result.code, sessionId);
            sessions.setCurrentCode(result.code, sessionId);
          }
        } else {
          sessions.addAssistantMessage(result.explanation || 'agent 没有产出代码', undefined, sessionId);
        }
      } catch (e: unknown) {
        if (isUserAbort(e, signal)) {
          sessions.addAssistantMessage('已中断', undefined, sessionId);
        } else {
          const errMsg = e instanceof Error ? e.message : '请求失败';
          sessions.addAssistantMessage(`出错了: ${errMsg}`, undefined, sessionId);
          strudel.setError(errMsg);
        }
      } finally {
        abortControllersRef.current.delete(sessionId);
        setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sessionId); return next; });
      }
    },
    [strudel, sessions, currentCode, demoStep, activeSet, isUserAbort]
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
    setLoadingSessions((prev) => new Set(prev).add(sessionId));

    abortControllersRef.current.set(sessionId, new AbortController());
    const signal = abortControllersRef.current.get(sessionId)!.signal;

    try {
      const shownLayerOps = new Set<string>();

      const onProgress = (e: ProgressEvent) => {
        if (e.kind === 'iteration') return;
        if (e.kind === 'tool_call') {
          if (e.name !== 'validate' && e.name !== 'commit') {
            const layerKey = (e.name === 'addLayer' || e.name === 'removeLayer' || e.name === 'replaceLayer')
              ? `${e.name}:${String(e.args.name ?? '')}`
              : e.name === 'improvise'
                ? `improvise:${String(e.args.role ?? '')}`
                : null;
            if (layerKey !== null) {
              if (shownLayerOps.has(layerKey)) return;
              shownLayerOps.add(layerKey);
            }
            sessions.addProgress('tool_call', formatToolCall(e.name, e.args), {
              toolName: e.name,
              sessionId,
            });
          }
          return;
        }
        if (e.kind === 'tool_result') {
          if (!e.ok) console.error(`[agent] ❌ tool "${e.name}" 失败:`, e.error || 'unknown error');
          return;
        }
        if (e.kind === 'commit') { sessions.addProgress('commit', '准备播放…', { sessionId }); return; }
        if (e.kind === 'warn') { sessions.addProgress('warn', e.message, { sessionId }); return; }
        if (e.kind === 'assistant_text_delta') { sessions.appendToLastThinking(e.delta, sessionId); return; }
        if (e.kind === 'assistant_text') { sessions.addProgress('thinking', e.text, { sessionId }); return; }
      };

      const result = await runAgent(instruction, currentCode, onProgress, moodContext ?? undefined, signal);
      if (signal.aborted) {
        sessions.addAssistantMessage('已中断', undefined, sessionId);
        return;
      }
      if (result.code) {
        if (sessionId === currentIdRef.current) {
          const success = await strudel.play(result.code);
          if (success) {
            sessions.addAssistantMessage(result.explanation, result.code, sessionId);
            sessions.setCurrentCode(result.code, sessionId);
          } else {
            sessions.addAssistantMessage(
              `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}`,
              result.code,
              sessionId
            );
          }
        } else {
          // 后台会话完成，仅保存结果，不更新编辑器也不播放音频
          sessions.addAssistantMessage(result.explanation, result.code, sessionId);
          sessions.setCurrentCode(result.code, sessionId);
        }
      } else {
        sessions.addAssistantMessage(result.explanation || 'agent 没有产出代码', undefined, sessionId);
      }
    } catch (e: unknown) {
      if (isUserAbort(e, signal)) {
        sessions.addAssistantMessage('已中断', undefined, sessionId);
      } else {
        const errMsg = e instanceof Error ? e.message : '请求失败';
        sessions.addAssistantMessage(`出错了: ${errMsg}`, undefined, sessionId);
        strudel.setError(errMsg);
      }
    } finally {
      abortControllersRef.current.delete(sessionId);
      setLoadingSessions((prev) => { const next = new Set(prev); next.delete(sessionId); return next; });
    }
  }, [strudel, sessions, currentCode, isUserAbort]);

  const handleNewSession = useCallback(() => {
    strudel.stop();
    sessions.newSession();
    if (isDemoMode()) setDemoStep(0);
  }, [strudel, sessions]);

  const handleSwitchSession = useCallback((id: string) => {
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
          <ConversationView messages={messages} isLoading={isLoading} />
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
            <div className="flex overflow-x-auto gap-2 pb-2 mt-3 no-scrollbar">
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
          onOpenSettings={() => setShowApiKeyModal(true)}
          isHistoryLoading={sessions.isLoading}
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
          setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, hDragRef.current.startWidth + delta)));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          hDragRef.current = null;
          setIsDragging(null);
        }}
        className="w-[22px] h-full shrink-0 group flex items-center justify-center pt-3 pb-3"
        style={{ cursor: 'col-resize' }}
      >
        <div className={`w-[6px] h-full transition-colors duration-150 ${isDragging === 'h' ? 'bg-white/40' : 'bg-transparent group-hover:bg-white/40'}`} />
      </div>

      <main className="flex-1 flex flex-col pt-3 pr-3 pb-0 min-w-0">
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
            setVizHeight(Math.max(VIZ_MIN, Math.min(VIZ_MAX, vDragRef.current.startHeight - delta)));
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
      return '读取当前曲谱';
    case 'addLayer':
      return `加入层 ${s('name')}`;
    case 'removeLayer':
      return `移除层 ${s('name')}`;
    case 'replaceLayer':
      return `替换层 ${s('name')}`;
    case 'applyEffect':
      return `给 ${s('layer')} 加效果 ${s('chain')}`;
    case 'setTempo':
      return `设速度 ${s('bpm')} BPM`;
    case 'validate':
      return '校验代码';
    case 'improvise': {
      const hints = s('hints');
      return `即兴生成 ${s('role')}${hints ? `（${hints}）` : ''}`;
    }
    case 'commit':
      return '提交并播放';
    default:
      return `${name}(${JSON.stringify(args).slice(0, 60)})`;
  }
}
