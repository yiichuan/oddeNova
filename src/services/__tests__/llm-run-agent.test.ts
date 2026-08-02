import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunAgentOptions } from '../../agent/loop';
import type { ConversationTurn } from '../llm';

const runAgentLoopMock = vi.hoisted(() => vi.fn());
const getActivePersonaSyncMock = vi.hoisted(() => vi.fn(() => ({
  id: 'persona-1',
  name: 'Nocturne',
  prompt: 'CUSTOM_PERSONA',
})));
const openAIChatCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../../agent/loop', () => ({
  runAgentLoop: runAgentLoopMock,
}));

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: openAIChatCreateMock,
      },
    },
  })),
}));

vi.mock('../../prompts/system-prompt', () => ({
  AGENT_SYSTEM_PROMPT_OPENAI: vi.fn((personaBlock: string, personaName: string) =>
    `zh system prompt ${personaName} ${personaBlock}`
  ),
  AGENT_SYSTEM_PROMPT_EN: vi.fn((personaBlock: string, personaName: string) =>
    `en system prompt ${personaName} ${personaBlock}`
  ),
}));

vi.mock('../../lib/persona-storage', () => ({
  BUILTIN_PERSONA_ID: 'oddenova',
  getActivePersonaSync: getActivePersonaSyncMock,
  getPersonaPrompt: vi.fn(() => 'CUSTOM_PERSONA'),
}));

vi.mock('../../persona/oddenova', () => ({
  buildPersonaBlock: vi.fn(() => 'BUILTIN_PERSONA'),
}));

vi.mock('../../agent/tools', () => ({
  getOpenAIToolSchemas: vi.fn(() => []),
}));

const officialModelConfig = {
  provider: 'official' as const,
  protocol: 'openai' as const,
  model: 'test-model',
  apiKey: 'official-proxy',
  baseURL: '/api/official/v1',
};
const getActiveModelConfigMock = vi.hoisted(() => vi.fn());
const getSelectedThinkingLevelMock = vi.hoisted(() => vi.fn(() => 'medium'));

vi.mock('../llm-config', () => ({
  getActiveModelConfig: getActiveModelConfigMock,
  getSelectedThinkingLevel: getSelectedThinkingLevelMock,
}));

const anthropicStreamMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { stream: anthropicStreamMock } })),
}));

vi.mock('../../demo/demo-config', () => ({
  isDemoMode: vi.fn(() => false),
  resolveDemoScenario: vi.fn(() => undefined),
  getActiveDemoSet: vi.fn(() => []),
  DEMO_MOOD_SCENARIO: { roleSnippets: {}, rounds: [] },
  DEMO_PREFILL: 'demo prefill',
  DEMO_PREFILL_SCENARIO: { roleSnippets: {}, rounds: [] },
}));

vi.mock('../../demo/demo-llm', () => ({
  createDemoLLMCaller: vi.fn(),
  createDemoMoodLLMCaller: vi.fn(),
}));

import { runAgent, classifyIntent } from '../llm';
import type { LLMCaller } from '../../agent/loop';

describe('runAgent conversationHistory pass-through', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    openAIChatCreateMock.mockReset();
    runAgentLoopMock.mockResolvedValue({
      code: 's("bd")',
      explanation: 'done',
      iterations: 1,
      committed: true,
    });
    getActiveModelConfigMock.mockReset().mockReturnValue(officialModelConfig);
    getSelectedThinkingLevelMock.mockReset().mockReturnValue('medium');
    anthropicStreamMock.mockReset().mockReturnValue({
      on: vi.fn(),
      finalMessage: vi.fn(async () => ({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })),
    });
  });

  it('passes conversationHistory to runAgentLoop', async () => {
    const history: ConversationTurn[] = [
      { role: 'user', content: 'previous request' },
      { role: 'assistant', content: 'previous answer' },
    ];

    await runAgent('still wrong', 's("hh")', undefined, undefined, undefined, history);

    expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    expect(opts.instruction).toBe('still wrong');
    expect(opts.initialCode).toBe('s("hh")');
    expect(opts.conversationHistory).toBe(history);
    expect(getActivePersonaSyncMock).toHaveBeenCalledTimes(1);
    expect(opts.systemPrompt).toBe('en system prompt Nocturne CUSTOM_PERSONA');
  });

  it('skips classification and enables thinking for mood generation', async () => {
    await runAgent('根据我的心情生成音乐', '', undefined);

    expect(openAIChatCreateMock).not.toHaveBeenCalled();
    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    expect(opts.enableThinking).toBe(true);
  });

  it('disables thinking when the classifier returns chat', async () => {
    async function* contentStream(text: string) {
      yield { choices: [{ delta: { content: text } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 1 } };
    }
    openAIChatCreateMock.mockResolvedValue(contentStream('chat'));

    await runAgent('你是谁呀', '', undefined);

    expect(openAIChatCreateMock).toHaveBeenCalledTimes(1);
    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    expect(opts.enableThinking).toBe(false);
  });

  it('gives the OpenAI-compatible agent call a larger completion budget', async () => {
    async function* stream() {
      yield { choices: [{ delta: {} }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 1 } };
    }
    openAIChatCreateMock.mockResolvedValue(stream());

    await runAgent('写一段热血冒险风格的 BGM', '', undefined);

    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    await opts.llm.chatWithTools([{ role: 'user', content: 'go' }], []);

    expect(openAIChatCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 131072,
      }),
      expect.any(Object),
    );
  });
});

describe('classifyIntent parsing', () => {
  function fakeLLM(content: string | null, throws = false): LLMCaller {
    return {
      async chatWithTools() {
        if (throws) throw new Error('network');
        return { content, toolCalls: [] };
      },
    };
  }

  it('returns chat when the model says chat', async () => {
    const intent = await classifyIntent(fakeLLM('chat'), { instruction: '你好', currentCode: '' });
    expect(intent).toBe('chat');
  });

  it('returns compose when the model says compose', async () => {
    const intent = await classifyIntent(fakeLLM('compose'), { instruction: '写个爵士', currentCode: '' });
    expect(intent).toBe('compose');
  });

  it('defaults to compose on unparseable output', async () => {
    const intent = await classifyIntent(fakeLLM('¯\\_(ツ)_/¯'), { instruction: 'x', currentCode: '' });
    expect(intent).toBe('compose');
  });

  it('defaults to compose when the classification call throws', async () => {
    const intent = await classifyIntent(fakeLLM(null, true), { instruction: 'x', currentCode: '' });
    expect(intent).toBe('compose');
  });

  it('disables thinking for the classification call itself', async () => {
    const seen: Array<boolean | undefined> = [];
    const llm: LLMCaller = {
      async chatWithTools(_m, _t, _od, _rd, _s, enableThinking) {
        seen.push(enableThinking);
        return { content: 'chat', toolCalls: [] };
      },
    };
    await classifyIntent(llm, { instruction: 'hi', currentCode: '' });
    expect(seen).toEqual([false]);
  });
});

describe('createOpenAILLMCaller thinking params', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    openAIChatCreateMock.mockReset();
    runAgentLoopMock.mockResolvedValue({ code: '', explanation: 'done', iterations: 1, committed: true });
    getActiveModelConfigMock.mockReset().mockReturnValue(officialModelConfig);
    getSelectedThinkingLevelMock.mockReset().mockReturnValue('medium');
  });

  async function captureLLM() {
    async function* stream() {
      yield { choices: [{ delta: {} }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    }
    openAIChatCreateMock.mockResolvedValue(stream());
    await runAgent('go', '', undefined);
    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    return opts.llm;
  }

  it('merges resolved thinking params into the request when thinking is enabled', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'extreme');

    expect(openAIChatCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: { type: 'enabled' }, reasoning_effort: 'max' }),
      expect.any(Object),
    );
  });

  it('omits thinking params entirely when thinking is disabled (chat intent, unchanged from today)', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, false);

    const body = openAIChatCreateMock.mock.calls[0][0];
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('thinking');
  });

  it('defaults thinkingLevel to medium when the caller omits it', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true);

    expect(openAIChatCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning_effort: 'high' }),
      expect.any(Object),
    );
  });
});

describe('anthropicLLMCaller thinking params', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    runAgentLoopMock.mockResolvedValue({ code: '', explanation: 'done', iterations: 1, committed: true });
    getActiveModelConfigMock.mockReset().mockReturnValue({
      provider: 'anthropic' as const,
      protocol: 'anthropic' as const,
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-test',
      baseURL: 'https://api.anthropic.com',
    });
    getSelectedThinkingLevelMock.mockReset().mockReturnValue('medium');
    anthropicStreamMock.mockReset().mockReturnValue({
      on: vi.fn(),
      finalMessage: vi.fn(async () => ({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })),
    });
  });

  async function captureLLM() {
    await runAgent('go', '', undefined);
    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    return opts.llm;
  }

  it('maps the requested level to the matching budget_tokens', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'high');

    expect(anthropicStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: { type: 'enabled', budget_tokens: 32000 } }),
      expect.any(Object),
    );
  });

  it('omits the thinking field entirely when thinking is disabled', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, false);

    const body = anthropicStreamMock.mock.calls[0][0];
    expect(body).not.toHaveProperty('thinking');
  });
});
