import { describe, expect, it } from 'vitest';
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  resolveAnthropicThinkingParam,
  resolveOpenAIThinkingParams,
} from '../thinking-params';

describe('resolveAnthropicThinkingParam', () => {
  it.each([
    ['low', 2000],
    ['medium', 10000],
    ['high', 32000],
    ['extreme', 60000],
  ] as const)('maps %s to budget_tokens %d', (level, budget) => {
    expect(resolveAnthropicThinkingParam(level)).toEqual({ type: 'enabled', budget_tokens: budget });
  });
});

describe('resolveOpenAIThinkingParams — deepseek / official', () => {
  it.each([
    ['low', 'low'],
    ['medium', 'high'],
    ['high', 'xhigh'],
    ['extreme', 'max'],
  ] as const)('%s maps to reasoning_effort %s (DeepSeek\'s 4 real request-level values)', (level, effort) => {
    for (const provider of ['deepseek', 'official'] as const) {
      expect(resolveOpenAIThinkingParams(provider, 'deepseek-v4-flash', level)).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: effort,
      });
    }
  });

  it('the mapping is identical regardless of which deepseek model is passed (DeepSeek remaps per-model server-side)', () => {
    for (const model of ['deepseek-v4-flash', 'deepseek-v4-pro']) {
      expect(resolveOpenAIThinkingParams('deepseek', model, 'high')).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'xhigh',
      });
    }
  });
});

describe('resolveOpenAIThinkingParams — kimi', () => {
  it.each(['low', 'medium', 'high', 'extreme'] as const)('%s only enables thinking, never sends reasoning_effort', (level) => {
    const result = resolveOpenAIThinkingParams('kimi', 'kimi-k2.6', level);
    expect(result).toEqual({ thinking: { type: 'enabled' } });
    expect(result).not.toHaveProperty('reasoning_effort');
  });
});

describe('resolveOpenAIThinkingParams — openai', () => {
  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-mini'] as const)(
    '%s maps extreme to reasoning_effort "xhigh" (not "max", even though gpt-5.6 documents a max tier)',
    (model) => {
      expect(resolveOpenAIThinkingParams('openai', model, 'extreme')).toEqual({ reasoning_effort: 'xhigh' });
    },
  );

  it.each(['gpt-5.1', 'gpt-5'] as const)('%s collapses extreme to reasoning_effort "high" (no xhigh support)', (model) => {
    expect(resolveOpenAIThinkingParams('openai', model, 'extreme')).toEqual({ reasoning_effort: 'high' });
  });

  it.each(['low', 'medium', 'high'] as const)('%s maps 1:1 to reasoning_effort', (level) => {
    expect(resolveOpenAIThinkingParams('openai', 'gpt-5.5', level)).toEqual({ reasoning_effort: level });
  });
});

describe('resolveOpenAIThinkingParams — glm', () => {
  it('glm-5.2: low/medium/high collapse to reasoning_effort "high"', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(resolveOpenAIThinkingParams('glm', 'glm-5.2', level)).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      });
    }
  });

  it('glm-5.2: extreme maps to reasoning_effort "max"', () => {
    expect(resolveOpenAIThinkingParams('glm', 'glm-5.2', 'extreme')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
  });

  it.each(['glm-5.1', 'glm-5.1-air', 'glm-5'] as const)('%s only exposes the boolean thinking switch', (model) => {
    const result = resolveOpenAIThinkingParams('glm', model, 'extreme');
    expect(result).toEqual({ thinking: { type: 'enabled' } });
    expect(result).not.toHaveProperty('reasoning_effort');
  });
});

describe('resolveOpenAIThinkingParams — anthropic (unreachable in practice)', () => {
  it('returns an empty object rather than throwing', () => {
    expect(resolveOpenAIThinkingParams('anthropic', 'claude-sonnet-4-6', 'medium')).toEqual({});
  });
});

describe('getSupportedThinkingLevels', () => {
  it.each(['anthropic', 'deepseek', 'official'] as const)('%s always supports all 4 levels', (provider) => {
    expect(getSupportedThinkingLevels(provider, 'any-model')).toEqual(['low', 'medium', 'high', 'extreme']);
  });

  it('kimi has no tiering — no supported levels', () => {
    expect(getSupportedThinkingLevels('kimi', 'kimi-k2.6')).toEqual([]);
  });

  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-mini'] as const)(
    'openai %s supports all 4 levels',
    (model) => {
      expect(getSupportedThinkingLevels('openai', model)).toEqual(['low', 'medium', 'high', 'extreme']);
    },
  );

  it.each(['gpt-5.1', 'gpt-5'] as const)('openai %s only supports low/medium/high (no xhigh)', (model) => {
    expect(getSupportedThinkingLevels('openai', model)).toEqual(['low', 'medium', 'high']);
  });

  it('glm-5.2 only has 2 real tiers: high and extreme', () => {
    expect(getSupportedThinkingLevels('glm', 'glm-5.2')).toEqual(['high', 'extreme']);
  });

  it.each(['glm-5.1', 'glm-5.1-air', 'glm-5'] as const)('glm %s has no tiering — no supported levels', (model) => {
    expect(getSupportedThinkingLevels('glm', model)).toEqual([]);
  });
});

describe('clampThinkingLevel', () => {
  it('returns the level unchanged if it is already supported', () => {
    expect(clampThinkingLevel('high', ['low', 'medium', 'high', 'extreme'])).toBe('high');
  });

  it('returns the level unchanged if nothing is supported (no tiering to clamp to)', () => {
    expect(clampThinkingLevel('extreme', [])).toBe('extreme');
  });

  it('clamps down to the nearest lower supported level when the exact level is unsupported', () => {
    expect(clampThinkingLevel('extreme', ['low', 'medium', 'high'])).toBe('high');
  });

  it('clamps up to the nearest higher supported level when nothing lower is supported', () => {
    expect(clampThinkingLevel('low', ['high', 'extreme'])).toBe('high');
    expect(clampThinkingLevel('medium', ['high', 'extreme'])).toBe('high');
  });
});
