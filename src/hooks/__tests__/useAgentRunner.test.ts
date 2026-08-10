import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentTurn } from '../useAgentRunner';
import type { AgentTurnDeps, AgentTurnInput } from '../useAgentRunner';
import type { RunAgentResult, ConversationTurn } from '../../services/llm';
import { t } from '../../lib/i18n';

// services/strudel pulls in the audio/soundfont chain (@kabelsalat/web) at module
// eval; cut it the same way tools.test.ts does. runAgent is injected per test anyway.
vi.mock('../../services/strudel', () => ({
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  validateCodeTranspiler: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

function makeResult(over: Partial<RunAgentResult> = {}): RunAgentResult {
  return { code: 'note("c3")', explanation: 'done', iterations: 1, committed: true, ...over };
}

/** A runAgent mock typed with the real arg tuple so `mock.calls[0][n]` is indexable. */
function makeRunAgent(impl: () => Promise<RunAgentResult> = async () => makeResult()) {
  return vi.fn(async (..._args: Parameters<AgentTurnDeps['runAgent']>) => impl());
}

/** Deps with sensible green-path defaults; override per test to steer one branch. */
function makeDeps(over: Partial<AgentTurnDeps> = {}): AgentTurnDeps {
  return {
    runAgent: vi.fn(async () => makeResult()),
    makeProgressHandler: () => () => {},
    play: vi.fn(async () => true),
    getStrudelError: () => null,
    setStrudelError: vi.fn(),
    engineStatus: () => 'ready',
    getCurrentId: () => 'S1',
    isCurrentSession: () => true,
    getCurrentCode: () => 'CURRENT',
    snapshotHistory: () => [],
    addUserMessage: vi.fn(),
    addAssistantMessage: vi.fn(),
    finalizeLastAssistantMessage: vi.fn(),
    setCurrentCode: vi.fn(),
    updateTokenStats: vi.fn(),
    setSessionSuggestions: vi.fn(),
    checkpointSession: vi.fn(async () => undefined),
    beginLoading: (id) => {
      void id;
      return new AbortController();
    },
    endLoading: vi.fn(),
    isCurrentController: () => true,
    resetSuggestions: vi.fn(),
    setCommitSuggestions: vi.fn(),
    clearRollbackPrefill: vi.fn(),
    getModelConfig: () => ({ provider: 'p', model: 'm' }),
    trackAgentTurnStarted: vi.fn(),
    trackAgentTurnFinished: vi.fn(),
    ...over,
  };
}

function makeInput(over: Partial<AgentTurnInput> = {}): AgentTurnInput {
  return { text: 'make a beat', entryPoint: 'text', includeHistory: true, ...over };
}

describe('runAgentTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not block the unified turn while the engine is still initializing', async () => {
    const deps = makeDeps({ engineStatus: () => 'initializing' });

    await runAgentTurn(makeInput(), deps);

    expect(deps.setStrudelError).not.toHaveBeenCalled();
    expect(deps.runAgent).toHaveBeenCalled();
  });

  it('adds the user message by default', async () => {
    const deps = makeDeps();
    await runAgentTurn(makeInput({ text: 'hello' }), deps);
    expect(deps.addUserMessage).toHaveBeenCalledWith('hello');
  });

  it('suppresses the user message when skipAddMessage is set', async () => {
    const deps = makeDeps();
    await runAgentTurn(makeInput({ skipAddMessage: true }), deps);
    expect(deps.addUserMessage).not.toHaveBeenCalled();
  });

  it('on the current session, plays then persists the generated code', async () => {
    const deps = makeDeps();
    await runAgentTurn(makeInput(), deps);
    expect(deps.play).toHaveBeenCalledWith('note("c3")');
    expect(deps.setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
    expect(deps.addAssistantMessage).toHaveBeenCalledWith('done', 'note("c3")', 'S1', {
      beforeCode: 'CURRENT',
      afterCode: 'note("c3")',
      playbackStatus: 'played',
    });
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
    expect(deps.checkpointSession).toHaveBeenCalledWith('S1');
  });

  it('persists the code even when playback fails — latest code is always the session truth', async () => {
    const deps = makeDeps({ play: vi.fn(async () => false), getStrudelError: () => 'bad node' });
    await runAgentTurn(makeInput(), deps);
    // always persist the newest code, regardless of whether it ran
    expect(deps.setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
    // and still surface the runtime error so the user knows it didn't play
    const call = (deps.addAssistantMessage as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe('note("c3")');
    expect(String(call[0])).toContain('bad node');
    expect(call[3]).toEqual({
      beforeCode: 'CURRENT',
      afterCode: 'note("c3")',
      playbackStatus: 'failed',
    });
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
  });

  it('on a background (non-current) session, persists without playing', async () => {
    const deps = makeDeps({ isCurrentSession: () => false });
    await runAgentTurn(makeInput(), deps);
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
    expect(deps.addAssistantMessage).toHaveBeenCalledWith('done', 'note("c3")', 'S1', {
      beforeCode: 'CURRENT',
      afterCode: 'note("c3")',
      playbackStatus: 'not_attempted',
    });
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
  });

  it('does not create a revision when code was not committed', async () => {
    const deps = makeDeps({ runAgent: vi.fn(async () => makeResult({ committed: false })) });

    await runAgentTurn(makeInput(), deps);

    expect(deps.addAssistantMessage).toHaveBeenCalledWith('done', 'note("c3")', 'S1');
  });

  it('surfaces next-step suggestions parsed from the explanation', async () => {
    const explanation = '搞定\n\n接下来可以：\n- 加鼓\n- 提速';
    const deps = makeDeps({ runAgent: vi.fn(async () => makeResult({ explanation })) });
    await runAgentTurn(makeInput(), deps);
    expect(deps.setCommitSuggestions).toHaveBeenCalledWith(['加鼓', '提速']);
    // the next-steps block is stripped from the chat message
    expect(deps.addAssistantMessage).toHaveBeenCalledWith('搞定', 'note("c3")', 'S1', {
      beforeCode: 'CURRENT',
      afterCode: 'note("c3")',
      playbackStatus: 'played',
    });
  });

  it('finalizes the streamed assistant message when the result carries no code', async () => {
    const deps = makeDeps({ runAgent: vi.fn(async () => makeResult({ code: '', explanation: 'hmm' })) });
    await runAgentTurn(makeInput(), deps);
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith('hmm', 'S1');
    expect(deps.addAssistantMessage).not.toHaveBeenCalled();
    expect(deps.setCurrentCode).not.toHaveBeenCalled();
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
  });

  it('falls back to the agentNoCode label when there is neither code nor explanation', async () => {
    const deps = makeDeps({ runAgent: vi.fn(async () => makeResult({ code: '', explanation: '' })) });
    await runAgentTurn(makeInput(), deps);
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(t('agentNoCode'), 'S1');
  });

  it('on abort, posts the interrupted message and skips playback', async () => {
    const controller = new AbortController();
    const deps = makeDeps({
      beginLoading: () => controller,
      runAgent: vi.fn(async () => {
        controller.abort();
        return makeResult();
      }),
    });
    await runAgentTurn(makeInput(), deps);
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(t('interrupted'), 'S1');
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.setCurrentCode).not.toHaveBeenCalled();
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
  });

  it('suppresses the interrupted message when the controller is stale', async () => {
    const controller = new AbortController();
    const deps = makeDeps({
      beginLoading: () => controller,
      isCurrentController: () => false,
      runAgent: vi.fn(async () => {
        controller.abort();
        return makeResult();
      }),
    });
    await runAgentTurn(makeInput(), deps);
    expect(deps.finalizeLastAssistantMessage).not.toHaveBeenCalled();
  });

  it('passes undefined history to runAgent when includeHistory is false', async () => {
    const runAgent = makeRunAgent();
    const deps = makeDeps({ runAgent, snapshotHistory: () => [{ role: 'user', content: 'old' }] });
    await runAgentTurn(makeInput({ includeHistory: false }), deps);
    expect(runAgent.mock.calls[0][5]).toBeUndefined();
  });

  it('passes the snapshot history to runAgent when includeHistory is true', async () => {
    const history: ConversationTurn[] = [{ role: 'user', content: 'old' }];
    const runAgent = makeRunAgent();
    const deps = makeDeps({ runAgent, snapshotHistory: () => history });
    await runAgentTurn(makeInput({ includeHistory: true }), deps);
    expect(runAgent.mock.calls[0][5]).toEqual(history);
  });

  it('prefers suppliedHistory over the snapshot', async () => {
    const supplied: ConversationTurn[] = [{ role: 'assistant', content: 'supplied' }];
    const runAgent = makeRunAgent();
    const deps = makeDeps({ runAgent, snapshotHistory: () => [{ role: 'user', content: 'snap' }] });
    await runAgentTurn(makeInput({ includeHistory: true, suppliedHistory: supplied }), deps);
    expect(runAgent.mock.calls[0][5]).toEqual(supplied);
  });

  it('uses initialCode as the agent input code when provided', async () => {
    const runAgent = makeRunAgent();
    const deps = makeDeps({ runAgent, getCurrentCode: () => 'CURRENT' });
    await runAgentTurn(makeInput({ initialCode: 'OVERRIDE' }), deps);
    expect(runAgent.mock.calls[0][1]).toBe('OVERRIDE');
    expect(deps.addAssistantMessage).toHaveBeenCalledWith('done', 'note("c3")', 'S1', {
      beforeCode: 'OVERRIDE',
      afterCode: 'note("c3")',
      playbackStatus: 'played',
    });
  });

  it('forwards moodContext to runAgent', async () => {
    const runAgent = makeRunAgent();
    const deps = makeDeps({ runAgent });
    await runAgentTurn(makeInput({ moodContext: 'feeling blue' }), deps);
    expect(runAgent.mock.calls[0][3]).toBe('feeling blue');
  });

  it('on a non-abort error, shows a retryable message and logs diagnostic details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = makeDeps({ runAgent: vi.fn(async () => { throw new Error('boom'); }) });

    await runAgentTurn(makeInput(), deps);

    expect(deps.setStrudelError).toHaveBeenCalledWith('boom');
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(t('agentResponseFailed'), 'S1');
    expect(consoleError).toHaveBeenCalledWith('[agent] Request failed', {
      provider: 'p',
      model: 'm',
      errorName: 'Error',
      errorMessage: 'boom',
    });
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('persists terminal metadata and messages before checkpointing', async () => {
    const deps = makeDeps({
      runAgent: vi.fn(async () => makeResult({
        explanation: '完成\n\n接下来可以：\n- 加贝斯',
        tokenUsage: { promptTokens: 12, systemEstimate: 3 },
      })),
    });

    await runAgentTurn(makeInput(), deps);

    const checkpointOrder = (
      deps.checkpointSession as ReturnType<typeof vi.fn>
    ).mock.invocationCallOrder[0];
    expect((deps.updateTokenStats as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan(checkpointOrder);
    expect((deps.setSessionSuggestions as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan(checkpointOrder);
    expect((deps.addAssistantMessage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan(checkpointOrder);
  });

  it('always ends the loading lifecycle with the controller it began', async () => {
    const controller = new AbortController();
    const deps = makeDeps({ beginLoading: () => controller });
    await runAgentTurn(makeInput(), deps);
    expect(deps.endLoading).toHaveBeenCalledWith('S1', controller);
  });

  it('does nothing past message-add when there is no current session', async () => {
    const deps = makeDeps({ getCurrentId: () => null });
    await runAgentTurn(makeInput(), deps);
    expect(deps.runAgent).not.toHaveBeenCalled();
    expect(deps.endLoading).not.toHaveBeenCalled();
    expect(deps.trackAgentTurnStarted).not.toHaveBeenCalled();
    expect(deps.trackAgentTurnFinished).not.toHaveBeenCalled();
  });

  it('captures one started event before the agent request with safe turn context', async () => {
    const priorHistory: ConversationTurn[] = [{ role: 'user', content: 'old turn' }];
    const trackAgentTurnStarted = vi.fn();
    const runAgent = vi.fn(async () => {
      expect(trackAgentTurnStarted).toHaveBeenCalledOnce();
      return makeResult();
    });
    const deps = makeDeps({
      runAgent,
      snapshotHistory: () => priorHistory,
      trackAgentTurnStarted,
    });

    await runAgentTurn(makeInput({ entryPoint: 'suggestion' }), deps);

    expect(trackAgentTurnStarted).toHaveBeenCalledWith({
      entry_point: 'suggestion',
      provider: 'p',
      model: 'm',
      has_existing_code: true,
      has_history: true,
    });
  });

  it('captures played exactly once after a committed current-session playback succeeds', async () => {
    const dateNow = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValue(1_450);
    const deps = makeDeps();

    await runAgentTurn(makeInput(), deps);

    expect(deps.trackAgentTurnFinished).toHaveBeenCalledOnce();
    expect(deps.trackAgentTurnFinished).toHaveBeenCalledWith({
      entry_point: 'text',
      provider: 'p',
      model: 'm',
      has_existing_code: true,
      has_history: false,
      outcome: 'played',
      duration_ms: 450,
      iterations: 1,
    });
    dateNow.mockRestore();
  });

  it.each([
    {
      outcome: 'generated',
      overrides: {
        isCurrentSession: () => false,
      },
    },
    {
      outcome: 'playback_failed',
      overrides: {
        play: vi.fn(async () => false),
      },
    },
    {
      outcome: 'not_committed',
      overrides: {
        runAgent: vi.fn(async () => makeResult({ committed: false })),
      },
    },
    {
      outcome: 'agent_failed',
      overrides: {
        runAgent: vi.fn(async () => { throw new Error('boom'); }),
      },
    },
  ] as const)('captures $outcome exactly once', async ({ outcome, overrides }) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = makeDeps(overrides);

    await runAgentTurn(makeInput({ entryPoint: 'retry' }), deps);

    expect(deps.trackAgentTurnFinished).toHaveBeenCalledOnce();
    expect(deps.trackAgentTurnFinished).toHaveBeenCalledWith(expect.objectContaining({
      entry_point: 'retry',
      outcome,
      iterations: outcome === 'agent_failed' ? 0 : 1,
    }));
    consoleError.mockRestore();
  });

  it('captures aborted exactly once when the completed request observes an aborted signal', async () => {
    const controller = new AbortController();
    const deps = makeDeps({
      beginLoading: () => controller,
      runAgent: vi.fn(async () => {
        controller.abort();
        return makeResult();
      }),
    });

    await runAgentTurn(makeInput({ entryPoint: 'mood', includeHistory: false }), deps);

    expect(deps.trackAgentTurnFinished).toHaveBeenCalledOnce();
    expect(deps.trackAgentTurnFinished).toHaveBeenCalledWith(expect.objectContaining({
      entry_point: 'mood',
      outcome: 'aborted',
      iterations: 1,
    }));
  });

  it('keeps Agent playback and persistence successful when analytics throws', async () => {
    const deps = makeDeps({
      trackAgentTurnStarted: vi.fn(() => { throw new Error('analytics start failed'); }),
      trackAgentTurnFinished: vi.fn(() => { throw new Error('analytics finish failed'); }),
    });

    await expect(runAgentTurn(makeInput(), deps)).resolves.toBeUndefined();

    expect(deps.play).toHaveBeenCalledWith('note("c3")');
    expect(deps.setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
  });
});
