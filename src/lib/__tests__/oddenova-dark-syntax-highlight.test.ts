import { describe, expect, it } from 'vitest';
import { ODDENOVA_DARK_SYNTAX_HIGHLIGHT_SPECS } from '../oddenova-dark-syntax-highlight';

describe('oddeNova Dark syntax highlight', () => {
  it('preserves the original Strudel theme rule granularity', () => {
    expect(ODDENOVA_DARK_SYNTAX_HIGHLIGHT_SPECS).toHaveLength(21);
  });
});
