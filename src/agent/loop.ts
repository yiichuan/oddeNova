import type { ImageAttachment, UserContent } from '../lib/image-types';
import { hasHummingWaveformReport } from '../lib/humming-context';
import type { LiveCodeDraft, RouterProgress, RouterStage, SessionProgress } from './progress';
import { streamedCodePreview } from './streamed-code';
import { describeEditTargets, type EditScope } from './session-scope';
import type { AgentTraceSink } from '../lib/agent-trace';
// Agent loop. Repeatedly calls the model with the tool schemas, dispatches
// each returned tool_call, feeds results back, and terminates when:
//   - the model invokes `commit` (CommitSignal)
//   - the model returns no tool_calls
//   - max_iter / timeout safety net trips
//
// The loop is LLM-agnostic — it accepts a callable injected by services/llm.ts
// so this module stays free of the openai SDK.

import { dispatchToolCall, type ToolCallRequest, type ToolCallOutcome } from './executor';
import {
  CommitSignal,
  getOpenAIToolSchemas,
  parseLayerNotes,
  validateCommittedCode,
  type AgentState,
  type ToolContext,
} from './tools';
import type { HummingAttachment } from '../types/humming';
import { parseScore, summariseScore } from './parser';
import {
  getErrorMessage,
  getErrorStatus,
  getRetryDelayMs,
  isRetryableRequestError,
  waitForRetryDelay,
} from '../lib/errors';

/** Anthropic extended thinking block, must be echoed back verbatim in multi-turn. */
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature: string };

/** User-selected reasoning depth for a compose-intent turn (see CONTEXT.md: Thinking level). */
export type ThinkingLevel = 'low' | 'medium' | 'high';

// OpenAI ChatCompletion message shape (only the bits we use).
export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: UserContent | null;
  /** Internal hint: cache through this static prefix; stripped from OpenAI payloads. */
  cachePrefix?: boolean;
  /** DeepSeek thinking mode: must be echoed back on every subsequent turn. */
  reasoning_content?: string | null;
  /** Anthropic extended thinking: thinking blocks must be echoed back verbatim. */
  thinking_blocks?: ThinkingBlock[];
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface LLMCaller {
  chatWithTools(
    messages: ChatMsg[],
    tools: ReturnType<typeof getOpenAIToolSchemas>,
    onTextDelta?: (delta: string) => void,
    onReasoningDelta?: (delta: string) => void,
    signal?: AbortSignal,
    /** When false, suppress the reasoning/thinking chain for this call (default true). */
    enableThinking?: boolean,
    /** How deep to think when enabled; ignored when enableThinking is false (default 'medium'). */
    thinkingLevel?: ThinkingLevel,
    onToolArguments?: (name: string, args: string) => void,
  ): Promise<{
    content: string | null;
    /** DeepSeek thinking mode: pass through so the loop can echo it back. */
    reasoning_content?: string | null;
    thinking_blocks?: ThinkingBlock[];
    toolCalls: ToolCallRequest[];
    usage?: LLMUsage;
  }>;
}

export type ProgressEvent =
  | { kind: 'code_draft'; draft?: LiveCodeDraft }
  | { kind: 'router_progress'; entry: RouterProgress }
  | { kind: 'router_stage'; stage: RouterStage }
  | { kind: 'router_reply_delta'; delta: string; attemptId?: never }
  | { kind: 'router_reply_complete'; text: string }
  | { kind: 'router_reply_reset' }
  | { kind: 'session_progress'; entry: SessionProgress }
  | { kind: 'router_request'; durationMs: number; usage?: LLMUsage }
  | { kind: 'route_decision'; route: 'reply' | 'inspect' | 'execute'; preparationMs: number }
  | { kind: 'request_retry' }
  | { kind: 'iteration'; index: number }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; ok: boolean; error?: string }
  | { kind: 'commit'; code: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'assistant_text_delta'; delta: string; attemptId?: string }
  | { kind: 'assistant_reply_delta'; delta: string; attemptId?: string }
  | { kind: 'reasoning_delta'; delta: string; attemptId?: string }
  | { kind: 'request_attempt_discarded'; attemptId: string }
  | { kind: 'request_attempt_succeeded'; attemptId: string }
  | { kind: 'warn'; message: string };

export type ConversationTurn = { role: 'user' | 'assistant'; content: string; images?: ImageAttachment[] };

export interface RunAgentOptions {
  initialCode: string;
  instruction: string;
  trace?: AgentTraceSink;
  validateScope?: ToolContext['validateScope'];
  editScope?: EditScope;
  preparedUserContent?: UserContent;
  preparedHistory?: ChatMsg[];
  locale: 'zh' | 'en';
  systemPrompt: string;
  llm: LLMCaller;
  sampleSearch?: ToolContext['sampleSearch'];
  maxIter?: number;
  timeoutMs?: number;
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  conversationHistory?: ConversationTurn[];
  humming?: HummingAttachment;
  /** When false, the model's reasoning/thinking chain is disabled for this run (default true). */
  enableThinking?: boolean;
  /** How deep to think when enabled; ignored when enableThinking is false (default 'medium'). */
  thinkingLevel?: ThinkingLevel;
}

export interface TokenUsage {
  promptTokens: number;
  systemEstimate: number;
}

export class EmptyAgentResponseError extends Error {
  constructor() {
    super('Model returned no text or tool calls');
    this.name = 'EmptyAgentResponseError';
  }
}

const MAX_REQUEST_ATTEMPTS = 3;
let requestAttemptSequence = 0;

function nextRequestAttemptId(iteration: number, attempt: number): string {
  requestAttemptSequence += 1;
  return `agent-${Date.now()}-${iteration}-${attempt}-${requestAttemptSequence}`;
}

// Wrap a streaming-delta progress event, or undefined when there's no listener.
function makeProgressDelta(
  onProgress: ((e: ProgressEvent) => void) | undefined,
  kind: 'assistant_text_delta' | 'assistant_reply_delta' | 'reasoning_delta',
  attemptId: string,
  onDelta: () => void,
): ((delta: string) => void) | undefined {
  return onProgress
    ? (delta: string) => {
        onDelta();
        onProgress({ kind, delta, attemptId });
      }
    : undefined;
}

type LLMResponse = Awaited<ReturnType<LLMCaller['chatWithTools']>>;

interface ChatWithToolsRetryOptions {
  llm: LLMCaller;
  messages: ChatMsg[];
  tools: ReturnType<typeof getOpenAIToolSchemas>;
  iteration: number;
  onProgress?: (event: ProgressEvent) => void;
  signal?: AbortSignal;
  enableThinking: boolean;
  thinkingLevel: ThinkingLevel;
  publishModelText: boolean;
  onToolArguments?: (name: string, args: string) => void;
  onDiscardDraft?: () => void;
}

async function chatWithToolsWithRetry(
  opts: ChatWithToolsRetryOptions,
): Promise<LLMResponse> {
  const {
    llm,
    messages,
    tools,
    iteration,
    onProgress,
    signal,
    enableThinking,
    thinkingLevel,
    publishModelText,
    onToolArguments,
    onDiscardDraft,
  } = opts;

  const onModelText = publishModelText ? onProgress : undefined;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
    const attemptId = nextRequestAttemptId(iteration, attempt);
    let receivedPartial = false;
    const markPartial = () => {
      receivedPartial = true;
    };

    try {
      const response = await llm.chatWithTools(
        messages,
        tools,
        makeProgressDelta(
          onModelText,
          enableThinking ? 'assistant_text_delta' : 'assistant_reply_delta',
          attemptId,
          markPartial,
        ),
        makeProgressDelta(onModelText, 'reasoning_delta', attemptId, markPartial),
        signal,
        enableThinking,
        thinkingLevel,
        ...(onToolArguments ? [onToolArguments] as const : []),
      );

      if (!response.content?.trim() && response.toolCalls.length === 0) {
        throw new EmptyAgentResponseError();
      }

      onProgress?.({ kind: 'request_attempt_succeeded', attemptId });
      return response;
    } catch (error) {
      onDiscardDraft?.();
      onProgress?.({ kind: 'request_attempt_discarded', attemptId });
      if (
        attempt === MAX_REQUEST_ATTEMPTS
        || !isRetryableRequestError(error, signal)
      ) {
        throw error;
      }

      const retryAttempt = attempt as 1 | 2;
      const delayMs = getRetryDelayMs(retryAttempt);
      console.warn('[agent] Retrying request', {
        iteration,
        retryAttempt,
        maxRetries: MAX_REQUEST_ATTEMPTS - 1,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: getErrorMessage(error),
        status: getErrorStatus(error),
        delayMs,
        receivedPartial,
      });
      await waitForRetryDelay(delayMs, signal);
      onProgress?.({ kind: 'request_retry' });
    }
  }

  throw new Error('Agent request retry loop exited unexpectedly');
}

// Count CJK code points (≈1 token/char) for the system-prompt token estimate.
function countCJK(s: string): number {
  let count = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3000 && cp <= 0x9fff)) count++;
  }
  return count;
}

export interface RunAgentResult {
  /** Separate from the main context occupancy shown by tokenUsage. */
  retrievalUsage?: LLMUsage & { calls: number };
  code: string;
  explanation: string;
  /** Short per-layer notes from `commit`, printed only on the share card. */
  layerNotes?: Record<string, string>;
  iterations: number;
  committed: boolean;
  tokenUsage?: TokenUsage;
  terminationReason?: 'committed' | 'text_reply' | 'no_commit' | 'iteration_limit' | 'timeout' | 'aborted' | 'validation_failed';
}

const DEFAULT_MAX_ITER = 30;
const DEFAULT_TIMEOUT = 10 * 60_000;
let sampleDebugRunSequence = 0;

function formatTimeoutMinutes(timeoutMs: number, isZh: boolean): string {
  const minutes = Math.ceil(timeoutMs / 60_000);
  if (isZh) return `${minutes} 分钟`;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export async function runAgentLoop(opts: RunAgentOptions): Promise<RunAgentResult> {
  const sampleDebugRunId = ++sampleDebugRunSequence;
  let sampleSearchCalls = 0;
  const sampleDebug = (stage: string, details: unknown) => {
    if (import.meta.env.DEV) console.info(`[searchSamples] run ${sampleDebugRunId} ${stage}`, details);
  };
  sampleDebug('start', { instruction: opts.instruction });
  const {
    initialCode,
    instruction,
    trace,
    locale,
    systemPrompt,
    llm,
    maxIter = DEFAULT_MAX_ITER,
    timeoutMs = DEFAULT_TIMEOUT,
    onProgress,
    signal,
    conversationHistory,
    humming,
    enableThinking = true,
    thinkingLevel = 'medium',
  } = opts;

  const state: AgentState = {
    code: initialCode || '',
    finalCode: null,
  };
  const isZh = locale === 'zh';
  const draftBaseline = initialCode.trim() ? initialCode : undefined;
  let checkingCode = false;
  let acceptedDraft: LiveCodeDraft | undefined;
  let visibleDraft: LiveCodeDraft | undefined;
  const previewDraft = (draft?: LiveCodeDraft) => {
    if (draft?.code === visibleDraft?.code && draft?.phase === visibleDraft?.phase) return;
    visibleDraft = draft;
    onProgress?.({ kind: 'code_draft', draft });
  };
  let iterationStarted = performance.now();
  const reportSession = opts.validateScope
    ? (entry: SessionProgress) => onProgress?.({
      kind: 'session_progress',
      entry: entry.kind === 'strategy' ? { ...entry, durationMs: performance.now() - iterationStarted } : entry,
    }) : undefined;
  const ctx: ToolContext = { state, isZh, humming, sampleSearch: opts.sampleSearch, validateScope: opts.validateScope, reportSession };
  const userText = typeof opts.preparedUserContent === 'string' ? opts.preparedUserContent : instruction;
  let userTurn: string;
  if (initialCode) {
    const score = parseScore(initialCode);
    const { bpm, layers } = summariseScore(score);
    const layerLabel = (l: { name: string; envelope?: string }) =>
      l.envelope ? `${l.name}[${l.envelope}]` : l.name;
    const bpmStr = bpm != null ? `BPM: ${bpm}` : '';
    const layersStr = isZh
      ? layers.length > 0 ? `音层: ${layers.map(layerLabel).join(' / ')}` : '（无音层）'
      : layers.length > 0 ? `Layers: ${layers.map(layerLabel).join(' / ')}` : '(no layers)';
    const meta = [bpmStr, layersStr].filter(Boolean).join(isZh ? '，' : ', ');
    userTurn = isZh
      ? `当前正在播放的代码（${meta}）:\n\`\`\`\n${initialCode}\n\`\`\`\n\n用户指令: ${userText}`
      : `Current playing code (${meta}):\n\`\`\`\n${initialCode}\n\`\`\`\n\nUser instruction: ${userText}`;
  } else {
    userTurn = isZh ? `用户指令: ${userText}` : `User instruction: ${userText}`;
  }

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt },
    ...(opts.preparedHistory ?? conversationHistory ?? []),
    { role: 'user', content: Array.isArray(opts.preparedUserContent) ? opts.preparedUserContent.map((block, index) => index === 0 && block.type === 'text' ? { ...block, text: userTurn } : block) : userTurn },
  ];

  const tools = getOpenAIToolSchemas(isZh, hasHummingWaveformReport(humming), Boolean(opts.validateScope))
    .filter(tool => ctx.sampleSearch || tool.function.name !== 'searchSamples');
  const start = Date.now();
  let iterations = 0;
  let explanation = '';
  let layerNotes: Record<string, string> | undefined;
  let committed = false;
  let finalCode = state.code;
  let isChatReply = false;
  let terminationReason: RunAgentResult['terminationReason'] = 'iteration_limit';
  // Only keep usage from the last iteration: each call accumulates the full message history,
  // so the final inputTokens reflects the true size of the current complete context.
  let lastUsage: LLMUsage | undefined;

  outer: for (let i = 0; i < maxIter; i++) {
    if (Date.now() - start > timeoutMs) {
      terminationReason = 'timeout';
      const timeoutLabel = formatTimeoutMinutes(timeoutMs, isZh);
      onProgress?.({ kind: 'warn', message: isZh ? `超时 ${timeoutLabel}，强制结束` : `Timed out after ${timeoutLabel}, force-stopping` });
      break;
    }
    if (signal?.aborted) {
      terminationReason = 'aborted';
      onProgress?.({ kind: 'warn', message: isZh ? '已中断' : 'Interrupted' });
      break;
    }
    iterations = i + 1;
    iterationStarted = performance.now();
    onProgress?.({ kind: 'iteration', index: iterations });

    const resp = await chatWithToolsWithRetry({
      llm,
      messages,
      tools,
      iteration: iterations,
      onProgress,
      signal,
      enableThinking,
      thinkingLevel,
      publishModelText: !opts.validateScope,
      // A partial replacement has no evidence about which existing layers
      // it will keep. For edits, preview the diff once setCode has accepted it.
      onToolArguments: !draftBaseline && !checkingCode && onProgress ? (name, args) => {
        if (name !== 'setCode') return;
        const code = streamedCodePreview(args);
        if (code) previewDraft({ code, phase: 'writing' });
      } : undefined,
      onDiscardDraft: () => previewDraft(acceptedDraft),
    });
    if (resp.usage) lastUsage = resp.usage;

    if (resp.content && resp.content.trim()) {
      console.debug(`[loop] iter ${i + 1} assistant_text:`, resp.content.trim());
    }

    // Push the assistant message so subsequent tool messages link back to it
    // (OpenAI requires assistant tool_calls to be present in history before
    // the matching tool replies).
    // DeepSeek thinking mode: reasoning_content must be echoed back verbatim.
    messages.push({
      role: 'assistant',
      content: resp.content,
      ...(resp.reasoning_content ? { reasoning_content: resp.reasoning_content } : {}),
      ...(resp.thinking_blocks?.length ? { thinking_blocks: resp.thinking_blocks } : {}),
      tool_calls:
        resp.toolCalls.length > 0
          ? resp.toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: c.arguments },
            }))
          : undefined,
    });

    if (resp.toolCalls.length === 0) {
      previewDraft(acceptedDraft);
      // No tools requested. A substantive text response is a legal chat turn
      // in unified-agent mode; empty responses were rejected by the request
      // retry boundary before reaching this point.
      const text = resp.content?.trim() || '';
      if (text) {
        explanation = text;
        if (state.code === initialCode) {
          isChatReply = true;
        }
      }
      terminationReason = isChatReply ? 'text_reply' : 'no_commit';
      break;
    }

    // Per-iteration dedup cache: key = `${name}\0${arguments}`, value = tool result JSON.
    // Prevents duplicate tool_calls (same name + args) in a single LLM response from
    // being executed twice — a known LLM parallel tool-call duplication bug.
    // Uses \0 as separator to avoid any ambiguity with tool names or argument strings.
    const iterResultCache = new Map<string, string>();

    const outcomes: ToolCallOutcome[] = [];
    for (const call of resp.toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        if (call.arguments) {
          const p = JSON.parse(call.arguments);
          if (p && typeof p === 'object' && !Array.isArray(p)) {
            parsedArgs = p as Record<string, unknown>;
          }
        }
      } catch {
        parsedArgs = { _raw: call.arguments };
      }
      const dedupKey = `${call.name}\0${call.arguments}`;
      const cachedResult = iterResultCache.get(dedupKey);
      if (cachedResult !== undefined) {
        if (call.name === 'searchSamples') {
          sampleDebug('deduplicated', { iteration: i + 1, callId: call.id, args: parsedArgs, result: cachedResult });
        }
        trace?.({ from: 'session', to: 'tool', label: '复用工具结果 · ' + call.name,
          data: { callId: call.id, iteration: i + 1, result: JSON.parse(cachedResult) } });
        // Intentionally skip onProgress — duplicate calls should be invisible to the UI.
        console.debug(`[loop] iter ${i + 1} dedup: skipping duplicate tool_call "${call.name}"`);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: cachedResult,
        });
        continue;
      }

      console.debug(`[loop] iter ${i + 1} tool_call: ${call.name}`, parsedArgs);
      onProgress?.({ kind: 'tool_call', name: call.name, args: parsedArgs });
      if (call.name === 'validate' || call.name === 'commit') checkingCode = true;
      const toolStarted = performance.now();
      const beforeEdit = state.code;
      if (call.name !== 'reportArrangement') reportSession?.({ kind: 'tool', facts: {
        action: call.name, phase: 'started',
        ...(call.name === 'searchSamples' && { queries: parsedArgs.queries }),
      } });
      trace?.({ from: 'session', to: 'tool', label: '调用 · ' + call.name,
        data: { callId: call.id, iteration: i + 1, arguments: parsedArgs } });
      if (call.name === 'searchSamples') {
        sampleSearchCalls++;
        sampleDebug('call', { iteration: i + 1, callId: call.id, args: parsedArgs });
      }

      try {
        const outcome = await dispatchToolCall(call, ctx, undefined, trace);
        if (call.name === 'setCode') {
          if (outcome.result.ok && (acceptedDraft || state.code !== draftBaseline)) {
            acceptedDraft = {
              code: state.code,
              phase: checkingCode ? 'repair' : 'writing',
              ...(draftBaseline !== undefined && { baseline: draftBaseline }),
            };
          }
          previewDraft(acceptedDraft);
        }
        if (call.name === 'searchSamples') {
          sampleDebug('result', { iteration: i + 1, callId: call.id,
            durationMs: Math.round(performance.now() - toolStarted), result: outcome.result });
        }
        if (reportSession && call.name === 'setCode' && outcome.result.ok && beforeEdit !== state.code
          && opts.editScope?.kind === 'remove_layers') {
          if (beforeEdit === initialCode) {
            const targets = new Set(opts.editScope.targets);
            for (const layer of describeEditTargets(beforeEdit, 800).layers) {
              if (!targets.has(layer.id)) continue;
              reportSession({ kind: 'operation', facts: {
                layer: layer.label ?? layer.id, action: 'removed from draft', before: layer.preview,
              } });
            }
          }
        } else if (reportSession && call.name === 'setCode' && outcome.result.ok && beforeEdit !== state.code) {
          const oldTargets = describeEditTargets(beforeEdit, Infinity);
          const newTargets = describeEditTargets(state.code, Infinity);
          const before = new Map([...oldTargets.layers, ...oldTargets.sections].map(layer => [layer.id, layer.preview]));
          for (const layer of newTargets.layers.length ? newTargets.layers : newTargets.sections) {
            const name = layer.label ?? layer.id;
            const previous = before.get(layer.id);
            if (previous === layer.preview) continue;
            reportSession({ kind: 'operation', facts: {
              layer: name, action: previous === undefined ? 'added to draft' : 'changed in draft',
              before: previous?.slice(0, 800), after: layer.preview.slice(0, 1800),
            } });
          }
        }
        if (call.name !== 'reportArrangement') reportSession?.({ kind: 'tool', facts: {
          action: call.name, phase: 'finished', ok: outcome.result.ok,
          ...(call.name === 'searchSamples' && outcome.result.ok && {
            queries: parsedArgs.queries,
            searchEvidence: JSON.stringify(outcome.result.data ?? {}).slice(0, 1800),
          }),
          ...(call.name === 'analyzeHummingWaveform' && outcome.result.ok && {
            analysisEvidence: JSON.stringify(outcome.result.data ?? {}).slice(0, 1600),
          }),
        } });
        if (call.name === 'setCode' && sampleSearchCalls > 0 && outcome.result.ok) {
          sampleDebug('setCode after search', { iteration: i + 1, code: state.code });
        }
        outcomes.push(outcome);
        if (!outcome.result.ok) {
          console.error(`[loop] iter ${i + 1} tool "${outcome.name}" returned failure:`, outcome.result.error);
          if (outcome.name === 'validate') {
            console.error(`[loop] code at validate failure:\n${ctx.state.code}`);
          }
        }
        // Cache the result JSON so duplicate calls in the same iteration can reuse it.
        const resultJson = JSON.stringify(
          outcome.result.ok
            ? { ok: true, ...(outcome.result.data as object || {}) }
            : { ok: false, error: outcome.result.error }
        );
        iterResultCache.set(dedupKey, resultJson);
        trace?.({ from: 'tool', to: 'session', label: '返回 · ' + call.name,
          data: { callId: call.id, result: outcome.result }, durationMs: performance.now() - toolStarted, failed: !outcome.result.ok });
        onProgress?.({
          kind: 'tool_result',
          name: outcome.name,
          ok: outcome.result.ok,
          error: outcome.result.error,
        });
      } catch (e) {
        if (call.name === 'setCode') previewDraft(acceptedDraft);
        if (e instanceof CommitSignal) {
          reportSession?.({ kind: 'tool', facts: { action: call.name, phase: 'finished', ok: true, candidateOnly: true } });
          // Commit terminates the loop. Record the tool reply so the
          // assistant's tool_calls are paired before exit.
          finalCode = e.code;
          state.finalCode = e.code;
          committed = true;
          if (call.name === 'commit') {
            // Try to lift `explanation` from the commit args.
            try {
              const commitArgs = JSON.parse(call.arguments || '{}');
              if (typeof commitArgs.explanation === 'string') {
                explanation = commitArgs.explanation;
              }
              const notes = parseLayerNotes(commitArgs.layerNotes, e.code);
              if (Object.keys(notes).length > 0) layerNotes = notes;
            } catch {
              /* ignore */
            }
          }
          const commitResultJson = JSON.stringify({ ok: true, committed: true });
          iterResultCache.set(dedupKey, commitResultJson);
          trace?.({ from: 'tool', to: 'session', label: '提交候选版本 · ' + call.name,
            data: { callId: call.id, code: e.code, explanation, layerNotes }, durationMs: performance.now() - toolStarted });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: commitResultJson,
          });
          onProgress?.({ kind: 'commit', code: e.code });
          terminationReason = 'committed';
          break outer;
        }
        const msg = getErrorMessage(e);
        trace?.({ from: 'tool', to: 'session', label: '执行失败 · ' + call.name,
          data: { callId: call.id, error: msg }, durationMs: performance.now() - toolStarted, failed: true });
        if (call.name === 'searchSamples') sampleDebug('error', { callId: call.id, error: msg });
        outcomes.push({
          id: call.id,
          name: call.name,
          result: { ok: false, error: msg },
        });
        const errorResultJson = JSON.stringify({ ok: false, error: msg });
        iterResultCache.set(dedupKey, errorResultJson);
        onProgress?.({ kind: 'tool_result', name: call.name, ok: false, error: msg });
      }
    }

    previewDraft(acceptedDraft);
    for (const o of outcomes) {
      messages.push({
        role: 'tool',
        tool_call_id: o.id,
        name: o.name,
        content: JSON.stringify(
          o.result.ok ? { ok: true, ...(o.result.data as object || {}) } : { ok: false, error: o.result.error }
        ),
      });
    }
  }

  // ----- implicit commit fallback -------------------------------------------
  // DeepSeek frequently stops without invoking `commit` (returns no tool_calls
  // after the last edit, or just runs out of iterations). If the agent did
  // mutate `state.code` AND the result still parses as valid JS, treat it as
  // a committed turn so the UI doesn't show a misleading "No code changes made" while
  // the player is in fact about to hot-reload that very code. If validation
  // fails we keep `committed=false` so App.tsx can surface the runtime error.
  // Skip the fallback entirely if the user explicitly aborted.
  if (!committed && !signal?.aborted) {
    const codeChanged = !!state.code && state.code !== initialCode;
    if (codeChanged) {
      const validationStarted = performance.now();
      trace?.({ from: 'session', to: 'tool', label: '校验隐式提交', data: { code: state.code } });
      const v = await validateCommittedCode(state.code, isZh);
      reportSession?.({ kind: 'tool', facts: { action: 'validate final draft', phase: 'finished', ok: v.ok } });
      trace?.({ from: 'tool', to: 'session', label: '隐式提交校验结果',
        data: v, durationMs: performance.now() - validationStarted, failed: !v.ok });
      if (v.ok) {
        committed = true;
        finalCode = state.code;
        state.finalCode = state.code;
        onProgress?.({
          kind: 'warn',
          message: isZh ? 'agent 未显式调用 commit，已自动收尾并播放' : 'Agent did not call commit — auto-finalised and playing',
        });
        onProgress?.({ kind: 'commit', code: state.code });
      } else {
        onProgress?.({
          kind: 'warn',
          message: isZh ? `agent 未调用 commit 且最后代码校验失败: ${v.error || '未知'}` : `Agent did not call commit and final code failed validation: ${v.error || 'unknown'}`,
        });
        if (terminationReason === 'no_commit') terminationReason = 'validation_failed';
        finalCode = state.code;
      }
    } else if (isChatReply) {
      finalCode = initialCode;
    } else {
      onProgress?.({
        kind: 'warn',
        message: isZh ? 'agent 未产出任何代码改动' : 'Agent produced no code changes',
      });
      finalCode = initialCode;
    }
  }

  if (!explanation) {
    if (committed) {
      explanation = isZh ? '已更新' : 'Updated';
    } else if (finalCode && finalCode !== initialCode) {
      explanation = isZh ? '已生成新代码，但校验未通过，请检查' : 'Code generated but validation failed — please check';
    } else {
      explanation = isZh ? '未生成新代码' : 'No code changes made';
    }
  }

  // Estimate token count for system prompt + tools.
  // CJK characters are ~1 token each; all other characters are ~4 chars/token.
  const systemRaw = systemPrompt + JSON.stringify(tools);
  const cjkCount = countCJK(systemRaw);
  const systemEstimate = Math.ceil(cjkCount + (systemRaw.length - cjkCount) / 4);

  const tokenUsage: TokenUsage | undefined = lastUsage
    ? {
        promptTokens: lastUsage.inputTokens,
        systemEstimate,
      }
    : undefined;

  const resultCode = committed || finalCode !== initialCode ? finalCode : '';
  sampleDebug('finished', {
    searchCalls: sampleSearchCalls, committed, aborted: signal?.aborted ?? false,
    code: resultCode,
  });

  return {
    code: resultCode,
    explanation,
    ...(committed && layerNotes ? { layerNotes } : {}),
    iterations,
    committed,
    tokenUsage,
    terminationReason: signal?.aborted ? 'aborted' : committed && terminationReason !== 'timeout' && terminationReason !== 'iteration_limit'
      ? 'committed' : terminationReason,
  };
}
