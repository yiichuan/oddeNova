import type { PromptLabResult } from './types';
export function verdict(results: PromptLabResult[], planned: number): string {
  if (results.some(r => r.error || r.checks.some(c => !c.passed))) return '失败';
  if (results.length !== planned || results.some(r => r.trialIndex === undefined)) return '未知';
  return '通过';
}
export function usageLabel(result: PromptLabResult): string {
  const u = result.usage;
  return u ? `${u.inputTokens} 输入 / ${u.outputTokens} 输出 · ${u.requestCount} 次调用 · ${u.completeness === 'complete' ? '已报告用量完整' : '用量不完整'}` : '历史用量不完整';
}
