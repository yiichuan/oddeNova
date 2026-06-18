import { describe, expect, it } from 'vitest';
import { GREETINGS_EN, GREETINGS_ZH, pickGreeting } from '../greetings';

describe('pickGreeting', () => {
  it('always returns a non-empty string from one of the known pools', () => {
    const allKnown = new Set([...GREETINGS_ZH, ...GREETINGS_EN]);
    for (let i = 0; i < 50; i++) {
      const result = pickGreeting();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(allKnown.has(result)).toBe(true);
    }
  });

  it('has at least 6 candidates in each language pool', () => {
    expect(GREETINGS_ZH.length).toBeGreaterThanOrEqual(6);
    expect(GREETINGS_EN.length).toBeGreaterThanOrEqual(6);
  });
});
