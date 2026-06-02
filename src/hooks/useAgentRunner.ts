import { useCallback, useEffect, useRef, useState } from 'react';
import { runAgent } from '../services/llm';
import type { ProgressEvent } from '../services/llm';
import { parseNextSteps } from '../services/suggestions';
import { getActiveModelConfig } from '../services/llm-config';
import { trackAgentRun, trackAgentError, trackAgentAbort } from '../lib/analytics';
import type { ProgressKind } from './useChat';
import type { TokenStats } from './useSessions';

// ---------------------------------------------------------------------------
// Module-level helpers (no closure over state)
// ---------------------------------------------------------------------------

function stripNextSteps(explanation: string): string {
  return explanation.replace(/\n\n接下来可以[：:][^]*$/, '').trim();
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  const s = (key: string): string => {
    const v = args[key];
    return v == null ? '' : String(v);
  };
  switch (name) {
    case 'getScore': return '读取当前曲谱';
    case 'applyEffect': return `给 ${s('layer')} 加效果 ${s('chain')}`;
    case 'setTempo': return `设速度 ${s('bpm')} BPM`;
    case 'validate': return '校验代码';
    case 'commit': return '提交并播放';
    default: return `${name}(${JSON.stringify(args).slice(0, 60)})`;
  }
}

function isUserAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    return /abort(ed)?/i.test(error.name) || /request was aborted\.?/i.test(error.message);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Narrow interfaces — only the session / strudel methods this hook needs
// ---------------------------------------------------------------------------

interface AgentRunnerSessions {
  currentId: string | null;
  addProgress: (kind: ProgressKind, content: string, opts?: { toolName?: string; ok?: boolean; sessionId?: string }) => void;
  addAssistantMessage: (content: string, code?: string, sessionId?: string) => void;
  appendToLastThinking: (delta: string, sessionId?: string) => void;
  appendToLastReasoning: (delta: string, sessionId?: string) => void;
  setCurrentCode: (code: string, sessionId?: string) => void;
  updateTokenStats: (stats: TokenStats, sessionId?: string) => void;
}

interface AgentRunnerStrudel {
  play: (code?: string) => Promise<boolean>;
  setError: (error: string | null) => void;
  error: string | null;
}

export interface AgentSessionOptions {
  instruction: string;
  sessionId: string;
  /** Live editor code passed as starting point for the agent. */
  currentCode: string;
  moodContext?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Encapsulates the full agent-run lifecycle:
 * AbortController management, loadingSessions state, onProgress dispatch,
 * result handling, analytics, and error recovery.
 *
 * Uses ref-sync pattern so runAgentSession / stop are stable across renders
 * regardless of how often sessions / strudel update.
 */
export function useAgentRunner({
  sessions,
  strudel,
  currentIdRef,
  setCommitSuggestions,
}: {
  sessions: AgentRunnerSessions;
  strudel: AgentRunnerStrudel;
  /** Ref to the currently active session ID — read by async callbacks to decide whether to play. */
  currentIdRef: { current: string | null };
  setCommitSuggestions: (v: string[] | null) => void;
}) {
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Abort all in-flight requests on unmount to prevent setState on unmounted component.
  useEffect(() => {
    const map = abortControllersRef.current;
    return () => { map.forEach((ctrl) => ctrl.abort()); };
  }, []);

  // Sync refs so callbacks always read the latest sessions/strudel without
  // needing them in the useCallback dependency array (avoids churn).
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const strudelRef = useRef(strudel);
  strudelRef.current = strudel;

  const stop = useCallback((): void => {
    const id = sessionsRef.current.currentId;
    if (id) abortControllersRef.current.get(id)?.abort();
  }, []);

  const runAgentSession = useCallback(async ({
    instruction,
    sessionId,
    currentCode,
    moodContext,
  }: AgentSessionOptions): Promise<void> => {
    // Snapshot refs at call time — these are kept up-to-date on every render.
    const sess = sessionsRef.current;
    const strdl = strudelRef.current;

    setCommitSuggestions(null);
    setLoadingSessions((prev) => new Set(prev).add(sessionId));

    const controller = new AbortController();
    abortControllersRef.current.set(sessionId, controller);
    const signal = controller.signal;
    const analyticsStart = Date.now();
    const { provider: analyticsProvider, model: analyticsModel } = getActiveModelConfig();

    try {
      const onProgress = (e: ProgressEvent): void => {
        if (e.kind === 'iteration') return;
        if (e.kind === 'tool_call') {
          if (e.name !== 'validate' && e.name !== 'commit') {
            sess.addProgress('tool_call', formatToolCall(e.name, e.args), { toolName: e.name, sessionId });
          }
          return;
        }
        if (e.kind === 'tool_result') {
          if (!e.ok) console.error(`[agent] ❌ tool "${e.name}" 失败:`, e.error || 'unknown error');
          return;
        }
        if (e.kind === 'commit') { sess.addProgress('commit', '准备播放…', { sessionId }); return; }
        if (e.kind === 'warn') { sess.addProgress('warn', e.message, { sessionId }); return; }
        if (e.kind === 'reasoning_delta') { sess.appendToLastReasoning(e.delta, sessionId); return; }
        if (e.kind === 'assistant_text_delta') { sess.appendToLastThinking(e.delta, sessionId); return; }
        if (e.kind === 'assistant_text') { sess.addProgress('thinking', e.text, { sessionId }); return; }
      };

      const result = await runAgent(instruction, currentCode, onProgress, moodContext, signal);

      if (signal.aborted) {
        if (abortControllersRef.current.get(sessionId) === controller) {
          sess.addAssistantMessage('已中断', undefined, sessionId);
        }
        trackAgentAbort();
        return;
      }

      trackAgentRun({
        provider: analyticsProvider,
        model: analyticsModel,
        iterations: result.iterations,
        durationMs: Date.now() - analyticsStart,
        committed: result.committed,
      });

      if (result.tokenUsage) {
        sess.updateTokenStats({ ...result.tokenUsage, modelId: analyticsModel }, sessionId);
      }

      if (result.code) {
        if (sessionId === currentIdRef.current) {
          // Foreground session: play the result immediately.
          const success = await strdl.play(result.code);
          if (success) {
            const nextSteps = parseNextSteps(result.explanation);
            if (nextSteps.length > 0) setCommitSuggestions(nextSteps);
            sess.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
            sess.setCurrentCode(result.code, sessionId);
          } else {
            sess.addAssistantMessage(
              `agent 生成完了但代码无法运行: ${strdl.error || '未知错误'}`,
              result.code,
              sessionId
            );
          }
        } else {
          // Background session: save result only, do not play or update the editor.
          sess.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
          sess.setCurrentCode(result.code, sessionId);
        }
      } else {
        sess.addAssistantMessage(result.explanation || 'agent 没有产出代码', undefined, sessionId);
      }
    } catch (e: unknown) {
      if (isUserAbort(e, signal)) {
        if (abortControllersRef.current.get(sessionId) === controller) {
          sess.addAssistantMessage('已中断', undefined, sessionId);
        }
        trackAgentAbort();
      } else {
        const errMsg = e instanceof Error ? e.message : '请求失败';
        sess.addAssistantMessage(`出错了: ${errMsg}`, undefined, sessionId);
        strdl.setError(errMsg);
        trackAgentError({
          provider: analyticsProvider,
          model: analyticsModel,
          error_type: e instanceof Error ? e.name : 'unknown',
        });
      }
    } finally {
      if (abortControllersRef.current.get(sessionId) === controller) {
        abortControllersRef.current.delete(sessionId);
        setLoadingSessions((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    }
  }, [currentIdRef, setCommitSuggestions]); // sessions/strudel read via stable refs

  return { loadingSessions, runAgentSession, stop };
}
