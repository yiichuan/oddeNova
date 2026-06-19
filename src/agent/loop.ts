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
  type AgentState,
  type ToolContext,
} from './tools';
import { parseScore, summariseScore } from './parser';
import { validateCodeRuntime } from '../services/strudel';
import { getErrorMessage } from '../lib/errors';

/** Anthropic extended thinking block, must be echoed back verbatim in multi-turn. */
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature: string };

// OpenAI ChatCompletion message shape (only the bits we use).
export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
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
}

export interface LLMCaller {
  chatWithTools(
    messages: ChatMsg[],
    tools: ReturnType<typeof getOpenAIToolSchemas>,
    onTextDelta?: (delta: string) => void,
    onReasoningDelta?: (delta: string) => void,
    signal?: AbortSignal
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
  | { kind: 'iteration'; index: number }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; ok: boolean; error?: string }
  | { kind: 'commit'; code: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'assistant_text_delta'; delta: string }
  | { kind: 'reasoning_delta'; delta: string }
  | { kind: 'warn'; message: string };

export type ConversationTurn = { role: 'user' | 'assistant'; content: string };

export interface RunAgentOptions {
  initialCode: string;
  instruction: string;
  systemPrompt: string;
  llm: LLMCaller;
  maxIter?: number;
  timeoutMs?: number;
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  conversationHistory?: ConversationTurn[];
}

export interface TokenUsage {
  promptTokens: number;
  systemEstimate: number;
}

// Wrap a streaming-delta progress event, or undefined when there's no listener.
function makeProgressDelta(
  onProgress: ((e: ProgressEvent) => void) | undefined,
  kind: 'assistant_text_delta' | 'reasoning_delta',
): ((delta: string) => void) | undefined {
  return onProgress ? (delta: string) => onProgress({ kind, delta }) : undefined;
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
  code: string;
  explanation: string;
  iterations: number;
  committed: boolean;
  tokenUsage?: TokenUsage;
}

const DEFAULT_MAX_ITER = 30;
const DEFAULT_TIMEOUT = 300_000;

export async function runAgentLoop(opts: RunAgentOptions): Promise<RunAgentResult> {
  const {
    initialCode,
    instruction,
    systemPrompt,
    llm,
    maxIter = DEFAULT_MAX_ITER,
    timeoutMs = DEFAULT_TIMEOUT,
    onProgress,
    signal,
    conversationHistory,
  } = opts;

  const state: AgentState = {
    code: initialCode || '',
    finalCode: null,
  };
  const isZh = /[一-龥]/.test(instruction);
  const ctx: ToolContext = { state, isZh };
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
      ? `当前正在播放的代码（${meta}）:\n\`\`\`\n${initialCode}\n\`\`\`\n\n用户指令: ${instruction}`
      : `Current playing code (${meta}):\n\`\`\`\n${initialCode}\n\`\`\`\n\nUser instruction: ${instruction}`;
  } else {
    userTurn = isZh ? `用户指令: ${instruction}` : `User instruction: ${instruction}`;
  }

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt },
    ...(conversationHistory ?? []),
    { role: 'user', content: userTurn },
  ];

  const tools = getOpenAIToolSchemas(isZh);
  const start = Date.now();
  let iterations = 0;
  let explanation = '';
  let committed = false;
  let finalCode = state.code;
  // Only keep usage from the last iteration: each call accumulates the full message history,
  // so the final inputTokens reflects the true size of the current complete context.
  let lastUsage: LLMUsage | undefined;

  outer: for (let i = 0; i < maxIter; i++) {
    if (Date.now() - start > timeoutMs) {
      onProgress?.({ kind: 'warn', message: isZh ? `超时 ${timeoutMs}ms，强制结束` : `Timed out after ${timeoutMs}ms, force-stopping` });
      break;
    }
    if (signal?.aborted) {
      onProgress?.({ kind: 'warn', message: isZh ? '已中断' : 'Interrupted' });
      break;
    }
    iterations = i + 1;
    onProgress?.({ kind: 'iteration', index: iterations });

    const onTextDelta = makeProgressDelta(onProgress, 'assistant_text_delta');
    const onReasoningDelta = makeProgressDelta(onProgress, 'reasoning_delta');
    const resp = await llm.chatWithTools(messages, tools, onTextDelta, onReasoningDelta, signal);
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
      // No tools requested — model done. Treat its text as explanation.
      explanation = resp.content?.trim() || (isZh ? '已完成' : 'Done');
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

      try {
        const outcome = await dispatchToolCall(call, ctx);
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
        onProgress?.({
          kind: 'tool_result',
          name: outcome.name,
          ok: outcome.result.ok,
          error: outcome.result.error,
        });
      } catch (e) {
        if (e instanceof CommitSignal) {
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
            } catch {
              /* ignore */
            }
          }
          const commitResultJson = JSON.stringify({ ok: true, committed: true });
          iterResultCache.set(dedupKey, commitResultJson);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: commitResultJson,
          });
          onProgress?.({ kind: 'commit', code: e.code });
          break outer;
        }
        const msg = getErrorMessage(e);
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
      const v = validateCodeRuntime(state.code);
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
          message: isZh ? `agent 未调用 commit 且最后代码语法错误: ${v.error || '未知'}` : `Agent did not call commit and final code has syntax errors: ${v.error || 'unknown'}`,
        });
        finalCode = state.code;
      }
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
      explanation = isZh ? '已生成新代码，但语法校验未通过，请检查' : 'Code generated but syntax validation failed — please check';
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

  return {
    code: finalCode,
    explanation,
    iterations,
    committed,
    tokenUsage,
  };
}
