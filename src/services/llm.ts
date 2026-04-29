import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  AGENT_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT_OPENAI,
  IMPROVISE_SYSTEM_PROMPT,
} from '../prompts/system-prompt';
import {
  runAgentLoop,
  type ChatMsg,
  type LLMCaller,
  type ProgressEvent,
  type RunAgentResult,
} from '../agent/loop';
import {
  getOpenAIToolSchemas,
  type ImproviseRequest,
} from '../agent/tools';
import { getRoleHint } from '../prompts/styles';
import { getActiveModelConfig } from './llm-config';
import { isDemoMode, resolveDemoScenario, getActiveDemoSet, DEMO_MOOD_SCENARIO, DEMO_PREFILL, DEMO_PREFILL_SCENARIO, resolveStaticSuggestionScenario } from '../demo/demo-config';
import { createDemoLLMCaller, createDemoMoodLLMCaller } from '../demo/demo-llm';

// ===========================================================================
// 双 Provider 客户端管理。
//
// - provider='anthropic' → 使用 @anthropic-ai/sdk（原生 Anthropic Messages 协议）
//   tool-calling 行为更可靠，保留原有实现。
// - provider='openai' / 'openai-compat' → 使用 openai SDK（OpenAI Chat Completions 协议）
//   支持 OpenAI、DeepSeek、通义千问等兼容接口。
//
// 模型/凭据配置统一放在 ./llm-config.ts。
// ===========================================================================

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

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

/** 清空客户端单例，下次调用时使用最新配置重建。 */
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
// chatOnce — 单轮无工具调用。供 improviseLLM 和 suggestions.ts 共用，
// 自动根据当前 provider 路由到对应 SDK。
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
// LLMCaller 实现 — Anthropic 路径（原有逻辑）
// ===========================================================================

const anthropicLLMCaller: LLMCaller = {
  async chatWithTools(messages: ChatMsg[], tools, onTextDelta, signal) {
    const anthropic = getAnthropicClient();
    const { system, messages: amsgs } = convertChatHistory(messages);

    const stream = anthropic.messages.stream({
      model: getModel(),
      system,
      messages: amsgs,
      tools: convertTools(tools),
      temperature: 0.7,
      max_tokens: 1024,
    }, { signal });

    if (onTextDelta) {
      stream.on('text', (delta) => {
        onTextDelta(delta);
      });
    }

    const response = await stream.finalMessage();

    let text = '';
    const toolCalls: { id: string; name: string; arguments: string }[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      }
    }

    return {
      content: text.trim() ? text : null,
      toolCalls,
    };
  },
};

// ===========================================================================
// LLMCaller 实现 — OpenAI / OpenAI-compat 路径
// ===========================================================================

function createOpenAILLMCaller(): LLMCaller {
  return {
    async chatWithTools(messages: ChatMsg[], tools, onTextDelta, signal) {
      const oai = getOpenAIClient();

      const stream = await oai.chat.completions.create({
        model: getModel(),
        // ChatMsg 已是 OpenAI 格式，可直接传入
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        tools: tools as OpenAI.ChatCompletionTool[],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 8192,
        stream: true,
      }, { signal });

      let text = '';
      let reasoningContent = '';
      const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        // DeepSeek extends the OpenAI delta with `reasoning_content`.
        // Cast to access this non-standard field without breaking the TS types.
        const delta = chunk.choices[0]?.delta as (typeof chunk.choices[0]['delta']) & {
          reasoning_content?: string;
        };
        if (!delta) continue;

        if (delta.reasoning_content) {
          reasoningContent += delta.reasoning_content;
          // reasoning_content is echoed back for multi-turn correctness but
          // not shown in the UI — the model outputs a short planning sentence
          // in `content` instead (see system prompt Working style §5).
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
      };
    },
  };
}

// ===========================================================================
// improviseLLM — 基于 chatOnce，自动路由到当前 provider。
// ===========================================================================

// Role-indexed canned snippets — used as the last-resort fallback so a flaky
// sub-LLM response never breaks the agent loop.
const IMPROVISE_FALLBACKS: Record<string, string> = {
  drums: 's("bd ~ sd ~").bank("RolandTR808").gain(0.8)',
  hh: 's("hh*8").gain(0.5)',
  bass: 'note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)',
  pad: 'n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).gain(0.4)',
  lead: 'n("<0 2 4 7 5 4>").scale("C4:minor").s("triangle").gain(0.5)',
  fx: 's("~ ~ ~ cp").room(0.5).gain(0.5)',
};

// Pull a Strudel snippet out of whatever shape the sub-LLM decided to return.
function extractStrudelSnippet(text: string): string | null {
  if (!text) return null;

  // 1) pure JSON
  try {
    const p = JSON.parse(text) as { code?: unknown };
    if (typeof p?.code === 'string' && p.code.trim()) return p.code.trim();
  } catch {
    /* fallthrough */
  }

  // 2) ```json {...} ```  or  ``` {...} ```
  const jsonBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonBlock) {
    try {
      const p = JSON.parse(jsonBlock[1]) as { code?: unknown };
      if (typeof p?.code === 'string' && p.code.trim()) return p.code.trim();
    } catch {
      /* fallthrough */
    }
  }

  // 3) regex the `"code": "..."` field out (survives truncated JSON)
  const field = text.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (field) {
    try {
      return JSON.parse(`"${field[1]}"`);
    } catch {
      return field[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }

  // 4) non-JSON code fence — treat body as the snippet
  const codeBlock = text.match(/```(?:js|javascript|strudel)?\s*([\s\S]*?)```/);
  if (codeBlock && codeBlock[1].trim()) {
    return codeBlock[1].trim();
  }

  // 5) raw text that already looks like a strudel expression
  const trimmed = text.trim();
  if (trimmed && /(^|[^a-zA-Z_])(s|n|note|stack|chord)\s*\(/.test(trimmed)) {
    const firstChunk = trimmed.split(/\n\s*\n/)[0].trim();
    return firstChunk || trimmed;
  }

  return null;
}

async function improviseLLM(req: ImproviseRequest): Promise<string> {
  const { role, hints, currentCode, style, complementTask } = req;
  const styleHint = style ? getRoleHint(style, role) : '';
  const userPrompt = [
    `role: ${role}`,
    style ? `style: ${style}` : '',
    complementTask ? `complement_task: ${complementTask}` : '',
    styleHint ? `style_hint: ${styleHint}` : '',
    hints ? `hint: ${hints}` : '',
    currentCode ? `current code (for context):\n${currentCode}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const tryCall = async (systemPrompt: string, tokens: number): Promise<string | null> => {
    try {
      const text = await chatOnce(systemPrompt, userPrompt, { temperature: 0.9, maxTokens: tokens });
      return extractStrudelSnippet(text);
    } catch (e) {
      console.warn('[improvise] upstream call errored', e);
      return null;
    }
  };

  const first = await tryCall(IMPROVISE_SYSTEM_PROMPT, 512);
  if (first) return first;

  const retryPrompt = [
    'You are a Strudel snippet generator.',
    'Output ONLY one single chained Strudel expression — no JSON, no markdown fences, no comments, no prose.',
    'Example output: s("bd ~ sd ~").bank("RolandTR808").gain(0.8)',
    'Rules: no stack wrapping, no setcps, no semicolons, no var/let/const.',
  ].join('\n');
  const second = await tryCall(retryPrompt, 512);
  if (second) return second;

  console.warn(`[improvise] falling back to canned snippet for role=${role}`);
  return IMPROVISE_FALLBACKS[role] ?? IMPROVISE_FALLBACKS.drums;
}

export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void,
  moodContext?: string,
  signal?: AbortSignal,
): Promise<RunAgentResult> {
  const basePrompt = isOpenAIProvider() ? AGENT_SYSTEM_PROMPT_OPENAI : AGENT_SYSTEM_PROMPT;
  const systemPrompt = moodContext
    ? `${basePrompt}\n\n${moodContext}`
    : basePrompt;

  const isMoodDemo = isDemoMode() && instruction === '根据我的心情生成音乐';
  const isPrefillDemo = isDemoMode() && instruction === DEMO_PREFILL;
  const staticScenario = resolveStaticSuggestionScenario(instruction);

  // 根据当前 provider 选择对应的 LLMCaller 实现
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

  const effectiveImproviseLLM = isMoodDemo
    ? async (req: ImproviseRequest) => {
        await new Promise<void>((r) => setTimeout(r, 1400));
        return DEMO_MOOD_SCENARIO.roleSnippets[req.role] ?? IMPROVISE_FALLBACKS[req.role] ?? '';
      }
    : isPrefillDemo
      ? async (req: ImproviseRequest) => {
          await new Promise<void>((r) => setTimeout(r, 1400));
          return DEMO_PREFILL_SCENARIO.roleSnippets[req.role] ?? IMPROVISE_FALLBACKS[req.role] ?? '';
        }
      : improviseLLM;

  return runAgentLoop({
    instruction,
    initialCode: currentCode,
    systemPrompt,
    llm,
    improviseLLM: effectiveImproviseLLM,
    onProgress,
    signal,
  });
}

// Re-exported so callers don't need to reach into ../agent/loop directly.
export type { ProgressEvent, RunAgentResult } from '../agent/loop';

void getOpenAIToolSchemas;
