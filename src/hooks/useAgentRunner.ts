import type { ImageAttachment } from '../lib/image-attachments';
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { useStrudel } from './useStrudel';
import type { useSessions, AgentRevisionCommit, CodeRevisionDraft, PlaybackStatus, Session } from './useSessions';
import { runAgent, runConversationTurn } from '../services/llm-loader';
import type { TurnRef } from '../agent/router';
import { traceError, type AgentTraceSink } from '../lib/agent-trace';
import { formatExecutionReceipt } from '../agent/router-presentation';
import type { ConversationRequest, ConversationResult } from '../services/llm';
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
import { hummingTakes, projectHummingAttachment } from '../lib/humming-transfer';
import { formatHummingContext, hasHummingWaveformReport } from '../lib/humming-context';
import type { HummingAttachment } from '../types/humming';

// ── Pure agent-turn logic (testable in isolation) ────────────────────────────
//
// One Agent turn: instruction in → LLM generation → playback + persistence.
// Shared verbatim by the text-instruction and mood-instruction entry points,
// which differ only in how they build the input. See CONTEXT.md (Agent turn).

/** Everything that varies per turn. */
export interface AgentTurnInput {
  trace?: AgentTraceSink;
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
  messageId?: string;
  initialRevisionId?: string;
  /** Override the code fed to the agent (resend / rollback). Defaults to live code. */
  initialCode?: string;
  /** Explicit history (resend); overrides the snapshot when includeHistory is true. */
  suppliedHistory?: ConversationTurn[];
  /** Called for a newly added first user message when it can name the session. */
  onFirstUserMessage?: (messageId: string) => void;
  /** Local transcription metadata attached to this user message. */
  humming?: HummingAttachment;
}

/**
 * The stateful collaborators a turn touches. This is the module's internal seam
 * (used by the hook wiring + the tests); the external interface callers see is
 * just `run(input)`. Pure helpers (history parse, next-steps, i18n, analytics)
 * are imported directly rather than injected.
 */
export interface AgentTurnDeps {
  runAgent: typeof runAgent;
  router?: {
    run: typeof runConversationTurn;
    snapshot: () => Session | null;
    markPending?: (ref: TurnRef) => void;
    commit: (commit: AgentRevisionCommit, canCommit: () => boolean) => Promise<string | null>;
    updateReceipt: (sessionId: string, revisionId: string, status: PlaybackStatus, text: string,
      metadata?: { inputMode: InputMode; suggestions: string[] }) => void;
    flushLocalWrites: (sessionId: string) => Promise<void>;
    getLiveEditorCode: () => string;
    setEditorCode: (code: string) => void;
  };
  makeProgressHandler: (sessionId: string, canPublish?: () => boolean) => (e: ProgressEvent) => void;

  // strudel (live audio)
  play: (code: string, context?: AnalyticsContext, signal?: AbortSignal) => Promise<boolean>;
  getStrudelError: () => string | null;
  setStrudelError: (msg: string) => void;
  engineStatus: () => StrudelState['engineStatus'];

  // sessions (persisted code + messages)
  getCurrentId: () => string | null;
  isCurrentSession: (sessionId: string) => boolean;
  getCurrentCode: () => string;
  snapshotHistory: () => ConversationTurn[];
  addUserMessage: (text: string, images?: ImageAttachment[], selectedChoice?: true, humming?: HummingAttachment) => {
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
  finalizeLastAssistantMessage: (text: string, sessionId: string, turnId?: string, inputMode?: InputMode) => void;
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

function conversationContext(
  session: Session | null,
  ref: TurnRef,
  code: string,
  retry: boolean,
  initialRevisionId?: string,
): Pick<ConversationRequest, 'current' | 'previous' | 'lastReceipt'> {
  const revisions = session?.revisions ?? [];
  const baseIndex = retry
    ? revisions.findIndex(revision => revision.id === initialRevisionId)
    : revisions.length - 1;
  const latest = revisions[baseIndex];
  if (!latest) return { current: { code } };
  if (latest.afterCode !== code) {
    return { current: { code }, previous: { code: latest.afterCode, revisionId: latest.id } };
  }
  const previous = revisions[baseIndex - 1];
  const capturedSummary = session?.messages.find(message => message.revisionId === latest.id)?.content;
  return {
    current: { code, revisionId: latest.id },
    previous: { code: latest.beforeCode, revisionId: previous?.afterCode === latest.beforeCode ? previous.id : undefined },
    lastReceipt: capturedSummary && JSON.stringify({
      revisionId: latest.id, summary: capturedSummary, playback: latest.playbackStatus, sessionId: ref.sessionId,
    }),
  };
}

type RoutedExecution = Extract<ConversationResult, { kind: 'execute' }>;

function publishRouterAnswer(deps: AgentTurnDeps, text: string, ref: TurnRef) {
  if (isStepwiseChoice(text)) {
    deps.finalizeLastAssistantMessage(text, ref.sessionId, ref.turnId, 'choice');
  } else {
    deps.finalizeLastAssistantMessage(text, ref.sessionId, ref.turnId);
  }
}

async function applyRoutedExecution(
  router: NonNullable<AgentTurnDeps['router']>,
  deps: AgentTurnDeps,
  routed: RoutedExecution,
  ref: TurnRef,
  baseline: { beforeCode: string; expectedCode: string; expectedRevisionId?: string; editorCode: string },
  ownsTurn: () => boolean,
  signal: AbortSignal,
  context: AnalyticsContext,
  onSaved: () => void,
  onPlayed: () => void,
  trace?: AgentTraceSink,
): Promise<{ outcome: AgentTurnOutcome; terminationReason?: string }> {
  const { result, synthesize, scope, status } = routed;
  if (status !== 'candidate') {
    const receipt = { ref, status, playback: 'not_attempted' } as const;
    let answer = formatExecutionReceipt(scope, receipt);
    trace?.({ from: 'router', label: '结束执行 · 未产生修订', data: receipt, failed: status !== 'no_change' });
    if (synthesize && ownsTurn() && !signal.aborted) {
      try {
        answer = await synthesize(receipt);
      } catch (error) {
        trace?.({ from: 'router', label: '使用标准回执', data: traceError(error), failed: !signal.aborted });
      }
    }
    if (ownsTurn()) publishRouterAnswer(deps, signal.aborted ? t('interrupted') : answer, ref);
    return {
      outcome: signal.aborted || !ownsTurn() ? 'aborted' : 'not_committed',
      terminationReason: signal.aborted || !ownsTurn() ? 'aborted' : status,
    };
  }

  const summary = formatExecutionReceipt(scope, { ref, status: 'saved', playback: 'not_attempted' });
  const canCommit = () => ownsTurn() && !signal.aborted
    && (!deps.isCurrentSession(ref.sessionId) || router.getLiveEditorCode() === baseline.editorCode);
  trace?.({ from: 'client', label: '检查回合归属与版本基线', data: {
    ref, expectedCode: baseline.expectedCode, expectedRevisionId: baseline.expectedRevisionId,
  } });
  const revisionId = await router.commit({
    ref,
    expectedCode: baseline.expectedCode,
    expectedRevisionId: baseline.expectedRevisionId,
    beforeCode: baseline.beforeCode,
    code: result.code,
    summary,
    layerNotes: result.layerNotes,
    inputMode: 'normal',
    suggestions: [],
  }, canCommit);
  if (!revisionId) {
    trace?.({ from: 'client', label: '未接受候选版本', failed: !signal.aborted,
      data: { ref, reason: signal.aborted ? 'aborted' : !ownsTurn() ? 'superseded' : 'stale_revision' } });
    if (ownsTurn()) deps.finalizeLastAssistantMessage(
      signal.aborted ? t('interrupted') : t('agentRevisionStale'), ref.sessionId, ref.turnId,
    );
    return signal.aborted || !ownsTurn()
      ? { outcome: 'aborted', terminationReason: 'aborted' }
      : { outcome: 'not_committed', terminationReason: 'stale_revision' };
  }

  rememberAnalyticsTurn(ref.sessionId, result.code, ref.turnId, deps.analyticsOwnerKey);
  onSaved();
  await router.flushLocalWrites(ref.sessionId);
  trace?.({ from: 'client', label: '会话已接受修订', data: { ref, revisionId, summary, scope } });
  let playback: PlaybackStatus = 'not_attempted';
  if (ownsTurn() && deps.isCurrentSession(ref.sessionId)
    && router.getLiveEditorCode() === baseline.editorCode) {
    if (!signal.aborted) {
      trace?.({ from: 'client', label: '尝试播放修订', data: { revisionId } });
      const played = await deps.play(result.code, context, signal).catch(error => {
        trace?.({ from: 'client', label: '播放异常', failed: true, data: traceError(error) });
        return false;
      });
      if (played) playback = 'played';
      else if (!signal.aborted) playback = 'failed';
    }
    // When playback could not set the editor, still present the saved revision.
    if (playback !== 'played' && ownsTurn() && deps.isCurrentSession(ref.sessionId)
      && router.getLiveEditorCode() === baseline.editorCode) {
      router.setEditorCode(result.code);
    }
  }

  if (playback === 'played') onPlayed();
  const playbackNote = playback === 'failed' ? t('agentRevisionPlaybackFailed') : '';
  const appendPlaybackNote = (text: string) => [text, playbackNote].filter(Boolean).join('\n\n');
  // Once accepted, the revision keeps its receipt even if a newer turn starts.
  // This write is keyed by revision and becomes a no-op after rollback/deletion.
  const receipt = { ref, revisionId, status: 'saved' as const, playback };
  trace?.({ from: 'router', to: 'client', label: '更新执行回执', data: receipt, failed: playback === 'failed' });
  router.updateReceipt(ref.sessionId, revisionId, playback, appendPlaybackNote(summary));

  if (synthesize && ownsTurn() && !signal.aborted) {
    try {
      trace?.({ from: 'client', to: 'router', label: '交给 Router 综合回复', data: receipt });
      const answer = await synthesize(receipt);
      if (ownsTurn() && !signal.aborted) {
        trace?.({ from: 'router', to: 'client', label: '返回综合回复', data: { answer, revisionId } });
        const suggestions = parseNextSteps(answer);
        const inputMode = isStepwiseChoice(answer) ? 'choice' : 'normal';
        router.updateReceipt(ref.sessionId, revisionId, playback, appendPlaybackNote(stripNextSteps(answer)), {
          inputMode, suggestions,
        });
        if (suggestions.length && deps.isCurrentSession(ref.sessionId)) deps.setCommitSuggestions(suggestions);
      }
    } catch (error) {
      trace?.({ from: 'router', to: 'client', label: '保留原执行回执', data: traceError(error), failed: !signal.aborted });
    }
  }
  return { outcome: playback === 'not_attempted' ? 'generated' : playback === 'played' ? 'played' : 'playback_failed' };
}

export async function runAgentTurn(input: AgentTurnInput, deps: AgentTurnDeps): Promise<void> {
  const trace = import.meta.env.DEV ? input.trace : undefined;
  deps.resetSuggestions();
  deps.clearRollbackPrefill();

  // The revision baseline is the editor state at turn start. Capture it once:
  // reading live code after the async agent call would include later user edits.
  const router = deps.router;
  const snapshot = router?.snapshot() ?? null;
  const editorCode = input.initialCode ?? router?.getLiveEditorCode();
  const beforeCode = editorCode ?? deps.getCurrentCode();
  let messageId = input.messageId;

  // Snapshot history BEFORE the user message is written, so the current turn is
  // not echoed back into its own history.
  const history: ConversationTurn[] | undefined = input.includeHistory
    ? input.suppliedHistory ?? deps.snapshotHistory()
    : undefined;

  if (!input.skipAddMessage) {
    const insertion = input.selectedChoice
      ? deps.addUserMessage(input.text, undefined, true)
      : input.humming
        ? deps.addUserMessage(input.text, input.images, undefined, input.humming)
        : input.images?.length
          ? deps.addUserMessage(input.text, input.images)
          : deps.addUserMessage(input.text);
    messageId = insertion?.id;
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
  const ref = router && messageId
    ? { sessionId, messageId, turnId: context.turn_id ?? messageId }
    : undefined;
  if (ref) router?.markPending?.(ref);
  trace?.({ from: 'client', label: '开始回合', data: {
    sessionId, messageId, turnId: ref?.turnId ?? context.turn_id, entryPoint: input.entryPoint,
    text: input.text, imageCount: input.images?.length ?? 0, humming: input.humming, provider, model,
    path: router ? 'router' : 'legacy',
  } });
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
  const routerMetrics: Pick<AgentTurnFinishedProperties,
    'route' | 'preparation_ms' | 'router_request_count' | 'router_duration_ms'
    | 'router_input_tokens' | 'router_output_tokens' | 'first_answer_ms' | 'time_to_play_ms'
  > = {};
  let failure: Pick<AgentTurnFinishedProperties, 'error_code' | 'failure_stage' | 'http_status'> = {};

  safelyTrackAnalytics(() => deps.trackAgentTurnStarted(analyticsBase));

  try {
    if (router && !ref) throw new Error('A routed turn requires a stored user message ID');
    const onProgress = deps.makeProgressHandler(sessionId, () => ownsTurn() && !signal.aborted);
    const humming = projectHummingAttachment(input.humming) ?? undefined;
    const takes = hummingTakes(humming);
    if (!input.skipAddMessage) {
      const missingStyles = takes
        .flatMap((take, index) => take.understanding ? [] : [String(index + 1).padStart(2, '0')]);
      if (missingStyles.length) {
        const suffix = takes.length > 1 ? ` (${missingStyles.join(', ')})` : '';
        onProgress({ kind: 'warn', message: `${t('hummingStyleAnalysisFailed')}${suffix}` });
      }
    }
    const waveformAttachment = hasHummingWaveformReport(humming) ? humming : undefined;
    const reportProgress = (event: ProgressEvent) => {
      if (event.kind === 'router_request') {
        routerMetrics.router_request_count = (routerMetrics.router_request_count ?? 0) + 1;
        routerMetrics.router_duration_ms = (routerMetrics.router_duration_ms ?? 0) + event.durationMs;
        if (event.usage) {
          routerMetrics.router_input_tokens = (routerMetrics.router_input_tokens ?? 0) + event.usage.inputTokens;
          routerMetrics.router_output_tokens = (routerMetrics.router_output_tokens ?? 0) + event.usage.outputTokens;
        }
        return;
      }
      if (event.kind === 'route_decision') {
        routerMetrics.route = event.route;
        routerMetrics.preparation_ms = event.preparationMs;
        return;
      }
      if (!ownsTurn() || signal.aborted) return;
      if (event.kind === 'iteration') iterations = event.index;
      if (event.kind === 'request_retry') requestRetryCount++;
      if (event.kind === 'tool_result' && !event.ok) toolFailureCount++;
      if (event.kind === 'request_retry' || event.kind === 'warn' || event.kind === 'iteration'
        || event.kind === 'request_attempt_discarded') {
        trace?.({ from: ref && iterations === 0 ? 'router' : 'session', label: {
          request_retry: '重试模型请求', warn: '运行提示', iteration: '开始生成迭代', request_attempt_discarded: '丢弃未完成的模型响应',
        }[event.kind], data: event });
      }
      if (!router || event.kind === 'router_progress' || event.kind === 'router_stage'
        || event.kind === 'router_reply_delta' || event.kind === 'router_reply_reset') onProgress(event);
    };
    const routed = router && ref ? await router.run({
      ref,
      text: input.text,
      entryPoint: input.entryPoint,
      moodContext: input.moodContext,
      ...conversationContext(snapshot, ref, beforeCode, Boolean(input.skipAddMessage), input.initialRevisionId),
      history,
      images: input.images,
      humming,
      signal,
      onProgress: reportProgress,
      trace,
    }) : undefined;
    if (routed?.kind === 'reply') {
      if (signal.aborted || !ownsTurn()) {
        outcome = 'aborted';
        terminationReason = 'aborted';
        if (ownsTurn()) deps.finalizeLastAssistantMessage(t('interrupted'), sessionId, context.turn_id);
        return;
      }
      routerMetrics.first_answer_ms = Date.now() - startedAt;
      outcome = 'answered';
      terminationReason = routed.route === 'inspect' ? 'session_inspection' : 'text_reply';
      if (ref) publishRouterAnswer(deps, routed.text, ref);
      return;
    }
    const legacyArgs = [
      formatHummingContext(input.text, humming, Boolean(waveformAttachment)),
      beforeCode,
      reportProgress,
      input.moodContext,
      signal,
      history,
      input.images,
    ] as const;
    const legacyResult = routed ? null : await (trace
      ? deps.runAgent(...legacyArgs, waveformAttachment, trace)
      : waveformAttachment ? deps.runAgent(...legacyArgs, waveformAttachment) : deps.runAgent(...legacyArgs));
    const result = routed?.result ?? legacyResult;
    if (!result) throw new Error('Missing execution result');
    if (legacyResult) trace?.({ from: 'session', to: 'client', label: '返回执行结果', data: legacyResult });
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
    if (router && ref && routed) {
      const completion = await applyRoutedExecution(router, deps, routed, ref, {
        beforeCode,
        expectedCode: input.initialCode ?? snapshot?.code ?? beforeCode,
        expectedRevisionId: input.skipAddMessage ? input.initialRevisionId : snapshot?.revisions?.at(-1)?.id,
        editorCode: editorCode ?? beforeCode,
      }, ownsTurn, signal, context,
      () => { routerMetrics.first_answer_ms = Date.now() - startedAt; },
      () => { routerMetrics.time_to_play_ms = Date.now() - startedAt; }, trace);
      outcome = completion.outcome;
      terminationReason = completion.terminationReason ?? terminationReason;
      if (outcome === 'playback_failed') failure = {
        failure_stage: 'playback',
        error_code: deps.engineStatus() === 'ready' ? 'playback_failed' : 'engine_unavailable',
      };
      return;
    }
    if (!legacyResult) return;
    const { explanation } = legacyResult;
    if (result.code) {
      if (result.committed) rememberAnalyticsTurn(sessionId, result.code, context.turn_id, deps.analyticsOwnerKey);
      if (deps.isCurrentSession(sessionId)) {
        // Always persist the newest code as the session truth, run or not.
        stage = 'playback';
        trace?.({ from: 'client', label: '尝试播放生成结果' });
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
        trace?.({ from: 'client', label: '处理播放结果与会话写入', failed: !success, data: { success, committed: result.committed } });
        const revision: CodeRevisionDraft | undefined = result.committed
          ? {
              beforeCode,
              afterCode: result.code,
              playbackStatus: success ? 'played' : 'failed',
            }
          : undefined;
        if (success) {
          const nextSteps = parseNextSteps(explanation);
          if (nextSteps.length > 0) {
            deps.setCommitSuggestions(nextSteps);
            deps.setSessionSuggestions(nextSteps, result.code, sessionId);
          }
          const inputMode: InputMode = isStepwiseChoice(explanation) ? 'choice' : 'normal';
          if (revision) {
            deps.addAssistantMessage(stripNextSteps(explanation), result.code, sessionId, revision, inputMode, result.layerNotes, context.turn_id);
          } else {
            deps.addAssistantMessage(stripNextSteps(explanation), result.code, sessionId);
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
          const inputMode: InputMode = isStepwiseChoice(explanation) ? 'choice' : 'normal';
          deps.addAssistantMessage(stripNextSteps(explanation), result.code, sessionId, revision, inputMode, result.layerNotes, context.turn_id);
        } else {
          deps.addAssistantMessage(stripNextSteps(explanation), result.code, sessionId);
        }
        deps.setCurrentCode(result.code, sessionId);
      }
    } else {
      outcome = 'not_committed';
      deps.finalizeLastAssistantMessage(explanation || t('agentNoCode'), sessionId);
    }
  } catch (e: unknown) {
    trace?.({ from: 'client', label: signal.aborted ? '回合已取消' : '回合异常',
      failed: !signal.aborted, data: traceError(e) });
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
      if (!router) deps.setStrudelError(errMsg);
    }
  } finally {
    trace?.({ from: 'client', label: '回合结束', durationMs: Date.now() - startedAt,
      failed: outcome === 'agent_failed' || outcome === 'playback_failed',
      data: { outcome, terminationReason, iterations, requestRetryCount, toolFailureCount, failure } });
    const finishedProperties: AgentTurnFinishedProperties = {
      ...analyticsBase,
      outcome,
      duration_ms: Date.now() - startedAt,
      iterations,
      request_retry_count: requestRetryCount,
      tool_failure_count: toolFailureCount,
      termination_reason: terminationReason,
      ...failure,
      ...routerMetrics,
    };
    safelyTrackAnalytics(() => deps.trackAgentTurnFinished(finishedProperties));
    // The indicator goes down before the turn is saved, not after. The
    // checkpoint is a cloud round trip, and behind it the thinking indicator
    // outlived the message that ended the turn — pressing stop wrote "已中断"
    // above a spinner that then hung there until the network answered.
    // Ordering is unaffected: the checkpoint reads its snapshot inside a state
    // updater queued after every message this turn wrote, whenever it runs.
    const shouldCheckpoint = ownsTurn();
    deps.endLoading(sessionId, controller);
    if (shouldCheckpoint) {
      await deps.checkpointSession(sessionId);
      if (ref) await router?.flushLocalWrites(sessionId);
    }
  }
}

// ── React hook wrapper ───────────────────────────────────────────────────────

export interface UseAgentRunnerConfig {
  localDiagnostics?: boolean;
  analyticsOwnerKey?: string;
  strudel: ReturnType<typeof useStrudel>;
  sessions: ReturnType<typeof useSessions>;
  currentCode: string;
  getLiveEditorCode?: () => string;
  isOwnerActive?: () => boolean;
  abortControllersRef: MutableRefObject<Map<string, AbortController>>;
  currentIdRef: MutableRefObject<string | null>;
  setLoadingSessions: Dispatch<SetStateAction<Set<string>>>;
  setCommitSuggestions: Dispatch<SetStateAction<string[] | null>>;
  setRollbackPrefill: Dispatch<SetStateAction<string>>;
  makeProgressHandler: (sessionId: string, canPublish?: () => boolean) => (e: ProgressEvent) => void;
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
    router: {
      run: runConversationTurn,
      snapshot: () => sessions.currentSession,
      markPending: sessions.markAgentTurnPending,
      commit: sessions.commitAgentRevision,
      updateReceipt: sessions.updateAgentReceipt,
      flushLocalWrites: sessions.flushLocalWrites,
      getLiveEditorCode: cfg.getLiveEditorCode ?? (() => strudel.code),
      setEditorCode: strudel.setCode,
    },
    makeProgressHandler,
    play: (code, context, signal) => strudel.play(code, 'agent', context, signal),
    getStrudelError: () => strudel.error,
    setStrudelError: (msg) => strudel.setError(msg),
    engineStatus: () => strudel.engineStatus,
    getCurrentId: () => sessions.currentId,
    isCurrentSession: (id) => id === currentIdRef.current,
    getCurrentCode: () => currentCode,
    snapshotHistory: () => conversationHistoryFromMessages(sessions.currentSession?.messages ?? []),
    addUserMessage: (text, images, selectedChoice, humming) => sessions.addUserMessage(text, undefined, images, selectedChoice, humming),
    addAssistantMessage: (text, code, id, revision, inputMode, layerNotes, turnId) =>
      sessions.addAssistantMessage(text, code, id, revision, inputMode, layerNotes, turnId),
    finalizeLastAssistantMessage: (text, id, turnId, mode) => mode
      ? sessions.finalizeLastAssistantMessage(text, id, turnId, mode)
      : sessions.finalizeLastAssistantMessage(text, id, turnId),
    setCurrentCode: (code, id) => sessions.setCurrentCode(code, id),
    setSessionSuggestions: (items, code, id) => sessions.setSuggestions(items, code, id),
    checkpointSession: (id) => sessions.checkpointSession(id),
    beginLoading: (id) => {
      sessions.updateLiveRouterProgress?.(id);
      setLoadingSessions((prev) => new Set(prev).add(id));
      const controller = new AbortController();
      abortControllersRef.current.get(id)?.abort();
      abortControllersRef.current.set(id, controller);
      return controller;
    },
    endLoading: (id, controller) => {
      if (abortControllersRef.current.get(id) === controller) {
        sessions.updateLiveRouterProgress?.(id);
        abortControllersRef.current.delete(id);
        setLoadingSessions((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    isCurrentController: (id, controller) => (cfg.isOwnerActive?.() ?? true)
      && abortControllersRef.current.get(id) === controller
      && (sessions.hasSession?.(id) ?? true),
    resetSuggestions: () => setCommitSuggestions(null),
    setCommitSuggestions: (steps) => setCommitSuggestions(steps),
    clearRollbackPrefill: () => setRollbackPrefill(''),
    getModelConfig: () => {
      const c = getActiveModelConfig();
      return { provider: c.provider, model: c.model };
    },
    trackAgentTurnStarted: cfg.localDiagnostics ? () => undefined : trackAgentTurnStarted,
    trackAgentTurnFinished: cfg.localDiagnostics ? () => undefined : trackAgentTurnFinished,
  };
}

/**
 * Captures the stateful collaborators once and exposes a narrow `run(input)`.
 * Mirrors the pure-core + thin-hook split used by useReplay.
 */
export function useAgentRunner(cfg: UseAgentRunnerConfig): (input: AgentTurnInput) => Promise<void> {
  const { analyticsOwnerKey } = cfg;
  const ownerScope = useRef(analyticsOwnerKey);
  const { abortControllersRef, setLoadingSessions } = cfg;
  const { updateLiveRouterProgress } = cfg.sessions;
  useLayoutEffect(() => {
    ownerScope.current = analyticsOwnerKey;
    const controllers = abortControllersRef.current;
    return () => {
      const ids = [...controllers.keys()];
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
      for (const id of ids) updateLiveRouterProgress?.(id);
      if (ids.length) setLoadingSessions(previous => {
        const next = new Set(previous);
        for (const id of ids) next.delete(id);
        return next;
      });
    };
  }, [abortControllersRef, setLoadingSessions, updateLiveRouterProgress, analyticsOwnerKey]);

  return useCallback((input: AgentTurnInput) => runAgentTurn(input, createAgentTurnDeps({
    ...cfg,
    isOwnerActive: () => ownerScope.current === cfg.analyticsOwnerKey,
  })), [cfg]);
}
