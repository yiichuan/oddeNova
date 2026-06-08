// ===========================================================================
// LLM configuration file — centralised management of switchable models and API credentials.
//
// Provider routing rules：
//   anthropic  → legacy proxy (timesniper.club) + LEGACY_MODELS + VITE_API_KEY takes priority
//   deepseek   → api.deepseek.com + built-in model + localStorage vibe_api_key
//   kimi       → api.moonshot.cn  + built-in model + localStorage vibe_api_key
//   openai     → api.openai.com   + built-in model + localStorage vibe_api_key
//   official   → /api/official/v1 + built-in model + server OFFICIAL_API_KEY / VITE_API_KEY
//   glm        → open.bigmodel.cn + built-in model + localStorage vibe_api_key
//   not set     → official
// ===========================================================================

/** Provider protocol type; determines which SDK to use. */
export type Protocol = 'anthropic' | 'openai';

/** User-selectable provider ID. */
export type ProviderType =
  | 'deepseek'
  | 'kimi'
  | 'openai'
  | 'anthropic'
  | 'official'
  | 'glm';

export interface ProviderPreset {
  /** Display name */
  label: string;
  /** Built-in base URL */
  baseURL: string;
  /** Built-in model name, not visible to the user */
  model: string;
  /** Which SDK protocol to use */
  protocol: Protocol;
}

/** Built-in configuration for each provider; Base URL is not visible to the user. */
export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash', // current official model, supports function calling
    protocol: 'openai',
  },
  kimi: {
    label: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',         // model shown in the official tool-calling documentation examples
    protocol: 'openai',
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-5.5',           // current flagship model, supports Chat Completions API + function calling
    protocol: 'openai',
  },
  anthropic: {
    label: 'Anthropic',
    baseURL: 'https://api.anthropic.com', // display only; actual baseURL uses LEGACY_BASE_URL
    model: 'claude-opus-4-6',             // display only; actual model uses LEGACY_MODELS
    protocol: 'anthropic',
  },
  official: {
    label: '官方体验',
    baseURL: '/api/official/v1',
    model: 'deepseek-v4-pro',
    protocol: 'openai',
  },
  glm: {
    label: 'GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.1',
    protocol: 'openai',
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
// Anthropic / legacy-user path (kept unchanged)
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
// OpenAI-compat path (deepseek / kimi / openai / official / glm)
// ---------------------------------------------------------------------------

function resolveOpenAICompatConfig(
  provider: 'deepseek' | 'kimi' | 'openai' | 'official' | 'glm',
  apiKey: string,
): ModelConfig {
  const preset = PROVIDER_PRESETS[provider];
  const isOfficial = provider === 'official';
  return {
    provider,
    protocol: 'openai',
    apiKey: isOfficial ? 'official-proxy' : apiKey,
    baseURL: isOfficial ? resolveOfficialBaseURL() : (import.meta.env.VITE_BASE_URL || preset.baseURL),
    model:   preset.model,
  };
}

function resolveOfficialBaseURL(): string {
  if (typeof window === 'undefined') return PROVIDER_PRESETS.official.baseURL;
  return `${window.location.origin}${PROVIDER_PRESETS.official.baseURL}`;
}

// ---------------------------------------------------------------------------
// Provider normalisation (backwards compatible with old localStorage values)
// ---------------------------------------------------------------------------

export function normalizeProvider(raw: string | null): ProviderType {
  if (!raw) return 'official';
  if (raw in PROVIDER_PRESETS) return raw as ProviderType;
  // Legacy values 'openai-compat' / 'custom' / 'qiniu' all downgrade to official
  return 'official';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Read runtime configuration from environment variables or localStorage. */
export function getActiveModelConfig(): ModelConfig {
  const provider = normalizeProvider(localStorage.getItem('vibe_provider'));

  // Anthropic always uses the legacy proxy; VITE_API_KEY takes priority (convenient for local development)
  const anthropicKey =
    import.meta.env.VITE_API_KEY ||
    localStorage.getItem('vibe_api_key') ||
    '';

  if (provider === 'anthropic') {
    return resolveAnthropicConfig(anthropicKey);
  }

  if (provider === 'official') {
    return resolveOpenAICompatConfig(provider, 'official-proxy');
  }

  // 其他 provider 使用用户在 Modal 里填的 Key
  const userApiKey = localStorage.getItem('vibe_api_key') || '';

  // deepseek | kimi | openai | official | glm
  return resolveOpenAICompatConfig(provider, userApiKey);
}

/** Whether an API Key has already been configured. */
export function hasApiKeyConfigured(): boolean {
  const provider = normalizeProvider(localStorage.getItem('vibe_provider'));
  if (provider === 'official') return true;

  return !!(
    import.meta.env.VITE_API_KEY ||
    localStorage.getItem('vibe_api_key')
  );
}

// Backwards compatibility: some legacy code still references these exports
export type ModelKey = 'sonnet' | 'opus';
export const ACTIVE_MODEL: ModelKey = (() => {
  const env = import.meta.env.VITE_LLM_MODEL as string | undefined;
  return (env === 'sonnet' ? 'sonnet' : 'opus') as ModelKey;
})();
