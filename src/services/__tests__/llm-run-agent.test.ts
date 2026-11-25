import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunAgentOptions } from '../../agent/loop';
import type { ConversationTurn } from '../llm';
import { hummingAttachment } from '../../lib/__tests__/fixtures/humming';
import { HUMMING_AGENT_PREPROCESSING_VERSION, type HummingAttachment } from '../../types/humming';

const runAgentLoopMock = vi.hoisted(() => vi.fn());
const getActivePersonaSyncMock = vi.hoisted(() => vi.fn((): { id: string; name: string; prompt?: string } => ({
  id: 'persona-1',
  name: 'Nocturne',
  prompt: 'CUSTOM_PERSONA',
})));
const openAIChatCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../auth-service', () => ({ getAccessToken: async () => 'signed-in-token' }));

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

import { runAgent, classifyIntent, runConversationTurn, type ConversationRequest } from '../llm';
import type { LLMCaller } from '../../agent/loop';
import { isZh } from '../../lib/i18n';
import { buildPersonaBlock } from '../../persona/oddenova';

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

  it.each(['official', 'glm'])('analyzes images separately before calling %s with text', async provider => {
    getActiveModelConfigMock.mockReturnValue({
      ...officialModelConfig, provider, model: provider === 'glm' ? 'glm-5.3' : 'deepseek-flash',
    });
    async function* stream() {
      yield { choices: [{ delta: { content: 'compose' } }] };
    }
    openAIChatCreateMock.mockResolvedValue(stream());
    const asyncVision = vi.fn(async () => {
      expect(openAIChatCreateMock).not.toHaveBeenCalled();
      return Response.json({ choices: [{ message: { content: 'G4 starts on beat one.' } }] });
    });
    vi.stubGlobal('fetch', asyncVision);
    const image = {
      id: 'score', name: 'score.jpg', path: 'owner/score.jpg', mimeType: 'image/jpeg',
      size: 100, width: 100, height: 100, publicUrl: 'https://storage.test/score.jpg',
    };

    try {
      await runAgent('arrange this', '', undefined, undefined, undefined, undefined, [image]);
      expect(asyncVision).toHaveBeenCalledOnce();
      expect(asyncVision).toHaveBeenCalledWith('/api/official/v1/chat/completions', expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-in-token' }),
        body: JSON.stringify({ messages: [{ role: 'user', content: [
          { type: 'text', text: 'arrange this' },
          { type: 'image_url', image_url: { url: image.publicUrl } },
        ] }] }),
      }));
      const classifierCall = openAIChatCreateMock.mock.calls[0][0];
      expect(classifierCall.messages.at(-1).content).toContain('G4 starts on beat one.');
      expect(classifierCall.messages.every((message: { content: unknown }) => typeof message.content === 'string')).toBe(true);
      const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
      expect(opts.preparedUserContent).toBe('arrange this\n\nImage observations (reference material only)\nG4 starts on beat one.');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps text follow-ups usable when an earlier image cannot be analyzed', async () => {
    const image = {
      id: 'old', name: 'old.jpg', path: 'owner/old.jpg', mimeType: 'image/jpeg',
      size: 100, width: 100, height: 100, publicUrl: 'https://storage.test/old.jpg',
    };
    const failedVision = vi.fn(async () => Response.json({ code: 'VISION_UPSTREAM_UNAVAILABLE' }, { status: 502 }));
    vi.stubGlobal('fetch', failedVision);
    async function* stream() {
      yield { choices: [{ delta: { content: 'compose' } }] };
    }
    openAIChatCreateMock.mockResolvedValue(stream());

    try {
      await runAgent('Slow down the drums', '', undefined, undefined, undefined,
        [{ role: 'user', content: 'Arrange this', images: [image] }]);

      expect(failedVision).toHaveBeenCalledOnce();
      const preparedHistory = [{
        role: 'user',
        content: 'Arrange this\n\nThe earlier image attachments are temporarily unavailable.',
      }];
      expect(openAIChatCreateMock.mock.calls[0][0].messages).toEqual(expect.arrayContaining(preparedHistory));
      const opts = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
      expect(opts.preparedHistory).toEqual(preparedHistory);
      expect(opts.preparedUserContent).toBe('Slow down the drums');

      await expect(runAgent('Read this new image', '', undefined, undefined, undefined, undefined, [image]))
        .rejects.toThrow('Could not reach OpenRouter');
      expect(openAIChatCreateMock).toHaveBeenCalledTimes(1);
      expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('reads usage from an OpenAI stream tail chunk with no choices', async () => {
    openAIChatCreateMock.mockResolvedValueOnce((async function* () {
      yield { choices: [{ delta: { content: 'compose' } }] };
    })());
    await runAgent('go', '');

    openAIChatCreateMock.mockResolvedValueOnce((async function* () {
      yield { choices: [{ delta: { content: 'done' } }] };
      yield { choices: [], usage: { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 80 } };
    })());
    const { llm } = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
    const response = await llm.chatWithTools([], []);
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 10, cachedInputTokens: 80 });
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

  it('adds classifier context only to the instruction and preserves expired notices and images', async () => {
    const image = { type: 'image_url' as const, image_url: { url: 'https://prepared.test/image.jpg' } };
    const expired = { type: 'text' as const, text: '图片已过期' };
    const llm: LLMCaller = { async chatWithTools(messages) {
      expect(messages.at(-1)?.content).toEqual([
        { type: 'text', text: expect.stringContaining('user latest message / 用户最新消息: analyze') }, expired, image,
      ]);
      return { content: 'compose', toolCalls: [] };
    } };
    await classifyIntent(llm, { instruction: 'analyze', currentCode: '',
      preparedUserContent: [{ type: 'text', text: 'analyze' }, expired, image],
    });
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

  it('omits thinking params for the main agent when the intent is chat', async () => {
    const llm = await captureLLM();
    await llm.chatWithTools([{ role: 'user', content: 'go' }], [], undefined, undefined, undefined, false);

    const body = openAIChatCreateMock.mock.lastCall?.[0];
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

describe('DeepSeek thinking params by request type', () => {
  it.each(['deepseek', 'official'] as const)('disables %s thinking for classification and sample retrieval while retaining it for composition', async provider => {
    runAgentLoopMock.mockReset().mockResolvedValue({ code: '', explanation: 'done', iterations: 1, committed: true });
    getActiveModelConfigMock.mockReset().mockReturnValue({ ...officialModelConfig, provider, model: 'deepseek-flash' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/guide.json') ? { piano: 'soft' } : { schemaVersion: 1, samples: [] },
    })));
    function stream(delta: object) {
      return (async function* () { yield { choices: [{ delta }] }; })();
    }
    openAIChatCreateMock.mockReset()
      .mockResolvedValueOnce(stream({ content: 'compose' }))
      .mockResolvedValueOnce(stream({ tool_calls: [{
        index: 0, id: 'return', function: {
          name: 'returnCandidates',
          arguments: '{"results":[{"id":"keys","variantIds":[]}]}',
        },
      }] }))
      .mockResolvedValueOnce(stream({ content: 'done' }));
    try {
      await runAgent('go', '');
      const { sampleSearch, llm } = runAgentLoopMock.mock.calls[0][0] as RunAgentOptions;
      await expect(sampleSearch?.({ queries: [{ id: 'keys', query: 'piano' }] }))
        .resolves.toEqual([{ id: 'keys', ok: true, candidates: [] }]);
      await llm.chatWithTools([], []);
      const [classification, retrieval, composition] = openAIChatCreateMock.mock.calls.map(([body]) => body);
      expect(classification.thinking).toEqual({ type: 'disabled' });
      expect(classification).not.toHaveProperty('reasoning_effort');
      expect(retrieval.thinking).toEqual({ type: 'disabled' });
      expect(retrieval).not.toHaveProperty('reasoning_effort');
      expect(composition.thinking).toEqual({ type: 'enabled' });
    } finally {
      vi.unstubAllGlobals();
    }
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

describe('Router and Session integration', () => {
  const humming: HummingAttachment = {
    ...hummingAttachment(),
    trimStartSeconds: 0.25,
    transcription: {
      engine: 'audio-llm', modelVersion: 'test-transcriber', preprocessingVersion: HUMMING_AGENT_PREPROCESSING_VERSION,
      modelRhythm: { bpm: 100, timeSignature: '4/4' },
      notes: [{ pitchMidi: 61, startSeconds: 0, durationSeconds: 0.5 }], warnings: [],
    },
  };

  function editTask(needsSynthesis = false) {
    return { instruction: 'Lower the kick gain only.', scope: 'parameter', targets: ['layer-1'], parameter: 'gain', needsSynthesis };
  }

  function request(text: string, over: Partial<ConversationRequest> = {}): ConversationRequest {
    return {
      text,
      ref: { sessionId: 'session-1', turnId: 'turn-1', messageId: 'message-1' },
      current: { code: 's("bd").gain(0.8)', revisionId: 'rev-current' },
      previous: { code: 's("bd").gain(1)', revisionId: 'rev-previous' },
      signal: new AbortController().signal,
      ...over,
    };
  }

  function respond(text: string, name?: string, args?: unknown) {
    return {
      on: vi.fn(),
      finalMessage: async () => ({
        content: [
          ...(text ? [{ type: 'text', text }] : []),
          ...(name ? [{ type: 'tool_use', id: 'call-1', name, input: args }] : []),
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
  }

  beforeEach(() => {
    runAgentLoopMock.mockReset().mockResolvedValue({
      code: 's("bd").gain(0.4)', explanation: 'Lowered the kick', iterations: 1, committed: true,
    });
    getActiveModelConfigMock.mockReturnValue({ ...officialModelConfig, provider: 'anthropic', protocol: 'anthropic' });
    anthropicStreamMock.mockReset();
  });

  it('styles a direct reply after neutral routing and never calls the music loop', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('The melody would feel closer.'))
      .mockReturnValueOnce(respond('The melody would feel closer.'));
    await expect(runConversationTurn(request('What if the drums were quieter?'))).resolves.toEqual({
      kind: 'reply', route: 'reply', text: 'The melody would feel closer.',
    });
    expect(anthropicStreamMock).toHaveBeenCalledTimes(2);
    expect(anthropicStreamMock.mock.calls[0][0].system).not.toContain('Nocturne');
    expect(anthropicStreamMock.mock.calls[1][0].system).toContain('Nocturne');
    expect(anthropicStreamMock.mock.calls[1][0].system).toContain('CUSTOM_PERSONA');
    expect(runAgentLoopMock).not.toHaveBeenCalled();
  });

  it('gives routing and read-only replies the already transcribed humming notes', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('The note is C sharp.'))
      .mockReturnValueOnce(respond('You hummed C♯4.'));
    await expect(runConversationTurn(request('What pitch did I hum?', { humming }))).resolves.toMatchObject({
      kind: 'reply', text: 'You hummed C♯4.',
    });
    for (const [payload] of anthropicStreamMock.mock.calls) {
      const messages = JSON.stringify(payload.messages);
      expect(messages).toContain('C#4');
      expect(messages).toContain('start_seconds');
      expect(messages).toContain('0.25');
      expect(messages).not.toContain('analyzeHummingWaveform');
    }
    expect(runAgentLoopMock).not.toHaveBeenCalled();
  });

  it('loads the full built-in persona only for the user-facing reply to a greeting', async () => {
    getActivePersonaSyncMock.mockReturnValueOnce({ id: 'oddenova', name: 'oddeNova' });
    vi.mocked(isZh).mockReturnValueOnce(true);
    const draft = '你好！现在还没有任何编曲内容。';
    const reply = '你好呀。我是 oddeNova。我在这里，听你说。';
    anthropicStreamMock.mockReturnValueOnce(respond(draft)).mockReturnValueOnce(respond(reply));

    await expect(runConversationTurn(request('你好', {
      current: { code: '', revisionId: 'rev-empty' },
    }))).resolves.toEqual({ kind: 'reply', route: 'reply', text: reply });

    expect(buildPersonaBlock).toHaveBeenLastCalledWith('zh');
    expect(anthropicStreamMock).toHaveBeenCalledTimes(2);
    const [route, answer] = anthropicStreamMock.mock.calls.map(([payload]) => payload);
    expect(route.system).not.toContain('BUILTIN_PERSONA');
    expect(answer.system).toContain('BUILTIN_PERSONA');
    expect(answer.tools).toBeUndefined();
    expect(runAgentLoopMock).not.toHaveBeenCalled();
  });

  it('streams only the user-facing Router reply', async () => {
    const draft = respond('Neutral draft');
    const reply = respond('Hello there.');
    reply.on.mockImplementation((event, listener) => {
      if (event === 'text') {
        listener('Hello');
        listener(' there.');
      }
    });
    anthropicStreamMock.mockReturnValueOnce(draft).mockReturnValueOnce(reply);
    const onProgress = vi.fn();

    await expect(runConversationTurn(request('Hi', { onProgress }))).resolves.toMatchObject({
      kind: 'reply', text: 'Hello there.',
    });
    expect(draft.on).not.toHaveBeenCalledWith('text', expect.any(Function));
    expect(onProgress.mock.calls[0][0]).toEqual({ kind: 'router_stage', stage: 'routing' });
    expect(onProgress.mock.calls.map(([event]) => event).filter(event => event.kind.startsWith('router_reply_'))).toEqual([
      { kind: 'router_reply_delta', delta: 'Hello' },
      { kind: 'router_reply_delta', delta: ' there.' },
      { kind: 'router_reply_complete', text: 'Hello there.' },
    ]);
  });

  it('passes only the Router brief to Session and keeps the conversation with Router', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('', 'executeSession', editTask()));
    const text = '把鼓调轻一点';
    const history: ConversationTurn[] = [{ role: 'assistant', content: '鼓使用底鼓音色。' }];
    await expect(runConversationTurn(request(text, { history }))).resolves.toMatchObject({
      kind: 'execute', result: { committed: true }, synthesize: undefined,
    });
    expect(anthropicStreamMock).toHaveBeenCalledOnce();
    expect(runAgentLoopMock).toHaveBeenCalledOnce();
    expect(runAgentLoopMock).toHaveBeenCalledWith(expect.objectContaining({
      instruction: expect.stringContaining('Lower the kick gain only.'),
      preparedUserContent: expect.not.stringContaining(text),
      initialCode: 's("bd").gain(0.8)', preparedHistory: [], enableThinking: true,
      systemPrompt: expect.not.stringContaining('Nocturne'),
    }));
  });

  it('emits the actual Router to Session handoff and evidence before returning the answer', async () => {
    anthropicStreamMock
      .mockReturnValueOnce(respond('', 'inspectSession', { question: 'What gain changed?' }))
      .mockReturnValueOnce(respond('The gain went from 1 to 0.8.'));
    const trace = vi.fn();
    await runConversationTurn(request('What changed?', { trace }));
    expect(trace.mock.calls.map(([event]) => [event.from, event.to])).toEqual([
      ['client', undefined], ['client', 'router'], ['router', 'model'], ['model', 'router'], ['router', 'session'],
      ['session', 'router'], ['router', 'model'], ['model', 'router'], ['router', 'client'],
    ]);
    expect(trace.mock.calls[5][0].data).toMatchObject({
      current: { revisionId: 'rev-current' }, previous: { revisionId: 'rev-previous' },
    });
  });

  it('passes both versions to a read-only answer, with no generation or write tools', async () => {
    anthropicStreamMock
      .mockReturnValueOnce(respond('', 'inspectSession', { question: 'What gain changed?' }))
      .mockReturnValueOnce(respond('The gain went from 1 to 0.8.'));
    await expect(runConversationTurn(request('What changed in the last revision?'))).resolves.toEqual({
      kind: 'reply', route: 'inspect', text: 'The gain went from 1 to 0.8.',
    });
    expect(runAgentLoopMock).not.toHaveBeenCalled();
    const answerRequest = anthropicStreamMock.mock.calls[1][0];
    expect(answerRequest.tools).toBeUndefined();
    expect(JSON.stringify(answerRequest.messages)).toContain('rev-previous');
    expect(JSON.stringify(answerRequest.messages)).toContain('rev-current');
  });

  it('waits for an execution receipt before synthesizing and gives that call no tools', async () => {
    anthropicStreamMock
      .mockReturnValueOnce(respond('Working on it', 'executeSession', editTask(true)))
      .mockReturnValueOnce(respond('The kick sits farther back now.'));
    const input = request('Lower the kick and explain the effect.', { humming });
    const result = await runConversationTurn(input);
    expect(anthropicStreamMock).toHaveBeenCalledOnce();
    if (result.kind !== 'execute') throw new Error('Expected execution');
    expect(runAgentLoopMock).toHaveBeenCalledWith(expect.objectContaining({
      humming, instruction: expect.stringContaining('analyzeHummingWaveform'),
    }));
    const brief = JSON.parse(runAgentLoopMock.mock.calls[0][0].instruction);
    expect(brief.hummingInstruction).toContain('Quantize the hummed notes and meaningful rests');
    expect(brief.hummingInstruction).toContain('as counts of grid slots, and omit @1');
    await expect(result.synthesize?.({
      ref: input.ref, revisionId: 'rev-new', status: 'saved', playback: 'failed',
    })).resolves.toBe('The kick sits farther back now.');
    expect(anthropicStreamMock.mock.calls[1][0].tools).toBeUndefined();
    expect(JSON.stringify(anthropicStreamMock.mock.calls[1][0].messages)).toContain('rev-new');
    expect(JSON.stringify(anthropicStreamMock.mock.calls[1][0].messages)).toContain('C#4');
    expect(JSON.stringify(anthropicStreamMock.mock.calls[1][0].messages)).not.toContain('analyzeHummingWaveform');
  });

  it('reports a scope conflict for an out-of-scope candidate even when Session claims it committed', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('', 'executeSession', editTask()));
    runAgentLoopMock.mockResolvedValueOnce({
      code: 's("hh").gain(0.4)', explanation: 'Private working notes', iterations: 1, committed: true,
    });
    const result = await runConversationTurn(request('Lower the kick only.'));
    expect(result).toMatchObject({ kind: 'execute', status: 'scope_conflict' });
    expect(JSON.stringify(result)).not.toContain('Private working notes');
  });

  it('displays a search stage only while the sample search tool is running', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('', 'executeSession', editTask()))
      .mockReturnValue(respond('[]'));
    runAgentLoopMock.mockImplementationOnce(async ({ onProgress }: RunAgentOptions) => {
      onProgress?.({ kind: 'tool_call', name: 'searchSamples', args: { queries: [] } });
      onProgress?.({ kind: 'tool_result', name: 'searchSamples', ok: true });
      return {
        code: 's("bd").gain(0.4)', explanation: 'Lowered the kick', iterations: 1, committed: true,
      };
    });
    const onProgress = vi.fn();
    await runConversationTurn(request('Find a softer kick.', { onProgress }));
    expect(onProgress.mock.calls.flat().filter(event => event.kind === 'router_stage').map(event => event.stage))
      .toEqual(['routing', 'composition', 'search', 'analysis']);
  });

  it('uses the Session plan as the only opening arrangement plan', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('', 'executeSession', {
      instruction: 'Compose a piece.', scope: 'create', needsSynthesis: false,
    })).mockReturnValueOnce(respond('[{"index":0,"title":"I’ll shape the arrangement in three sections.","detail":""}]'));
    runAgentLoopMock.mockImplementationOnce(async ({ onProgress }: RunAgentOptions) => {
      onProgress?.({ kind: 'session_progress', entry: { kind: 'plan', facts: { nextStep: 'shape three sections' } } });
      return { code: 's("bd")', explanation: '', iterations: 1, committed: true };
    });
    await runConversationTurn(request('Compose a piece.', { current: { code: '' }, onProgress: vi.fn() }));
    const narration = JSON.stringify(anthropicStreamMock.mock.calls[1][0].messages);
    expect(narration).toContain('shape three sections');
    expect(narration).not.toContain('sketch the structure of the composition');
  });

  it('streams a repair status while omitting repair narration', async () => {
    anthropicStreamMock.mockReturnValueOnce(respond('', 'executeSession', editTask()))
      .mockReturnValue(respond('[]'));
    runAgentLoopMock.mockImplementationOnce(async ({ onProgress }: RunAgentOptions) => {
      onProgress?.({ kind: 'tool_call', name: 'validate', args: {} });
      onProgress?.({ kind: 'tool_result', name: 'validate', ok: false });
      onProgress?.({ kind: 'session_progress', entry: { kind: 'plan', facts: { nextStep: 'fix private syntax details' } } });
      onProgress?.({ kind: 'tool_call', name: 'setCode', args: {} });
      onProgress?.({ kind: 'session_progress', entry: { kind: 'tool', facts: { action: 'setCode', phase: 'finished' } } });
      onProgress?.({ kind: 'tool_call', name: 'validate', args: {} });
      onProgress?.({ kind: 'tool_result', name: 'validate', ok: true });
      return { code: 's("bd").gain(0.4)', explanation: '', iterations: 2, committed: true };
    });
    const onProgress = vi.fn();
    await runConversationTurn(request('Lower the kick.', { onProgress }));
    const stages = onProgress.mock.calls.flat().filter(event => event.kind === 'router_stage').map(event => event.stage);
    expect(stages).toEqual(['routing', 'composition', 'validation', 'repair', 'validation']);
    const narration = JSON.stringify(anthropicStreamMock.mock.calls[1][0].messages);
    expect(narration).toContain('setCode');
    expect(narration).not.toContain('fix private syntax details');
  });

  it('never delegates on an invalid tool call and recovers on the single retry', async () => {
    anthropicStreamMock
      .mockReturnValueOnce(respond('', 'executeSession', { needsSynthesis: true, sessionId: 'other' }))
      .mockReturnValueOnce(respond('Which drum do you mean?'))
      .mockReturnValueOnce(respond('Which drum do you mean?'));
    const onProgress = vi.fn();
    await expect(runConversationTurn(request('Do it', { onProgress }))).resolves.toMatchObject({ kind: 'reply' });
    expect(onProgress).toHaveBeenCalledWith({ kind: 'request_retry' });
    expect(anthropicStreamMock).toHaveBeenCalledTimes(3);
    expect(runAgentLoopMock).not.toHaveBeenCalled();
  });

  it('forwards OpenAI-compatible tool results through the same decision parser', async () => {
    getActiveModelConfigMock.mockReturnValue(officialModelConfig);
    async function* stream() {
      yield { choices: [{ delta: { tool_calls: [{
        index: 0, id: 'call-1', function: { name: 'executeSession', arguments: JSON.stringify(editTask()) },
      }] } }] };
    }
    openAIChatCreateMock.mockReset().mockResolvedValueOnce(stream());
    await expect(runConversationTurn(request('Lower the kick.'))).resolves.toMatchObject({ kind: 'execute' });
    expect(openAIChatCreateMock).toHaveBeenCalledOnce();
    expect(openAIChatCreateMock.mock.calls[0][0].tools).toHaveLength(2);
    expect(runAgentLoopMock).toHaveBeenCalledOnce();
  });
});
