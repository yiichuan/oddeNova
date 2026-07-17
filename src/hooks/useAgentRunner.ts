import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { useStrudel } from './useStrudel';
import type { useSessions, CodeRevisionDraft, TokenStats } from './useSessions';
import { runAgent } from '../services/llm';
import type { ConversationTurn, ProgressEvent } from '../services/llm';
import { conversationHistoryFromMessages } from '../lib/conversation-history';
import { commitPlayback } from '../lib/playback-commit';
import { parseNextSteps, stripNextSteps } from '../services/suggestions';
import { getEngineUnavailableMessage } from '../lib/engine-status';
import { getActiveModelConfig } from '../services/llm-config';
import { trackAgentRun, trackAgentError, trackAgentAbort } from '../lib/analytics';
import { t, zh } from '../lib/i18n';
import type { StrudelState } from '../services/strudel';

// ── Pure agent-turn logic (testable in isolation) ────────────────────────────
//
// One Agent turn: instruction in → LLM generation → playback + persistence.
// Shared verbatim by the text-instruction and mood-instruction entry points,
// which differ only in how they build the input. See CONTEXT.md (Agent turn).

/** Everything that varies per turn. */
export interface AgentTurnInput {
  /** Final instruction text handed to the agent. */
  text: string;
  /** Optional mood context appended to the system prompt. */
  moodContext?: string;
  /** Whether to feed the agent prior conversation history. Mood turns pass false. */
  includeHistory: boolean;
  /** Skip writing the user message (resend overwrites it itself). */
  skipAddMessage?: boolean;
  /** Override the code fed to the agent (resend / rollback). Defaults to live code. */
  initialCode?: string;
  /** Explicit history (resend); overrides the snapshot when includeHistory is true. */
  suppliedHistory?: ConversationTurn[];
}

/**
 * The stateful collaborators a turn touches. This is the module's internal seam
 * (used by the hook wiring + the tests); the external interface callers see is
 * just `run(input)`. Pure helpers (history parse, next-steps, i18n, analytics)
 * are imported directly rather than injected.
 */
export interface AgentTurnDeps {
  runAgent: typeof runAgent;
  makeProgressHandler: (sessionId: string) => (e: ProgressEvent) => void;

  // strudel (live audio)
  play: (code: string) => Promise<boolean>;
  getStrudelError: () => string | null;
  setStrudelError: (msg: string) => void;
  engineStatus: () => StrudelState['engineStatus'];

  // sessions (persisted code + messages)
  getCurrentId: () => string | null;
  isCurrentSession: (sessionId: string) => boolean;
  getCurrentCode: () => string;
  snapshotHistory: () => ConversationTurn[];
  addUserMessage: (text: string) => void;
  addAssistantMessage: (
    text: string,
    code: string | undefined,
    sessionId: string,
    revision?: CodeRevisionDraft,
  ) => void;
  setCurrentCode: (code: string, sessionId: string) => void;
  updateTokenStats: (stats: TokenStats, sessionId: string) => void;

  // loading / abort lifecycle (owned by App's controller map + loading set)
  beginLoading: (sessionId: string) => AbortController;
  endLoading: (sessionId: string, controller: AbortController) => void;
  isCurrentController: (sessionId: string, controller: AbortController) => boolean;

  // UI side-effects
  resetSuggestions: () => void;
  setCommitSuggestions: (steps: string[]) => void;
  clearRollbackPrefill: () => void;

  // analytics
  getModelConfig: () => { provider: string; model: string };
}

/** Distinguish a user-triggered abort from a genuine error. */
function isUserAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    return /abort(ed)?/i.test(error.name) || /request was aborted\.?/i.test(error.message);
  }
  return false;
}

export async function runAgentTurn(input: AgentTurnInput, deps: AgentTurnDeps): Promise<void> {
  const unavailable = getEngineUnavailableMessage(deps.engineStatus());
  if (unavailable) {
    deps.setStrudelError(unavailable);
    return;
  }

  deps.resetSuggestions();
  deps.clearRollbackPrefill();

  // The revision baseline is the editor state at turn start. Capture it once:
  // reading live code after the async agent call would include later user edits.
  const beforeCode = input.initialCode ?? deps.getCurrentCode();

  // Snapshot history BEFORE the user message is written, so the current turn is
  // not echoed back into its own history.
  const history: ConversationTurn[] | undefined = input.includeHistory
    ? input.suppliedHistory ?? deps.snapshotHistory()
    : undefined;

  if (!input.skipAddMessage) {
    deps.addUserMessage(input.text);
  }

  const sessionId = deps.getCurrentId();
  if (!sessionId) return;

  const controller = deps.beginLoading(sessionId);
  const signal = controller.signal;
  const startedAt = Date.now();
  const { provider, model } = deps.getModelConfig();

  try {
    const onProgress = deps.makeProgressHandler(sessionId);
    const result = await deps.runAgent(
      input.text,
      beforeCode,
      onProgress,
      input.moodContext,
      signal,
      history,
    );

    if (signal.aborted) {
      if (deps.isCurrentController(sessionId, controller)) {
        deps.addAssistantMessage(t('interrupted'), undefined, sessionId);
      }
      trackAgentAbort();
      return;
    }

    trackAgentRun({
      provider,
      model,
      iterations: result.iterations,
      durationMs: Date.now() - startedAt,
      committed: result.committed,
    });

    if (result.tokenUsage) {
      deps.updateTokenStats({ ...result.tokenUsage, modelId: model }, sessionId);
    }

    if (result.code) {
      if (deps.isCurrentSession(sessionId)) {
        // Always persist the newest code as the session truth, run or not.
        const success = await commitPlayback(result.code, sessionId, deps);
        const revision: CodeRevisionDraft | undefined = result.committed
          ? {
              beforeCode,
              afterCode: result.code,
              playbackStatus: success ? 'played' : 'failed',
            }
          : undefined;
        if (success) {
          const nextSteps = parseNextSteps(result.explanation);
          if (nextSteps.length > 0) deps.setCommitSuggestions(nextSteps);
          if (revision) {
            deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId, revision);
          } else {
            deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
          }
        } else {
          const content = zh
            ? `agent 生成完了但代码无法运行: ${deps.getStrudelError() || '未知错误'}`
            : `Agent generated code but it failed to run: ${deps.getStrudelError() || 'unknown error'}`;
          if (revision) {
            deps.addAssistantMessage(content, result.code, sessionId, revision);
          } else {
            deps.addAssistantMessage(content, result.code, sessionId);
          }
        }
      } else {
        // Background session completed: persist only, don't touch the editor or play audio.
        const revision: CodeRevisionDraft | undefined = result.committed
          ? { beforeCode, afterCode: result.code, playbackStatus: 'not_attempted' }
          : undefined;
        if (revision) {
          deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId, revision);
        } else {
          deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
        }
        deps.setCurrentCode(result.code, sessionId);
      }
    } else {
      deps.addAssistantMessage(result.explanation || t('agentNoCode'), undefined, sessionId);
    }
  } catch (e: unknown) {
    if (isUserAbort(e, signal)) {
      if (deps.isCurrentController(sessionId, controller)) {
        deps.addAssistantMessage(t('interrupted'), undefined, sessionId);
      }
      trackAgentAbort();
    } else {
      const errMsg = e instanceof Error ? e.message : t('requestFailed');
      deps.addAssistantMessage(zh ? `出错了: ${errMsg}` : `Error: ${errMsg}`, undefined, sessionId);
      deps.setStrudelError(errMsg);
      trackAgentError({ provider, model, error_type: e instanceof Error ? e.name : 'unknown' });
    }
  } finally {
    deps.endLoading(sessionId, controller);
  }
}

// ── React hook wrapper ───────────────────────────────────────────────────────

export interface UseAgentRunnerConfig {
  strudel: ReturnType<typeof useStrudel>;
  sessions: ReturnType<typeof useSessions>;
  currentCode: string;
  abortControllersRef: MutableRefObject<Map<string, AbortController>>;
  currentIdRef: MutableRefObject<string | null>;
  setLoadingSessions: Dispatch<SetStateAction<Set<string>>>;
  setCommitSuggestions: Dispatch<SetStateAction<string[] | null>>;
  setRollbackPrefill: Dispatch<SetStateAction<string>>;
  makeProgressHandler: (sessionId: string) => (e: ProgressEvent) => void;
}

/**
 * Captures the stateful collaborators once and exposes a narrow `run(input)`.
 * Mirrors the pure-core + thin-hook split used by useReplay.
 */
export function useAgentRunner(cfg: UseAgentRunnerConfig): (input: AgentTurnInput) => Promise<void> {
  const {
    strudel,
    sessions,
    currentCode,
    abortControllersRef,
    currentIdRef,
    setLoadingSessions,
    setCommitSuggestions,
    setRollbackPrefill,
    makeProgressHandler,
  } = cfg;

  return useCallback(
    (input: AgentTurnInput) => {
      const deps: AgentTurnDeps = {
        runAgent,
        makeProgressHandler,
        play: (code) => strudel.play(code),
        getStrudelError: () => strudel.error,
        setStrudelError: (msg) => strudel.setError(msg),
        engineStatus: () => strudel.engineStatus,
        getCurrentId: () => sessions.currentId,
        isCurrentSession: (id) => id === currentIdRef.current,
        getCurrentCode: () => currentCode,
        snapshotHistory: () => conversationHistoryFromMessages(sessions.currentSession?.messages ?? []),
        addUserMessage: (text) => sessions.addUserMessage(text),
        addAssistantMessage: (text, code, id, revision) => sessions.addAssistantMessage(text, code, id, revision),
        setCurrentCode: (code, id) => sessions.setCurrentCode(code, id),
        updateTokenStats: (stats, id) => sessions.updateTokenStats(stats, id),
        beginLoading: (id) => {
          setLoadingSessions((prev) => new Set(prev).add(id));
          const controller = new AbortController();
          abortControllersRef.current.set(id, controller);
          return controller;
        },
        endLoading: (id, controller) => {
          if (abortControllersRef.current.get(id) === controller) {
            abortControllersRef.current.delete(id);
            setLoadingSessions((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        },
        isCurrentController: (id, controller) => abortControllersRef.current.get(id) === controller,
        resetSuggestions: () => setCommitSuggestions(null),
        setCommitSuggestions: (steps) => setCommitSuggestions(steps),
        clearRollbackPrefill: () => setRollbackPrefill(''),
        getModelConfig: () => {
          const c = getActiveModelConfig();
          return { provider: c.provider, model: c.model };
        },
      };
      return runAgentTurn(input, deps);
    },
    [
      strudel,
      sessions,
      currentCode,
      makeProgressHandler,
      abortControllersRef,
      currentIdRef,
      setLoadingSessions,
      setCommitSuggestions,
      setRollbackPrefill,
    ],
  );
}
