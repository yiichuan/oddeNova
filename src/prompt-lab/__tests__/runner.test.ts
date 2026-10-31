import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ run: vi.fn(), validate: vi.fn(), chat: vi.fn() }));
vi.mock('../../services/llm', () => ({ runAgentWithConfig: mocks.run, createLLMCaller: () => ({ chatWithTools: mocks.chat }) }));
vi.mock('../../agent/tools', () => ({ validateCommittedCode: mocks.validate }));
import { runPromptCase } from '../runner';
import { verdict } from '../metrics';
import type { PromptLabConfig } from '../types';
import type { PromptTemplate } from '../../prompts/lab/template';
const template: PromptTemplate = { id: 't', name: 't', basedOn: 'v25', locale: 'zh', revision: 1, createdAt: '', updatedAt: '', modules: [] };
const config: PromptLabConfig = { provider: 'official', model: 'test', apiKey: '', thinkingLevel: 'medium', personaName: '', personaPrompt: '', moodContext: '' };
const options = () => ({ testCase: { id: 'case', name: 'case', category: 'test', turns: ['first', 'second'] }, template, config, signal: new AbortController().signal, onProgress: vi.fn(), onTrace: vi.fn(), trialIndex: 2 });
beforeEach(() => { vi.clearAllMocks(); mocks.validate.mockResolvedValue({ ok: true }); mocks.chat.mockResolvedValue({ content: '', toolCalls: [], usage: { inputTokens: 10, outputTokens: 3 } }); mocks.run.mockImplementation(async opts => { await opts.llm.chatWithTools([], []); await opts.llm.chatWithTools([], []); return { code: 's("bd")', explanation: 'done', committed: true, iterations: 1 }; }); });
describe('Prompt Lab trials', () => {
  it('keeps repeat and turn identity and exact pre-turn input', async () => {
    const result = await runPromptCase({ ...options(), testCase: { ...options().testCase, initialCode: 'old', initialHistory: [{ role: 'user', content: 'history' }] } });
    expect(result.map(r => [r.trialIndex, r.turnIndex])).toEqual([[2, 0], [2, 1]]);
    expect(result[0].inputSnapshot).toEqual({ code: 'old', history: [{ role: 'user', content: 'history' }] });
    expect(result[1].inputSnapshot?.code).toBe('s("bd")');
    expect(result[0].inputSnapshot?.history).toHaveLength(1);
    expect(result[1].inputSnapshot?.history).toHaveLength(3);
  });
  it('counts every caller request, not only last context size', async () => {
    const result = await runPromptCase(options());
    expect(result[0].usage).toMatchObject({ inputTokens: 20, outputTokens: 6, requestCount: 2, completeness: 'complete' });
  });
  it('marks missing usage as partial', async () => {
    mocks.chat.mockResolvedValueOnce({ usage: { inputTokens: 2, outputTokens: 1 } }).mockResolvedValueOnce({});
    const result = await runPromptCase(options());
    expect(result[0].usage?.completeness).toBe('partial');
  });
  it('checks each turn and preserves final-only assertions', async () => {
    const result = await runPromptCase({ ...options(), testCase: { ...options().testCase, turnChecks: [{ mustContain: ['missing'] }], mustContain: ['bd'] } });
    expect(result[0].checks.some(c => !c.passed)).toBe(true);
    expect(result[1].checks.some(c => c.label === '最终包含：bd' && c.passed)).toBe(true);
    expect(mocks.validate).toHaveBeenCalledTimes(2);
  });
  it('does not advance invalid committed code', async () => {
    mocks.validate.mockResolvedValue({ ok: false, error: 'invalid' });
    const result = await runPromptCase(options());
    expect(result).toHaveLength(1);
    expect(result[0].error).toBe('invalid');
    expect(result[0].code).toBe('');
  });
  it('awaits durable checkpoint before another paid call', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    await expect(runPromptCase({ ...options(), onTurnCompleted: save })).rejects.toThrow('保存失败');
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('does not run after cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    expect(await runPromptCase({ ...options(), signal: controller.signal })).toEqual([]);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('does not infer unknown legacy boundaries or count incomplete trials as passed', async () => {
    const result = await runPromptCase(options());
    expect(verdict(result, 2)).toBe('通过');
    expect(verdict(result.slice(0, 1), 2)).toBe('未知');
    expect(verdict(result.map(r => ({ ...r, trialIndex: undefined })), 2)).toBe('未知');
  });
});
