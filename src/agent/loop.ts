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
import { validateCode } from '../services/strudel';

// OpenAI ChatCompletion message shape (only the bits we use).
export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface LLMCaller {
  chatWithTools(
    messages: ChatMsg[],
    tools: ReturnType<typeof getOpenAIToolSchemas>
  ): Promise<{
    content: string | null;
    toolCalls: ToolCallRequest[];
  }>;
}

export type ProgressEvent =
  | { kind: 'iteration'; index: number }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; ok: boolean; error?: string }
  | { kind: 'commit'; code: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'warn'; message: string };

export interface RunAgentOptions {
  initialCode: string;
  instruction: string;
  systemPrompt: string;
  llm: LLMCaller;
  improviseLLM: ToolContext['improviseLLM'];
  maxIter?: number;
  timeoutMs?: number;
  onProgress?: (e: ProgressEvent) => void;
}

export interface RunAgentResult {
  code: string;
  explanation: string;
  iterations: number;
  committed: boolean;
}

const DEFAULT_MAX_ITER = 30;
// 120s covers ~10 tool-calls worth of latency (including nested `improvise`
// sub-LLM calls). 45s was too tight — a typical multi-layer request
// (read → setTempo → improvise drums → addLayer → improvise bass → addLayer
// → validate → commit) easily overruns it before the model reaches `commit`.
const DEFAULT_TIMEOUT = 300_000;

export async function runAgentLoop(opts: RunAgentOptions): Promise<RunAgentResult> {
  const {
    initialCode,
    instruction,
    systemPrompt,
    llm,
    improviseLLM,
    maxIter = DEFAULT_MAX_ITER,
    timeoutMs = DEFAULT_TIMEOUT,
    onProgress,
  } = opts;

  const state: AgentState = { code: initialCode || '', finalCode: null };
  const ctx: ToolContext = { state, improviseLLM };

  const userTurn = initialCode
    ? `当前正在播放的代码:\n\`\`\`\n${initialCode}\n\`\`\`\n\n用户指令: ${instruction}`
    : `用户指令: ${instruction}`;

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userTurn },
  ];

  const tools = getOpenAIToolSchemas();
  const start = Date.now();
  let iterations = 0;
  let explanation = '';
  let committed = false;
  let finalCode = state.code;

  outer: for (let i = 0; i < maxIter; i++) {
    if (Date.now() - start > timeoutMs) {
      onProgress?.({ kind: 'warn', message: `超时 ${timeoutMs}ms，强制结束` });
      break;
    }
    iterations = i + 1;
    onProgress?.({ kind: 'iteration', index: iterations });

    const resp = await llm.chatWithTools(messages, tools);

    if (resp.content && resp.content.trim()) {
      onProgress?.({ kind: 'assistant_text', text: resp.content.trim() });
    }

    // Push the assistant message so subsequent tool messages link back to it
    // (OpenAI requires assistant tool_calls to be present in history before
    // the matching tool replies).
    messages.push({
      role: 'assistant',
      content: resp.content,
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
      explanation = resp.content?.trim() || '已完成';
      break;
    }

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
      onProgress?.({ kind: 'tool_call', name: call.name, args: parsedArgs });

      try {
        const outcome = await dispatchToolCall(call, ctx);
        outcomes.push(outcome);
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
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({ ok: true, committed: true }),
          });
          onProgress?.({ kind: 'commit', code: e.code });
          break outer;
        }
        const msg = e instanceof Error ? e.message : String(e);
        outcomes.push({
          id: call.id,
          name: call.name,
          result: { ok: false, error: msg },
        });
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
  // a committed turn so the UI doesn't show a misleading "未生成新代码" while
  // the player is in fact about to hot-reload that very code. If validation
  // fails we keep `committed=false` so App.tsx can surface the runtime error.
  if (!committed) {
    const codeChanged = !!state.code && state.code !== initialCode;
    if (codeChanged) {
      const v = validateCode(state.code);
      if (v.ok) {
        committed = true;
        finalCode = state.code;
        state.finalCode = state.code;
        onProgress?.({
          kind: 'warn',
          message: 'agent 未显式调用 commit，已自动收尾并播放',
        });
        onProgress?.({ kind: 'commit', code: state.code });
      } else {
        onProgress?.({
          kind: 'warn',
          message: `agent 未调用 commit 且最后代码语法错误: ${v.error || '未知'}`,
        });
        finalCode = state.code;
      }
    } else {
      onProgress?.({
        kind: 'warn',
        message: 'agent 未产出任何代码改动',
      });
      finalCode = initialCode;
    }
  }

  if (!explanation) {
    if (committed) {
      explanation = '已更新';
    } else if (finalCode && finalCode !== initialCode) {
      explanation = '已生成新代码，但语法校验未通过，请检查';
    } else {
      explanation = '未生成新代码';
    }
  }

  return {
    code: finalCode,
    explanation,
    iterations,
    committed,
  };
}
