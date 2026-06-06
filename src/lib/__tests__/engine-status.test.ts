import { describe, expect, it } from 'vitest';

import { getEngineUnavailableMessage } from '../engine-status';

describe('getEngineUnavailableMessage', () => {
  it('returns retry guidance for failed engine status', () => {
    expect(getEngineUnavailableMessage('failed')).toBe('初始化失败，请点击重试按钮');
  });

  it('returns startup guidance for initializing engine status', () => {
    expect(getEngineUnavailableMessage('initializing')).toBe('音频引擎启动中，请稍后再试');
  });

  it('returns no message for ready engine status', () => {
    expect(getEngineUnavailableMessage('ready')).toBeNull();
  });
});
