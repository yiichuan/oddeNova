import OpenAI from 'openai';
import { SYSTEM_PROMPT, buildUserMessage } from '../prompts/system-prompt';

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
