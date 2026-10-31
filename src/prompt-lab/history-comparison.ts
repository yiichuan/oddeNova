import type { PromptLabCase, PromptLabExperiment, PromptLabHistorySource } from './types';

function inputs(c: PromptLabCase): string {
  return JSON.stringify([c.turns, c.locale ?? null, c.initialCode ?? '', c.initialHistory ?? [], c.turnChecks ?? [], c.turnCriteria ?? [], c.mustContain ?? [], c.mustNotContain ?? [], c.reviewCriteria ?? []]);
}

export function createHistoryComparison(left: PromptLabHistorySource, right: PromptLabHistorySource): PromptLabExperiment {
  if (left.runId === right.runId && left.side === right.side) throw new Error('请选择不同的来源结果');
  for (const source of [left, right]) {
    if (source.snapshot.status === 'running' || source.snapshot.kind === 'debug' || source.snapshot.historySources) throw new Error('请选择已结束的批量运行');
  }
  const a = left.snapshot, b = right.snapshot;
  const cases = (r: PromptLabExperiment) => r.suiteSnapshot?.cases ?? r.results.map(c => c.caseSnapshot);
  const unmatched: string[] = [];
  const matched = cases(a).filter(c => cases(b).some(d => d.id === c.id && inputs(c) === inputs(d)));
  const results = matched.map(c => ({ caseId: c.id, caseSnapshot: structuredClone(c), left: structuredClone(a.results.find(r => r.caseId === c.id)?.[left.side] ?? []), right: structuredClone(b.results.find(r => r.caseId === c.id)?.[right.side] ?? []) }));
  if (!results.some(c => c.left.some(l => l.trialIndex !== undefined && l.turnIndex !== undefined && c.right.some(r => r.trialIndex === l.trialIndex && r.turnIndex === l.turnIndex)))) throw new Error('没有输入一致且具有重复、轮次标识的可配对结果');
  for (const [source, label] of [[left, 'A'], [right, 'B']] as const) {
    for (const c of cases(source.snapshot)) if (!matched.some(m => m.id === c.id)) unmatched.push(`${label} · ${c.name}：输入或检查条件不匹配`);
  }
  const now = new Date().toISOString();
  return { ...structuredClone(a), id: `comparison-${crypto.randomUUID()}`, revision: 0, kind: 'compare', status: 'completed', error: undefined, name: `历史对比 · ${a.name} / ${b.name}`, createdAt: now, updatedAt: now, historySources: structuredClone({ left, right }), unmatched, repeats: Math.max(a.repeats, b.repeats), leftTemplate: structuredClone(left.side === 'left' ? a.leftTemplate : a.rightTemplate!), rightTemplate: structuredClone(right.side === 'left' ? b.leftTemplate : b.rightTemplate!), leftSystemPrompt: left.side === 'left' ? a.leftSystemPrompt : a.rightSystemPrompt!, rightSystemPrompt: right.side === 'left' ? b.leftSystemPrompt : b.rightSystemPrompt!, provenance: undefined, suiteSnapshot: { ...(a.suiteSnapshot ?? { id: 'history', revision: 0, createdAt: now, updatedAt: now, name: '历史对比' }), cases: structuredClone(matched) }, results };
}
