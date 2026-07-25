import { describe, expect, it, vi } from 'vitest';
import { createAgentProgressHandler } from '../agent-progress-handler';

function makeSessions() {
  return {
    addProgress: vi.fn(),
    addAssistantMessage: vi.fn(),
    appendToLastAssistant: vi.fn(),
    appendToLastThinking: vi.fn(),
    appendToLastReasoning: vi.fn(),
    discardAgentAttempt: vi.fn(),
    finalizeAgentAttempt: vi.fn(),
  };
}

describe('createAgentProgressHandler', () => {
  it('routes streamed chat replies directly into the assistant message', () => {
    const sessions = makeSessions();
    const handle = createAgentProgressHandler(sessions, 'S1');

    handle({
      kind: 'assistant_reply_delta',
      delta: '你好，很高兴遇见你。',
      attemptId: 'attempt-1',
    });

    expect(sessions.appendToLastAssistant)
      .toHaveBeenCalledWith('你好，很高兴遇见你。', 'S1', 'attempt-1');
    expect(sessions.appendToLastThinking).not.toHaveBeenCalled();
  });

  it('routes streamed and completed assistant narration into thinking progress', () => {
    const sessions = makeSessions();
    const handle = createAgentProgressHandler(sessions, 'S1');

    handle({
      kind: 'assistant_text_delta',
      delta: '先加一条贝斯线',
      attemptId: 'attempt-1',
    });
    handle({
      kind: 'reasoning_delta',
      delta: '分析节奏',
      attemptId: 'attempt-1',
    });
    handle({ kind: 'assistant_text', text: '让低音更有呼吸。' });

    expect(sessions.appendToLastThinking)
      .toHaveBeenCalledWith('先加一条贝斯线', 'S1', 'attempt-1');
    expect(sessions.appendToLastReasoning)
      .toHaveBeenCalledWith('分析节奏', 'S1', 'attempt-1');
    expect(sessions.addProgress).toHaveBeenCalledWith(
      'thinking',
      '让低音更有呼吸。',
      { sessionId: 'S1' },
    );
  });

  it('does not promote setCode explanation to an assistant message', () => {
    const sessions = makeSessions();
    const handle = createAgentProgressHandler(sessions, 'S1');

    handle({
      kind: 'tool_call',
      name: 'setCode',
      args: { code: 's("bd")', explanation: '先铺好底鼓。' },
    });

    expect(sessions.addProgress).toHaveBeenCalledTimes(1);
    expect(sessions.addAssistantMessage).not.toHaveBeenCalled();
    expect(sessions.addProgress).toHaveBeenCalledWith(
      'tool_call',
      expect.any(String),
      { toolName: 'setCode', sessionId: 'S1' },
    );
  });

  it('discards failed stream attempts and finalizes successful ones', () => {
    const sessions = makeSessions();
    const handle = createAgentProgressHandler(sessions, 'S1');

    handle({ kind: 'request_attempt_discarded', attemptId: 'attempt-1' });
    handle({ kind: 'request_attempt_succeeded', attemptId: 'attempt-2' });

    expect(sessions.discardAgentAttempt).toHaveBeenCalledWith('attempt-1', 'S1');
    expect(sessions.finalizeAgentAttempt).toHaveBeenCalledWith('attempt-2', 'S1');
  });
});
