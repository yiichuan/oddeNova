// Maps the user-facing Thinking level (see CONTEXT.md) to each provider's real
// request parameters. Providers differ sharply in what they can actually
// distinguish — see docs/superpowers/plans/2026-08-01-thinking-level-control.md
// for the research this table is based on. Where a provider/model can't
// distinguish a level, multiple UI levels intentionally collapse to the same
// wire behavior; the UI still always shows all four levels.

import type { ThinkingLevel } from '../agent/loop';
import type { ProviderType } from './llm-config';

export const ANTHROPIC_THINKING_BUDGET: Record<ThinkingLevel, number> = {
  low: 2000,
  medium: 10000,
  high: 32000,
  extreme: 60000,
};

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
      // DeepSeek's reasoning_effort only distinguishes 'high' and 'max' natively;
      // low/medium are accepted but silently mapped to 'high' server-side.
      // https://api-docs.deepseek.com/guides/thinking_mode/
      return {
        thinking: { type: 'enabled' },
        reasoning_effort: level === 'extreme' ? 'max' : 'high',
      };
    case 'kimi':
      // kimi-k2.x (what this app ships — not k3) has no effort dial, and
      // Moonshot rejects requests that send `thinking` and `reasoning_effort`
      // together, so every level just enables thinking.
      return { thinking: { type: 'enabled' } };
    case 'openai': {
      // gpt-5.5 / gpt-5.5-mini document an 'xhigh' tier above 'high'; gpt-5.1 /
      // gpt-5 only document low/medium/high.
      const supportsXHigh = model === 'gpt-5.5' || model === 'gpt-5.5-mini';
      if (level === 'extreme') return { reasoning_effort: supportsXHigh ? 'xhigh' : 'high' };
      return { reasoning_effort: level };
    }
    case 'glm':
      // glm-5.2 supports reasoning_effort (two-tier: high/max) and, per Z.ai's
      // docs, thinking is on by default — but we send `thinking: { type:
      // 'enabled' }` explicitly anyway (like deepseek/official) rather than
      // relying on that default, since GLM (unlike Kimi) doesn't reject the two
      // fields sent together.
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
