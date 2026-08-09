// ===========================================================================
// LLM configuration file — centralised management of switchable models and API credentials.
//
// Provider routing rules：
//   anthropic  → api.anthropic.com + LEGACY_MODELS + VITE_API_KEY takes priority
//   deepseek   → api.deepseek.com + built-in model + localStorage vibe_api_key
//   kimi       → api.moonshot.cn  + built-in model + localStorage vibe_api_key
//   openai     → api.openai.com   + built-in model + localStorage vibe_api_key
//   official   → /api/official/v1 + built-in model + server OFFICIAL_API_KEY / VITE_API_KEY
//   glm        → open.bigmodel.cn + built-in model + localStorage vibe_api_key
//   not set     → official
// ===========================================================================

import { t } from '../lib/i18n';

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
  /** User-selectable models for this provider; first item is the default. Omitted for providers without manual model selection (official). */
  models?: string[];
  /** Non-secret example showing the provider's API key shape. */
  apiKeyPlaceholder?: string;
}

/** Built-in configuration for each provider; Base URL is not visible to the user. */
export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash', // current official model, supports function calling
    protocol: 'openai',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    apiKeyPlaceholder: 'sk-…',
  },
  kimi: {
    label: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',         // model shown in the official tool-calling documentation examples
    protocol: 'openai',
    models: ['kimi-k2.6', 'kimi-k2.5'],
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-5.5',           // current flagship model, supports Chat Completions API + function calling
    protocol: 'openai',
    models: ['gpt-5.5', 'gpt-5.5-mini', 'gpt-5.1', 'gpt-5'],
    apiKeyPlaceholder: 'sk-…',
  },
  anthropic: {
    label: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-opus-4-6',             // display only; actual model uses LEGACY_MODELS
    protocol: 'anthropic',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
    apiKeyPlaceholder: 'sk-ant-api…',
  },
  official: {
    label: t('officialLabel'),
    baseURL: '/api/official/v1',
    model: 'deepseek-v4-flash',
    protocol: 'openai',
  },
  glm: {
    label: 'GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.2',
    protocol: 'openai',
    models: ['glm-5.2', 'glm-5.1', 'glm-5.1-air', 'glm-5'],
    apiKeyPlaceholder: 'id.secret',
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
// Anthropic path
// ---------------------------------------------------------------------------

function resolveAnthropicConfig(apiKey: string): ModelConfig {
  return {
    provider: 'anthropic',
    protocol: 'anthropic',
    apiKey,
    baseURL: import.meta.env.VITE_BASE_URL || PROVIDER_PRESETS.anthropic.baseURL,
    model:   getSelectedModel('anthropic'),
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
    model:   getSelectedModel(provider),
  };
}

function resolveOfficialBaseURL(): string {
  if (typeof window === 'undefined') return PROVIDER_PRESETS.official.baseURL;
  return `${window.location.origin}${PROVIDER_PRESETS.official.baseURL}`;
}

// ---------------------------------------------------------------------------
// User-selected model (per provider, persisted in localStorage)
// ---------------------------------------------------------------------------

/** Resolve the model to use for `provider`, honouring a user override if valid. */
export function getSelectedModel(provider: ProviderType): string {
  const preset = PROVIDER_PRESETS[provider];
  const override = localStorage.getItem(`vibe_model_${provider}`);
  if (override && preset.models?.includes(override)) {
    return override;
  }
  if (provider === 'anthropic') {
    const envModel = import.meta.env.VITE_LLM_MODEL as string | undefined;
    return envModel || 'claude-sonnet-4-6';
  }
  return preset.model;
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

  // Other providers use the key entered by the user in the Modal
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
