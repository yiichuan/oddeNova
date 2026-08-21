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
    ['high', 60000],
  ] as const)('maps %s to budget_tokens %d', (level, budget) => {
    expect(resolveAnthropicThinkingParam(level)).toEqual({ type: 'enabled', budget_tokens: budget });
  });
});

describe('resolveOpenAIThinkingParams — deepseek / official', () => {
  it.each([
    ['low', 'low'],
    ['medium', 'high'],
    ['high', 'max'],
  ] as const)('%s maps to reasoning_effort %s (DeepSeek\'s 3 real request-level values)', (level, effort) => {
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
        reasoning_effort: 'max',
      });
    }
  });
});

describe('resolveOpenAIThinkingParams — kimi', () => {
  it.each(['low', 'medium', 'high'] as const)('%s only enables thinking, never sends reasoning_effort', (level) => {
    const result = resolveOpenAIThinkingParams('kimi', 'kimi-k2.6', level);
    expect(result).toEqual({ thinking: { type: 'enabled' } });
    expect(result).not.toHaveProperty('reasoning_effort');
  });
});

describe('resolveOpenAIThinkingParams — openai', () => {
  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] as const)(
    '%s maps high to reasoning_effort "max" (full ladder incl. xhigh/max documented)',
    (model) => {
      expect(resolveOpenAIThinkingParams('openai', model, 'high')).toEqual({ reasoning_effort: 'max' });
    },
  );

  it.each(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'] as const)(
    '%s maps high to reasoning_effort "xhigh" (caps at xhigh, no max)',
    (model) => {
      expect(resolveOpenAIThinkingParams('openai', model, 'high')).toEqual({ reasoning_effort: 'xhigh' });
    },
  );

  it('unknown openai models keep high at reasoning_effort "high" (no xhigh support)', () => {
    expect(resolveOpenAIThinkingParams('openai', 'gpt-unknown', 'high')).toEqual({ reasoning_effort: 'high' });
  });

  it.each(['low', 'medium'] as const)('%s maps 1:1 to reasoning_effort', (level) => {
    expect(resolveOpenAIThinkingParams('openai', 'gpt-5.5', level)).toEqual({ reasoning_effort: level });
  });
});

describe('resolveOpenAIThinkingParams — glm', () => {
  it('glm-5.2: low/medium collapse to reasoning_effort "high"', () => {
    for (const level of ['low', 'medium'] as const) {
      expect(resolveOpenAIThinkingParams('glm', 'glm-5.2', level)).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      });
    }
  });

  it('glm-5.2: high maps to reasoning_effort "max"', () => {
    expect(resolveOpenAIThinkingParams('glm', 'glm-5.2', 'high')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
  });

  it.each(['glm-5.1', 'glm-5.1-air', 'glm-5'] as const)('%s only exposes the boolean thinking switch', (model) => {
    const result = resolveOpenAIThinkingParams('glm', model, 'high');
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
  it.each(['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5'] as const)(
    'anthropic %s supports all 3 levels (full budget ladder)',
    (model) => {
      expect(getSupportedThinkingLevels('anthropic', model)).toEqual(['low', 'medium', 'high']);
    },
  );

  it('anthropic claude-haiku-4-5 has no effort dial — no supported levels', () => {
    expect(getSupportedThinkingLevels('anthropic', 'claude-haiku-4-5')).toEqual([]);
  });

  it('deepseek-v4-flash supports all 3 levels (low/high/max are all distinct)', () => {
    expect(getSupportedThinkingLevels('deepseek', 'deepseek-v4-flash')).toEqual(['low', 'medium', 'high']);
    expect(getSupportedThinkingLevels('official', 'deepseek-v4-flash')).toEqual(['low', 'medium', 'high']);
  });

  it('deepseek-v4-pro only supports medium/high (low folds into high server-side)', () => {
    expect(getSupportedThinkingLevels('deepseek', 'deepseek-v4-pro')).toEqual(['medium', 'high']);
  });

  it('kimi has no tiering — no supported levels', () => {
    expect(getSupportedThinkingLevels('kimi', 'kimi-k2.6')).toEqual([]);
  });

  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-unknown'] as const)(
    'openai %s supports all 3 levels',
    (model) => {
      expect(getSupportedThinkingLevels('openai', model)).toEqual(['low', 'medium', 'high']);
    },
  );

  it('glm-5.2 only has 2 real tiers: medium and high', () => {
    expect(getSupportedThinkingLevels('glm', 'glm-5.2')).toEqual(['medium', 'high']);
  });

  it.each(['glm-5.1', 'glm-5.1-air', 'glm-5'] as const)('glm %s has no tiering — no supported levels', (model) => {
    expect(getSupportedThinkingLevels('glm', model)).toEqual([]);
  });
});

describe('clampThinkingLevel', () => {
  it('returns the level unchanged if it is already supported', () => {
    expect(clampThinkingLevel('high', ['low', 'medium', 'high'])).toBe('high');
  });

  it('returns the level unchanged if nothing is supported (no tiering to clamp to)', () => {
    expect(clampThinkingLevel('high', [])).toBe('high');
  });

  it('clamps up to the nearest higher supported level (glm-5.2 / deepseek-v4-pro start at medium)', () => {
    expect(clampThinkingLevel('low', ['medium', 'high'])).toBe('medium');
  });

  it('clamps down to the nearest lower supported level when nothing higher is supported', () => {
    expect(clampThinkingLevel('high', ['low', 'medium'])).toBe('medium');
  });
});
