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

vi.mock('../../lib/i18n', () => ({
  isZh: vi.fn(() => false),
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
  getDemoMoodInstruction: vi.fn(() => '根据我的心情生成音乐'),
  getDemoMoodScenario: vi.fn(() => ({ roleSnippets: {}, rounds: [] })),
  getDemoPrefill: vi.fn(() => 'demo prefill'),
  getDemoPrefillScenario: vi.fn(() => ({ roleSnippets: {}, rounds: [] })),
}));

vi.mock('../../demo/demo-llm', () => ({
  createDemoLLMCaller: vi.fn(),
  createDemoMoodLLMCaller: vi.fn(),
}));

import { runAgent, classifyIntent } from '../llm';
import type { LLMCaller } from '../../agent/loop';
import { isZh } from '../../lib/i18n';

describe('runAgent conversationHistory pass-through', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    openAIChatCreateMock.mockReset();
    getActivePersonaSyncMock.mockClear();
    vi.mocked(isZh).mockReturnValue(false);
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

  it('passes the browser locale to the system prompt and agent loop', async () => {
    vi.mocked(isZh).mockReturnValue(true);

    await runAgent('1', 's("hh")');

    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    expect(opts.locale).toBe('zh');
    expect(opts.systemPrompt).toBe('zh system prompt Nocturne CUSTOM_PERSONA');
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

  it('threads getSelectedThinkingLevel() into RunAgentOptions.thinkingLevel', async () => {
    getSelectedThinkingLevelMock.mockReturnValue('high');

    await runAgent('go', '', undefined);

    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    expect(opts.thinkingLevel).toBe('high');
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
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'high');

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
      model: 'claude-sonnet-5',
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

  function lastBody() {
    return anthropicStreamMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  }

  it('adaptive models use thinking: adaptive with output_config.effort and no temperature', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'high');

    expect(anthropicStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: { type: 'adaptive' },
        output_config: { effort: 'max' },
      }),
      expect.any(Object),
    );
    expect(lastBody()).not.toHaveProperty('temperature');
  });

  it('adaptive models map medium to output_config.effort medium', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'medium');

    expect(anthropicStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ output_config: { effort: 'medium' } }),
      expect.any(Object),
    );
  });

  it('claude-haiku-4-5 keeps the legacy budget_tokens path with temperature and the 64k output cap', async () => {
    getActiveModelConfigMock.mockReturnValue({
      provider: 'anthropic' as const,
      protocol: 'anthropic' as const,
      model: 'claude-haiku-4-5',
      apiKey: 'sk-ant-test',
      baseURL: 'https://api.anthropic.com',
    });
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'high');

    expect(anthropicStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: { type: 'enabled', budget_tokens: 60000 },
        max_tokens: 64000,
        temperature: 1,
      }),
      expect.any(Object),
    );
  });

  it('unknown anthropic models keep the full 131072 output budget on the legacy path', async () => {
    getActiveModelConfigMock.mockReturnValue({
      provider: 'anthropic' as const,
      protocol: 'anthropic' as const,
      model: 'claude-legacy-override',
      apiKey: 'sk-ant-test',
      baseURL: 'https://api.anthropic.com',
    });
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, true, 'high');

    expect(anthropicStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: { type: 'enabled', budget_tokens: 60000 },
        max_tokens: 131072,
      }),
      expect.any(Object),
    );
  });

  it('omits the thinking field entirely when thinking is disabled', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, false);

    expect(lastBody()).not.toHaveProperty('thinking');
    expect(lastBody()).not.toHaveProperty('output_config');
  });

  it('converts echoed thinking blocks and tool calls into Anthropic-shaped multi-turn history', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'add drums' },
        {
          role: 'assistant',
          content: null,
          thinking_blocks: [{ type: 'thinking', thinking: 'pick a kick', signature: 'sig-1' }],
          tool_calls: [{
            id: 'tu-1',
            type: 'function',
            function: { name: 'setCode', arguments: '{"code":"s(\\"bd\\")"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'tu-1', name: 'setCode', content: '{"ok":true}' },
      ],
      [],
      undefined,
      undefined,
      undefined,
      true,
      'high',
    );

    const body = lastBody() as { messages: Array<{ role: string; content: unknown }> };
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'pick a kick', signature: 'sig-1' },
        { type: 'tool_use', id: 'tu-1', name: 'setCode', input: { code: 's("bd")' } },
      ],
    });
    expect(body.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: '{"ok":true}' }],
    });
  });
});

describe('createOpenAILLMCaller provider-shaped requests', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    openAIChatCreateMock.mockReset();
    runAgentLoopMock.mockResolvedValue({ code: '', explanation: 'done', iterations: 1, committed: true });
    getActiveModelConfigMock.mockReset().mockReturnValue(officialModelConfig);
    getSelectedThinkingLevelMock.mockReset().mockReturnValue('medium');
  });

  async function captureAgentBody(cfg: {
    provider: 'official' | 'kimi' | 'openai';
    protocol: 'openai';
    model: string;
    apiKey: string;
    baseURL: string;
  }) {
    getActiveModelConfigMock.mockReturnValue(cfg);
    async function* stream() {
      yield { choices: [{ delta: {} }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    }
    openAIChatCreateMock.mockResolvedValue(stream());
    await runAgent('go', '', undefined);
    const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    await opts.llm.chatWithTools([{ role: 'user', content: 'go' }], []);
    return openAIChatCreateMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  }

  it('keeps temperature and max_tokens for deepseek / official', async () => {
    const body = await captureAgentBody(officialModelConfig);

    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(131072);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('kimi requests send no temperature (fixed server-side) but keep max_tokens', async () => {
    const body = await captureAgentBody({
      provider: 'kimi' as const,
      protocol: 'openai' as const,
      model: 'kimi-k2.6',
      apiKey: 'sk-kimi',
      baseURL: 'https://api.moonshot.cn/v1',
    });

    expect(body).not.toHaveProperty('temperature');
    expect(body.max_tokens).toBe(131072);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('openai GPT-5 requests use max_completion_tokens and no temperature', async () => {
    const body = await captureAgentBody({
      provider: 'openai' as const,
      protocol: 'openai' as const,
      model: 'gpt-5.5',
      apiKey: 'sk-openai',
      baseURL: 'https://api.openai.com/v1',
    });

    expect(body).not.toHaveProperty('temperature');
    expect(body.max_completion_tokens).toBe(131072);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('the classification call still sends no thinking params for non-always-thinking models', async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: 'chat' } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 1 } };
    }
    getActiveModelConfigMock.mockReturnValue({
      provider: 'openai' as const,
      protocol: 'openai' as const,
      model: 'gpt-5.5',
      apiKey: 'sk-openai',
      baseURL: 'https://api.openai.com/v1',
    });
    openAIChatCreateMock.mockResolvedValue(stream());

    await runAgent('你是谁呀', '', undefined);

    // The classification call is the only create() here (agent loop is mocked).
    const classifyBody = openAIChatCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(classifyBody).not.toHaveProperty('reasoning_effort');
    expect(classifyBody).not.toHaveProperty('thinking');
  });

  it('the classification call for kimi-k3 sends the lowest effective strength instead of a disable', async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: 'chat' } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 1 } };
    }
    getActiveModelConfigMock.mockReturnValue({
      provider: 'kimi' as const,
      protocol: 'openai' as const,
      model: 'kimi-k3',
      apiKey: 'sk-kimi',
      baseURL: 'https://api.moonshot.cn/v1',
    });
    openAIChatCreateMock.mockResolvedValue(stream());

    await runAgent('你是谁呀', '', undefined);

    const classifyBody = openAIChatCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(classifyBody.reasoning_effort).toBe('low');
    expect(classifyBody).not.toHaveProperty('thinking');
  });

  it('the classification call for glm-5.3 sends the lowest effective strength instead of a disable', async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: 'chat' } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 1 } };
    }
    getActiveModelConfigMock.mockReturnValue({
      provider: 'glm' as const,
      protocol: 'openai' as const,
      model: 'glm-5.3',
      apiKey: 'glm-key',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    });
    openAIChatCreateMock.mockResolvedValue(stream());

    await runAgent('你是谁呀', '', undefined);

    const classifyBody = openAIChatCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(classifyBody).toEqual(expect.objectContaining({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    }));
  });
});
