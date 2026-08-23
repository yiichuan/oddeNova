import { describe, expect, it } from 'vitest';

import { getEngineUnavailableMessage } from '../engine-status';
import { t } from '../i18n';

describe('getEngineUnavailableMessage', () => {
  it('returns retry guidance for failed engine status', () => {
    expect(getEngineUnavailableMessage('failed')).toBe(t('engineFailedRetry'));
  });

  it('returns startup guidance for initializing engine status', () => {
    expect(getEngineUnavailableMessage('initializing')).toBe(t('engineStarting'));
  });

  it('returns no message for ready engine status', () => {
    expect(getEngineUnavailableMessage('ready')).toBeNull();
  });
});
