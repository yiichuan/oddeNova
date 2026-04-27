// ===========================================================================
// LLM 配置文件 —— 集中管理可切换的模型与 API 凭据。
//
// Provider 路由规则：
//   anthropic  → 旧版代理 (timesniper.club) + LEGACY_MODELS + VITE_API_KEY 优先
//   deepseek   → api.deepseek.com + 内置模型 + localStorage vibe_api_key
//   kimi       → api.moonshot.cn  + 内置模型 + localStorage vibe_api_key
//   openai     → api.openai.com   + 内置模型 + localStorage vibe_api_key
//   未设置     → 同 anthropic（向后兼容旧用户）
// ===========================================================================

/** Provider 协议类型，决定使用哪套 SDK。 */
export type Protocol = 'anthropic' | 'openai';

/** 用户可选择的服务商 ID。 */
export type ProviderType =
  | 'deepseek'
  | 'kimi'
  | 'openai'
  | 'anthropic';

export interface ProviderPreset {
  /** 显示名称 */
  label: string;
  /** 内置 Base URL */
  baseURL: string;
  /** 内置模型名，对用户不可见 */
  model: string;
  /** 使用哪套 SDK 协议 */
  protocol: Protocol;
}

/** 各服务商的内置配置，Base URL 对用户不可见。 */
export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash', // 官方当前模型，支持 function calling
    protocol: 'openai',
  },
  kimi: {
    label: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',         // 官方工具调用文档示例模型
    protocol: 'openai',
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-5.5',           // 当前旗舰，支持 Chat Completions API + function calling
    protocol: 'openai',
  },
  anthropic: {
    label: 'Anthropic',
    baseURL: 'https://api.anthropic.com', // 仅作展示用；实际 baseURL 走 LEGACY_BASE_URL
    model: 'claude-opus-4-6',             // 仅作展示用；实际 model 走 LEGACY_MODELS
    protocol: 'anthropic',
  },
};

export interface ModelConfig {
  model: string;
  baseURL: string;
  apiKey: string;
  provider: ProviderType;
  protocol: Protocol;
}

// ---------------------------------------------------------------------------
// Anthropic / 旧用户 路径（保持不变）
// ---------------------------------------------------------------------------

const LEGACY_BASE_URL = 'https://timesniper.club';

const LEGACY_MODELS: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6',
};

function resolveAnthropicConfig(apiKey: string): ModelConfig {
  const envModel = import.meta.env.VITE_LLM_MODEL as string | undefined;
  const legacyModel = envModel ? (LEGACY_MODELS[envModel] ?? envModel) : '';
  return {
    provider: 'anthropic',
    protocol: 'anthropic',
    apiKey,
    baseURL: import.meta.env.VITE_BASE_URL || localStorage.getItem('vibe_base_url') || LEGACY_BASE_URL,
    model:   legacyModel || LEGACY_MODELS['sonnet'],
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compat 路径（deepseek / kimi / openai）
// ---------------------------------------------------------------------------

function resolveOpenAICompatConfig(
  provider: 'deepseek' | 'kimi' | 'openai',
  apiKey: string,
): ModelConfig {
  const preset = PROVIDER_PRESETS[provider];
  return {
    provider,
    protocol: 'openai',
    apiKey,
    baseURL: import.meta.env.VITE_BASE_URL || preset.baseURL,
    model:   preset.model,
  };
}

// ---------------------------------------------------------------------------
// Provider 规范化（向后兼容旧 localStorage 值）
// ---------------------------------------------------------------------------

function normalizeProvider(raw: string | null): ProviderType {
  if (!raw) return 'anthropic';
  if (raw in PROVIDER_PRESETS) return raw as ProviderType;
  // 旧版 'openai-compat' / 'custom' 均降级为 anthropic
  return 'anthropic';
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/** 从环境变量或 localStorage 读取运行时配置。 */
export function getActiveModelConfig(): ModelConfig {
  const provider = normalizeProvider(localStorage.getItem('vibe_provider'));

  // Anthropic 始终走旧代理；VITE_API_KEY 优先（方便本地开发）
  const anthropicKey =
    import.meta.env.VITE_API_KEY ||
    localStorage.getItem('vibe_api_key') ||
    '';

  if (provider === 'anthropic') {
    return resolveAnthropicConfig(anthropicKey);
  }

  // 其他 provider 使用用户在 Modal 里填的 Key
  const userApiKey = localStorage.getItem('vibe_api_key') || '';

  // deepseek | kimi | openai
  return resolveOpenAICompatConfig(provider, userApiKey);
}

/** 是否已有 API Key 配置。 */
export function hasApiKeyConfigured(): boolean {
  return !!(
    import.meta.env.VITE_API_KEY ||
    localStorage.getItem('vibe_api_key')
  );
}

// 向后兼容：部分旧代码仍引用这些导出
export type ModelKey = 'sonnet' | 'opus';
export const ACTIVE_MODEL: ModelKey = (() => {
  const env = import.meta.env.VITE_LLM_MODEL as string | undefined;
  return (env === 'sonnet' ? 'sonnet' : 'opus') as ModelKey;
})();
