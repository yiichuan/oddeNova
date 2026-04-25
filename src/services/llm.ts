import Anthropic from '@anthropic-ai/sdk';
import {
  AGENT_SYSTEM_PROMPT,
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
// Anthropic client — the upstream proxy at timesniper.club speaks BOTH the
// OpenAI and Anthropic protocols. We went back to the native Anthropic
// Messages protocol because json_object / tool-calling behaviour via the
// OpenAI-compat shim was unreliable on claude-sonnet-4-6.
//
// 模型/凭据配置统一放在 ./llm-config.ts，方便在 sonnet / opus 之间切换。
// ===========================================================================

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const cfg = getActiveModelConfig();
    client = new Anthropic({
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
  return client;
}


/** 清空 Anthropic client 单例，下次调用 getClient() 时使用最新配置重建。 */
export function resetClient(): void {
  client = null;
}

function getModel(): string {
  return getActiveModelConfig().model;
}

// ---------------------------------------------------------------------------
// Helpers: collapse the response.content[] blocks into plain text, and the
// reverse — convert our ChatMsg[] history (OpenAI-shaped, used by the agent
// loop) into Anthropic's messages + system pair.
// ---------------------------------------------------------------------------

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

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
      // Concatenate so we don't silently drop a mid-conversation system nudge.
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
        // Anthropic rejects empty assistant content. Skip the message —
        // losing an empty assistant turn doesn't affect the conversation.
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
      // Fold consecutive tool replies into the previous user message so each
      // assistant `tool_use` gets paired inside the same user turn.
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

// OpenAI tool schemas → Anthropic tool schemas. The JSON Schema payload itself
// is identical; only the outer envelope differs.
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
// Agent mode entry point. Wraps the Anthropic client in the loop's LLMCaller
// interface and exposes a streaming-progress runAgent() to the UI.
// ===========================================================================

const llmCaller: LLMCaller = {
  async chatWithTools(messages: ChatMsg[], tools, onTextDelta) {
    const anthropic = getClient();
    const { system, messages: amsgs } = convertChatHistory(messages);

    const stream = anthropic.messages.stream({
      model: getModel(),
      system,
      messages: amsgs,
      tools: convertTools(tools),
      temperature: 0.7,
      max_tokens: 1024,
    });

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

// Role-indexed canned snippets — used as the last-resort fallback so a flaky
// sub-LLM response never breaks the agent loop. Each must be a single chained
// Strudel expression (no stack wrap, no setcps, no semicolons).
const IMPROVISE_FALLBACKS: Record<string, string> = {
  drums: 's("bd ~ sd ~").bank("RolandTR808").gain(0.8)',
  hh: 's("hh*8").gain(0.5)',
  bass: 'note("c2 c2 eb2 f2").s("sawtooth").lpf(500).gain(0.7)',
  pad: 'n("0 2 4 7").scale("C4:minor").s("sine").attack(0.5).release(2).gain(0.4)',
  lead: 'n("<0 2 4 7 5 4>").scale("C4:minor").s("triangle").gain(0.5)',
  fx: 's("~ ~ ~ cp").room(0.5).gain(0.5)',
};

// Pull a Strudel snippet out of whatever shape the sub-LLM decided to return.
// Claude is relatively well-behaved with structured prompts but still varies,
// so we keep the same tolerant parser we used under the OpenAI-compat path:
//   1. strict JSON  `{"code": "..."}`
//   2. markdown-fenced JSON    ```json { "code": "..." } ```
//   3. unterminated JSON with a `"code": "..."` field we can regex out
//   4. bare code fence  ```js s("bd") ```
//   5. raw text that looks like a strudel expression (s(... / note(... / n(...)
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
    // Take everything up to the first line that clearly isn't expression-like
    // (e.g. trailing prose). A single-expression snippet typically has no blank
    // lines mid-way, so split on the first blank line.
    const firstChunk = trimmed.split(/\n\s*\n/)[0].trim();
    return firstChunk || trimmed;
  }

  return null;
}

async function improviseLLM(req: ImproviseRequest): Promise<string> {
  const { role, hints, currentCode, style, complementTask } = req;
  const anthropic = getClient();
  // Look up the per-role style hint from styles.ts so the sub-model gets
  // concrete guidance instead of just a bare style id.
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
      const resp = await anthropic.messages.create({
        model: getModel(),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.9,
        max_tokens: tokens,
      });
      return extractStrudelSnippet(extractText(resp));
    } catch (e) {
      console.warn('[improvise] upstream call errored', e);
      return null;
    }
  };

  const first = await tryCall(IMPROVISE_SYSTEM_PROMPT, 512);
  if (first) return first;

  // Retry with a looser prompt: ask for a raw expression, no JSON at all.
  const retryPrompt = [
    'You are a Strudel snippet generator.',
    'Output ONLY one single chained Strudel expression — no JSON, no markdown fences, no comments, no prose.',
    'Example output: s("bd ~ sd ~").bank("RolandTR808").gain(0.8)',
    'Rules: no stack wrapping, no setcps, no semicolons, no var/let/const.',
  ].join('\n');
  const second = await tryCall(retryPrompt, 512);
  if (second) return second;

  // Last resort — a safe canned snippet so the agent loop can keep progressing
  // instead of surfacing an "improvise 失败" error the user doesn't need to see.
  console.warn(`[improvise] falling back to canned snippet for role=${role}`);
  return IMPROVISE_FALLBACKS[role] ?? IMPROVISE_FALLBACKS.drums;
}

export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void,
  moodContext?: string,
): Promise<RunAgentResult> {
  const systemPrompt = moodContext
    ? `${AGENT_SYSTEM_PROMPT}\n\n${moodContext}`
    : AGENT_SYSTEM_PROMPT;

  const isMoodDemo = isDemoMode() && instruction === '根据我的心情生成音乐';
  const isPrefillDemo = isDemoMode() && instruction === DEMO_PREFILL;
  const staticScenario = resolveStaticSuggestionScenario(instruction);

  const llm = staticScenario
    ? createDemoLLMCaller(staticScenario)
    : isDemoMode()
      ? isMoodDemo
        ? createDemoMoodLLMCaller(DEMO_MOOD_SCENARIO)
        : isPrefillDemo
          ? createDemoMoodLLMCaller(DEMO_PREFILL_SCENARIO)
          : createDemoLLMCaller(resolveDemoScenario(instruction) ?? getActiveDemoSet()[0])
      : llmCaller;

  // 心情 demo 和灵感 demo 使用预写片段，跳过真实 LLM improvise 调用
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
  });
}

// Re-exported so callers don't need to reach into ../agent/loop directly.
export type { ProgressEvent, RunAgentResult } from '../agent/loop';

// Suppress the "unused import" warning if TS strips schema imports.
// (Schema is imported transitively but listed here for visibility.)
void getOpenAIToolSchemas;
