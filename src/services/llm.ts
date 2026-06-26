import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { buildSystemPrompt } from '../prompts/build-system-prompt';
import {
  runAgentLoop,
  type ChatMsg,
  type ConversationTurn,
  type LLMCaller,
  type ProgressEvent,
  type RunAgentResult,
  type ThinkingBlock,
} from '../agent/loop';
import {
  getOpenAIToolSchemas,
} from '../agent/tools';
import { getActiveModelConfig } from './llm-config';
import { isDemoMode, resolveDemoScenario, getActiveDemoSet, DEMO_MOOD_SCENARIO, DEMO_PREFILL, DEMO_PREFILL_SCENARIO, resolveStaticSuggestionScenario } from '../demo/demo-config';
import { createDemoLLMCaller, createDemoMoodLLMCaller } from '../demo/demo-llm';

// ===========================================================================
// Dual-provider client management.
//
// - provider='anthropic' → uses @anthropic-ai/sdk (native Anthropic Messages protocol)
//   tool-calling behaviour is more reliable; original implementation retained.
// - provider='openai' / 'openai-compat' → uses openai SDK (OpenAI Chat Completions protocol)
//   supports OpenAI, DeepSeek, Tongyi Qianwen and other compatible endpoints.
//
// Model/credential configuration is centralised in ./llm-config.ts.
// ===========================================================================

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
const AGENT_MAX_TOKENS = 131072;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const cfg = getActiveModelConfig();
    anthropicClient = new Anthropic({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      dangerouslyAllowBrowser: true,
      // Some OpenAI-compat proxies only read `Authorization: Bearer`. Adding
      // it as a default header is a no-op for a real Anthropic endpoint
      // (which ignores the Authorization header in favour of `x-api-key`),
      // but it lets the same proxy URL work for both protocols.
      defaultHeaders: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
    });
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const cfg = getActiveModelConfig();
    openaiClient = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL || undefined,
      dangerouslyAllowBrowser: true,
    });
  }
  return openaiClient;
}

/** Clear the client singletons; they will be rebuilt with the latest config on the next call. */
export function resetClient(): void {
  anthropicClient = null;
  openaiClient = null;
}

function getModel(): string {
  return getActiveModelConfig().model;
}

function isOpenAIProvider(): boolean {
  return getActiveModelConfig().protocol === 'openai';
}

// ---------------------------------------------------------------------------
// chatOnce — single-turn, no tool calls. Shared by improviseLLM and suggestions.ts;
// automatically routes to the appropriate SDK based on the current provider.
// ---------------------------------------------------------------------------

export async function chatOnce(
  system: string,
  userContent: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const { temperature = 0.8, maxTokens = 200 } = opts;

  if (isOpenAIProvider()) {
    const oai = getOpenAIClient();
    const resp = await oai.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      temperature,
      max_tokens: maxTokens,
    });
    return resp.choices[0]?.message?.content ?? '';
  } else {
    const anthropic = getAnthropicClient();
    const resp = await anthropic.messages.create({
      model: getModel(),
      system,
      messages: [{ role: 'user', content: userContent }],
      temperature,
      max_tokens: maxTokens,
    });
    return resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}

// ---------------------------------------------------------------------------
// Helpers for Anthropic path: collapse content blocks, convert chat history.
// ---------------------------------------------------------------------------

interface ConvertedHistory {
  system: string;
  messages: Anthropic.MessageParam[];
}

// ChatMsg[] → Anthropic (system, messages). The agent loop keeps its history
// in OpenAI shape (separate `tool` role, `tool_calls` array on assistant).
// Anthropic expects:
//   - `system` as a top-level string (NOT a message)
//   - only `user` / `assistant` roles
//   - tool calls appear as `tool_use` content blocks on the assistant turn
//   - tool results appear as `tool_result` blocks on a user turn, and
//     multiple consecutive tool replies MUST collapse into ONE user message.
function convertChatHistory(msgs: ChatMsg[]): ConvertedHistory {
  let system = '';
  const out: Anthropic.MessageParam[] = [];

  for (const msg of msgs) {
    const content = typeof msg.content === 'string' ? msg.content : '';

    if (msg.role === 'system') {
      system = system ? `${system}\n\n${content}` : content;
      continue;
    }

    if (msg.role === 'user') {
      out.push({ role: 'user', content });
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      // Anthropic requires thinking blocks to appear before text/tool_use blocks.
      if (msg.thinking_blocks && msg.thinking_blocks.length > 0) {
        for (const tb of msg.thinking_blocks) {
          blocks.push({
            type: 'thinking',
            thinking: tb.thinking,
            signature: tb.signature,
          } as Anthropic.ContentBlockParam);
        }
      }
      if (content.trim()) {
        blocks.push({ type: 'text', text: content });
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(tc.function.arguments || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              input = parsed as Record<string, unknown>;
            }
          } catch {
            /* keep input = {} */
          }
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
      if (blocks.length === 0) {
        continue;
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }

    if (msg.role === 'tool') {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id || '',
        content,
      };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
        (prev.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
  }

  return { system, messages: out };
}

// OpenAI tool schemas → Anthropic tool schemas.
function convertTools(
  oaiTools: ReturnType<typeof getOpenAIToolSchemas>
): Anthropic.Tool[] {
  return oaiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

// ===========================================================================
// LLMCaller implementation — Anthropic path (original logic)
// ===========================================================================

const anthropicLLMCaller: LLMCaller = {
  async chatWithTools(messages: ChatMsg[], tools, onTextDelta, onReasoningDelta, signal) {
    const anthropic = getAnthropicClient();
    const { system, messages: amsgs } = convertChatHistory(messages);

    const stream = anthropic.messages.stream({
      model: getModel(),
      system,
      messages: amsgs,
      tools: convertTools(tools),
      temperature: 1,
      max_tokens: AGENT_MAX_TOKENS,
      thinking: { type: 'enabled', budget_tokens: 10000 },
    // Type assertion needed: SDK types don't yet include `thinking` in the
    // stream params, but it works at runtime when the beta header is set.
    } as Parameters<typeof anthropic.messages.stream>[0], { signal });

    if (onTextDelta) {
      stream.on('text', (delta) => {
        onTextDelta(delta);
      });
    }

    stream.on('thinking', (delta) => onReasoningDelta?.(delta));

    const response = await stream.finalMessage();

    let text = '';
    const toolCalls: { id: string; name: string; arguments: string }[] = [];
    const thinkingBlocks: ThinkingBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      } else if (block.type === 'thinking') {
        thinkingBlocks.push({
          type: 'thinking',
          thinking: block.thinking,
          signature: block.signature,
        });
      }
    }

    return {
      content: text.trim() ? text : null,
      ...(thinkingBlocks.length > 0 ? { thinking_blocks: thinkingBlocks } : {}),
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  },
};

// ===========================================================================
// LLMCaller implementation — OpenAI / OpenAI-compat path
// ===========================================================================

function createOpenAILLMCaller(): LLMCaller {
  return {
    async chatWithTools(messages: ChatMsg[], tools, onTextDelta, onReasoningDelta, signal) {
      const oai = getOpenAIClient();

      const stream = await oai.chat.completions.create({
        model: getModel(),
        // ChatMsg is already in OpenAI format, can be passed directly
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        tools: tools as OpenAI.ChatCompletionTool[],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: AGENT_MAX_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
      }, { signal });

      let text = '';
      let reasoningContent = '';
      const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();
      let streamUsage: { prompt_tokens: number; completion_tokens: number } | undefined;

      for await (const chunk of stream) {
        // DeepSeek extends the OpenAI delta with `reasoning_content`.
        // Cast to access this non-standard field without breaking the TS types.
        const delta = chunk.choices[0]?.delta as (typeof chunk.choices[0]['delta']) & {
          reasoning_content?: string;
        };
        if (!delta) continue;

        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          // Fire streaming callback so callers can show reasoning in real time.
          onReasoningDelta?.(delta.reasoning_content);
        }

        if (delta.content) {
          text += delta.content;
          onTextDelta?.(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallBuffers.has(tc.index)) {
              toolCallBuffers.set(tc.index, { id: '', name: '', args: '' });
            }
            const buf = toolCallBuffers.get(tc.index)!;
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name = tc.function.name;
            if (tc.function?.arguments) buf.args += tc.function.arguments;
          }
        }

        if (chunk.usage) {
          streamUsage = { prompt_tokens: chunk.usage.prompt_tokens, completion_tokens: chunk.usage.completion_tokens };
        }
      }

      const toolCalls = Array.from(toolCallBuffers.values()).map((buf) => ({
        id: buf.id,
        name: buf.name,
        arguments: buf.args,
      }));

      return {
        content: text.trim() || null,
        reasoning_content: reasoningContent || null,
        toolCalls,
        usage: streamUsage
          ? { inputTokens: streamUsage.prompt_tokens, outputTokens: streamUsage.completion_tokens }
          : undefined,
      };
    },
  };
}

export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void,
  moodContext?: string,
  signal?: AbortSignal,
  conversationHistory?: ConversationTurn[],
): Promise<RunAgentResult> {
  const systemPrompt = buildSystemPrompt({ instruction, moodContext });

  const isMoodDemo = isDemoMode() && instruction === '根据我的心情生成音乐';
  const isPrefillDemo = isDemoMode() && instruction === DEMO_PREFILL;
  const staticScenario = resolveStaticSuggestionScenario(instruction);

  // Select the LLMCaller implementation corresponding to the current provider
  const activeLLMCaller = isOpenAIProvider() ? createOpenAILLMCaller() : anthropicLLMCaller;

  const llm = staticScenario
    ? createDemoLLMCaller(staticScenario)
    : isDemoMode()
      ? isMoodDemo
        ? createDemoMoodLLMCaller(DEMO_MOOD_SCENARIO)
        : isPrefillDemo
          ? createDemoMoodLLMCaller(DEMO_PREFILL_SCENARIO)
          : createDemoLLMCaller(resolveDemoScenario(instruction) ?? getActiveDemoSet()[0])
      : activeLLMCaller;

  return runAgentLoop({
    instruction,
    initialCode: currentCode,
    systemPrompt,
    llm,
    onProgress,
    signal,
    conversationHistory,
  });
}

// Re-exported so callers don't need to reach into ../agent/loop directly.
export type { ProgressEvent, RunAgentResult, ConversationTurn } from '../agent/loop';

void getOpenAIToolSchemas;
