// ===========================================================================
// LLM 配置文件 —— 集中管理可切换的模型与 API 凭据。
//
// 切换模型的方式：把下面的 ACTIVE_MODEL 改成 MODELS 中任意一个 key。
// 例如：
//   export const ACTIVE_MODEL: ModelKey = 'sonnet';   // 用 claude-sonnet-4-6
//   export const ACTIVE_MODEL: ModelKey = 'opus';     // 用 claude-opus-4-6
//
// 也可以通过 Vite 环境变量 VITE_LLM_MODEL 覆盖（可选）。
// ===========================================================================

export interface ModelConfig {
  /** 上游模型名（透传给 Anthropic 接口的 model 字段） */
  model: string;
  /** 接口 base URL */
  baseURL: string;
  /** API Key */
  apiKey: string;
}

export const MODELS = {
  sonnet: {
    model: 'claude-sonnet-4-6',
    baseURL: 'https://timesniper.club',
    apiKey: 'sk-bQJ3QzB4h6b3u5aRGuvd8XTXG0jD1KDsWMtJgtLGcQjGArvR',
  },
  opus: {
    model: 'claude-opus-4-6',
    baseURL: 'https://timesniper.club',
    apiKey: 'sk-bQJ3QzB4h6b3u5aRGuvd8XTXG0jD1KDsWMtJgtLGcQjGArvR',
  },
} as const satisfies Record<string, ModelConfig>;

export type ModelKey = keyof typeof MODELS;

// 默认使用的模型 —— 改这里就能切换全局模型。
const DEFAULT_MODEL: ModelKey = 'opus';

// 允许通过 Vite 环境变量覆盖（如 .env.local 里 VITE_LLM_MODEL=opus）。
function resolveActiveKey(): ModelKey {
  const envKey = (import.meta as unknown as { env?: Record<string, string> })?.env
    ?.VITE_LLM_MODEL as ModelKey | undefined;
  if (envKey && envKey in MODELS) return envKey;
  return DEFAULT_MODEL;
}

export const ACTIVE_MODEL: ModelKey = resolveActiveKey();

export function getActiveModelConfig(): ModelConfig {
  return MODELS[ACTIVE_MODEL];
}
