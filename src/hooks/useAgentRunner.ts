import type { ImageAttachment } from '../lib/image-attachments';
import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { useStrudel } from './useStrudel';
import type { useSessions, CodeRevisionDraft } from './useSessions';
import { runAgent } from '../services/llm-loader';
import type { ConversationTurn, ProgressEvent } from '../services/llm-loader';
import type { InputMode } from './useChat';
import { conversationHistoryFromMessages } from '../lib/conversation-history';
import { commitPlayback } from '../lib/playback-commit';
import { isStepwiseChoice, parseNextSteps, stripNextSteps } from '../services/suggestions';
import { getActiveModelConfig } from '../services/llm-config';
import {
  trackAgentTurnFinished,
  trackAgentTurnStarted,
  type AgentEntryPoint,
  type AgentTurnFinishedProperties,
  type AgentTurnOutcome,
} from '../lib/analytics';
import { t, zh } from '../lib/i18n';
import type { StrudelState } from '../services/strudel';
import { analyticsContext, analyticsError, analyticsId, rememberAnalyticsTurn, type AnalyticsContext } from '../lib/analytics-context';
import { isAbortError } from '../lib/errors';

// ── Pure agent-turn logic (testable in isolation) ────────────────────────────
//
// One Agent turn: instruction in → LLM generation → playback + persistence.
// Shared verbatim by the text-instruction and mood-instruction entry points,
// which differ only in how they build the input. See CONTEXT.md (Agent turn).

/** Everything that varies per turn. */
export interface AgentTurnInput {
  /** Final instruction text handed to the agent. */
  text: string;
  images?: ImageAttachment[];
  selectedChoice?: true;
  /** Product surface that initiated this turn. */
  entryPoint: AgentEntryPoint;
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
  /** Called for a newly added first user message when it can name the session. */
  onFirstUserMessage?: (messageId: string) => void;
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
  play: (code: string, context?: AnalyticsContext) => Promise<boolean>;
  getStrudelError: () => string | null;
  setStrudelError: (msg: string) => void;
  engineStatus: () => StrudelState['engineStatus'];

  // sessions (persisted code + messages)
  getCurrentId: () => string | null;
  isCurrentSession: (sessionId: string) => boolean;
  getCurrentCode: () => string;
  snapshotHistory: () => ConversationTurn[];
  addUserMessage: (text: string, images?: ImageAttachment[], selectedChoice?: true) => {
    id: string;
    isFirstUserMessage: boolean;
  } | undefined;
  addAssistantMessage: (
    text: string,
    code: string | undefined,
    sessionId: string,
    revision?: CodeRevisionDraft,
    inputMode?: InputMode,
    layerNotes?: Record<string, string>,
    analyticsTurnId?: string,
  ) => void;
  finalizeLastAssistantMessage: (text: string, sessionId: string, turnId?: string) => void;
  setCurrentCode: (code: string, sessionId: string) => void;
  setSessionSuggestions: (
    items: string[],
    forCode: string,
    sessionId: string,
  ) => void;
  checkpointSession: (sessionId: string) => Promise<void>;

  // loading / abort lifecycle (owned by App's controller map + loading set)
  beginLoading: (sessionId: string) => AbortController;
  endLoading: (sessionId: string, controller: AbortController) => void;
  isCurrentController: (sessionId: string, controller: AbortController) => boolean;

  // UI side-effects
  resetSuggestions: () => void;
  setCommitSuggestions: (steps: string[]) => void;
  clearRollbackPrefill: () => void;

  // analytics
  analyticsOwnerKey?: string;
  getModelConfig: () => { provider: string; model: string };
  trackAgentTurnStarted: typeof trackAgentTurnStarted;
  trackAgentTurnFinished: typeof trackAgentTurnFinished;
}

/** Distinguish a user-triggered abort from a genuine error. */
export function isUserAbort(error: unknown, signal?: AbortSignal): boolean {
  return isAbortError(error, signal);
}

function safelyTrackAnalytics(capture: () => void): void {
  try {
    capture();
  } catch {
    // Analytics must never alter Agent, playback, or persistence behavior.
  }
}

export async function runAgentTurn(input: AgentTurnInput, deps: AgentTurnDeps): Promise<void> {
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
    const insertion = input.selectedChoice
      ? deps.addUserMessage(input.text, undefined, true)
      : input.images?.length
        ? deps.addUserMessage(input.text, input.images)
        : deps.addUserMessage(input.text);
    if (insertion?.isFirstUserMessage) input.onFirstUserMessage?.(insertion.id);
  }

  const sessionId = deps.getCurrentId();
  if (!sessionId) return;

  const controller = deps.beginLoading(sessionId);
  const signal = controller.signal;
  const ownsTurn = () => deps.isCurrentController(sessionId, controller);
  const startedAt = Date.now();
  const { provider, model } = deps.getModelConfig();
  const context = { ...analyticsContext(sessionId, deps.analyticsOwnerKey), turn_id: analyticsId() };
  const analyticsBase = {
    context,
    input_mode: beforeCode.trim() ? 'revise' : 'create',
    image_count: input.images?.length ?? 0,
    entry_point: input.entryPoint,
    provider,
    model,
    has_existing_code: beforeCode.trim().length > 0,
    has_history: Boolean(history?.length),
  } as const;
  let outcome: AgentTurnOutcome = 'agent_failed';
  let iterations = 0;
  let requestRetryCount = 0;
  let toolFailureCount = 0;
  let terminationReason = 'exception';
  let stage = 'request';
  let failure: Pick<AgentTurnFinishedProperties, 'error_code' | 'failure_stage' | 'http_status'> = {};

  safelyTrackAnalytics(() => deps.trackAgentTurnStarted(analyticsBase));

  try {
    const onProgress = deps.makeProgressHandler(sessionId);
    const result = await deps.runAgent(
      input.text,
      beforeCode,
      (event) => {
        if (!ownsTurn()) return;
        if (event.kind === 'iteration') iterations = event.index;
        if (event.kind === 'request_retry') requestRetryCount++;
        if (event.kind === 'tool_result' && !event.ok) toolFailureCount++;
        onProgress(event);
      },
      input.moodContext,
      signal,
      history,
      input.images,
    );
    iterations = result.iterations;
    terminationReason = result.terminationReason ?? (result.committed ? 'committed' : 'no_commit');
    if (terminationReason === 'validation_failed') failure = { failure_stage: 'validation', error_code: 'validation_failed' };
    if (terminationReason === 'timeout') failure = { failure_stage: 'agent_loop', error_code: 'timeout' };

    if (signal.aborted || !ownsTurn()) {
      outcome = 'aborted';
      terminationReason = 'aborted';
      if (ownsTurn()) {
        deps.finalizeLastAssistantMessage(t('interrupted'), sessionId);
      }
      return;
    }

    stage = 'result';
    if (result.code) {
      if (result.committed) rememberAnalyticsTurn(sessionId, result.code, context.turn_id, deps.analyticsOwnerKey);
      if (deps.isCurrentSession(sessionId)) {
        // Always persist the newest code as the session truth, run or not.
        stage = 'playback';
        const success = await commitPlayback(result.code, sessionId, {
          play: code => deps.play(code, context),
          setCurrentCode: (code, id) => {
            if (ownsTurn()) deps.setCurrentCode(code, id);
          },
        });
        if (!ownsTurn()) {
          outcome = 'aborted';
          terminationReason = 'aborted';
          return;
        }
        if (!success && !failure.error_code) failure = {
          failure_stage: 'playback',
          error_code: deps.engineStatus() === 'ready' ? 'playback_failed' : 'engine_unavailable',
        };
        stage = 'result';
        outcome = result.committed
          ? (success ? 'played' : 'playback_failed')
          : 'not_committed';
        const revision: CodeRevisionDraft | undefined = result.committed
          ? {
              beforeCode,
              afterCode: result.code,
              playbackStatus: success ? 'played' : 'failed',
            }
          : undefined;
        if (success) {
          const nextSteps = parseNextSteps(result.explanation);
          if (nextSteps.length > 0) {
            deps.setCommitSuggestions(nextSteps);
            deps.setSessionSuggestions(nextSteps, result.code, sessionId);
          }
          const inputMode: InputMode = isStepwiseChoice(result.explanation) ? 'choice' : 'normal';
          if (revision) {
            deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId, revision, inputMode, result.layerNotes, context.turn_id);
          } else {
            deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
          }
        } else {
          const content = zh
            ? `agent 生成完了但代码无法运行: ${deps.getStrudelError() || '未知错误'}`
            : `Agent generated code but it failed to run: ${deps.getStrudelError() || 'unknown error'}`;
          if (revision) {
            deps.addAssistantMessage(content, result.code, sessionId, revision, undefined, undefined, context.turn_id);
          } else {
            deps.addAssistantMessage(content, result.code, sessionId);
          }
        }
      } else {
        // Background session completed: persist only, don't touch the editor or play audio.
        outcome = result.committed ? 'generated' : 'not_committed';
        const revision: CodeRevisionDraft | undefined = result.committed
          ? { beforeCode, afterCode: result.code, playbackStatus: 'not_attempted' }
          : undefined;
        if (revision) {
          const inputMode: InputMode = isStepwiseChoice(result.explanation) ? 'choice' : 'normal';
          deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId, revision, inputMode, result.layerNotes, context.turn_id);
        } else {
          deps.addAssistantMessage(stripNextSteps(result.explanation), result.code, sessionId);
        }
        deps.setCurrentCode(result.code, sessionId);
      }
    } else {
      outcome = 'not_committed';
      deps.finalizeLastAssistantMessage(result.explanation || t('agentNoCode'), sessionId);
    }
  } catch (e: unknown) {
    if (!ownsTurn() || isUserAbort(e, signal)) {
      outcome = 'aborted';
      terminationReason = 'aborted';
      if (ownsTurn()) {
        deps.finalizeLastAssistantMessage(t('interrupted'), sessionId);
      }
    } else {
      outcome = 'agent_failed';
      terminationReason = 'exception';
      failure = { failure_stage: stage, ...analyticsError(e) };
      const errMsg = e instanceof Error ? e.message : t('requestFailed');
      console.error('[agent] Request failed', {
        provider,
        model,
        errorName: e instanceof Error ? e.name : typeof e,
        errorMessage: errMsg,
      });
      deps.finalizeLastAssistantMessage(t('agentResponseFailed'), sessionId, context.turn_id);
      deps.setStrudelError(errMsg);
    }
  } finally {
    const finishedProperties: AgentTurnFinishedProperties = {
      ...analyticsBase,
      outcome,
      duration_ms: Date.now() - startedAt,
      iterations,
      request_retry_count: requestRetryCount,
      tool_failure_count: toolFailureCount,
      termination_reason: terminationReason,
      ...failure,
    };
    safelyTrackAnalytics(() => deps.trackAgentTurnFinished(finishedProperties));
    // The indicator goes down before the turn is saved, not after. The
    // checkpoint is a cloud round trip, and behind it the thinking indicator
    // outlived the message that ended the turn — pressing stop wrote "已中断"
    // above a spinner that then hung there until the network answered.
    // Ordering is unaffected: the checkpoint reads its snapshot inside a state
    // updater queued after every message this turn wrote, whenever it runs.
    if (ownsTurn()) {
      deps.endLoading(sessionId, controller);
      await deps.checkpointSession(sessionId);
    }
  }
}

// ── React hook wrapper ───────────────────────────────────────────────────────

export interface UseAgentRunnerConfig {
  analyticsOwnerKey?: string;
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

export function createAgentTurnDeps(cfg: UseAgentRunnerConfig): AgentTurnDeps {
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

  return {
    analyticsOwnerKey: cfg.analyticsOwnerKey,
    runAgent,
    makeProgressHandler,
    play: (code, context) => strudel.play(code, 'agent', context),
    getStrudelError: () => strudel.error,
    setStrudelError: (msg) => strudel.setError(msg),
    engineStatus: () => strudel.engineStatus,
    getCurrentId: () => sessions.currentId,
    isCurrentSession: (id) => id === currentIdRef.current,
    getCurrentCode: () => currentCode,
    snapshotHistory: () => conversationHistoryFromMessages(sessions.currentSession?.messages ?? []),
    addUserMessage: (text, images, selectedChoice) => sessions.addUserMessage(text, undefined, images, selectedChoice),
    addAssistantMessage: (text, code, id, revision, inputMode, layerNotes, turnId) =>
      sessions.addAssistantMessage(text, code, id, revision, inputMode, layerNotes, turnId),
    finalizeLastAssistantMessage: (text, id, turnId) => sessions.finalizeLastAssistantMessage(text, id, turnId),
    setCurrentCode: (code, id) => sessions.setCurrentCode(code, id),
    setSessionSuggestions: (items, code, id) => sessions.setSuggestions(items, code, id),
    checkpointSession: (id) => sessions.checkpointSession(id),
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
    trackAgentTurnStarted,
    trackAgentTurnFinished,
  };
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
      const deps = createAgentTurnDeps({
        strudel,
        sessions,
        currentCode,
        abortControllersRef,
        currentIdRef,
        setLoadingSessions,
        setCommitSuggestions,
        setRollbackPrefill,
        makeProgressHandler,
      });
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
