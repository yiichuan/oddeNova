import { describe, expect, it } from 'vitest';
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  resolveAnthropicThinkingParam,
  resolveOpenAIClassificationParams,
  resolveOpenAIThinkingParams,
} from '../thinking-params';

describe('resolveAnthropicThinkingParam', () => {
  it.each([
    ['low', 2000],
    ['medium', 10000],
    ['high', 60000],
  ] as const)('maps %s to budget_tokens %d on the legacy extended-thinking path', (level, budget) => {
    expect(resolveAnthropicThinkingParam('claude-haiku-4-5', level)).toEqual({
      thinking: { type: 'enabled', budget_tokens: budget },
    });
  });

  it.each([
    'claude-opus-5',
    'claude-opus-5-5',
    'claude-fable-5-1',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-opus-4-8',
  ] as const)('%s uses the adaptive path with output_config.effort', (model) => {
    expect(resolveAnthropicThinkingParam(model, 'low')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
    });
    expect(resolveAnthropicThinkingParam(model, 'medium')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
    });
    expect(resolveAnthropicThinkingParam(model, 'high')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
    });
  });

  it('unknown anthropic models keep the legacy budget_tokens wire path', () => {
    expect(resolveAnthropicThinkingParam('claude-unknown', 'high')).toEqual({
      thinking: { type: 'enabled', budget_tokens: 60000 },
    });
  });
});

describe('resolveOpenAIThinkingParams — deepseek / official', () => {
  it.each([
    ['low', 'low'],
    ['medium', 'high'],
    ['high', 'max'],
  ] as const)('%s maps to reasoning_effort %s (DeepSeek\'s 3 real request-level values)', (level, effort) => {
    for (const provider of ['deepseek', 'official'] as const) {
      expect(resolveOpenAIThinkingParams(provider, 'deepseek-flash', level)).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: effort,
      });
    }
  });

  it('the mapping is identical regardless of which deepseek model is passed (DeepSeek remaps per-model server-side)', () => {
    for (const model of ['deepseek-flash', 'deepseek-v4-pro']) {
      expect(resolveOpenAIThinkingParams('deepseek', model, 'high')).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'max',
      });
    }
  });
});

describe('resolveOpenAIThinkingParams — kimi', () => {
  it.each(['low', 'medium', 'high'] as const)('kimi-k2.6 %s only enables thinking, never sends reasoning_effort', (level) => {
    const result = resolveOpenAIThinkingParams('kimi', 'kimi-k2.6', level);
    expect(result).toEqual({ thinking: { type: 'enabled' } });
    expect(result).not.toHaveProperty('reasoning_effort');
  });

  it.each([
    ['low', 'low'],
    ['medium', 'high'],
    ['high', 'max'],
  ] as const)('kimi-k3 %s maps to reasoning_effort %s, with no thinking field', (level, effort) => {
    const result = resolveOpenAIThinkingParams('kimi', 'kimi-k3', level);
    expect(result).toEqual({ reasoning_effort: effort });
    expect(result).not.toHaveProperty('thinking');
  });

  it.each(['low', 'medium', 'high'] as const)('kimi-k2.7-code %s sends neither thinking nor reasoning_effort', (level) => {
    expect(resolveOpenAIThinkingParams('kimi', 'kimi-k2.7-code', level)).toEqual({});
  });
});

describe('resolveOpenAIClassificationParams (enableThinking=false)', () => {
  it('kimi-k3 uses its lowest effective strength (reasoning_effort low, no thinking field)', () => {
    expect(resolveOpenAIClassificationParams('kimi', 'kimi-k3')).toEqual({ reasoning_effort: 'low' });
  });

  it('glm-5.3 uses its lowest effective strength', () => {
    expect(resolveOpenAIClassificationParams('glm', 'glm-5.3')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });
  });

  it('kimi-k2.7-code sends nothing (it always thinks and rejects explicit control)', () => {
    expect(resolveOpenAIClassificationParams('kimi', 'kimi-k2.7-code')).toEqual({});
  });

  it('everything else keeps thinking fully off (empty params)', () => {
    expect(resolveOpenAIClassificationParams('deepseek', 'deepseek-flash')).toEqual({});
    expect(resolveOpenAIClassificationParams('kimi', 'kimi-k2.6')).toEqual({});
    expect(resolveOpenAIClassificationParams('glm', 'glm-5.2')).toEqual({});
    expect(resolveOpenAIClassificationParams('openai', 'gpt-5.5')).toEqual({});
    expect(resolveOpenAIClassificationParams('official', 'deepseek-flash')).toEqual({});
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

  it.each(['gpt-5.1', 'gpt-5'] as const)('%s maps high to reasoning_effort "high" (no xhigh support)', (model) => {
    expect(resolveOpenAIThinkingParams('openai', model, 'high')).toEqual({ reasoning_effort: 'high' });
  });

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

  it('glm-5.3 maps low/medium/high onto its low/high/max intensities', () => {
    expect(resolveOpenAIThinkingParams('glm', 'glm-5.3', 'low')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });
    expect(resolveOpenAIThinkingParams('glm', 'glm-5.3', 'medium')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
    expect(resolveOpenAIThinkingParams('glm', 'glm-5.3', 'high')).toEqual({
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
  it.each(['claude-fable-5-1', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-opus-4-8'] as const)(
    'anthropic %s supports all 3 levels (adaptive effort ladder)',
    (model) => {
      expect(getSupportedThinkingLevels('anthropic', model)).toEqual(['low', 'medium', 'high']);
    },
  );

  it('anthropic claude-haiku-4-5 has no effort dial — no supported levels', () => {
    expect(getSupportedThinkingLevels('anthropic', 'claude-haiku-4-5')).toEqual([]);
  });

  it('deepseek-flash supports all 3 levels (low/high/max are all distinct)', () => {
    expect(getSupportedThinkingLevels('deepseek', 'deepseek-flash')).toEqual(['low', 'medium', 'high']);
    expect(getSupportedThinkingLevels('official', 'deepseek-flash')).toEqual(['low', 'medium', 'high']);
  });

  it('deepseek-v4-pro only supports medium/high (low folds into high server-side)', () => {
    expect(getSupportedThinkingLevels('deepseek', 'deepseek-v4-pro')).toEqual(['medium', 'high']);
  });

  it('kimi-k3 supports all 3 levels', () => {
    expect(getSupportedThinkingLevels('kimi', 'kimi-k3')).toEqual(['low', 'medium', 'high']);
  });

  it.each(['kimi-k2.6', 'kimi-k2.7-code'] as const)('kimi %s has no tiering — no supported levels', (model) => {
    expect(getSupportedThinkingLevels('kimi', model)).toEqual([]);
  });

  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.1', 'gpt-5', 'gpt-unknown'] as const)(
    'openai %s supports all 3 levels',
    (model) => {
      expect(getSupportedThinkingLevels('openai', model)).toEqual(['low', 'medium', 'high']);
    },
  );

  it('glm-5.2 only has 2 real tiers: medium and high', () => {
    expect(getSupportedThinkingLevels('glm', 'glm-5.2')).toEqual(['medium', 'high']);
  });

  it('glm-5.3 distinguishes all three stops', () => {
    expect(getSupportedThinkingLevels('glm', 'glm-5.3')).toEqual(['low', 'medium', 'high']);
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
