import { describe, expect, it } from 'vitest';
import { MOBILE_TOP_ACTIONS } from '../mobileTopActions';

describe('TopActionBar mobile menu', () => {
  it('keeps the requested mobile menu actions in order', () => {
    expect(MOBILE_TOP_ACTIONS.map((action) => action.labelZh)).toEqual([
      '设置',
      '分享',
      '导出',
      '学习',
      'GitHub',
    ]);
  });
});
