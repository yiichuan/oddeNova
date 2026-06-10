import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressEvent } from '../llm';

const openAICreateMock = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: openAICreateMock,
      },
    },
  })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

vi.mock('../../agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

vi.mock('../../agent/tools', () => ({
  getOpenAIToolSchemas: vi.fn(() => []),
}));

vi.mock('../llm-config', () => ({
  getActiveModelConfig: vi.fn(() => ({
    provider: 'official',
    protocol: 'openai',
    model: 'test-model',
    apiKey: 'official-proxy',
    baseURL: '/api/official/v1',
  })),
}));

vi.mock('../../demo/demo-config', () => ({
  isDemoMode: vi.fn(() => false),
  resolveDemoScenario: vi.fn(() => undefined),
  getActiveDemoSet: vi.fn(() => []),
  DEMO_MOOD_SCENARIO: { roleSnippets: {}, rounds: [] },
  DEMO_PREFILL: 'demo prefill',
  DEMO_PREFILL_SCENARIO: { roleSnippets: {}, rounds: [] },
  resolveStaticSuggestionScenario: vi.fn(() => undefined),
}));

vi.mock('../../demo/demo-llm', () => ({
  createDemoLLMCaller: vi.fn(),
  createDemoMoodLLMCaller: vi.fn(),
}));

async function* streamChunks() {
  yield { choices: [{ delta: { content: '你好，' } }] };
  yield { choices: [{ delta: { content: '我是 oddeNova。' } }] };
}

import { runChat } from '../llm';

describe('runChat', () => {
  beforeEach(() => {
    openAICreateMock.mockReset();
    openAICreateMock.mockResolvedValue(streamChunks());
  });

  it('streams a no-tool chat completion with history and returns the reply', async () => {
    const events: ProgressEvent[] = [];

    const result = await runChat(
      '你是谁',
      (event) => events.push(event),
      undefined,
      [{ role: 'user', content: '上一轮' }],
    );

    expect(result).toEqual({ reply: '你好，我是 oddeNova。' });
    expect(events).toEqual([
      { kind: 'assistant_text_delta', delta: '你好，' },
      { kind: 'assistant_text_delta', delta: '我是 oddeNova。' },
    ]);

    const request = openAICreateMock.mock.calls[0][0];
    expect(request.tools).toBeUndefined();
    expect(request.tool_choice).toBeUndefined();
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(request.messages[1]).toEqual({ role: 'user', content: '上一轮' });
    expect(request.messages[2]).toEqual({ role: 'user', content: '你是谁' });
  });
});
