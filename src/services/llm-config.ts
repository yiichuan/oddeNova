// ===========================================================================
// LLM 配置文件 —— 集中管理可切换的模型与 API 凭据。
//
// 切换模型的方式：把下面的 ACTIVE_MODEL 改成 MODELS 中任意一个 key。
// 例如：
//   export const ACTIVE_MODEL: ModelKey = 'sonnet';   // 用 claude-sonnet-4-6
//   export const ACTIVE_MODEL: ModelKey = 'opus';     // 用 claude-opus-4-6
//
// 也可以通过 Vite 环境变量 VITE_LLM_MODEL 覆盖（可选）。
//
// API Key 配置优先级（从高到低）：
//   1. 项目根目录 .env.local 中的 VITE_API_KEY（不提交 git）
//   2. localStorage['vibe_api_key']（弹窗填写后保存）
// ===========================================================================

export interface ModelConfig {
  /** 上游模型名（透传给 Anthropic 接口的 model 字段） */
  model: string;
  /** 接口 base URL */
  baseURL: string;
  /** API Key */
  apiKey: string;
}

const DEFAULT_BASE_URL = 'https://timesniper.club';

export const MODELS = {
  sonnet: {
    model: 'claude-sonnet-4-6',
    baseURL: DEFAULT_BASE_URL,
  },
  opus: {
    model: 'claude-opus-4-6',
    baseURL: DEFAULT_BASE_URL,
  },
} as const satisfies Record<string, { model: string; baseURL: string }>;

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

/** 从环境变量或 localStorage 读取运行时配置，合并到模型静态配置中。 */
export function getActiveModelConfig(): ModelConfig {
  const env = (import.meta as unknown as { env?: Record<string, string> })?.env ?? {};
  const base = MODELS[ACTIVE_MODEL];

  const apiKey =
    env['VITE_API_KEY'] ||
    localStorage.getItem('vibe_api_key') ||
    '';

  const baseURL =
    env['VITE_BASE_URL'] ||
    localStorage.getItem('vibe_base_url') ||
    base.baseURL;

  return { model: base.model, baseURL, apiKey };
}

/** 是否已有 API Key 配置（环境变量或 localStorage 任一非空即视为已配置）。 */
export function hasApiKeyConfigured(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string> })?.env ?? {};
  return !!(
    env['VITE_API_KEY'] ||
    localStorage.getItem('vibe_api_key')
  );
}
