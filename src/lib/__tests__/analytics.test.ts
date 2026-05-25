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

  it('trackAgentRun 调用 track，事件名为 agent_run 且携带所有属性', () => {
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

  it('trackAgentError 调用 track，事件名为 agent_error 且携带属性', () => {
    const props = { provider: 'kimi', model: 'kimi-k2.6', error_type: 'TypeError' };
    trackAgentError(props);
    expect(track).toHaveBeenCalledWith('agent_error', props);
  });

  it('trackAgentAbort 调用 track，事件名为 agent_abort', () => {
    trackAgentAbort();
    expect(track).toHaveBeenCalledWith('agent_abort');
  });

  it('trackShare 调用 track，事件名为 share', () => {
    trackShare();
    expect(track).toHaveBeenCalledWith('share');
  });

  it('trackWavExport 调用 track，事件名为 wav_export', () => {
    trackWavExport();
    expect(track).toHaveBeenCalledWith('wav_export');
  });

  it.each([
    ['trackAgentRun', () => trackAgentRun({ provider: 'deepseek', model: 'deepseek-v4-flash', iterations: 1, durationMs: 100, committed: false })],
    ['trackAgentError', () => trackAgentError({ provider: 'kimi', model: 'kimi-k2.6', error_type: 'TypeError' })],
    ['trackAgentAbort', () => trackAgentAbort()],
    ['trackShare', () => trackShare()],
    ['trackWavExport', () => trackWavExport()],
  ] as const)('%s 吞掉 track() 抛出的异常', (_name, fn) => {
    vi.mocked(track).mockImplementationOnce(() => { throw new Error('network'); });
    expect(fn).not.toThrow();
  });
});
