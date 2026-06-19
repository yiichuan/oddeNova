import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunAgentOptions } from '../../agent/loop';
import type { ConversationTurn } from '../llm';

const runAgentLoopMock = vi.hoisted(() => vi.fn());
const getActivePersonaSyncMock = vi.hoisted(() => vi.fn(() => ({
  id: 'persona-1',
  name: 'Nocturne',
  prompt: 'CUSTOM_PERSONA',
})));

vi.mock('../../agent/loop', () => ({
  runAgentLoop: runAgentLoopMock,
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

import { runAgent } from '../llm';

describe('runAgent conversationHistory pass-through', () => {
  beforeEach(() => {
    runAgentLoopMock.mockReset();
    runAgentLoopMock.mockResolvedValue({
      code: 's("bd")',
      explanation: 'done',
      iterations: 1,
      committed: true,
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
});
