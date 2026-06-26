import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/strudel', () => ({
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  validateCodeTranspiler: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

import { runAgentLoop, type LLMCaller, type ConversationTurn } from '../loop';

// Minimal LLMCaller that returns a commit tool call on the first invocation,
// capturing the messages array it receives for assertion.
function makeCapturingLLM(commitCode = 's("bd")') {
  const calls: { messages: unknown[] }[] = [];
  const llm: LLMCaller = {
    async chatWithTools(messages) {
      calls.push({ messages: [...messages] });
      return {
        content: null,
        toolCalls: [
          {
            id: 'tc-1',
            name: 'commit',
            arguments: JSON.stringify({ code: commitCode, explanation: 'done' }),
          },
        ],
      };
    },
  };
  return { llm, calls };
}

describe('runAgentLoop — conversationHistory message ordering', () => {
  it('inserts history between system prompt and user turn', async () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: 'previous user message' },
      { role: 'assistant', content: 'previous assistant reply' },
    ];

    const { llm, calls } = makeCapturingLLM();

    await runAgentLoop({
      initialCode: '',
      instruction: 'add drums',
      systemPrompt: 'You are a music assistant.',
      llm,
      conversationHistory: history,
    });

    expect(calls.length).toBeGreaterThan(0);
    const msgs = calls[0].messages as Array<{ role: string; content: unknown }>;

    expect(msgs[0].role).toBe('system');
    expect(msgs[1]).toEqual({ role: 'user', content: 'previous user message' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'previous assistant reply' });
    expect(msgs[3].role).toBe('user');
    expect(msgs[3].content).toContain('add drums');
  });

  it('omits history slot when conversationHistory is empty', async () => {
    const { llm, calls } = makeCapturingLLM();

    await runAgentLoop({
      initialCode: '',
      instruction: 'add bass',
      systemPrompt: 'You are a music assistant.',
      llm,
      conversationHistory: [],
    });

    const msgs = calls[0].messages as Array<{ role: string; content: unknown }>;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });
});

describe('runAgentLoop — timeout warning', () => {
  it('uses a 10 minute default timeout and describes it in minutes for Chinese instructions', async () => {
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(600_001);
    const onProgress = vi.fn();
    const llm: LLMCaller = {
      async chatWithTools() {
        return {
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              name: 'validate',
              arguments: JSON.stringify({ code: 's("bd")' }),
            },
          ],
        };
      },
    };

    try {
      await runAgentLoop({
        initialCode: '',
        instruction: '写一段鼓',
        systemPrompt: 'You are a music assistant.',
        llm,
        onProgress,
      });
    } finally {
      now.mockRestore();
    }

    expect(onProgress).toHaveBeenCalledWith({
      kind: 'warn',
      message: '超时 10 分钟，强制结束',
    });
  });

  it('describes custom timeouts in minutes for English instructions', async () => {
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(120_001);
    const onProgress = vi.fn();
    const llm: LLMCaller = {
      async chatWithTools() {
        return {
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              name: 'validate',
              arguments: JSON.stringify({ code: 's("bd")' }),
            },
          ],
        };
      },
    };

    try {
      await runAgentLoop({
        initialCode: '',
        instruction: 'add drums',
        systemPrompt: 'You are a music assistant.',
        llm,
        timeoutMs: 120_000,
        onProgress,
      });
    } finally {
      now.mockRestore();
    }

    expect(onProgress).toHaveBeenCalledWith({
      kind: 'warn',
      message: 'Timed out after 2 minutes, force-stopping',
    });
  });
});
