// Maps the user-facing Thinking level (see CONTEXT.md) to each provider's real
// request parameters. Providers differ sharply in what they can actually
// distinguish — see docs/superpowers/plans/2026-08-01-thinking-level-control.md
// for the research this table is based on. getSupportedThinkingLevels() below
// mirrors this collapsing so the UI only offers levels that produce a
// genuinely different request for the selected provider/model — models without
// an effort dial ([] from getSupportedThinkingLevels) don't show the control
// at all. There is deliberately no "off" level anywhere: thinking is always on.

import type { ThinkingLevel } from '../agent/loop';
import type { ProviderType } from './llm-config';

export const ANTHROPIC_THINKING_BUDGET: Record<ThinkingLevel, number> = {
  low: 2000,
  medium: 10000,
  high: 32000,
  extreme: 60000,
};

// DeepSeek only accepts three request-level effort values — low/high/max —
// which its backend then remaps per-model server-side (deepseek-v4-pro
// collapses low->high, so only high/max are genuinely distinct there;
// deepseek-v4-flash keeps low/high/max distinct). xhigh is NOT a valid
// DeepSeek request value.
const DEEPSEEK_EFFORT: Record<ThinkingLevel, string> = {
  low: 'low',
  medium: 'high',
  high: 'high',
  extreme: 'max',
};

// gpt-5.6-sol/terra/luna document a full low/medium/high/xhigh/max ladder;
// gpt-5.5 / gpt-5.4 / gpt-5.4-mini cap at xhigh. Shared between
// resolveOpenAIThinkingParams and getSupportedThinkingLevels so the two never
// drift apart.
const OPENAI_MAX_MODELS = new Set(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
const OPENAI_XHIGH_MODELS = new Set(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini']);

const ALL_LEVELS: readonly ThinkingLevel[] = ['low', 'medium', 'high', 'extreme'];

export function resolveAnthropicThinkingParam(
  level: ThinkingLevel,
): { type: 'enabled'; budget_tokens: number } {
  return { type: 'enabled', budget_tokens: ANTHROPIC_THINKING_BUDGET[level] };
}

/** Extra body fields to merge into an OpenAI-protocol chat.completions.create() call. */
export function resolveOpenAIThinkingParams(
  provider: ProviderType,
  model: string,
  level: ThinkingLevel,
): Record<string, unknown> {
  switch (provider) {
    case 'deepseek':
    case 'official':
      // See DEEPSEEK_EFFORT above: DeepSeek's only real request values are
      // low/high/max, remapped per-model server-side.
      return {
        thinking: { type: 'enabled' },
        reasoning_effort: DEEPSEEK_EFFORT[level],
      };
    case 'kimi':
      // kimi-k2.x (what this app ships — not k3) has no effort dial, and
      // Moonshot rejects requests that send `thinking` and `reasoning_effort`
      // together, so every level just enables thinking.
      return { thinking: { type: 'enabled' } };
    case 'openai': {
      // 'extreme' lands on the top tier the model actually documents: max for
      // gpt-5.6, xhigh for gpt-5.5 / gpt-5.4 / gpt-5.4-mini.
      if (level === 'extreme') {
        if (OPENAI_MAX_MODELS.has(model)) return { reasoning_effort: 'max' };
        if (OPENAI_XHIGH_MODELS.has(model)) return { reasoning_effort: 'xhigh' };
        return { reasoning_effort: 'high' };
      }
      return { reasoning_effort: level };
    }
    case 'glm':
      // Confirmed against Z.ai's own effort-mapping table: glm-5.2 only has 2
      // real tiers — low/medium/high all land on 'high', xhigh/max/ultracode
      // all land on 'max'. We send `thinking: { type: 'enabled' }` alongside
      // reasoning_effort (like deepseek/official) rather than relying on
      // thinking-on-by-default, since GLM (unlike Kimi) doesn't reject the
      // two fields sent together.
      // glm-5.1 / glm-5.1-air / glm-5 only expose the boolean thinking switch,
      // no reasoning_effort.
      if (model === 'glm-5.2') {
        return {
          thinking: { type: 'enabled' },
          reasoning_effort: level === 'extreme' ? 'max' : 'high',
        };
      }
      return { thinking: { type: 'enabled' } };
    case 'anthropic':
      // Anthropic never reaches this function (it uses resolveAnthropicThinkingParam) —
      // this case exists only so TypeScript's exhaustiveness check catches a future
      // ProviderType addition that forgets to handle Thinking level here.
      return {};
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/**
 * Which Thinking levels are actually distinct for this provider/model, mirroring the
 * collapsing documented in resolveOpenAIThinkingParams/resolveAnthropicThinkingParam
 * above — the UI should only offer levels that produce a different real request.
 * An empty array means the model has no effort dial at all (thinking is a plain
 * on/off switch), so the UI shouldn't render the control.
 */
export function getSupportedThinkingLevels(provider: ProviderType, model: string): readonly ThinkingLevel[] {
  switch (provider) {
    case 'anthropic':
      // Official models (docs.anthropic.com/en/docs/about-claude/models):
      // fable-5 / opus-5 / sonnet-5 all support the effort ladder; haiku-4-5
      // has no effort dial at all. Unknown model ids keep the full dial — the
      // legacy budget_tokens wire path still works for them.
      if (model.startsWith('claude-fable-5') || model.startsWith('claude-opus-5') ||
          model.startsWith('claude-sonnet-5')) {
        return ALL_LEVELS;
      }
      if (model.startsWith('claude-haiku-4-5')) return [];
      return ALL_LEVELS;
    case 'deepseek':
    case 'official':
      // deepseek-v4-pro collapses low->high server-side, so only high/max are
      // distinct there; v4-flash keeps low/high/max.
      return model === 'deepseek-v4-pro' ? ['high', 'extreme'] : ['low', 'high', 'extreme'];
    case 'kimi':
      return [];
    case 'openai':
      if (OPENAI_MAX_MODELS.has(model) || OPENAI_XHIGH_MODELS.has(model)) return ALL_LEVELS;
      return ['low', 'medium', 'high'];
    case 'glm':
      return model === 'glm-5.2' ? ['high', 'extreme'] : [];
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/**
 * Clamp `level` to the closest level actually offered for the current provider/model
 * (nearest higher first, then nearest lower), so a globally-stored preference like
 * 'extreme' still displays sensibly against a model that collapses it down to 'high',
 * and a stored 'medium' folds onto 'high' for DeepSeek (whose wire value for medium
 * IS high). Returns `level` unchanged if `supported` is empty (no tiering to clamp
 * to) or already contains it.
 */
export function clampThinkingLevel(level: ThinkingLevel, supported: readonly ThinkingLevel[]): ThinkingLevel {
  if (supported.length === 0 || supported.includes(level)) return level;
  const idx = ALL_LEVELS.indexOf(level);
  for (let i = idx + 1; i < ALL_LEVELS.length; i++) {
    if (supported.includes(ALL_LEVELS[i])) return ALL_LEVELS[i];
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (supported.includes(ALL_LEVELS[i])) return ALL_LEVELS[i];
  }
  return level;
}
