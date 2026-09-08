import { describe, expect, it } from 'vitest';
import { titleSearchPattern } from '../../server/session-search';

describe('titleSearchPattern', () => {
  it('treats an empty search as no filter', () => {
    expect(titleSearchPattern(undefined)).toBeNull();
    expect(titleSearchPattern('  ')).toBeNull();
  });

  it('trims and escapes a literal substring', () => {
    expect(titleSearchPattern('  雨 Bass  ')).toBe('雨 Bass');
    expect(titleSearchPattern('a.*[b](c)|d?')).toBe('a\\.\\*\\[b\\]\\(c\\)\\|d\\?');
    expect(titleSearchPattern('100%_')).toBe('100%_');
  });
});
