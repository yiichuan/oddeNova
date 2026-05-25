// src/lib/__tests__/analytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '@vercel/analytics';
import {
  trackAgentRun,
  trackAgentError,
  trackAgentAbort,
  trackShare,
  trackWavExport,
} from '../analytics';

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trackAgentRun calls track with agent_run and all props', () => {
    const props = {
      provider: 'deepseek' as const,
      model: 'deepseek-v4-flash',
      iterations: 3,
      durationMs: 1200,
      committed: true,
    };
    trackAgentRun(props);
    expect(track).toHaveBeenCalledWith('agent_run', props);
  });

  it('trackAgentError calls track with agent_error and props', () => {
    const props = { provider: 'kimi', model: 'kimi-k2.6', error_type: 'TypeError' };
    trackAgentError(props);
    expect(track).toHaveBeenCalledWith('agent_error', props);
  });

  it('trackAgentAbort calls track with agent_abort', () => {
    trackAgentAbort();
    expect(track).toHaveBeenCalledWith('agent_abort');
  });

  it('trackShare calls track with share', () => {
    trackShare();
    expect(track).toHaveBeenCalledWith('share');
  });

  it('trackWavExport calls track with wav_export', () => {
    trackWavExport();
    expect(track).toHaveBeenCalledWith('wav_export');
  });

  it('trackAgentRun swallows exceptions from track()', () => {
    vi.mocked(track).mockImplementationOnce(() => { throw new Error('network'); });
    expect(() =>
      trackAgentRun({ provider: 'deepseek', model: 'deepseek-v4-flash', iterations: 1, durationMs: 100, committed: false })
    ).not.toThrow();
  });
});
