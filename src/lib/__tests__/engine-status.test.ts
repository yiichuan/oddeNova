import { describe, expect, it } from 'vitest';

import { getEngineUnavailableMessage } from '../engine-status';

describe('getEngineUnavailableMessage', () => {
  it('returns retry guidance for failed engine status', () => {
    expect(getEngineUnavailableMessage('failed')).toBe('Engine init failed — click retry');
  });

  it('returns startup guidance for initializing engine status', () => {
    expect(getEngineUnavailableMessage('initializing')).toBe('Audio engine starting, please try again later');
  });

  it('returns no message for ready engine status', () => {
    expect(getEngineUnavailableMessage('ready')).toBeNull();
  });
});
