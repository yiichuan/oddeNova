import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentTurnDeps, runAgentTurn } from '../useAgentRunner';
import type { AgentTurnDeps, AgentTurnInput, UseAgentRunnerConfig } from '../useAgentRunner';
import type { RunAgentResult, ConversationTurn } from '../../services/llm';
import { t } from '../../lib/i18n';
import { hummingAttachment } from '../../lib/__tests__/fixtures/humming';

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

  it('marks messages sent from a stepwise choice', async () => {
    const deps = makeDeps();
    const text = 'Add a bass line';
    await runAgentTurn(makeInput({ text, selectedChoice: true, entryPoint: 'suggestion' }), deps);
    expect(deps.addUserMessage).toHaveBeenCalledWith(text, undefined, true);
  });

  it('warns about the missing take style and still hands the humming batch to the composer', async () => {
    const onProgress = vi.fn();
    const runAgent = makeRunAgent();
    const deps = makeDeps({ runAgent, makeProgressHandler: () => onProgress });
    const first = hummingAttachment();
    const second = { ...first, id: '22222222-2222-4222-8222-222222222222' };
    const humming = { ...first, understanding: { melodyStyle: 'Folk' }, additionalTakes: [second] };

    await runAgentTurn(makeInput({ text: 'arrange both takes', humming }), deps);

    expect(onProgress).toHaveBeenCalledWith({
      kind: 'warn', message: `${t('hummingStyleAnalysisFailed')} (02)`,
    });
    expect(runAgent.mock.calls[0][0]).toContain('arrange both takes');
    expect(runAgent).toHaveBeenCalledOnce();
  });

  it('suppresses the user message when skipAddMessage is set', async () => {
    const deps = makeDeps();
    await runAgentTurn(makeInput({ skipAddMessage: true }), deps);
    expect(deps.addUserMessage).not.toHaveBeenCalled();
  });

  it('on the current session, plays then persists the generated code', async () => {
    const deps = makeDeps();
    await runAgentTurn(makeInput(), deps);
    expect(deps.play).toHaveBeenCalledWith('note("c3")', expect.objectContaining({ turn_id: expect.any(String) }));
    expect(deps.setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
    expect(deps.addAssistantMessage).toHaveBeenCalledWith('done', 'note("c3")', 'S1', {
      beforeCode: 'CURRENT',
      afterCode: 'note("c3")',
      playbackStatus: 'played',
    }, 'normal', undefined, expect.any(String));
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

  it('stores the commit\'s layer notes on the committed assistant message', async () => {
    const layerNotes = { pad: '温暖pad铺出天空和声' };
    const deps = makeDeps({ runAgent: vi.fn(async () => makeResult({ layerNotes })) });
    await runAgentTurn(makeInput(), deps);
    expect(deps.addAssistantMessage).toHaveBeenCalledWith('done', 'note("c3")', 'S1', expect.anything(), 'normal', layerNotes, expect.any(String));
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
    }, 'normal', undefined, expect.any(String));
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
    }, 'normal', undefined, expect.any(String));
  });

  it('marks a successful stepwise numbered response as choice input mode', async () => {
    const explanation = [
      '先写了一段明亮的旋律。这个方向对吗？',
      '',
      '1. 加入鼓和贝斯',
      '2. 换个方向',
      '3. 按这个方向写完',
      '',
      '回复序号，或者直接说出你的想法。',
    ].join('\n');
    const deps = makeDeps({ runAgent: vi.fn(async () => makeResult({ explanation })) });

    await runAgentTurn(makeInput(), deps);

    expect(deps.setCommitSuggestions).not.toHaveBeenCalled();
    expect(deps.addAssistantMessage).toHaveBeenCalledWith(explanation, 'note("c3")', 'S1', {
      beforeCode: 'CURRENT',
      afterCode: 'note("c3")',
      playbackStatus: 'played',
    }, 'choice', undefined, expect.any(String));
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

  it('ignores late progress and cancellation after rollback takes ownership away', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    let ownsTurn = true;
    const deps = makeDeps({
      beginLoading: () => controller,
      isCurrentController: () => ownsTurn,
      makeProgressHandler: () => onProgress,
      runAgent: vi.fn(async (_text, _code, progress) => {
        ownsTurn = false;
        controller.abort();
        progress?.({ kind: 'assistant_reply_delta', delta: 'late reply' });
        throw new DOMException('Aborted', 'AbortError');
      }),
    });
    await runAgentTurn(makeInput(), deps);
    expect(onProgress).not.toHaveBeenCalled();
    expect(deps.finalizeLastAssistantMessage).not.toHaveBeenCalled();
    expect(deps.checkpointSession).not.toHaveBeenCalled();
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
    }, 'normal', undefined, expect.any(String));
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
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(t('agentResponseFailed'), 'S1', expect.any(String));
    expect(consoleError).toHaveBeenCalledWith('[agent] Request failed', {
      provider: 'p',
      model: 'm',
      errorName: 'Error',
      errorMessage: 'boom',
    });
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('persists terminal messages before checkpointing without writing token stats to the session', async () => {
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
    expect((deps.setSessionSuggestions as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan(checkpointOrder);
    expect((deps.addAssistantMessage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan(checkpointOrder);
  });

  it('takes the thinking indicator down without waiting for the turn to be saved', async () => {
    // What a press of stop used to look like: "已中断" written above a spinner
    // that hung there until the cloud answered.
    const controller = new AbortController();
    let releaseCheckpoint!: () => void;
    const deps = makeDeps({
      beginLoading: () => controller,
      runAgent: vi.fn(async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      }),
      checkpointSession: vi.fn(() => new Promise<void>((resolve) => {
        releaseCheckpoint = resolve;
      })),
    });

    const turn = runAgentTurn(makeInput(), deps);
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(t('interrupted'), 'S1');
    expect(deps.checkpointSession).toHaveBeenCalledOnce();
    expect(deps.endLoading).toHaveBeenCalledWith('S1', controller);

    releaseCheckpoint();
    await turn;
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

    expect(trackAgentTurnStarted).toHaveBeenCalledWith(expect.objectContaining({
      entry_point: 'suggestion',
      provider: 'p',
      model: 'm',
      has_existing_code: true,
      has_history: true,
      input_mode: 'revise',
    }));
  });

  it('captures played exactly once after a committed current-session playback succeeds', async () => {
    const dateNow = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValue(1_450);
    const deps = makeDeps();

    await runAgentTurn(makeInput(), deps);

    expect(deps.trackAgentTurnFinished).toHaveBeenCalledOnce();
    expect(deps.trackAgentTurnFinished).toHaveBeenCalledWith(expect.objectContaining({
      entry_point: 'text',
      provider: 'p',
      model: 'm',
      has_existing_code: true,
      has_history: false,
      outcome: 'played',
      duration_ms: 450,
      iterations: 1,
      termination_reason: 'committed',
    }));
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

  it('preserves progress and pairs a failed turn after a provider retry', async () => {
    const deps = makeDeps({
      runAgent: async (_text, _code, progress) => {
        progress?.({ kind: 'iteration', index: 2 });
        progress?.({ kind: 'request_retry' });
        progress?.({ kind: 'tool_result', name: 'validate', ok: false });
        throw Object.assign(new Error('private request details'), { status: 429 });
      },
    });
    await runAgentTurn(makeInput(), deps);
    const [started] = vi.mocked(deps.trackAgentTurnStarted).mock.calls[0];
    const [finished] = vi.mocked(deps.trackAgentTurnFinished).mock.calls[0];
    expect(finished.context?.turn_id).toBe(started.context?.turn_id);
    expect(finished).toMatchObject({
      iterations: 2, request_retry_count: 1, tool_failure_count: 1,
      error_code: 'rate_limited', http_status: 429, failure_stage: 'request',
    });
    expect(JSON.stringify(finished)).not.toContain('private request details');
  });

  it('keeps Agent playback and persistence successful when analytics throws', async () => {
    const deps = makeDeps({
      trackAgentTurnStarted: vi.fn(() => { throw new Error('analytics start failed'); }),
      trackAgentTurnFinished: vi.fn(() => { throw new Error('analytics finish failed'); }),
    });

    await expect(runAgentTurn(makeInput(), deps)).resolves.toBeUndefined();

    expect(deps.play).toHaveBeenCalledWith('note("c3")', expect.objectContaining({ turn_id: expect.any(String) }));
    expect(deps.setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
  });
});

describe('useAgentRunner production adapter', () => {
  it('forwards the successful response input mode into session persistence', () => {
    const addAssistantMessage = vi.fn();
    const config = {
      strudel: {},
      sessions: { addAssistantMessage },
      currentCode: '',
      abortControllersRef: { current: new Map() },
      currentIdRef: { current: 'S1' },
      setLoadingSessions: vi.fn(),
      setCommitSuggestions: vi.fn(),
      setRollbackPrefill: vi.fn(),
      makeProgressHandler: () => () => {},
    } as unknown as UseAgentRunnerConfig;

    const deps = createAgentTurnDeps(config);
    deps.addAssistantMessage('请选择', 'note("c3")', 'S1', undefined, 'choice', { pad: '温暖pad铺出天空和声' });

    expect(addAssistantMessage).toHaveBeenCalledWith(
      '请选择',
      'note("c3")',
      'S1',
      undefined,
      'choice',
      { pad: '温暖pad铺出天空和声' },
      undefined,
    );
  });
});

describe('routed turns', () => {
  function makeRouter(over: Partial<NonNullable<AgentTurnDeps['router']>> = {}): NonNullable<AgentTurnDeps['router']> {
    return {
      run: vi.fn().mockResolvedValue({ kind: 'execute', scope: { kind: 'rewrite' }, status: 'candidate', result: makeResult() }),
      snapshot: () => ({ id: 'S1', title: 'Song', messages: [], code: 'CURRENT', createdAt: 0, updatedAt: 0 }),
      commit: vi.fn(async (_commit, canCommit) => canCommit() ? 'revision-1' : null),
      updateReceipt: vi.fn(),
      flushLocalWrites: vi.fn(async () => undefined),
      getLiveEditorCode: () => 'CURRENT',
      setEditorCode: vi.fn(),
      ...over,
    };
  }

  function makeRoutedDeps(router: NonNullable<AgentTurnDeps['router']>, over: Partial<AgentTurnDeps> = {}) {
    return makeDeps({ router, addUserMessage: vi.fn(() => ({ id: 'message-1', isFirstUserMessage: false })), ...over });
  }

  it('stores the original once and accepts exactly one Router reply', async () => {
    const router = makeRouter({ run: vi.fn().mockResolvedValue({ kind: 'reply', route: 'reply', text: 'Hi' }) });
    const deps = makeRoutedDeps(router);
    await runAgentTurn(makeInput({ text: 'Hello' }), deps);
    expect(deps.addUserMessage).toHaveBeenCalledOnce();
    expect(deps.addUserMessage).toHaveBeenCalledWith('Hello');
    expect(router.run).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Hello', ref: expect.objectContaining({ sessionId: 'S1', messageId: 'message-1' }),
    }));
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledOnce();
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith('Hi', 'S1', expect.any(String));
    expect(router.commit).not.toHaveBeenCalled();
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.runAgent).not.toHaveBeenCalled();
  });

  it('publishes only Router statuses and a standard receipt, including for the mood entry', async () => {
    const onProgress = vi.fn();
    const run: NonNullable<AgentTurnDeps['router']>['run'] = vi.fn(async request => {
      request.onProgress?.({ kind: 'router_progress', entry: { kind: 'plan', title: 'Review the score' } });
      request.onProgress?.({ kind: 'reasoning_delta', delta: 'private reasoning' });
      request.onProgress?.({ kind: 'assistant_text_delta', delta: 'private narration' });
      request.onProgress?.({ kind: 'assistant_text', text: 'private working text' });
      request.onProgress?.({ kind: 'assistant_reply_delta', delta: 'private reply' });
      request.onProgress?.({ kind: 'warn', message: 'private error' });
      request.onProgress?.({ kind: 'tool_call', name: 'validate', args: { code: 'private code' } });
      return { kind: 'execute', scope: { kind: 'rewrite' }, status: 'candidate',
        result: makeResult({ explanation: 'private commit note' }) } as const;
    });
    const router = makeRouter({ run });
    const deps = makeRoutedDeps(router, { makeProgressHandler: () => onProgress });
    await runAgentTurn(makeInput({ entryPoint: 'mood', moodContext: 'context', includeHistory: false }), deps);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ entryPoint: 'mood', moodContext: 'context' }));
    expect(deps.runAgent).not.toHaveBeenCalled();
    expect(onProgress.mock.calls).toEqual([
      [{ kind: 'router_progress', entry: { kind: 'plan', title: 'Review the score' } }],
      [{ kind: 'router_stage', stage: 'playback' }],
    ]);
    expect(onProgress.mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(deps.play).mock.invocationCallOrder[0]);
    expect(router.commit).toHaveBeenCalledWith(expect.objectContaining({ summary: t('agentRevisionSaved') }), expect.any(Function));
    expect(router.updateReceipt).toHaveBeenCalledWith('S1', 'revision-1', 'played', t('agentRevisionSaved'));
  });

  it('never saves or plays an out-of-scope candidate', async () => {
    const router = makeRouter({ run: vi.fn().mockResolvedValue({
      kind: 'execute', scope: { kind: 'parameter', targets: ['layer-1'], parameter: 'gain' },
      status: 'scope_conflict', result: makeResult(),
    }) });
    const deps = makeRoutedDeps(router);
    await runAgentTurn(makeInput(), deps);
    expect(router.commit).not.toHaveBeenCalled();
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(t('agentRouterScopeConflict'), 'S1', expect.any(String));
  });

  it('keeps the last revision when the Session candidate fails validation', async () => {
    const router = makeRouter({ run: vi.fn().mockResolvedValue({
      kind: 'execute', scope: { kind: 'rewrite' }, status: 'failed', result: makeResult({ committed: false, terminationReason: 'validation_failed' }),
    }) });
    const deps = makeRoutedDeps(router);
    await runAgentTurn(makeInput(), deps);
    expect(router.commit).not.toHaveBeenCalled();
    expect(deps.setCurrentCode).not.toHaveBeenCalled();
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledOnce();
  });

  it('retains the saved revision and reports playback failure when synthesis fails', async () => {
    const synthesize = vi.fn().mockRejectedValue(new Error('network'));
    const router = makeRouter({ run: vi.fn().mockResolvedValue({ kind: 'execute', scope: { kind: 'rewrite' }, status: 'candidate', result: makeResult(), synthesize }) });
    const deps = makeRoutedDeps(router, { play: vi.fn(async () => false) });
    await runAgentTurn(makeInput(), deps);
    expect(router.commit).toHaveBeenCalledOnce();
    expect(router.updateReceipt).toHaveBeenCalledOnce();
    expect(router.updateReceipt).toHaveBeenCalledWith('S1', 'revision-1', 'failed',
      t('agentRevisionSaved') + '\n\n' + t('agentRevisionPlaybackFailed'));
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 'revision-1', playback: 'failed' }));
    expect(deps.finalizeLastAssistantMessage).not.toHaveBeenCalled();
  });

  it('saves background revisions without touching the active editor or playing', async () => {
    const router = makeRouter();
    const deps = makeRoutedDeps(router, { isCurrentSession: () => false });
    await runAgentTurn(makeInput(), deps);
    expect(router.commit).toHaveBeenCalledOnce();
    expect(router.updateReceipt).toHaveBeenCalledOnce();
    expect(router.updateReceipt).toHaveBeenCalledWith('S1', 'revision-1', 'not_attempted', t('agentRevisionSaved'));
    expect(router.setEditorCode).not.toHaveBeenCalled();
    expect(deps.play).not.toHaveBeenCalled();
  });

  it('rejects a revision when the editor changes during generation', async () => {
    const getLiveEditorCode = vi.fn().mockReturnValueOnce('CURRENT').mockReturnValue('edited');
    const router = makeRouter({ getLiveEditorCode });
    const deps = makeRoutedDeps(router);
    await runAgentTurn(makeInput(), deps);
    expect(router.updateReceipt).not.toHaveBeenCalled();
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledOnce();
    expect(deps.finalizeLastAssistantMessage).toHaveBeenCalledWith(
      t('agentRevisionStale'), 'S1', expect.any(String),
    );
  });

  it('keeps the receipt when cancelled after commit and avoids playback', async () => {
    const controller = new AbortController();
    const router = makeRouter({ flushLocalWrites: async () => controller.abort() });
    const deps = makeRoutedDeps(router, { beginLoading: () => controller });
    await runAgentTurn(makeInput(), deps);
    expect(router.updateReceipt).toHaveBeenCalledOnce();
    expect(router.updateReceipt).toHaveBeenCalledWith('S1', 'revision-1', 'not_attempted', t('agentRevisionSaved'));
    expect(router.setEditorCode).toHaveBeenCalledWith('note("c3")');
    expect(deps.play).not.toHaveBeenCalled();
  });
});
