/**
 * 各模型上下文窗口大小（token 数）。
 * 按前缀匹配：先精确匹配，再前缀匹配，未命中时回退 128K。
 */
const MODEL_CONTEXT_SIZES: Array<{ prefix: string; size: number }> = [
  // Anthropic
  { prefix: 'claude-3-5-sonnet', size: 200_000 },
  { prefix: 'claude-3-5-haiku', size: 200_000 },
  { prefix: 'claude-3-opus', size: 200_000 },
  { prefix: 'claude-3-sonnet', size: 200_000 },
  { prefix: 'claude-3-haiku', size: 200_000 },
  { prefix: 'claude-opus', size: 1_000_000 },
  { prefix: 'claude-sonnet', size: 1_000_000 },
  { prefix: 'claude-haiku', size: 200_000 },
  { prefix: 'claude', size: 200_000 },
  // DeepSeek
  { prefix: 'deepseek-v3', size: 131_072 },
  { prefix: 'deepseek-v4', size: 1_000_000 },
  { prefix: 'deepseek-r1', size: 131_072 },
  { prefix: 'deepseek-chat', size: 131_072 }, // deepseek-chat = DeepSeek V3
  { prefix: 'deepseek', size: 131_072 },
  // Kimi / Moonshot
  { prefix: 'kimi-k2', size: 262_144 },
  { prefix: 'moonshot-v1-128k', size: 131_072 },
  { prefix: 'moonshot-v1-32k', size: 32_768 },
  { prefix: 'moonshot-v1-8k', size: 8_192 },
  { prefix: 'kimi', size: 262_144 },
  { prefix: 'moonshot', size: 131_072 },
  // OpenAI
  { prefix: 'gpt-4o', size: 128_000 },
  { prefix: 'gpt-4-turbo', size: 128_000 },
  { prefix: 'gpt-4', size: 128_000 },
  { prefix: 'gpt-3.5-turbo', size: 16_385 },
  { prefix: 'o1-mini', size: 128_000 },
  { prefix: 'o1-preview', size: 128_000 },
  { prefix: 'o1', size: 200_000 },
  { prefix: 'o3-mini', size: 200_000 },
  { prefix: 'o3', size: 200_000 },
  // GLM
  { prefix: 'glm-4', size: 128_000 },
  { prefix: 'glm-3', size: 128_000 },
  { prefix: 'glm-5', size: 200_000 },
];

const DEFAULT_CONTEXT_SIZE = 128_000;

export function getContextWindowSize(modelId: string): number {
  const lower = modelId.toLowerCase();
  for (const { prefix, size } of MODEL_CONTEXT_SIZES) {
    if (lower.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_SIZE;
}
