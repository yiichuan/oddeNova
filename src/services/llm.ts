import OpenAI from 'openai';
import {
  SYSTEM_PROMPT,
  buildUserMessage,
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
import { getOpenAIToolSchemas } from '../agent/tools';

export interface LLMResponse {
  code: string;
  explanation: string;
}

let client: OpenAI | null = null;

const DEEPSEEK_API_KEY = 'sk-b68931774d1a4c11a95559735a8e9306';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-chat';

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
      dangerouslyAllowBrowser: true,
    });
  }
  return client;
}

function getModel(): string {
  return DEEPSEEK_MODEL;
}

export async function generateMusic(
  instruction: string,
  currentCode: string
): Promise<LLMResponse> {
  const openai = getClient();
  const userMessage = buildUserMessage(instruction, currentCode);

  const response = await openai.chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM 返回为空');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      throw new Error('无法解析 LLM 返回的 JSON');
    }
  }

  if (!parsed.code || typeof parsed.code !== 'string') {
    throw new Error('LLM 返回格式错误：缺少 code 字段');
  }

  return {
    code: parsed.code,
    explanation: parsed.explanation || '已更新音乐',
  };
}

// ===========================================================================
// Agent mode entry point. Wraps the openai client in the loop's LLMCaller
// interface and exposes a streaming-progress runAgent() to the UI.
// ===========================================================================

const llmCaller: LLMCaller = {
  async chatWithTools(messages: ChatMsg[], tools) {
    const openai = getClient();
    const response = await openai.chat.completions.create({
      model: getModel(),
      // The OpenAI types require a discriminated union per role; cast via
      // unknown because our ChatMsg permits any role in one shape.
      messages: messages as unknown as Parameters<
        typeof openai.chat.completions.create
      >[0]['messages'],
      tools: tools as unknown as Parameters<
        typeof openai.chat.completions.create
      >[0]['tools'],
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1024,
    });
    const choice = response.choices[0];
    const msg = choice?.message;
    const toolCalls = (msg?.tool_calls || []).map((c) => {
      const fn = (c as { function?: { name?: string; arguments?: string } }).function;
      return {
        id: (c as { id: string }).id,
        name: fn?.name || '',
        arguments: fn?.arguments || '{}',
      };
    });
    return {
      content: msg?.content ?? null,
      toolCalls,
    };
  },
};

async function improviseLLM(
  role: string,
  hints: string,
  currentCode: string
): Promise<string> {
  const openai = getClient();
  const userPrompt = [
    `role: ${role}`,
    hints ? `hint: ${hints}` : '',
    currentCode ? `current code (for context):\n${currentCode}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const resp = await openai.chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: IMPROVISE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens: 256,
    response_format: { type: 'json_object' },
  });
  const text = resp.choices[0]?.message?.content || '';
  let parsed: { code?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!m) throw new Error('improvise 返回非 JSON');
    parsed = JSON.parse(m[1]);
  }
  if (typeof parsed.code !== 'string' || !parsed.code.trim()) {
    throw new Error('improvise 返回缺少 code');
  }
  return parsed.code;
}

export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void
): Promise<RunAgentResult> {
  return runAgentLoop({
    instruction,
    initialCode: currentCode,
    systemPrompt: AGENT_SYSTEM_PROMPT,
    llm: llmCaller,
    improviseLLM,
    onProgress,
  });
}

// Re-exported so callers don't need to reach into ../agent/loop directly.
export type { ProgressEvent, RunAgentResult } from '../agent/loop';

// Suppress the "unused import" warning if TS strips schema imports.
// (Schema is imported transitively but listed here for visibility.)
void getOpenAIToolSchemas;
