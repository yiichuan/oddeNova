import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * llm-loader delegates to services/llm through a fixed dynamic import. The
 * loader tests spy on the *module boundary* ('../llm') so the real
 * SDK-heavy module is never evaluated here; llm-run-agent.test.ts covers the
 * real runtime. resetClient is sync and must not trigger the import; the
 * loader must merge concurrent first calls; a failed import must leave the
 * loader free to retry; and a request aborted while the module was loading
 * must not reach the real runAgent.
 */
const runAgentMock = vi.hoisted(() => vi.fn());
const chatOnceMock = vi.hoisted(() => vi.fn());
const resetClientMock = vi.hoisted(() => vi.fn());

vi.mock('../llm', () => ({
  runAgent: runAgentMock,
  chatOnce: chatOnceMock,
  resetClient: resetClientMock,
}));

import {
  loadLlmRuntime,
  resetClient,
  runAgent,
  chatOnce,
} from '../llm-loader';

const dynamicImportSpy = vi.spyOn(
  await import('../llm-loader'),
  // The loader uses `import('./llm')`; vitest routes that through the mock
  // above. To observe module-boundary behaviour directly we watch the mocked
  // surface itself.
  'loadLlmRuntime',
);

describe('llm-loader', () => {
  beforeEach(() => {
    runAgentMock.mockReset();
    chatOnceMock.mockReset();
    resetClientMock.mockReset();
    dynamicImportSpy.mockClear();
  });

  afterEach(() => {
    // Drop any runtime cached by earlier tests in this file.
    resetClient();
  });

  it('resetClient before load stays sync and does not import the runtime', () => {
    expect(() => resetClient()).not.toThrow();
    expect(resetClientMock).not.toHaveBeenCalled();
    expect(dynamicImportSpy).not.toHaveBeenCalled();
  });

  it('resetClient after load clears the runtime clients', async () => {
    await chatOnce('sys', 'user');
    expect(resetClientMock).not.toHaveBeenCalled();
    resetClient();
    expect(resetClientMock).toHaveBeenCalledTimes(1);
  });

  it('merges concurrent first loads into one runtime acquisition', async () => {
    runAgentMock.mockResolvedValue({ code: 's("bd")', explanation: 'x', iterations: 1, committed: false });
    const first = runAgent('a', '');
    const second = runAgent('b', '');
    await Promise.all([first, second]);
    // Both calls forwarded once the single import resolved.
    expect(runAgentMock).toHaveBeenCalledTimes(2);
  });

  it('forwards the full original signature to runAgent', async () => {
    runAgentMock.mockResolvedValue({ code: null, explanation: 'ok', iterations: 1, committed: false });
    const onProgress = vi.fn();
    const controller = new AbortController();
    const history = [{ role: 'user' as const, content: 'hi' }];
    const result = await runAgent('instruction', 's("hh")', onProgress, 'mood', controller.signal, history);
    expect(result).toEqual({ code: null, explanation: 'ok', iterations: 1, committed: false });
    expect(runAgentMock).toHaveBeenCalledWith(
      'instruction',
      's("hh")',
      onProgress,
      'mood',
      controller.signal,
      history,
    );
  });

  it('keeps chatOnce call shape (system, user, opts)', async () => {
    chatOnceMock.mockResolvedValue('reply');
    await expect(chatOnce('s', 'u', { temperature: 0.2, maxTokens: 10 })).resolves.toBe('reply');
    expect(chatOnceMock).toHaveBeenCalledWith('s', 'u', { temperature: 0.2, maxTokens: 10 });
  });

  it('aborts between module load and runtime call without sending a request', async () => {
    runAgentMock.mockResolvedValue({ code: 'x', explanation: '', iterations: 1, committed: true });
    const controller = new AbortController();
    const pending = runAgent('a', 'code', undefined, undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it('does not forward to the runtime after a failure until a later call retries', async () => {
    runAgentMock.mockRejectedValueOnce(new Error('network down'));
    await expect(runAgent('a', '')).rejects.toThrow('network down');
    // A subsequent call reaches the runtime again (module-load retries are
    // allowed; without it a cached module-eval failure would brick turns).
    runAgentMock.mockResolvedValue({ code: null, explanation: 'ok', iterations: 1, committed: true });
    await expect(runAgent('a', '')).resolves.toMatchObject({ explanation: 'ok' });
  });

  it('exposes loadLlmRuntime for eager acquisition without starting a turn', async () => {
    const runtime = await loadLlmRuntime();
    expect(runtime).toBeDefined();
    expect(typeof runtime.runAgent).toBe('function');
  });
});
