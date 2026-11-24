import type { ImageAttachment } from '../lib/image-attachments';
import { prepareUserText } from './image-understanding';
import { openAIUsage, anthropicUsage, withoutCacheHints } from './llm-usage';
import { createSampleRetriever } from '../agent/sample-retriever';
import { answerWithSessionResult, routeConversation, type RouterDecision, type SessionVersion, type TurnRef } from '../agent/router';
import { traceModel, type AgentTraceSink } from '../lib/agent-trace';
import { createScopeValidator, describeEditTargets, type EditScope } from '../agent/session-scope';
import { createRouterProgress } from '../agent/router-progress';
import type { RouterStage } from '../agent/progress';
import { SESSION_EXECUTION_PROMPT } from '../prompts/session-execution';
import { inspectSession } from '../agent/session-inspection';
import { buildHummingTurnReport, formatHummingContext, hasHummingWaveformReport } from '../lib/humming-context';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { HummingAttachment } from '../types/humming';
import { buildSystemPrompt, resolvePersonaBlock } from '../prompts/build-system-prompt';
import {
  runAgentLoop,
  type ChatMsg,
  type ConversationTurn,
  type LLMCaller,
  type ProgressEvent,
  type RunAgentOptions,
  type RunAgentResult,
  type ThinkingBlock,
  type ThinkingLevel,
} from '../agent/loop';
import {
  getOpenAIToolSchemas,
} from '../agent/tools';
import { getActiveModelConfig, getSelectedThinkingLevel } from './llm-config';
import {
  isAnthropicAdaptiveModel,
  resolveAnthropicThinkingParam,
  resolveOpenAIClassificationParams,
  resolveOpenAIThinkingParams,
} from './thinking-params';
import {
  isDemoMode,
  resolveDemoScenario,
  getActiveDemoSet,
  getDemoMoodInstruction,
  getDemoMoodScenario,
  getDemoPrefill,
  getDemoPrefillScenario,
} from '../demo/demo-config';
import { createDemoLLMCaller, createDemoMoodLLMCaller } from '../demo/demo-llm';
import { getActivePersonaSync } from '../lib/persona-storage';
import { isZh } from '../lib/i18n';
import { INTENT_CLASSIFIER_PROMPT } from '../prompts/intent-classifier';

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

// Synchronous Messages API output caps (platform.claude.com/docs/en/models/overview):
// fable-5-1 / opus-5* / opus-4-8 support 128k; sonnet-4-6 and haiku-4-5 cap at 64k.
const ANTHROPIC_OUTPUT_LIMITS: Array<{ prefix: string; max: number }> = [
  { prefix: 'claude-haiku-4-5', max: 64000 },
  { prefix: 'claude-sonnet-4-6', max: 64000 },
];

function anthropicMaxOutputTokens(model: string): number {
  for (const { prefix, max } of ANTHROPIC_OUTPUT_LIMITS) {
    if (model.startsWith(prefix)) return max;
  }
  return AGENT_MAX_TOKENS;
}

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
  opts: { temperature?: number; maxTokens?: number; thinking?: 'disabled' } = {}
): Promise<string> {
  const { temperature = 0.8, maxTokens = 200 } = opts;

  if (isOpenAIProvider()) {
    const cfg = getActiveModelConfig();
    const oai = getOpenAIClient();
    const resp = await oai.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      // Kimi fixes temperature server-side when thinking is on, and OpenAI's
      // GPT-5 reasoning models reject caller-set temperature entirely.
      ...(cfg.provider === 'kimi' || cfg.provider === 'openai' ? {} : { temperature }),
      // GPT-5 reasoning models dropped max_tokens in favour of
      // max_completion_tokens; DeepSeek/Kimi/GLM still take max_tokens.
      ...(cfg.provider === 'openai'
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      // DeepSeek V4 defaults to thinking enabled. For title generation, make
      // the disabled state explicit; `reasoning_effort` is intentionally omitted.
      ...(opts.thinking === 'disabled' && (cfg.provider === 'deepseek' || cfg.provider === 'official')
        ? { thinking: { type: 'disabled' } }
        : {}),
    } as OpenAI.ChatCompletionCreateParamsNonStreaming);
    return resp.choices[0]?.message?.content ?? '';
  } else {
    const anthropic = getAnthropicClient();
    const model = getModel();
    const resp = await anthropic.messages.create({
      model,
      system,
      messages: [{ role: 'user', content: userContent }],
      // Adaptive-thinking models reject a caller-set temperature.
      ...(!isAnthropicAdaptiveModel(model) ? { temperature } : {}),
      max_tokens: Math.min(maxTokens, anthropicMaxOutputTokens(model)),
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
      out.push({ role: 'user', content: Array.isArray(msg.content) ? msg.content.map(block => block.type === 'text' ? block : { type: 'image' as const, source: { type: 'url' as const, url: block.image_url.url } }) : msg.cachePrefix ? [{type:'text',text:content,cache_control:{type:'ephemeral'}}] : content });
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

export function getActiveLLMCaller(options?: { disableDeepSeekThinking?: boolean }): LLMCaller {
  return isOpenAIProvider() ? createOpenAILLMCaller(options) : anthropicLLMCaller;
}

// ===========================================================================
// LLMCaller implementation — Anthropic path (original logic)
// ===========================================================================

const anthropicLLMCaller: LLMCaller = {
  async chatWithTools(messages: ChatMsg[], tools, onTextDelta, onReasoningDelta, signal, enableThinking = true, thinkingLevel: ThinkingLevel = 'medium') {
    const anthropic = getAnthropicClient();
    const model = getModel();
    const { system, messages: amsgs } = convertChatHistory(messages);

    const stream = anthropic.messages.stream({
      model,
      system,
      messages: amsgs,
      ...(tools.length > 0 ? { tools: convertTools(tools) } : {}),
      // Adaptive-thinking models reject a caller-set temperature.
      ...(!isAnthropicAdaptiveModel(model) ? { temperature: 1 } : {}),
      max_tokens: anthropicMaxOutputTokens(model),
      // Omit `thinking` entirely when disabled so no reasoning tokens are generated.
      ...(enableThinking ? resolveAnthropicThinkingParam(model, thinkingLevel) : {}),
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
        ...anthropicUsage(response.usage),
      },
    };
  },
};

// ===========================================================================
// LLMCaller implementation — OpenAI / OpenAI-compat path
// ===========================================================================

function createOpenAILLMCaller({ disableDeepSeekThinking = false } = {}): LLMCaller {
  return {
    async chatWithTools(messages: ChatMsg[], tools, onTextDelta, onReasoningDelta, signal, enableThinking = true, thinkingLevel: ThinkingLevel = 'medium') {
      const oai = getOpenAIClient();
      const cfg = getActiveModelConfig();
      // OpenAI's GPT-5 reasoning models and Kimi's thinking models fix
      // temperature server-side; sending one gets the request rejected.
      const fixedTemperature = cfg.provider === 'openai' || cfg.provider === 'kimi';
      // DeepSeek defaults to thinking when the request omits this field.
      const thinkingParams = disableDeepSeekThinking && (cfg.provider === 'deepseek' || cfg.provider === 'official')
        ? { thinking: { type: 'disabled' } }
        : enableThinking
          ? resolveOpenAIThinkingParams(cfg.provider, cfg.model, thinkingLevel)
          : resolveOpenAIClassificationParams(cfg.provider, cfg.model);

      const stream = await oai.chat.completions.create({
        model: getModel(),
        // ChatMsg is already in OpenAI format, can be passed directly
        messages: withoutCacheHints(messages) as OpenAI.ChatCompletionMessageParam[],
        ...(tools.length > 0
          ? {
              tools: tools as OpenAI.ChatCompletionTool[],
              tool_choice: 'auto' as const,
            }
          : {}),
        ...(!fixedTemperature ? { temperature: 0.7 } : {}),
        // GPT-5 reasoning models dropped max_tokens in favour of
        // max_completion_tokens; DeepSeek/Kimi/GLM still take max_tokens.
        ...(cfg.provider === 'openai'
          ? { max_completion_tokens: AGENT_MAX_TOKENS }
          : { max_tokens: AGENT_MAX_TOKENS }),
        stream: true,
        stream_options: { include_usage: true },
        ...thinkingParams,
      // Type assertion needed: `thinking`/`reasoning_effort` are provider-specific
      // fields accepted at runtime by DeepSeek/Kimi/GLM's OpenAI-compatible
      // endpoints but aren't in the OpenAI SDK's own param types.
      } as OpenAI.ChatCompletionCreateParamsStreaming, { signal });

      let text = '';
      let reasoningContent = '';
      const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();
      let streamUsage: ReturnType<typeof openAIUsage> | undefined;

      for await (const chunk of stream) {
        if (chunk.usage) {
          streamUsage = openAIUsage(chunk.usage);
        }
        // DeepSeek extends the OpenAI delta with `reasoning_content`.
        // Cast to access this non-standard field without breaking the TS types.
        const delta = chunk.choices[0]?.delta as (typeof chunk.choices[0]['delta']) & {
          reasoning_content?: string;
        };
        if (!delta) continue;

        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          // Fire streaming callback so callers can show reasoning in real time.
          // DeepSeek reasoner always emits reasoning_content (can't be disabled
          // via the API), so when thinking is off we simply don't forward it.
          if (enableThinking) onReasoningDelta?.(delta.reasoning_content);
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
        usage: streamUsage,
      };
    },
  };
}

async function prepareConversationHistory(
  turns: ConversationTurn[] | undefined,
  signal?: AbortSignal,
): Promise<ChatMsg[]> {
  return Promise.all((turns ?? []).map(async turn => {
    if (turn.role !== 'user' || !turn.images?.length) {
      return { role: turn.role, content: turn.content };
    }
    try {
      return { role: turn.role, content: await prepareUserText(turn.content, turn.images, signal) };
    } catch {
      signal?.throwIfAborted();
      const notice = isZh() ? '此前附带的图片暂时无法读取。' : 'The earlier image attachments are temporarily unavailable.';
      return { role: turn.role, content: [turn.content, notice].filter(Boolean).join('\n\n') };
    }
  }));
}

type Intent = 'compose' | 'chat';

// Lightweight, thinking-disabled classification call. Decides whether this turn
// should stream a reasoning chain (compose) or stay silent (chat). Runs before
// the main agent loop; fails open to `compose` so a misfire never hides a real
// composition's reasoning.
export async function classifyIntent(
  llm: LLMCaller,
  opts: {
    instruction: string;
    images?: ImageAttachment[];
    currentCode: string;
    conversationHistory?: ConversationTurn[];
    signal?: AbortSignal;
    preparedHistory?: ChatMsg[];
    preparedUserContent?: ChatMsg["content"];
  },
): Promise<Intent> {
  const { instruction, currentCode, conversationHistory, signal } = opts;
  const hasCode = currentCode.trim().length > 0;
  const codeNote = hasCode
    ? '(a track is currently playing / 当前已有一首曲子在播放)'
    : '(no track yet / 当前还没有曲子)';
  const latest = opts.preparedUserContent;
  const preparedLatest = Array.isArray(latest)
    ? latest.map((block, index) => index === 0 && block.type === 'text' ? { ...block, text: `${codeNote}\nuser latest message / 用户最新消息: ${block.text}` } : block)
    : typeof latest === 'string' ? `${codeNote}\nuser latest message / 用户最新消息: ${latest}` : undefined;
  const messages: ChatMsg[] = [
    { role: 'system', content: INTENT_CLASSIFIER_PROMPT },
    ...(opts.preparedHistory ?? await prepareConversationHistory(conversationHistory, signal)),
    { role: 'user', content: preparedLatest ?? await prepareUserText(`${codeNote}\nuser latest message / 用户最新消息: ${instruction}`, opts.images, signal) },
  ];
  try {
    const resp = await llm.chatWithTools(messages, [], undefined, undefined, signal, false);
    const out = (resp.content ?? '').toLowerCase();
    if (out.includes('chat') && !out.includes('compose')) return 'chat';
    return 'compose';
  } catch {
    return 'compose';
  }
}

export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void,
  moodContext?: string,
  signal?: AbortSignal,
  conversationHistory?: ConversationTurn[],
  images?: ImageAttachment[],
  humming?: HummingAttachment,
  trace?: AgentTraceSink,
): Promise<RunAgentResult> {
  const preparedUserContent = await prepareUserText(instruction, images, signal);
  const preparedHistory: ChatMsg[] = await prepareConversationHistory(conversationHistory, signal);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  trace?.({ from: 'client', to: 'session', label: '准备直接执行的输入', data: { preparedUserContent, preparedHistory, humming, moodContext } });
  // Classify intent up front (thinking-disabled) so we only stream a reasoning
  // chain for composition turns. Demo/mood-generation flows are always
  // compositions — skip the extra call for them.
  const isMoodGeneration = instruction === getDemoMoodInstruction();
  const skipClassification = isDemoMode() || isMoodGeneration;
  let intent: Intent = 'compose';
  if (!skipClassification) {
    const classifier = getActiveLLMCaller({ disableDeepSeekThinking: true });
    intent = await classifyIntent(
      trace ? traceModel(classifier, trace, 'session', '旧入口意图分类', getActiveModelConfig()) : classifier,
      { instruction, currentCode, conversationHistory, signal, images, preparedUserContent, preparedHistory },
    );
  }

  return executeMusic({
    instruction, currentCode, onProgress, moodContext, signal, conversationHistory, humming,
    preparedUserContent, preparedHistory, enableThinking: intent === 'compose', trace,
  });
}

interface MusicRequest {
  validateScope?: RunAgentOptions['validateScope'];
  demoInstruction?: string;
  trace?: AgentTraceSink;
  instruction: string;
  currentCode: string;
  preparedUserContent: string;
  preparedHistory: ChatMsg[];
  enableThinking: boolean;
  onProgress?: (event: ProgressEvent) => void;
  moodContext?: string;
  signal?: AbortSignal;
  conversationHistory?: ConversationTurn[];
  humming?: HummingAttachment;
}

async function executeMusic({
  instruction, currentCode, preparedUserContent, preparedHistory, enableThinking,
  onProgress, moodContext, signal, conversationHistory, humming, trace, validateScope, demoInstruction,
}: MusicRequest): Promise<RunAgentResult> {
  signal?.throwIfAborted();
  const locale = isZh() ? 'zh' : 'en';
  const musicPrompt = buildSystemPrompt({
    moodContext,
    persona: validateScope ? undefined : getActivePersonaSync(),
    executionOnly: Boolean(validateScope),
    locale,
  });

  const moodInstruction = getDemoMoodInstruction();
  const prefillInstruction = getDemoPrefill();
  const scenarioInstruction = demoInstruction ?? instruction;
  const isMoodDemo = isDemoMode() && scenarioInstruction === moodInstruction;
  const isPrefillDemo = isDemoMode() && scenarioInstruction === prefillInstruction;

  // Select the LLMCaller implementation corresponding to the current provider
  const activeLLMCaller = getActiveLLMCaller();

  const llm = isDemoMode()
    ? isMoodDemo
      ? createDemoMoodLLMCaller(getDemoMoodScenario())
      : isPrefillDemo
        ? createDemoMoodLLMCaller(getDemoPrefillScenario())
        : createDemoLLMCaller(resolveDemoScenario(scenarioInstruction) ?? getActiveDemoSet()[0])
    : activeLLMCaller;

  const retrievalUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0, calls: 0 };
  const model = trace ? getActiveModelConfig() : undefined;
  const sampleCaller = isDemoMode() ? undefined : getActiveLLMCaller({ disableDeepSeekThinking: true });
  const sampleSearch = sampleCaller && createSampleRetriever(
    model ? traceModel(sampleCaller, trace, 'session', '采样检索模型', model) : sampleCaller,
    {
      signal, onUsage: usage => {
        retrievalUsage.inputTokens += usage.inputTokens;
        retrievalUsage.outputTokens += usage.outputTokens;
        retrievalUsage.cachedInputTokens += usage.cachedInputTokens ?? 0;
        retrievalUsage.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
        retrievalUsage.calls++;
      },
    },
  );
  const result = await runAgentLoop({
    sampleSearch,
    preparedUserContent,
    preparedHistory,
    instruction,
    initialCode: currentCode,
    locale,
    systemPrompt: validateScope ? musicPrompt + '\n' + SESSION_EXECUTION_PROMPT : musicPrompt,
    validateScope,
    llm: model ? traceModel(llm, trace, 'session', '音乐模型', model) : llm,
    trace,
    onProgress,
    signal,
    conversationHistory,
    humming,
    enableThinking,
    thinkingLevel: getSelectedThinkingLevel(),
  });
  return { ...result, retrievalUsage };
}

export interface ConversationRequest {
  trace?: AgentTraceSink;
  ref: TurnRef;
  entryPoint?: string;
  moodContext?: string;
  text: string;
  current: SessionVersion;
  previous?: SessionVersion;
  lastReceipt?: string;
  history?: ConversationTurn[];
  images?: ImageAttachment[];
  humming?: HummingAttachment;
  signal: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
}

export type ExecutionStatus = 'saved' | 'no_change' | 'failed' | 'scope_conflict';
export interface ExecutionReceipt {
  ref: TurnRef;
  status: ExecutionStatus;
  revisionId?: string;
  playback: 'played' | 'failed' | 'not_attempted';
}

export type ConversationResult =
  | { kind: 'reply'; route: 'reply' | 'inspect'; text: string }
  | {
      kind: 'execute';
      scope: EditScope;
      status: Exclude<ExecutionStatus, 'saved'> | 'candidate';
      result: Omit<RunAgentResult, 'explanation'>;
      synthesize?: (receipt: ExecutionReceipt) => Promise<string>;
    };

export async function runConversationTurn(request: ConversationRequest): Promise<ConversationResult> {
  const { text, history, images, humming, current, previous, lastReceipt, signal, onProgress, trace } = request;
  const startedAt = Date.now();
  trace?.({ from: 'client', label: '准备用户输入', data: {
    imageIds: images?.map(image => image.id), humming: Boolean(humming), historyTurns: history?.length ?? 0,
  } });
  const persona = resolvePersonaBlock(getActivePersonaSync(), isZh() ? 'zh' : 'en');
  const voice = { name: persona.name, prompt: persona.block };
  const activeCaller = getActiveLLMCaller({ disableDeepSeekThinking: true });
  const caller = trace ? traceModel(activeCaller, trace, 'router', '路由模型', getActiveModelConfig()) : activeCaller;
  const router: LLMCaller = {
    async chatWithTools(...args) {
      const requestStartedAt = Date.now();
      let usage: Awaited<ReturnType<LLMCaller['chatWithTools']>>['usage'];
      try {
        const response = await caller.chatWithTools(...args);
        usage = response.usage;
        return response;
      } finally {
        onProgress?.({ kind: 'router_request', durationMs: Date.now() - requestStartedAt, usage });
      }
    },
  };
  const progress = onProgress && !isDemoMode() ? createRouterProgress(router, text, voice, signal, entry => {
    trace?.({ from: 'router', to: 'client', label: '发布进度', data: entry });
    onProgress({ kind: 'router_progress', entry });
  }) : undefined;
  const stage = (value: RouterStage) => onProgress?.({ kind: 'router_stage', stage: value });
  const answerUser = async (history: ChatMsg[], message: string, result: unknown) => {
    stage('reply');
    try {
      return await answerWithSessionResult(router, history, message, result, signal, voice,
        delta => onProgress?.({ kind: 'router_reply_delta', delta }));
    } catch (error) {
      onProgress?.({ kind: 'router_reply_reset' });
      throw error;
    }
  };
  try {
    if (images?.length) progress?.add({ kind: 'plan', facts: { nextStep: 'inspect attached images', imageCount: images.length } });
    if (humming) progress?.add({ kind: 'plan', facts: { nextStep: 'review the available humming analysis', takes: 1 + (humming.additionalTakes?.length ?? 0) } });
    return await run();
  } finally {
    progress?.close();
  }

  async function run(): Promise<ConversationResult> {
    const waveform = hasHummingWaveformReport(humming) ? humming : undefined;
    const instruction = formatHummingContext(text, humming, Boolean(waveform));
    if (images?.length) stage('image');
    const preparedUserContent = await prepareUserText(instruction, images, signal);
    if (humming) stage('humming');
    if (images?.length && preparedUserContent.startsWith(instruction)) {
      const observation = preparedUserContent.slice(instruction.length).trim();
      if (observation) progress?.add({ kind: 'tool', facts: { action: 'inspect images', observation: observation.slice(0, 1200) } });
    }
    const preparedHistory = await prepareConversationHistory(history, signal);
    signal.throwIfAborted();
    const preparationMs = Date.now() - startedAt;
    trace?.({ from: 'client', to: 'router', label: '传入本轮消息与上下文', durationMs: preparationMs,
      data: { ref: request.ref, text, preparedUserContent, preparedHistory, currentRevision: current.revisionId,
        previousRevision: previous?.revisionId, hasCode: Boolean(current.code.trim()), lastReceipt, humming } });
    const hasCode = Boolean(current.code.trim());
    const editTargets = describeEditTargets(current.code);
    const decision: RouterDecision = isDemoMode()
      ? { kind: 'execute', task: { scope: { kind: hasCode ? 'rewrite' : 'create' }, instruction: text, needsSynthesis: false } }
      : await routeConversation(router, preparedHistory, preparedUserContent, {
        hasCode, hasHumming: Boolean(humming), lastReceipt, editTargets, entryPoint: request.entryPoint,
      }, { signal, onRetry: () => onProgress?.({ kind: 'request_retry' }) });
    onProgress?.({ kind: 'route_decision', route: decision.kind, preparationMs });

    trace?.({ from: 'router', to: decision.kind === 'reply' ? undefined : 'session',
      label: decision.kind === 'reply' ? '形成对话草稿' : decision.kind === 'inspect' ? '委派 · 只读查询' : '委派 · 创作或改曲',
      data: { ref: request.ref, decision, demo: isDemoMode() } });
    if (decision.kind === 'reply') {
      await progress?.finish();
      let reply = decision.text;
      try {
        reply = await answerUser(preparedHistory, preparedUserContent, { conversationDraft: reply });
      } catch {
        signal.throwIfAborted();
        trace?.({ from: 'router', label: '角色回复生成失败，使用对话草稿', failed: true });
      }
      trace?.({ from: 'router', to: 'client', label: '发布对话回复', data: { reply } });
      return { kind: 'reply', route: 'reply', text: reply };
    }
    if (decision.kind === 'inspect') {
      stage('analysis');
      progress?.add({ kind: 'tool', facts: { action: 'inspect score versions', question: decision.question } });
      const inspectionStarted = performance.now();
      const facts = inspectSession(decision.question, current, previous);
      trace?.({ from: 'session', to: 'router', label: '返回作品证据', data: facts, durationMs: performance.now() - inspectionStarted });
      await progress?.finish();
      const answer = await answerUser(preparedHistory, preparedUserContent, facts);
      trace?.({ from: 'router', to: 'client', label: '根据作品证据回复', data: { answer } });
      return { kind: 'reply', route: 'inspect', text: answer };
    }

    const { task } = decision;
    const plansStructure = task.scope.kind === 'create' || task.scope.kind === 'rewrite' || task.scope.kind === 'section';
    if (plansStructure) progress?.add({ kind: 'plan', facts: {
      nextStep: task.scope.kind === 'section' ? 'consider how to shape the requested section in context' : 'sketch the structure of the composition',
      request: task.instruction,
    } });
    let plannedSampleSearch = false;
    stage(waveform ? 'humming' : 'composition');

    const permitsEdit = createScopeValidator(task.scope, current.code);
    let rejectedCandidate = false;
    const validateScope = (candidate: string) => {
      const allowed = permitsEdit(candidate);
      if (!allowed) {
        rejectedCandidate = true;
        trace?.({ from: 'session', to: 'router', label: '候选版本超出授权范围', failed: true,
          data: { scope: task.scope, candidate } });
      }
      return allowed;
    };
    const imageReference = images?.length && preparedUserContent.startsWith(instruction)
      ? preparedUserContent.slice(instruction.length).trim() : undefined;
    const brief = JSON.stringify({
      task: task.instruction,
      scope: task.scope,
      targets: (task.scope.kind === 'section' ? editTargets.sections : editTargets.layers)
        .filter(target => 'targets' in task.scope && task.scope.targets.includes(target.id)),
      imageReference,
      hummingReference: humming && !waveform ? buildHummingTurnReport(humming) : undefined,
      waveformAvailable: Boolean(waveform),
    });
    trace?.({ from: 'router', to: 'session', label: '传入实施任务与作品基线', data: { ref: request.ref, task, current } });
    const { explanation, ...result } = await executeMusic({
      instruction: brief,
      currentCode: current.code,
      preparedUserContent: brief,
      preparedHistory: [],
      demoInstruction: text,
      moodContext: request.moodContext,
      signal,
      humming: waveform,
      enableThinking: true,
      validateScope,
      onProgress: event => {
        if (event.kind === 'session_progress') {
          if (event.entry.kind === 'strategy') stage('structure');
          progress?.add(event.entry);
          return;
        }
        if (event.kind === 'tool_call') {
          switch (event.name) {
            case 'analyzeHummingWaveform': stage('humming'); break;
            case 'searchSamples':
              if (!plannedSampleSearch) {
                plannedSampleSearch = true;
                progress?.add({ kind: 'plan', facts: {
                  nextStep: 'look for sounds that fit the requested expression and musical roles',
                  queries: event.args.queries,
                } });
              }
              stage('analysis');
              break;
            case 'getScore': stage('analysis'); break;
            case 'setCode': stage('composition'); break;
            case 'validate':
            case 'commit': stage('validation'); break;
          }
        } else if (event.kind === 'tool_result' && event.name === 'analyzeHummingWaveform') {
          stage('analysis');
        }
        onProgress?.(event);
      },
      trace,
    });
    await progress?.finish();
    const changed = Boolean(result.code && result.code !== current.code);
    const status = result.committed && changed && validateScope(result.code) ? 'candidate'
      : rejectedCandidate ? 'scope_conflict'
      : changed || ['timeout', 'iteration_limit', 'validation_failed'].includes(result.terminationReason ?? '') ? 'failed'
      : 'no_change';
    trace?.({ from: 'session', to: 'router', label: '返回实施结果与证据',
      data: { status, scope: task.scope, result, implementationNote: explanation } });
    return {
      kind: 'execute',
      scope: task.scope,
      status,
      result,
      synthesize: task.needsSynthesis || !isDemoMode() && (Boolean(humming) || status === 'scope_conflict')
        ? receipt => answerUser(preparedHistory, preparedUserContent, {
          ...receipt,
          scope: task.scope,
          terminationReason: result.terminationReason,
          ...(receipt.status === 'saved' && { evidence: inspectSession(task.instruction, { code: result.code }, current) }),
        })
        : undefined,
    };
  }
}

// Re-exported so callers don't need to reach into ../agent/loop directly.
export type { ProgressEvent, RunAgentResult, ConversationTurn } from '../agent/loop';

void getOpenAIToolSchemas;
