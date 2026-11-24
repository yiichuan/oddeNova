import { describe, expect, it, vi } from 'vitest';
import type { LLMCaller } from '../../agent/loop';
import { traceModel, type AgentTraceSink } from '../agent-trace';

describe('agent workflow model trace', () => {
  it('records ordered request and response data while keeping credentials and continuation blocks out of the trace', async () => {
    const response = {
      content: 'Lowered the kick.',
      toolCalls: [{ id: 'commit-1', name: 'commit', arguments: '{}' }],
      reasoning_content: 'opaque continuation',
      usage: { inputTokens: 42, outputTokens: 3 },
    };
    const caller: LLMCaller = { chatWithTools: vi.fn(async () => response) };
    const events: Parameters<AgentTraceSink>[0][] = [];
    const config = { provider: 'test', model: 'test-model', apiKey: 'private-key' };
    const traced = traceModel(caller, event => events.push(event), 'session', '测试请求', config);
    await expect(traced.chatWithTools([
      { role: 'assistant', content: 'Earlier reply', reasoning_content: 'earlier continuation' },
      { role: 'tool', name: 'validate', tool_call_id: 'validate-1', content: '{"ok":true}' },
    ], [])).resolves.toEqual(response);
    expect(events).toMatchObject([
      { from: 'session', to: 'model', data: { provider: 'test', model: 'test-model' } },
      { from: 'model', to: 'session', data: { content: response.content, usage: response.usage } },
    ]);
    expect(JSON.stringify(events)).toContain('validate-1');
    expect(JSON.stringify(events)).not.toMatch(/private-key|continuation/);
  });

  it('records failures and rethrows the original error', async () => {
    const failure = new Error('Timed out');
    const caller: LLMCaller = { chatWithTools: vi.fn(async () => { throw failure; }) };
    const trace = vi.fn();
    const traced = traceModel(caller, trace, 'router', '路由', { provider: 'test', model: 'test-model' });
    await expect(traced.chatWithTools([], [])).rejects.toBe(failure);
    expect(trace).toHaveBeenLastCalledWith(expect.objectContaining({
      from: 'model', to: 'router', failed: true, data: expect.objectContaining({ message: 'Timed out' }),
    }));
  });
});
