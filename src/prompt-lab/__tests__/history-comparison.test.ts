import { describe, expect, it } from 'vitest';
import { createHistoryComparison } from '../history-comparison';
import type { PromptLabExperiment, PromptLabHistorySource } from '../types';
function source(id: string): PromptLabHistorySource {
  return { runId: id, revision: 1, side: 'left', snapshot: { id, revision: 1, kind: 'batch', status: 'completed', name: id, repeats: 1, config: { model: id }, leftTemplate: { name: id }, leftSystemPrompt: id, results: [{ caseId: 'case', caseSnapshot: { id: 'case', name: 'case', turns: ['make music'], category: '' }, left: [{ trialIndex: 0, turnIndex: 0, instruction: 'make music', code: 'music', traceId: 'trace-1' }], right: [] }] } as unknown as PromptLabExperiment };
}
describe('historical comparison', () => {
  it('copies results with independent identity and preserves both model configurations', () => {
    const a = source('a'), b = source('b');
    const result = createHistoryComparison(a, b);
    expect(result.id).not.toBe('a');
    expect(result.historySources?.right.snapshot.config.model).toBe('b');
    expect(result.results[0].left[0].traceId).toBe('trace-1');
    result.results[0].left[0].code = 'changed';
    expect(a.snapshot.results[0].left[0].code).toBe('music');
  });
  it('rejects self comparison, running sources, changed inputs and legacy identities', () => {
    const a = source('a'), b = source('b');
    expect(() => createHistoryComparison(a, a)).toThrow();
    b.snapshot.status = 'running';
    expect(() => createHistoryComparison(a, b)).toThrow();
    b.snapshot.status = 'completed';
    b.snapshot.results[0].caseSnapshot.turns = ['different'];
    expect(() => createHistoryComparison(a, b)).toThrow();
    b.snapshot.results[0].caseSnapshot.turns = ['make music'];
    delete b.snapshot.results[0].left[0].trialIndex;
    expect(() => createHistoryComparison(a, b)).toThrow();
  });
  it('preserves unmatched cases and different repeat counts', () => {
    const a = source('a'), b = source('b');
    b.snapshot.repeats = 3;
    b.snapshot.results.push({ caseId: 'extra', caseSnapshot: { id: 'extra', name: 'extra', category: '', turns: ['extra'] }, left: [], right: [] });
    const result = createHistoryComparison(a, b);
    expect(result.repeats).toBe(3);
    expect(result.unmatched).toHaveLength(1);
    expect(result.historySources?.right.snapshot.results).toHaveLength(2);
  });
});
